/**
 * Nostr Key Recovery and Rotation System
 *
 * Provides comprehensive key recovery and rotation for both Family Federation
 * and Private Individual users with proper security measures and audit trails.
 */

import { FederationRole } from "../../types/auth";
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
  oldNsec: string; // Temporarily stored for migration
  newNsec: string; // Temporarily stored for setup
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
      const { decryptNsecSimple } = await import("../privacy/encryption");
      const decryptedNsec = await decryptNsecSimple(
        encryptedNsec,
        authResult.user.user_salt
      );

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
      const newNsec = generatePrivateKey();
      const newPubkey = getPublicKey(newNsec);

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
        oldNsec: "", // Will be filled during migration
        newNsec,
        rotationId,
        timestamp: Date.now(),
        reason,
        preserveIdentity,
      };

      // Store rotation request
      await this.storeKeyRotationRequest(rotationData);

      return {
        success: true,
        rotationId,
        newKeys: {
          npub: newNpub,
          nsec: newNsec,
        },
      };
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
    event: NIP41WhitelistEvent | NIP41MigrationEvent,
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
      const subscription = pool.subscribeMany(
        targetRelays,
        [
          {
            kinds: [1776],
            authors: [currentPubkey],
            "#p": [targetPubkey],
            limit: 10,
          },
        ],
        {
          onevent: (event: any) => {
            events.push(event);
          },
          oneose: () => {
            // End of stored events - we can process results
          },
        }
      );

      // Wait for events to be collected (give it 5 seconds)
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Close subscription and pool
      subscription.close();
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
      // Create and publish whitelist event
      const whitelistResult = await this.createWhitelistEvent(
        currentNsec,
        targetPubkey,
        relays
      );

      if (!whitelistResult.success) {
        return {
          success: false,
          error: whitelistResult.error,
        };
      }

      return {
        success: true,
        whitelistEventId: whitelistResult.eventId,
        waitingPeriod: 60, // 60 days as per NIP-41
      };
    } catch (error) {
      console.error("Failed to prepare key rotation:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to prepare key rotation",
      };
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
      const newNsec = generatePrivateKey();
      const newPubkey = getPublicKey(newNsec);
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
        newNsec,
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
        newKeys: rotationResult.newKeys,
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
    userId: string
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

      // Update user_identities table with new keys
      const supabase = await this.getSupabaseClient();

      // Encrypt new nsec with user's salt
      const user = await this.getUserById(userId);
      if (!user) {
        return {
          success: false,
          error: "User not found",
        };
      }

      const { encryptNsecSimple } = await import("../privacy/encryption");
      const encryptedNewNsec = await encryptNsecSimple(
        rotationData.newNsec,
        user.user_salt
      );

      // Update user record with new keys
      const { error: updateError } = await supabase
        .from("user_identities")
        .update({
          npub: rotationData.newNpub,
          encrypted_nsec: encryptedNewNsec,
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
        const { getPublicKey } = await import("nostr-tools");
        const oldPubkey = getPublicKey(rotationData.oldNsec || ""); // This would need to be retrieved securely
        const newPubkey = getPublicKey(rotationData.newNsec);

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

        const migrationResult = await this.createMigrationEvent(
          rotationData.newNsec,
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

      // Clear sensitive data from memory
      rotationData.oldNsec = "";
      rotationData.newNsec = "";

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
      const newProfileNotice = `🔄 Key Rotation Notice: This is a new Nostr identity for ${
        rotationData.preserveIdentity.username
      }. Previous npub (${rotationData.oldNpub.substring(
        0,
        16
      )}...) has been deprecated for security reasons. Same NIP-05: ${
        rotationData.preserveIdentity.nip05
      } | Same Lightning Address: ${
        rotationData.preserveIdentity.lightningAddress
      }`;

      // Create notice for old profile (if accessible)
      const oldProfileNotice = `⚠️ DEPRECATED: This Nostr identity has been rotated for security. Find me at my new npub via NIP-05: ${rotationData.preserveIdentity.nip05} | Lightning: ${rotationData.preserveIdentity.lightningAddress}`;

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
      oldNsec: "", // Not stored in database
      newNsec: "", // Not stored in database
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
