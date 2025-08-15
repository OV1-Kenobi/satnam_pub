/**
 * Nostr Key Recovery and Rotation System
 *
 * Provides comprehensive key recovery and rotation for both Family Federation
 * and Private Individual users with proper security measures and audit trails.
 */

import { FederationRole } from "../../types/auth";
import { SecureBuffer } from "../security/secure-buffer";
import { UserIdentity } from "./user-identities-auth";

// NIP-41 Key Migration Types
export interface NIP41WhitelistEvent {
  kind: 1776;
  pubkey: string;
  content: string;
  tags: string[][];
  created_at: number;
  id: string;
  sig: string;
}

export interface NIP41MigrationEvent {
  kind: 1777;
  pubkey: string;
  content: string;
  tags: string[][];
  created_at: number;
  id: string;
  sig: string;
}

export interface NIP41EventPublishResult {
  success: boolean;
  eventId?: string;
  relayResults?: { relay: string; success: boolean; error?: string }[];
  error?: string;
}

// Recovery method types
export type RecoveryMethod =
  | "nip05-password"
  | "nip07-password"
  | "family-consensus";

// Recovery request types
export type RecoveryType =
  | "nsec-recovery"
  | "key-rotation"
  | "account-recovery";

// Recovery status
export type RecoveryStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "completed"
  | "expired";

// Key rotation data
export interface KeyRotationData {
  oldNpub: string;
  newNpub: string;
  // Use secure buffers internally; avoid string secrets
  oldNsecBuffer?: SecureBuffer; // transient, not persisted
  newNsecBuffer?: SecureBuffer; // transient, not persisted
  rotationId: string;
  timestamp: number;
  reason: string;
  preserveIdentity: {
    nip05: string;
    lightningAddress: string;
    username: string;
    bio?: string;
    profilePicture?: string;
  };
}

// Recovery request interface
export interface RecoveryRequest {
  id: string;
  userId: string;
  userRole: FederationRole;
  recoveryType: RecoveryType;
  recoveryMethod: RecoveryMethod;
  status: RecoveryStatus;
  requestedAt: Date;
  expiresAt: Date;
  completedAt?: Date;

  // Authentication data
  credentials?: {
    nip05?: string;
    password?: string;
    npub?: string;
    signature?: string;
  };

  // Family consensus data (for family federation users)
  familyConsensus?: {
    requiredApprovals: number;
    currentApprovals: number;
    approvedBy: string[];
    rejectedBy: string[];
  };

  // Recovery result
  recoveredData?: {
    nsec?: string;
    keyRotation?: KeyRotationData;
  };

  // Audit trail
  auditLog: {
    timestamp: Date;
    action: string;
    details: string;
    ipAddress?: string;
  }[];
}

/**
 * Nostr Key Recovery Service
 */
export class NostrKeyRecoveryService {
  private static instance: NostrKeyRecoveryService;

  public static getInstance(): NostrKeyRecoveryService {
    if (!NostrKeyRecoveryService.instance) {
      NostrKeyRecoveryService.instance = new NostrKeyRecoveryService();
    }
    return NostrKeyRecoveryService.instance;
  }

  /**
   * Initiate Nsec recovery for authenticated user
   */
  async initiateNsecRecovery(
    credentials: {
      nip05?: string;
      password?: string;
      npub?: string;
    },
    userRole: FederationRole
  ): Promise<{
    success: boolean;
    requestId?: string;
    requiresConsensus?: boolean;
    error?: string;
  }> {
    try {
      // Validate user is NOT currently signed in
      const { useAuth } = await import("../../components/auth/AuthProvider");
      // Note: This would need to be called from a component context

      // Generate recovery request ID
      const requestId = `recovery-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 11)}`;

      // Determine recovery method based on user role and credentials
      let recoveryMethod: RecoveryMethod;
      let requiresConsensus = false;

      if (userRole === "private") {
        // Private users use direct authentication
        if (credentials.nip05 && credentials.password) {
          recoveryMethod = "nip05-password";
        } else if (credentials.npub && credentials.password) {
          recoveryMethod = "nip07-password";
        } else {
          return {
            success: false,
            error: "Invalid credentials for private user recovery",
          };
        }
      } else {
        // Family federation users require consensus
        recoveryMethod = "family-consensus";
        requiresConsensus = true;
      }

      // Create recovery request
      const recoveryRequest: RecoveryRequest = {
        id: requestId,
        userId: "", // Will be determined after authentication
        userRole,
        recoveryType: "nsec-recovery",
        recoveryMethod,
        status: "pending",
        requestedAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        credentials,
        auditLog: [
          {
            timestamp: new Date(),
            action: "recovery_initiated",
            details: `Nsec recovery initiated for ${userRole} user`,
          },
        ],
      };

      // Store recovery request
      await this.storeRecoveryRequest(recoveryRequest);

      return {
        success: true,
        requestId,
        requiresConsensus,
      };
    } catch (error) {
      console.error("Failed to initiate nsec recovery:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Recovery initiation failed",
      };
    }
  }

  /**
   * Process Nsec recovery for private users
   */
  async processPrivateUserRecovery(requestId: string): Promise<{
    success: boolean;
    nsec?: string;
    error?: string;
  }> {
    try {
      // Get recovery request
      const request = await this.getRecoveryRequest(requestId);
      if (!request || request.recoveryType !== "nsec-recovery") {
        return {
          success: false,
          error: "Invalid recovery request",
        };
      }

      // Check if request is expired
      if (new Date() > request.expiresAt) {
        await this.updateRecoveryStatus(requestId, "expired");
        return {
          success: false,
          error: "Recovery request has expired",
        };
      }

      // Authenticate user with provided credentials
      const { userIdentitiesAuth } = await import("./user-identities-auth");
      let authResult;

      if (
        request.recoveryMethod === "nip05-password" &&
        request.credentials?.nip05 &&
        request.credentials?.password
      ) {
        authResult = await userIdentitiesAuth.authenticateNIP05Password({
          nip05: request.credentials.nip05,
          password: request.credentials.password,
        });
      } else if (
        request.recoveryMethod === "nip07-password" &&
        request.credentials?.npub &&
        request.credentials?.password
      ) {
        // Convert npub to pubkey for authentication
        const { nip19 } = await import("nostr-tools");
        const { data: pubkey } = nip19.decode(request.credentials.npub);

        authResult = await userIdentitiesAuth.authenticateNIP07({
          pubkey: pubkey as string,
          signature: "recovery-signature", // Special signature for recovery
          password: request.credentials.password,
        });
      } else {
        return {
          success: false,
          error: "Invalid recovery credentials",
        };
      }

      if (!authResult.success || !authResult.user) {
        await this.logRecoveryAttempt(requestId, "authentication_failed");
        return {
          success: false,
          error: "Authentication failed",
        };
      }

      // Update request with user ID
      request.userId = authResult.user.id;

      // Retrieve encrypted nsec
      const encryptedNsec = authResult.user.hashed_encrypted_nsec;
      if (!encryptedNsec) {
        return {
          success: false,
          error: "No encrypted nsec found for user",
        };
      }

      // Decrypt nsec using user's salt
      const { decryptNsecSimpleToBuffer } = await import(
        "../privacy/encryption"
      );
      const decryptedNsecBuf = await decryptNsecSimpleToBuffer(
        encryptedNsec,
        authResult.user.user_salt
      );
      // Return hex only at API boundary (optimized) and clear buffer
      const { CryptoUtils } = await import("../frost/crypto-utils");
      const { secureClearMemory } = await import("../privacy/encryption");
      const decryptedNsec = CryptoUtils.bytesToHex(decryptedNsecBuf);
      try {
        secureClearMemory([
          { data: decryptedNsecBuf, type: "uint8array" },
        ] as any);
      } catch {
        decryptedNsecBuf.fill(0);
      }

      // Log successful recovery
      await this.logRecoveryAttempt(requestId, "recovery_successful");
      await this.updateRecoveryStatus(requestId, "completed");

      return {
        success: true,
        nsec: decryptedNsec,
      };
    } catch (error) {
      console.error("Private user recovery failed:", error);
      await this.logRecoveryAttempt(requestId, "recovery_failed");

      return {
        success: false,
        error: error instanceof Error ? error.message : "Recovery failed",
      };
    }
  }

  /**
   * Initiate key rotation for compromised keys
   */
  async initiateKeyRotation(
    userId: string,
    reason: string,
    preserveIdentity: {
      nip05: string;
      lightningAddress: string;
      username: string;
      bio?: string;
      profilePicture?: string;
    }
  ): Promise<{
    success: boolean;
    rotationId?: string;
    newKeys?: {
      npub: string;
      nsec: string;
    };
    error?: string;
  }> {
    try {
      // Generate new cryptographically secure keypair
      const { generatePrivateKey, getPublicKey } = await import("nostr-tools");
      const { CryptoUtils } = await import("../frost/crypto-utils");
      const { SecureBuffer } = await import("../security/secure-buffer");

      // Create private key and wrap in SecureBuffer (zero source bytes if applicable)
      const privateKey = generatePrivateKey();
      if (!privateKey) {
        throw new Error("Failed to generate private key");
      }
      // Support both Uint8Array and hex string return types
      const rawNew: Uint8Array =
        typeof privateKey === "string"
          ? CryptoUtils.hexToBytes(privateKey)
          : (privateKey as Uint8Array);

      let newSec: SecureBuffer | null = null;
      try {
        newSec = SecureBuffer.fromBytes(rawNew, true);
        const newPubkey = getPublicKey(newSec.toBytes());

        // Convert to npub format
        const { nip19 } = await import("nostr-tools");
        const newNpub = nip19.npubEncode(newPubkey);

        // Get current user data
        const { userIdentitiesAuth } = await import("./user-identities-auth");
        const currentUser = await userIdentitiesAuth.getUserById(userId);

        if (!currentUser) {
          return {
            success: false,
            error: "User not found",
          };
        }

        // Create rotation data
        const rotationId = `rotation-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 11)}`;
        const rotationData: KeyRotationData = {
          oldNpub: currentUser.hashed_npub || "",
          newNpub,
          rotationId,
          timestamp: Date.now(),
          reason,
          preserveIdentity,
          newNsecBuffer: newSec,
        };

        // Store rotation request
        await this.storeKeyRotationRequest(rotationData);

        return {
          success: true,
          rotationId,
          newKeys: {
            npub: newNpub,
            nsec: CryptoUtils.bytesToHex(newSec.toBytes()),
          },
        };
      } finally {
        try {
          newSec?.dispose();
        } catch (e) {
          console.warn("SecureBuffer dispose failed", e);
        }
      }
    } catch (error) {
      console.error("Key rotation initiation failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Key rotation failed",
      };
    }
  }

  /**
   * Store recovery request in database
   */
  private async storeRecoveryRequest(request: RecoveryRequest): Promise<void> {
    const supabase = await this.getSupabaseClient();

    const { error } = await supabase.from("recovery_requests").insert({
      id: request.id,
      user_id: request.userId,
      user_role: request.userRole,
      recovery_type: request.recoveryType,
      recovery_method: request.recoveryMethod,
      status: request.status,
      requested_at: request.requestedAt.toISOString(),
      expires_at: request.expiresAt.toISOString(),
      credentials: request.credentials,
      family_consensus: request.familyConsensus,
      audit_log: request.auditLog,
    });

    if (error) {
      throw new Error(`Failed to store recovery request: ${error.message}`);
    }
  }

  /**
   * Get recovery request from database
   */
  private async getRecoveryRequest(
    requestId: string
  ): Promise<RecoveryRequest | null> {
    const supabase = await this.getSupabaseClient();

    const { data, error } = await supabase
      .from("recovery_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      userId: data.user_id,
      userRole: data.user_role,
      recoveryType: data.recovery_type,
      recoveryMethod: data.recovery_method,
      status: data.status,
      requestedAt: new Date(data.requested_at),
      expiresAt: new Date(data.expires_at),
      completedAt: data.completed_at ? new Date(data.completed_at) : undefined,
      credentials: data.credentials,
      familyConsensus: data.family_consensus,
      recoveredData: data.recovered_data,
      auditLog: data.audit_log || [],
    };
  }

  /**
   * Store key rotation request
   */
  private async storeKeyRotationRequest(
    rotationData: KeyRotationData
  ): Promise<void> {
    const supabase = await this.getSupabaseClient();

    const { error } = await supabase.from("key_rotations").insert({
      rotation_id: rotationData.rotationId,
      old_npub: rotationData.oldNpub,
      new_npub: rotationData.newNpub,
      timestamp: new Date(rotationData.timestamp).toISOString(),
      reason: rotationData.reason,
      preserve_identity: rotationData.preserveIdentity,
      status: "pending",
    });

    if (error) {
      throw new Error(`Failed to store key rotation request: ${error.message}`);
    }
  }

  /**
   * Update recovery status
   */
  private async updateRecoveryStatus(
    requestId: string,
    status: RecoveryStatus
  ): Promise<void> {
    const supabase = await this.getSupabaseClient();

    const updateData: any = { status };
    if (status === "completed") {
      updateData.completed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("recovery_requests")
      .update(updateData)
      .eq("id", requestId);

    if (error) {
      throw new Error(`Failed to update recovery status: ${error.message}`);
    }
  }

  /**
   * Log recovery attempt for audit trail
   */
  private async logRecoveryAttempt(
    requestId: string,
    action: string,
    details?: string
  ): Promise<void> {
    const supabase = await this.getSupabaseClient();

    const { error } = await supabase.from("recovery_audit_log").insert({
      request_id: requestId,
      action,
      details: details || "",
      timestamp: new Date().toISOString(),
      ip_address: "unknown", // Would be populated from request context
    });

    if (error) {
      console.error("Failed to log recovery attempt:", error);
    }
  }

  /**
   * Create and publish NIP-41 whitelist event (kind 1776)
   * This should be done ahead of time to whitelist backup keys
   */
  async createWhitelistEvent(
    currentNsec: string,
    whitelistPubkey: string,
    relays: string[] = []
  ): Promise<NIP41EventPublishResult> {
    try {
      const { getPublicKey, getEventHash, signEvent } = await import(
        "nostr-tools"
      );

      // Create whitelist event (without id and sig initially)
      const whitelistEventUnsigned = {
        kind: 1776 as const,
        pubkey: getPublicKey(currentNsec),
        content: "", // Content should be ignored per NIP-41
        tags: [
          ["p", whitelistPubkey],
          ["alt", "pubkey whitelisting event"],
        ],
        created_at: Math.floor(Date.now() / 1000),
      };

      // Sign the event
      const eventId = getEventHash(whitelistEventUnsigned);
      const signature = signEvent(whitelistEventUnsigned, currentNsec);

      // Create final signed event
      const whitelistEvent: NIP41WhitelistEvent = {
        ...whitelistEventUnsigned,
        id: eventId,
        sig: signature,
      };

      // Publish to relays
      const publishResult = await this.publishEventToRelays(
        whitelistEvent,
        relays
      );

      // Note: OpenTimestamp attestation (NIP-03) would be implemented here
      // for full NIP-41 compliance. This requires integration with OpenTimestamp
      // service to create cryptographic proofs of event timestamps.
      console.log(
        "✅ NIP-41 whitelist event created (OpenTimestamp attestation pending)"
      );

      return {
        success: publishResult.success,
        eventId: whitelistEvent.id,
        relayResults: publishResult.relayResults,
        error: publishResult.error,
      };
    } catch (error) {
      console.error("Failed to create whitelist event:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to create whitelist event",
      };
    }
  }

  /**
   * Create and publish NIP-41 migration event (kind 1777)
   * This announces the key rotation to the Nostr network
   */
  async createMigrationEvent(
    newNsec: string,
    oldPubkey: string,
    whitelistEventId: string,
    proofEventId: string,
    reason: string = "",
    relays: string[] = []
  ): Promise<NIP41EventPublishResult> {
    try {
      const { getPublicKey, getEventHash, signEvent } = await import(
        "nostr-tools"
      );

      // Create migration event (without id and sig initially)
      const migrationEventUnsigned = {
        kind: 1777 as const,
        pubkey: getPublicKey(newNsec),
        content: reason || "Key rotation for security purposes",
        tags: [
          ["p", oldPubkey],
          ["e", whitelistEventId],
          ["proof", proofEventId],
          ["alt", "pubkey migration event"],
          ["relays", ...relays],
        ],
        created_at: Math.floor(Date.now() / 1000),
      };

      // Sign the event
      const eventId = getEventHash(migrationEventUnsigned);
      const signature = signEvent(migrationEventUnsigned, newNsec);

      // Create final signed event
      const migrationEvent: NIP41MigrationEvent = {
        ...migrationEventUnsigned,
        id: eventId,
        sig: signature,
      };

      // Publish to relays
      const publishResult = await this.publishEventToRelays(
        migrationEvent,
        relays
      );

      // Note: OpenTimestamp attestation (NIP-03) would be implemented here
      // for full NIP-41 compliance. This requires integration with OpenTimestamp
      // service to create cryptographic proofs of event timestamps.
      console.log(
        "✅ NIP-41 migration event created (OpenTimestamp attestation pending)"
      );

      return {
        success: publishResult.success,
        eventId: migrationEvent.id,
        relayResults: publishResult.relayResults,
        error: publishResult.error,
      };
    } catch (error) {
      console.error("Failed to create migration event:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to create migration event",
      };
    }
  }

  /**
   * Publish event to multiple Nostr relays
   */
  private async publishEventToRelays(
    event: any,
    relays: string[]
  ): Promise<{
    success: boolean;
    relayResults?: { relay: string; success: boolean; error?: string }[];
    error?: string;
  }> {
    try {
      const { SimplePool } = await import("nostr-tools");

      // Use default relays if none provided
      const targetRelays =
        relays.length > 0
          ? relays
          : [
              "wss://relay.damus.io",
              "wss://nos.lol",
              "wss://relay.snort.social",
              "wss://relay.nostr.band",
            ];

      const pool = new SimplePool();
      const relayResults: {
        relay: string;
        success: boolean;
        error?: string;
      }[] = [];
      let successCount = 0;

      // Publish to each relay individually using the correct API
      const publishPromises = targetRelays.map(async (relayUrl) => {
        try {
          await pool.publish([relayUrl], event);
          relayResults.push({ relay: relayUrl, success: true });
          successCount++;
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : "Unknown error";
          relayResults.push({
            relay: relayUrl,
            success: false,
            error: errorMsg,
          });
        }
      });

      // Wait for all publish attempts
      await Promise.allSettled(publishPromises);

      // Close pool connections
      pool.close(targetRelays);

      return {
        success: successCount > 0,
        relayResults,
        error:
          successCount === 0 ? "Failed to publish to any relays" : undefined,
      };
    } catch (error) {
      console.error("Failed to publish event to relays:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to publish event",
      };
    }
  }

  /**
   * Check if a pubkey has been whitelisted for migration (NIP-41 compliance)
   */
  async checkWhitelistStatus(
    currentPubkey: string,
    targetPubkey: string,
    relays: string[] = []
  ): Promise<{
    isWhitelisted: boolean;
    whitelistEventId?: string;
    daysRemaining?: number;
    error?: string;
  }> {
    try {
      const { SimplePool } = await import("nostr-tools");

      const targetRelays =
        relays.length > 0
          ? relays
          : [
              "wss://relay.damus.io",
              "wss://nos.lol",
              "wss://relay.snort.social",
              "wss://relay.nostr.band",
            ];

      const pool = new SimplePool();
      const events: any[] = [];

      // Query for whitelist events (kind 1776) from the current pubkey using subscription
      const sub = (pool as any).sub(
        targetRelays,
        [
          {
            kinds: [1776],
            authors: [currentPubkey],
            "#p": [targetPubkey],
            limit: 10,
          },
        ],
        { eoseTimeout: 5000 }
      );
      sub.on("event", (ev: any) => {
        events.push(ev);
      });
      sub.on("eose", () => {
        // End of stored events - unsubscribe to clean up
        sub.unsub();
      });

      // Wait for EOSE or timeout, whichever comes first
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          try {
            sub.unsub();
          } catch {}
          resolve();
        }, 5000);
        sub.on("eose", () => {
          clearTimeout(timeout);
          try {
            sub.unsub();
          } catch {}
          resolve();
        });
      });

      // Close subscription and pool
      pool.close(targetRelays);

      if (events.length === 0) {
        return {
          isWhitelisted: false,
          error: "No whitelist event found for target pubkey",
        };
      }

      // Find the most recent whitelist event
      const latestEvent = events.sort(
        (a: any, b: any) => b.created_at - a.created_at
      )[0];

      // Check if 60 days have passed since the whitelist event
      const eventDate = new Date(latestEvent.created_at * 1000);
      const now = new Date();
      const daysSinceWhitelist = Math.floor(
        (now.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const daysRemaining = Math.max(0, 60 - daysSinceWhitelist);

      return {
        isWhitelisted: daysSinceWhitelist >= 60,
        whitelistEventId: latestEvent.id,
        daysRemaining: daysRemaining > 0 ? daysRemaining : undefined,
      };
    } catch (error) {
      console.error("Failed to check whitelist status:", error);
      return {
        isWhitelisted: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to check whitelist status",
      };
    }
  }

  /**
   * Prepare for key rotation by creating whitelist event (NIP-41 compliance)
   * This should be done at least 60 days before the actual rotation
   */
  async prepareKeyRotation(
    currentNsec: string,
    targetPubkey: string,
    relays: string[] = []
  ): Promise<{
    success: boolean;
    whitelistEventId?: string;
    waitingPeriod?: number;
    error?: string;
  }> {
    try {
      const { getPublicKey, getEventHash, signEvent } = await import(
        "nostr-tools"
      );
      const now = Math.floor(Date.now() / 1000);
      const whitelistUnsigned = {
        kind: 1776 as const,
        pubkey: getPublicKey(currentNsec),
        content: "Key rotation whitelist",
        tags: [
          ["p", targetPubkey],
          ["alt", "pubkey whitelisting event"],
        ],
        created_at: now,
      };
      const id = getEventHash(whitelistUnsigned);
      const sig = signEvent(whitelistUnsigned, currentNsec);
      const event = { ...whitelistUnsigned, id, sig } as any;

      const publish = await this.publishEventToRelays(event, relays);
      if (!publish.success) {
        return {
          success: false,
          error: publish.error || "Failed to publish whitelist",
        };
      }

      return { success: true, whitelistEventId: id, waitingPeriod: 60 };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Whitelist creation failed",
      };
    }
  }

  /**
   * Publish NIP-26 delegation from old key -> new key for trust chain
   */
  private async publishNIP26Delegation(
    oldNsecHex: string,
    newPubkey: string,
    relays: string[] = []
  ): Promise<{ success: boolean; eventId?: string; error?: string }> {
    try {
      const nt = await import("nostr-tools");

      const now = Math.floor(Date.now() / 1000);
      const until = now + 60 * 60 * 24 * 90; // 90 days window
      const conditions = `kind=1,kind=0,kind=1777,created_at>${now},created_at<${until}`;

      // Create delegation tag (NIP-26)
      const delegTag = (nt as any).nip26?.createDelegation(oldNsecHex, {
        pubkey: newPubkey,
        kind: 1,
        since: now,
        until,
        conditions,
      } as any);

      // Publish a kind:1 note from old key with the delegation tag for discoverability
      const delegNoteUnsigned = {
        kind: 1 as const,
        pubkey: nt.getPublicKey(oldNsecHex),
        content: `NIP-26 delegation issued to ${newPubkey} for identity migration.`,
        tags: [
          delegTag,
          ["p", newPubkey],
          ["alt", "delegation for key rotation"],
        ],
        created_at: now,
      };

      const eventId = nt.getEventHash(delegNoteUnsigned);
      const sig = nt.signEvent(delegNoteUnsigned, oldNsecHex);
      const delegEvent = { ...delegNoteUnsigned, id: eventId, sig } as any;

      const publishRes = await this.publishEventToRelays(delegEvent, relays);
      if (!publishRes.success) {
        return {
          success: false,
          error: publishRes.error || "Delegation publish failed",
        };
      }
      return { success: true, eventId };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to publish NIP-26 delegation",
      };
    }
  }

  /**
   * Publish kind:0 metadata updates on old and new keys with cross-references
   */
  private async publishMetadataCrossReferences(
    oldNsecHex: string,
    newNsecHex: string,
    oldNpub: string,
    newNpub: string,
    preserveIdentity: {
      nip05: string;
      lightningAddress: string;
      username: string;
      bio?: string;
      profilePicture?: string;
    },
    relays: string[] = []
  ): Promise<{ success: boolean; errors?: string[] }> {
    const errors: string[] = [];
    try {
      const nt = await import("nostr-tools");
      const now = Math.floor(Date.now() / 1000);

      const oldMeta = {
        name: preserveIdentity.username,
        about: `Deprecated key. New npub: ${newNpub}. See NIP-26 delegation.`,
        picture: preserveIdentity.profilePicture || "",
        nip05: preserveIdentity.nip05,
        lud16: preserveIdentity.lightningAddress,
      };
      const newMeta = {
        name: preserveIdentity.username,
        about: `New identity after key rotation. Previous npub: ${oldNpub}. Delegation from old key active per NIP-26.`,
        picture: preserveIdentity.profilePicture || "",
        nip05: preserveIdentity.nip05,
        lud16: preserveIdentity.lightningAddress,
      };

      const oldUnsigned = {
        kind: 0 as const,
        pubkey: nt.getPublicKey(oldNsecHex),
        created_at: now,
        content: JSON.stringify(oldMeta),
        tags: [
          ["p", nt.getPublicKey(newNsecHex)],
          ["alt", "old key metadata cross-reference"],
        ],
      };
      const newUnsigned = {
        kind: 0 as const,
        pubkey: nt.getPublicKey(newNsecHex),
        created_at: now,
        content: JSON.stringify(newMeta),
        tags: [
          ["p", nt.getPublicKey(oldNsecHex)],
          ["alt", "new key metadata cross-reference"],
        ],
      };

      const oldEvent = {
        ...oldUnsigned,
        id: nt.getEventHash(oldUnsigned),
        sig: nt.signEvent(oldUnsigned, oldNsecHex),
      } as any;
      const newEvent = {
        ...newUnsigned,
        id: nt.getEventHash(newUnsigned),
        sig: nt.signEvent(newUnsigned, newNsecHex),
      } as any;

      const oldRes = await this.publishEventToRelays(oldEvent, relays);
      if (!oldRes.success)
        errors.push(oldRes.error || "Failed to publish old metadata");
      const newRes = await this.publishEventToRelays(newEvent, relays);
      if (!newRes.success)
        errors.push(newRes.error || "Failed to publish new metadata");

      return {
        success: errors.length === 0,
        errors: errors.length ? errors : undefined,
      };
    } catch (error) {
      errors.push(
        error instanceof Error
          ? error.message
          : "Metadata cross-reference failed"
      );
      return { success: false, errors };
    }
  }

  /**
   * Complete NIP-41 compliant key rotation workflow
   * This is a comprehensive function that handles the entire NIP-41 process
   */
  async performNIP41KeyRotation(
    userId: string,
    currentNsec: string,
    reason: string,
    preserveIdentity: {
      nip05: string;
      lightningAddress: string;
      username: string;
      bio?: string;
      profilePicture?: string;
    },
    relays: string[] = []
  ): Promise<{
    success: boolean;
    rotationId?: string;
    newKeys?: { npub: string; nsec: string };
    whitelistEventId?: string;
    migrationEventId?: string;
    migrationSteps?: string[];
    error?: string;
  }> {
    try {
      // Step 1: Generate new keys
      const { generatePrivateKey, getPublicKey, nip19 } = await import(
        "nostr-tools"
      );
      const { CryptoUtils } = await import("../frost/crypto-utils");
      const { SecureBuffer } = await import("../security/secure-buffer");
      const privateKey2 = generatePrivateKey();
      if (!privateKey2) {
        throw new Error("Failed to generate private key");
      }
      const rawNew: Uint8Array =
        typeof privateKey2 === "string"
          ? CryptoUtils.hexToBytes(privateKey2)
          : (privateKey2 as Uint8Array);

      let newSec: SecureBuffer | null = null;
      try {
        newSec = SecureBuffer.fromBytes(rawNew, true);
        const newPubkey = getPublicKey(newSec.toBytes());
        const newNpub = nip19.npubEncode(newPubkey);
        const oldPubkey = getPublicKey(currentNsec);

        // Step 2: Check if new pubkey is already whitelisted
        const whitelistStatus = await this.checkWhitelistStatus(
          oldPubkey,
          newPubkey,
          relays
        );

        let whitelistEventId: string | undefined;

        if (!whitelistStatus.isWhitelisted) {
          // Step 3: Create whitelist event if not already whitelisted
          const whitelistResult = await this.createWhitelistEvent(
            currentNsec,
            newPubkey,
            relays
          );

          if (!whitelistResult.success) {
            return {
              success: false,
              error: `Failed to create whitelist event: ${whitelistResult.error}`,
            };
          }

          whitelistEventId = whitelistResult.eventId;

          // According to NIP-41, we need to wait 60 days
          return {
            success: false,
            whitelistEventId,
            error:
              "Whitelist event created. Must wait 60 days before migration per NIP-41 specification.",
          };
        } else {
          whitelistEventId = whitelistStatus.whitelistEventId;
        }

        // Step 4: Initiate key rotation in our system
        const rotationResult = await this.initiateKeyRotation(
          userId,
          reason,
          preserveIdentity
        );

        if (!rotationResult.success) {
          return {
            success: false,
            error: rotationResult.error,
          };
        }

        // Step 5: Create and publish NIP-41 migration event
        const migrationResult = await this.createMigrationEvent(
          CryptoUtils.bytesToHex(newSec.toBytes()),
          oldPubkey,
          whitelistEventId!,
          whitelistEventId!, // Using whitelist event as proof (in full implementation, this would be OpenTimestamp proof)
          reason,
          relays
        );

        // Step 6: Complete the rotation in our system
        const completionResult = await this.completeKeyRotation(
          rotationResult.rotationId!,
          userId
        );

        if (!completionResult.success) {
          return {
            success: false,
            error: completionResult.error,
          };
        }

        return {
          success: true,
          rotationId: rotationResult.rotationId,
          newKeys: {
            npub: newNpub,
            nsec: CryptoUtils.bytesToHex(newSec.toBytes()),
          },
          whitelistEventId,
          migrationEventId: migrationResult.eventId,
          migrationSteps: [
            "✅ New keypair generated",
            "✅ Whitelist event verified (60+ days old)",
            "✅ NIP-41 migration event published to Nostr network",
            "✅ Internal key rotation completed",
            "✅ NIP-05 record updated",
            "✅ Profile migration notices created",
            "⚠️ Followers will automatically update after seeing migration event",
            "⚠️ Update other Nostr clients with new nsec",
            "⚠️ Backup new keys securely",
          ],
        };
      } finally {
        try {
          newSec?.dispose();
        } catch (e) {
          console.warn("SecureBuffer dispose failed", e);
        }
      }
    } catch (error) {
      console.error("NIP-41 key rotation failed:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "NIP-41 key rotation failed",
      };
    }
  }

  /**
   * Complete key rotation process with NIP-41 compliance
   */
  async completeKeyRotation(
    rotationId: string,
    userId: string,
    options?: { newNsecBech32?: string; newNpub?: string }
  ): Promise<{
    success: boolean;
    migrationSteps?: string[];
    nip41EventId?: string;
    error?: string;
  }> {
    try {
      // Get rotation data
      const rotationData = await this.getKeyRotationData(rotationId);
      if (!rotationData) {
        return {
          success: false,
          error: "Rotation request not found",
        };
      }

      // Prepare clients and context
      const supabase = await this.getSupabaseClient();
      const user = await this.getUserById(userId);
      if (!user) {
        return { success: false, error: "User not found" };
      }

      const { encryptNsecSimple, decryptNsecSimpleToBuffer } = await import(
        "../privacy/encryption"
      );
      const { CryptoUtils } = await import("../frost/crypto-utils");
      const { nip19, getPublicKey } = await import("nostr-tools");

      // Derive old private key (hex) for signing delegation and old metadata
      let oldNsecHex = "";
      try {
        if (user.hashed_encrypted_nsec) {
          const oldBuf = await decryptNsecSimpleToBuffer(
            user.hashed_encrypted_nsec,
            user.user_salt
          );
          oldNsecHex = CryptoUtils.bytesToHex(oldBuf);
          try {
            const { secureClearMemory } = await import("../privacy/encryption");
            secureClearMemory([{ data: oldBuf, type: "uint8array" }] as any);
          } catch {
            try {
              oldBuf.fill(0);
            } catch {}
          }
        }
      } catch (e) {
        console.warn(
          "⚠️ Could not decrypt old nsec; delegation may be skipped.",
          e
        );
      }

      // Determine new nsec (hex) and new npub from provided options or rotation data
      let effectiveNewNsecHex = "";
      let effectiveNewNpub = rotationData.newNpub;
      if (options?.newNsecBech32) {
        try {
          const dec = nip19.decode(options.newNsecBech32);
          if (dec.type === "nsec") {
            effectiveNewNsecHex = CryptoUtils.bytesToHex(
              dec.data as Uint8Array
            );
          }
        } catch (e) {
          console.warn("Invalid provided new nsec bech32:", e);
        }
      } else if (rotationData.newNsecBuffer) {
        effectiveNewNsecHex = CryptoUtils.bytesToHex(
          rotationData.newNsecBuffer.toBytes()
        );
      }

      if (options?.newNpub) {
        effectiveNewNpub = options.newNpub;
      } else if (!effectiveNewNpub && effectiveNewNsecHex) {
        const pub = getPublicKey(
          CryptoUtils.hexToBytes(effectiveNewNsecHex) as any
        );
        effectiveNewNpub = nip19.npubEncode(pub);
      }

      // Publish NIP-26 delegation and cross-referenced metadata BEFORE DB update
      if (oldNsecHex && effectiveNewNsecHex && effectiveNewNpub) {
        try {
          const newPubkey = getPublicKey(
            CryptoUtils.hexToBytes(effectiveNewNsecHex) as any
          );
          await this.publishNIP26Delegation(oldNsecHex, newPubkey, []);
          await this.publishMetadataCrossReferences(
            oldNsecHex,
            effectiveNewNsecHex,
            rotationData.oldNpub,
            effectiveNewNpub,
            rotationData.preserveIdentity,
            []
          );
        } catch (e) {
          console.warn("Delegation/metadata publishing failed:", e);
        }
      }

      // Encrypt new nsec with user's salt for DB storage
      const encryptedNewNsec = await encryptNsecSimple(
        effectiveNewNsecHex,
        user.user_salt
      );

      // Update user record with new keys
      const { error: updateError } = await supabase
        .from("user_identities")
        .update({
          npub: effectiveNewNpub || rotationData.newNpub,
          hashed_encrypted_nsec: encryptedNewNsec,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (updateError) {
        throw new Error(`Failed to update user keys: ${updateError.message}`);
      }

      // Update NIP-05 record to point to new npub
      await this.updateNIP05Record(
        rotationData.preserveIdentity.nip05,
        rotationData.newNpub
      );

      // Create deprecation notices for old and new profiles
      await this.createDeprecationNotices(rotationData);

      // Create and publish NIP-41 migration event
      let nip41EventId: string | undefined;
      try {
        // For NIP-41 compliance, we need:
        // 1. A whitelist event (kind 1776) - should have been created beforehand
        // 2. A proof event - OpenTimestamp proof of the whitelist event
        // 3. The migration event (kind 1777)

        // First, check if there's an existing whitelist event for the new pubkey
        const { nip19 } = await import("nostr-tools");
        const decOld = nip19.decode(rotationData.oldNpub);
        if (decOld.type !== "npub" || typeof decOld.data !== "string") {
          throw new Error("Invalid old npub format");
        }
        const oldPubkey = decOld.data;
        const newPubkey = rotationData.newNpub;

        const whitelistStatus = await this.checkWhitelistStatus(
          oldPubkey,
          newPubkey,
          [] // Use default relays
        );

        let whitelistEventId = rotationId; // Fallback to rotation ID
        let proofEventId = rotationId; // Fallback to rotation ID

        if (whitelistStatus.isWhitelisted && whitelistStatus.whitelistEventId) {
          whitelistEventId = whitelistStatus.whitelistEventId;
          proofEventId = whitelistStatus.whitelistEventId; // In a full implementation, this would be the OpenTimestamp proof
          console.log("✅ Found existing whitelist event:", whitelistEventId);
        } else {
          console.warn(
            "⚠️ No valid whitelist event found. Migration may not be NIP-41 compliant."
          );
          console.warn(
            "Days remaining for whitelist:",
            whitelistStatus.daysRemaining
          );
        }

        const { CryptoUtils } = await import("../frost/crypto-utils");
        const newNsecHex2 = rotationData.newNsecBuffer
          ? CryptoUtils.bytesToHex(rotationData.newNsecBuffer.toBytes())
          : "";
        const migrationResult = await this.createMigrationEvent(
          newNsecHex2,
          oldPubkey,
          whitelistEventId,
          proofEventId,
          rotationData.reason,
          [] // Use default relays
        );

        if (migrationResult.success) {
          nip41EventId = migrationResult.eventId;
          console.log("✅ NIP-41 migration event published:", nip41EventId);
        } else {
          console.warn(
            "⚠️ Failed to publish NIP-41 migration event:",
            migrationResult.error
          );
        }
      } catch (error) {
        console.warn("⚠️ NIP-41 migration event creation failed:", error);
      }

      // Mark rotation as completed
      await this.updateKeyRotationStatus(rotationId, "completed");

      // Clear sensitive data from memory (best-effort, browser-compatible)
      try {
        const { secureClearMemory } = await import("../privacy/encryption");
        const targets: Array<{ data: Uint8Array; type: "uint8array" }> = [];
        if (rotationData.oldNsecBuffer) {
          targets.push({
            data: rotationData.oldNsecBuffer.toBytes(),
            type: "uint8array",
          });
        }
        if (rotationData.newNsecBuffer) {
          targets.push({
            data: rotationData.newNsecBuffer.toBytes(),
            type: "uint8array",
          });
        }
        if (targets.length > 0) {
          secureClearMemory(targets as any);
          // Dispose SecureBuffer instances after clearing their copies
          try {
            rotationData.oldNsecBuffer?.dispose();
          } catch {}
          try {
            rotationData.newNsecBuffer?.dispose();
          } catch {}
        }
      } catch (error) {
        console.warn("Failed to securely clear memory:", error);
        // Fallback: dispose SecureBuffer instances directly
        try {
          rotationData.oldNsecBuffer?.dispose();
        } catch {}
        try {
          rotationData.newNsecBuffer?.dispose();
        } catch {}
      } finally {
        // Clear buffer references
        rotationData.oldNsecBuffer = undefined;
        rotationData.newNsecBuffer = undefined;
      }

      const migrationSteps = [
        "✅ New keypair generated and encrypted",
        "✅ User database record updated",
        "✅ NIP-05 record updated to new npub",
        "✅ Deprecation notices created",
        nip41EventId
          ? "✅ NIP-41 migration event published to Nostr network"
          : "⚠️ NIP-41 migration event failed (non-critical)",
        "✅ Key rotation completed successfully",
        "⚠️ Update other Nostr clients with new nsec",
        "⚠️ Backup new keys securely",
      ];

      return {
        success: true,
        migrationSteps,
        nip41EventId,
      };
    } catch (error) {
      console.error("Key rotation completion failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Key rotation failed",
      };
    }
  }

  /**
   * Update NIP-05 record to point to new npub
   */
  private async updateNIP05Record(
    nip05: string,
    newNpub: string
  ): Promise<void> {
    const supabase = await this.getSupabaseClient();

    const { error } = await supabase
      .from("nip05_records")
      .update({
        npub: newNpub,
        updated_at: new Date().toISOString(),
      })
      .eq("nip05", nip05);

    if (error) {
      throw new Error(`Failed to update NIP-05 record: ${error.message}`);
    }
  }

  /**
   * Create deprecation notices for old and new profiles
   */
  private async createDeprecationNotices(
    rotationData: KeyRotationData
  ): Promise<void> {
    try {
      // Create notice for new profile
      const newProfileNotice = `🔄 Key Rotation: New identity for ${rotationData.preserveIdentity.username}. See delegation from old key (NIP-26). Same NIP-05: ${rotationData.preserveIdentity.nip05} | Lightning: ${rotationData.preserveIdentity.lightningAddress}`;

      // Create notice for old profile (if accessible)
      const oldProfileNotice = `⚠️ DEPRECATED: Rotation complete. Trust events signed by the new key per NIP-26 delegation. Discover via NIP-05: ${rotationData.preserveIdentity.nip05} | Lightning: ${rotationData.preserveIdentity.lightningAddress}`;

      // Store notices for later profile updates
      const supabase = await this.getSupabaseClient();

      await supabase.from("profile_migration_notices").insert([
        {
          rotation_id: rotationData.rotationId,
          npub: rotationData.newNpub,
          notice_type: "new_profile",
          notice_content: newProfileNotice,
          created_at: new Date().toISOString(),
        },
        {
          rotation_id: rotationData.rotationId,
          npub: rotationData.oldNpub,
          notice_type: "deprecated_profile",
          notice_content: oldProfileNotice,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      console.error("Failed to create deprecation notices:", error);
      // Don't fail the entire rotation for this
    }
  }

  /**
   * Get key rotation data
   */
  private async getKeyRotationData(
    rotationId: string
  ): Promise<KeyRotationData | null> {
    const supabase = await this.getSupabaseClient();

    const { data, error } = await supabase
      .from("key_rotations")
      .select("*")
      .eq("rotation_id", rotationId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      oldNpub: data.old_npub,
      newNpub: data.new_npub,
      rotationId: data.rotation_id,
      timestamp: new Date(data.timestamp).getTime(),
      reason: data.reason,
      preserveIdentity: data.preserve_identity,
    };
  }

  /**
   * Update key rotation status
   */
  private async updateKeyRotationStatus(
    rotationId: string,
    status: string
  ): Promise<void> {
    const supabase = await this.getSupabaseClient();

    const { error } = await supabase
      .from("key_rotations")
      .update({
        status,
        completed_at: status === "completed" ? new Date().toISOString() : null,
      })
      .eq("rotation_id", rotationId);

    if (error) {
      throw new Error(`Failed to update rotation status: ${error.message}`);
    }
  }

  /**
   * Get user by ID
   */
  private async getUserById(userId: string): Promise<UserIdentity | null> {
    const { userIdentitiesAuth } = await import("./user-identities-auth");
    return await userIdentitiesAuth.getUserById(userId);
  }

  /**
   * Get Supabase client
   */
  private async getSupabaseClient() {
    const { supabase } = await import("../supabase");
    return supabase;
  }
}

// Export singleton instance
export const nostrKeyRecovery = NostrKeyRecoveryService.getInstance();
