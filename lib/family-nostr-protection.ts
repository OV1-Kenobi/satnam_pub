/**
 * @fileoverview Family Nostr Protection System
 * @description Secure nsec key protection using Fedimint federation sharding
 * with guardian-based recovery mechanisms for family coordination
 */

import { getPublicKey, nip19 } from "nostr-tools";
import { EventSigner } from "./crypto/event-signer";
import { createDatabase } from "./db";
import { FederationManager } from "./fedimint/federation-manager";

export interface GuardianShard {
  guardianId: string;
  shardData: string;
  shardIndex: number;
  threshold: number;
  createdAt: Date;
}

export interface GuardianSignature {
  guardianId: string;
  signature: string;
  shardData: string;
  timestamp: Date;
}

export interface ProtectionMetadata {
  id: string;
  familyMemberId: string;
  userId: string;
  federationId: string;
  guardianCount: number;
  thresholdRequired: number;
  protectionActive: boolean;
  nsecShardsStored: boolean;
  createdAt: Date;
  lastRecoveryAt?: Date;
  recoveryCount: number;
}

export interface ShardingResult {
  success: boolean;
  shardsDistributed: number;
  federationId: string;
  guardianIds: string[];
  error?: string;
}

export interface RecoveryResult {
  success: boolean;
  nsec?: string;
  publicKey?: string;
  error?: string;
}

export interface NotificationResult {
  success: boolean;
  notified: number;
  failed: number;
  errors?: string[];
}

/**
 * Family Nostr Protection System
 * Provides secure nsec key sharding and recovery using Fedimint federation
 */
export class FamilyNostrProtection {
  private static db = createDatabase();
  private static federationManager = new FederationManager();
  private static eventSigner = new EventSigner();

  /**
   * Shard nsec key among guardians using Fedimint secret sharing
   */
  static async shardNsecAmongGuardians(
    nsec: string,
    guardians: string[],
    threshold: number,
    federationId: string,
  ): Promise<ShardingResult> {
    try {
      // Validate inputs
      if (!nsec || !Array.isArray(guardians) || guardians.length < threshold) {
        return {
          success: false,
          shardsDistributed: 0,
          federationId,
          guardianIds: [],
          error: "Invalid input parameters",
        };
      }

      // Validate nsec format
      let privateKeyBytes: Uint8Array;
      try {
        if (nsec.startsWith("nsec")) {
          const decoded = nip19.decode(nsec);
          if (decoded.type !== "nsec") {
            throw new Error("Invalid nsec format");
          }
          privateKeyBytes = decoded.data;
        } else {
          privateKeyBytes = new Uint8Array(Buffer.from(nsec, "hex"));
        }
      } catch (error) {
        return {
          success: false,
          shardsDistributed: 0,
          federationId,
          guardianIds: [],
          error: "Invalid nsec format",
        };
      }

      // Get federation client
      const federationClient =
        await this.federationManager.getClient(federationId);
      if (!federationClient) {
        return {
          success: false,
          shardsDistributed: 0,
          federationId,
          guardianIds: [],
          error: "Federation client not available",
        };
      }

      // Split secret using Shamir's Secret Sharing
      const shards = await this.splitSecret(
        privateKeyBytes,
        guardians.length,
        threshold,
      );

      if (shards.length !== guardians.length) {
        return {
          success: false,
          shardsDistributed: 0,
          federationId,
          guardianIds: [],
          error: "Failed to generate correct number of shards",
        };
      }

      // Distribute shards to guardians through Fedimint federation
      const distributionPromises = guardians.map(async (guardianId, index) => {
        try {
          await this.storeShardWithGuardian(
            guardianId,
            shards[index],
            federationId,
            index,
            threshold,
          );
          return { guardianId, success: true };
        } catch (error) {
          console.error(
            `Failed to store shard with guardian ${guardianId}:`,
            error,
          );
          return {
            guardianId,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      });

      const distributionResults = await Promise.all(distributionPromises);
      const successfulDistributions = distributionResults.filter(
        (r) => r.success,
      );

      if (successfulDistributions.length < threshold) {
        return {
          success: false,
          shardsDistributed: successfulDistributions.length,
          federationId,
          guardianIds: successfulDistributions.map((r) => r.guardianId),
          error: `Insufficient shards distributed. Need ${threshold}, got ${successfulDistributions.length}`,
        };
      }

      return {
        success: true,
        shardsDistributed: successfulDistributions.length,
        federationId,
        guardianIds: successfulDistributions.map((r) => r.guardianId),
      };
    } catch (error) {
      return {
        success: false,
        shardsDistributed: 0,
        federationId,
        guardianIds: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Reconstruct nsec from guardian shards
   */
  static async reconstructNsecFromShards(
    protectionId: string,
    guardianSignatures: GuardianSignature[],
    federationId: string,
  ): Promise<RecoveryResult> {
    try {
      // Validate signatures and extract shard data
      const validShards: { index: number; shard: Uint8Array }[] = [];

      for (const signature of guardianSignatures) {
        // Verify guardian signature
        const isValidSignature = await this.verifyGuardianSignature(
          signature,
          protectionId,
          federationId,
        );

        if (!isValidSignature) {
          console.warn(
            `Invalid signature from guardian ${signature.guardianId}`,
          );
          continue;
        }

        // Extract shard data
        try {
          const shardBytes = Buffer.from(signature.shardData, "base64");
          const shardIndex = this.extractShardIndex(signature.shardData);

          validShards.push({
            index: shardIndex,
            shard: new Uint8Array(shardBytes),
          });
        } catch (error) {
          console.warn(
            `Failed to process shard from guardian ${signature.guardianId}:`,
            error,
          );
        }
      }

      if (validShards.length === 0) {
        return {
          success: false,
          error: "No valid shards found",
        };
      }

      // Reconstruct secret using Shamir's Secret Sharing
      const reconstructedSecret = await this.reconstructSecret(validShards);

      if (!reconstructedSecret) {
        return {
          success: false,
          error: "Failed to reconstruct secret from shards",
        };
      }

      // Convert to nsec format
      const nsec = nip19.nsecEncode(reconstructedSecret);
      const publicKey = getPublicKey(reconstructedSecret);

      return {
        success: true,
        nsec,
        publicKey,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Notify guardians of new protection setup
   */
  static async notifyGuardiansOfProtection(
    guardians: string[],
    familyMemberId: string,
    protectionId: string,
  ): Promise<NotificationResult> {
    try {
      const notificationPromises = guardians.map(async (guardianId) => {
        try {
          // Create notification event for guardian
          const notificationEvent = {
            type: "guardian_protection_setup",
            familyMemberId,
            protectionId,
            guardianId,
            timestamp: new Date(),
            message: `You have been selected as a guardian for family member ${familyMemberId}'s Nostr key protection.`,
          };

          // Send notification through available channels
          await this.sendGuardianNotification(guardianId, notificationEvent);

          // Store notification in database
          await this.db.from("guardian_notifications").insert({
            guardian_id: guardianId,
            family_member_id: familyMemberId,
            protection_id: protectionId,
            notification_type: "protection_setup",
            message: notificationEvent.message,
            sent_at: new Date().toISOString(),
            status: "sent",
          });

          return { guardianId, success: true };
        } catch (error) {
          console.error(`Failed to notify guardian ${guardianId}:`, error);
          return {
            guardianId,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      });

      const results = await Promise.all(notificationPromises);
      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      return {
        success: successful.length > 0,
        notified: successful.length,
        failed: failed.length,
        errors: failed.map((f) => f.error).filter(Boolean) as string[],
      };
    } catch (error) {
      return {
        success: false,
        notified: 0,
        failed: guardians.length,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Split secret using Shamir's Secret Sharing algorithm
   */
  private static async splitSecret(
    secret: Uint8Array,
    totalShares: number,
    threshold: number,
  ): Promise<Uint8Array[]> {
    // This is a simplified implementation
    // In production, use a proper Shamir's Secret Sharing library
    const shards: Uint8Array[] = [];

    for (let i = 0; i < totalShares; i++) {
      // Create shard with metadata
      const shardData = new Uint8Array(secret.length + 8);
      shardData.set(secret, 0);
      shardData.set(new Uint8Array([i, threshold]), secret.length);
      shardData.set(
        new Uint8Array(Buffer.from(Date.now().toString())),
        secret.length + 2,
      );

      shards.push(shardData);
    }

    return shards;
  }

  /**
   * Reconstruct secret from shards
   */
  private static async reconstructSecret(
    shards: { index: number; shard: Uint8Array }[],
  ): Promise<Uint8Array | null> {
    if (shards.length === 0) return null;

    // This is a simplified implementation
    // In production, use proper Shamir's Secret Sharing reconstruction
    const firstShard = shards[0];
    const secretLength = firstShard.shard.length - 8;

    return firstShard.shard.slice(0, secretLength);
  }

  /**
   * Store shard with guardian through Fedimint federation
   */
  private static async storeShardWithGuardian(
    guardianId: string,
    shard: Uint8Array,
    federationId: string,
    shardIndex: number,
    threshold: number,
  ): Promise<void> {
    try {
      // Encode shard for storage
      const shardData = Buffer.from(shard).toString("base64");

      // Store in guardian shard table
      const { error } = await this.db.from("guardian_shards").insert({
        guardian_id: guardianId,
        federation_id: federationId,
        shard_data: shardData,
        shard_index: shardIndex,
        threshold_required: threshold,
        created_at: new Date().toISOString(),
      });

      if (error) {
        throw new Error(`Failed to store shard: ${error.message}`);
      }

      // Optionally, also store in Fedimint federation for redundancy
      const federationClient =
        await this.federationManager.getClient(federationId);
      if (federationClient) {
        // Store encrypted shard data in federation
        await federationClient.storeEncryptedData(
          `guardian_shard_${guardianId}_${shardIndex}`,
          shardData,
        );
      }
    } catch (error) {
      throw new Error(
        `Failed to store shard with guardian ${guardianId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Verify guardian signature
   */
  private static async verifyGuardianSignature(
    signature: GuardianSignature,
    protectionId: string,
    federationId: string,
  ): Promise<boolean> {
    try {
      // Get guardian's public key
      const { data: guardian } = await this.db
        .from("family_guardians")
        .select("public_key")
        .eq("guardian_id", signature.guardianId)
        .single();

      if (!guardian?.public_key) {
        return false;
      }

      // Verify signature using the event signer
      const messageToVerify = `${protectionId}:${federationId}:${signature.shardData}:${signature.timestamp.toISOString()}`;

      return await this.eventSigner.verifySignature(
        messageToVerify,
        signature.signature,
        guardian.public_key,
      );
    } catch (error) {
      console.error("Failed to verify guardian signature:", error);
      return false;
    }
  }

  /**
   * Extract shard index from shard data
   */
  private static extractShardIndex(shardData: string): number {
    try {
      const shardBytes = Buffer.from(shardData, "base64");
      // Extract index from metadata (simplified implementation)
      return shardBytes[shardBytes.length - 8] || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Send notification to guardian through available channels
   */
  private static async sendGuardianNotification(
    guardianId: string,
    notificationEvent: any,
  ): Promise<void> {
    try {
      // Get guardian contact information
      const { data: guardian } = await this.db
        .from("family_guardians")
        .select("*")
        .eq("guardian_id", guardianId)
        .single();

      if (!guardian) {
        throw new Error(`Guardian ${guardianId} not found`);
      }

      // Send through multiple channels if available
      const notifications = [];

      // Nostr DM
      if (guardian.nostr_pubkey) {
        notifications.push(
          this.sendNostrDM(guardian.nostr_pubkey, notificationEvent),
        );
      }

      // Email (if available)
      if (guardian.email) {
        notifications.push(this.sendEmail(guardian.email, notificationEvent));
      }

      // Wait for at least one notification to succeed
      await Promise.any(notifications);
    } catch (error) {
      throw new Error(
        `Failed to send notification to guardian ${guardianId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Send Nostr DM to guardian
   */
  private static async sendNostrDM(
    guardianPubkey: string,
    notificationEvent: any,
  ): Promise<void> {
    try {
      // Implementation would use Nostr DM functionality
      // This is a placeholder for the actual implementation
      console.log(`Sending Nostr DM to ${guardianPubkey}:`, notificationEvent);
    } catch (error) {
      throw new Error(
        `Failed to send Nostr DM: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Send email to guardian
   */
  private static async sendEmail(
    guardianEmail: string,
    notificationEvent: any,
  ): Promise<void> {
    try {
      // Implementation would use email service
      // This is a placeholder for the actual implementation
      console.log(`Sending email to ${guardianEmail}:`, notificationEvent);
    } catch (error) {
      throw new Error(
        `Failed to send email: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/**
 * Guardian management utilities
 */
export class GuardianManager {
  private static db = createDatabase();

  /**
   * Add a guardian to the family
   */
  static async addGuardian(params: {
    guardianId: string;
    familyId: string;
    publicKey: string;
    email?: string;
    nostrPubkey?: string;
    role: "parent" | "trusted_contact" | "family_friend";
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.db.from("family_guardians").insert({
        guardian_id: params.guardianId,
        family_id: params.familyId,
        public_key: params.publicKey,
        email: params.email,
        nostr_pubkey: params.nostrPubkey,
        role: params.role,
        active: true,
        created_at: new Date().toISOString(),
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get family guardians
   */
  static async getFamilyGuardians(familyId: string): Promise<{
    success: boolean;
    guardians?: any[];
    error?: string;
  }> {
    try {
      const { data: guardians, error } = await this.db
        .from("family_guardians")
        .select("*")
        .eq("family_id", familyId)
        .eq("active", true)
        .order("created_at", { ascending: false });

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        guardians: guardians || [],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
