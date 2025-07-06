/**
 * @fileoverview SSS-Based Federated Signing API
 * @description Implements federated signing using Shamir Secret Sharing
 * without ever exposing the private key to individual family members
 */

import { finalizeEvent, getPublicKey, verifyEvent } from "../../src/lib/nostr-browser";
import { CitadelRelay } from "../citadel/relay";
import db from "../db";
import { FamilyGuardianManager } from "../family/guardian-management";
import { PrivacyUtils } from "../privacy/encryption";

/**
 * SSS-based federated event that requires guardian consensus
 */
export interface SSSFederatedEvent {
  id: string;
  eventUuid: string;
  familyId: string;
  eventType:
    | "family_announcement"
    | "payment_request"
    | "member_update"
    | "coordination"
    | "key_rotation";
  content: string;
  authorId: string;
  timestamp: Date;
  status:
    | "pending_guardians"
    | "guardians_approved"
    | "signing_ready"
    | "signed"
    | "broadcast"
    | "expired";
  requiredGuardianApprovals: number;
  currentGuardianApprovals: number;
  guardianApprovals: Array<{
    guardianId: string;
    approved: boolean;
    timestamp: Date;
    reason?: string;
  }>;
  reconstructionRequestId?: string; // Set when guardians approve and key reconstruction is requested
  signedEventId?: string; // Nostr event ID when signed with reconstructed key
  broadcastTimestamp?: Date;
  expiresAt: Date;
  privacyLevel: 1 | 2 | 3;
}

/**
 * Guardian approval for family events
 */
export interface GuardianApproval {
  guardianId: string;
  eventId: string;
  approved: boolean;
  reason?: string;
  deviceInfo?: {
    userAgent: string;
    ipAddress: string;
  };
  timestamp: Date;
  shareCommitment?: string; // Commitment that guardian will provide share if needed
}

/**
 * SSS Federated Signing API Response
 */
export interface SSSFederatedSigningResponse {
  success: boolean;
  data?: any;
  error?: string;
  details?: any;
  privacyAuditId?: string;
}

/**
 * SSS-Based Federated Signing API
 * Never exposes private keys to individual family members
 */
export class SSSFederatedSigningAPI {
  private static relay = new CitadelRelay();

  /**
   * Create a federated event that requires guardian consensus
   */
  static async createFederatedEvent(params: {
    familyId: string;
    eventType: SSSFederatedEvent["eventType"];
    content: string;
    authorId: string;
    requiredGuardianApprovals?: number;
    privacyLevel?: 1 | 2 | 3;
  }): Promise<SSSFederatedSigningResponse> {
    let auditId: string | undefined;

    try {
      const {
        familyId,
        eventType,
        content,
        authorId,
        requiredGuardianApprovals,
        privacyLevel = 3,
      } = params;

      // Log privacy operation
      const auditEntry = PrivacyUtils.logPrivacyOperation({
        action: "create",
        dataType: "event",
        userId: authorId,
        familyId,
        success: false,
      });
      auditId = auditEntry.id;

      // Get family configuration to determine required approvals
      const familyConfigResult = await this.getFamilyConfig(familyId);
      if (!familyConfigResult.success) {
        return {
          success: false,
          error: "Family configuration not found",
          privacyAuditId: auditId,
        };
      }

      const familyConfig = familyConfigResult.data!;
      const defaultRequiredApprovals = Math.ceil(
        familyConfig.shareDistribution.length / 2,
      ); // Majority approval
      const finalRequiredApprovals =
        requiredGuardianApprovals || defaultRequiredApprovals;

      // Generate secure identifiers
      const eventUuid = PrivacyUtils.generateSecureUUID();
      const eventId = `sss_event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours for guardian approval

      // Encrypt sensitive data for storage - each field gets a unique salt
      const encryptedFamilyId =
        await PrivacyUtils.encryptSensitiveData(familyId);
      const encryptedContent = await PrivacyUtils.encryptSensitiveData(content);
      const encryptedAuthorId =
        await PrivacyUtils.encryptSensitiveData(authorId);

      // Store the federated event
      await db.query(
        `
        INSERT INTO sss_federated_events (
          event_uuid, encrypted_family_id, family_salt, family_iv, family_tag,
          event_type, encrypted_content, content_salt, content_iv, content_tag,
          encrypted_author_id, author_salt, author_iv, author_tag,
          required_guardian_approvals, current_guardian_approvals,
          guardian_approvals, status, expires_at, created_at, privacy_level
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      `,
        [
          eventUuid,
          encryptedFamilyId.encrypted,
          encryptedFamilyId.salt,
          encryptedFamilyId.iv,
          encryptedFamilyId.tag,
          eventType,
          encryptedContent.encrypted,
          encryptedContent.salt,
          encryptedContent.iv,
          encryptedContent.tag,
          encryptedAuthorId.encrypted,
          encryptedAuthorId.salt,
          encryptedAuthorId.iv,
          encryptedAuthorId.tag,
          finalRequiredApprovals,
          0,
          JSON.stringify([]),
          "pending_guardians",
          expiresAt,
          new Date(),
          privacyLevel,
        ],
      );

      // Send notifications to guardians (in a real implementation)
      await this.notifyGuardians(familyId, eventId, eventType, content);

      // Update audit log
      await db.query(
        `
        UPDATE privacy_audit_log SET success = true WHERE id = $1
      `,
        [auditId],
      );

      const federatedEvent: SSSFederatedEvent = {
        id: eventId,
        eventUuid,
        familyId,
        eventType,
        content,
        authorId,
        timestamp: new Date(),
        status: "pending_guardians",
        requiredGuardianApprovals: finalRequiredApprovals,
        currentGuardianApprovals: 0,
        guardianApprovals: [],
        expiresAt,
        privacyLevel,
      };

      return {
        success: true,
        data: {
          event: federatedEvent,
          guardianNotificationsSent: familyConfig.shareDistribution.length,
        },
        privacyAuditId: auditId,
      };
    } catch (error) {
      // Log error in audit
      if (auditId) {
        try {
          await db.query(
            `
            UPDATE privacy_audit_log SET success = false, error_message = $1 WHERE id = $2
          `,
            [error instanceof Error ? error.message : String(error), auditId],
          );
        } catch (auditError) {
          console.error("Failed to update audit log:", auditError);
        }
      }

      return {
        success: false,
        error: "Failed to create federated event",
        details: error instanceof Error ? error.message : String(error),
        privacyAuditId: auditId,
      };
    }
  }

  /**
   * Guardian approves or rejects a federated event
   */
  static async guardianApproval(params: {
    eventId: string;
    guardianId: string;
    approved: boolean;
    reason?: string;
    deviceInfo?: GuardianApproval["deviceInfo"];
  }): Promise<SSSFederatedSigningResponse> {
    let auditId: string | undefined;

    try {
      const { eventId, guardianId, approved, reason, deviceInfo } = params;

      // Log privacy operation
      const auditEntry = PrivacyUtils.logPrivacyOperation({
        action: "access",
        dataType: "event",
        userId: guardianId,
        success: false,
      });
      auditId = auditEntry.id;

      // Get the event
      const eventResult = await db.query(
        `
        SELECT * FROM sss_federated_events WHERE event_uuid = $1 OR id = $1
      `,
        [eventId],
      );

      if (eventResult.rows.length === 0) {
        return {
          success: false,
          error: "Event not found",
          privacyAuditId: auditId,
        };
      }

      const eventData = eventResult.rows[0];

      if (eventData.status !== "pending_guardians") {
        return {
          success: false,
          error: "Event is no longer pending guardian approvals",
          privacyAuditId: auditId,
        };
      }

      if (new Date(eventData.expires_at) < new Date()) {
        return {
          success: false,
          error: "Event has expired",
          privacyAuditId: auditId,
        };
      }

      // Decrypt family ID to verify guardian membership
      const familyId = await PrivacyUtils.decryptSensitiveData({
        encrypted: eventData.encrypted_family_id,
        salt: eventData.family_salt,
        iv: eventData.family_iv,
        tag: eventData.family_tag,
      });

      // Verify guardian is authorized for this family
      const isAuthorized = await this.verifyGuardianAuthorization(
        guardianId,
        familyId,
      );
      if (!isAuthorized) {
        return {
          success: false,
          error: "Guardian not authorized for this family",
          privacyAuditId: auditId,
        };
      }

      // Parse existing approvals
      const guardianApprovals = JSON.parse(
        eventData.guardian_approvals || "[]",
      );

      // Check if guardian has already voted
      const existingApproval = guardianApprovals.find(
        (a: any) => a.guardianId === guardianId,
      );
      if (existingApproval) {
        return {
          success: false,
          error: "Guardian has already provided approval/rejection",
          privacyAuditId: auditId,
        };
      }

      // Add guardian approval
      const approval: GuardianApproval = {
        guardianId,
        eventId,
        approved,
        reason,
        deviceInfo: deviceInfo
          ? {
              userAgent: crypto
                .createHash("sha256")
                .update(deviceInfo.userAgent)
                .digest("hex"),
              ipAddress: crypto
                .createHash("sha256")
                .update(deviceInfo.ipAddress)
                .digest("hex"),
            }
          : undefined,
        timestamp: new Date(),
      };

      guardianApprovals.push(approval);

      // Count current approvals
      const currentApprovals = guardianApprovals.filter(
        (a: any) => a.approved,
      ).length;
      const newStatus =
        currentApprovals >= eventData.required_guardian_approvals
          ? "guardians_approved"
          : "pending_guardians";

      // Update event with new approval
      await db.query(
        `
        UPDATE sss_federated_events 
        SET guardian_approvals = $1, current_guardian_approvals = $2, status = $3, updated_at = NOW()
        WHERE event_uuid = $4
      `,
        [
          JSON.stringify(guardianApprovals),
          currentApprovals,
          newStatus,
          eventData.event_uuid,
        ],
      );

      // If threshold met, prepare for signing
      let reconstructionRequestId: string | undefined;
      if (newStatus === "guardians_approved") {
        // Request key reconstruction for signing
        const reconstructionResult =
          await FamilyGuardianManager.requestKeyReconstruction({
            familyId,
            requesterId: eventData.encrypted_author_id, // This needs to be decrypted first
            reason: "signing",
            expiresInHours: 2, // Short window for signing
          });

        if (reconstructionResult.success) {
          reconstructionRequestId = reconstructionResult.data!.requestId;

          // Update event with reconstruction request ID
          await db.query(
            `
            UPDATE sss_federated_events 
            SET reconstruction_request_id = $1, status = 'signing_ready'
            WHERE event_uuid = $2
          `,
            [reconstructionRequestId, eventData.event_uuid],
          );
        }
      }

      // Update audit log
      await db.query(
        `
        UPDATE privacy_audit_log SET success = true WHERE id = $1
      `,
        [auditId],
      );

      return {
        success: true,
        data: {
          approved,
          currentApprovals,
          requiredApprovals: eventData.required_guardian_approvals,
          thresholdMet: newStatus === "guardians_approved",
          reconstructionRequestId,
          nextStep:
            newStatus === "guardians_approved"
              ? "guardian_share_provision"
              : "awaiting_more_approvals",
        },
        privacyAuditId: auditId,
      };
    } catch (error) {
      // Log error in audit
      if (auditId) {
        try {
          await db.query(
            `
            UPDATE privacy_audit_log SET success = false, error_message = $1 WHERE id = $2
          `,
            [error instanceof Error ? error.message : String(error), auditId],
          );
        } catch (auditError) {
          console.error("Failed to update audit log:", auditError);
        }
      }

      return {
        success: false,
        error: "Failed to process guardian approval",
        details: error instanceof Error ? error.message : String(error),
        privacyAuditId: auditId,
      };
    }
  }

  /**
   * Guardian provides their share for event signing
   */
  static async provideShareForSigning(params: {
    eventId: string;
    guardianId: string;
    deviceInfo?: any;
  }): Promise<SSSFederatedSigningResponse> {
    try {
      const { eventId, guardianId, deviceInfo } = params;

      // Get the event
      const eventResult = await db.query(
        `
        SELECT * FROM sss_federated_events WHERE event_uuid = $1 OR id = $1
      `,
        [eventId],
      );

      if (eventResult.rows.length === 0) {
        return { success: false, error: "Event not found" };
      }

      const eventData = eventResult.rows[0];

      if (eventData.status !== "signing_ready") {
        return { success: false, error: "Event is not ready for signing" };
      }

      if (!eventData.reconstruction_request_id) {
        return { success: false, error: "No reconstruction request found" };
      }

      // Decrypt family ID
      const familyId = await PrivacyUtils.decryptSensitiveData({
        encrypted: eventData.encrypted_family_id,
        salt: eventData.family_salt,
        iv: eventData.family_iv,
        tag: eventData.family_tag,
      });

      // Get guardian's share indices
      const familyConfig = await this.getFamilyConfig(familyId);
      if (!familyConfig.success) {
        return { success: false, error: "Family configuration not found" };
      }

      const guardianDistribution = familyConfig.data!.shareDistribution.find(
        (d) => d.guardianId === guardianId,
      );

      if (!guardianDistribution) {
        return {
          success: false,
          error: "Guardian not found in share distribution",
        };
      }

      // Provide shares to the reconstruction request
      const shareResult = await FamilyGuardianManager.provideGuardianShare({
        requestId: eventData.reconstruction_request_id,
        guardianId,
        shareIndices: guardianDistribution.shareIndices,
        deviceInfo,
      });

      if (!shareResult.success) {
        return shareResult;
      }

      // If threshold is met, attempt to sign the event
      if (shareResult.data!.thresholdMet) {
        const signingResult = await this.signEventWithReconstructedKey(
          eventData.event_uuid,
          eventData.reconstruction_request_id,
        );

        return {
          success: true,
          data: {
            shareProvided: true,
            thresholdMet: true,
            signingResult,
          },
        };
      }

      return {
        success: true,
        data: {
          shareProvided: true,
          thresholdMet: false,
          remainingNeeded: shareResult.data!.remainingNeeded,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: "Failed to provide share for signing",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Sign event with reconstructed key (internal method)
   */
  private static async signEventWithReconstructedKey(
    eventUuid: string,
    reconstructionRequestId: string,
  ): Promise<any> {
    try {
      // Reconstruct the key for signing
      const keyResult = await FamilyGuardianManager.reconstructKeyForSigning({
        requestId: reconstructionRequestId,
        operation: "sign_event",
      });

      if (!keyResult.success) {
        return { success: false, error: keyResult.error };
      }

      const nsec = keyResult.data!.nsec;

      // Get event data
      const eventResult = await db.query(
        `
        SELECT * FROM sss_federated_events WHERE event_uuid = $1
      `,
        [eventUuid],
      );

      const eventData = eventResult.rows[0];

      // Decrypt event content
      const content = await PrivacyUtils.decryptSensitiveData({
        encrypted: eventData.encrypted_content,
        salt: eventData.content_salt,
        iv: eventData.content_iv,
        tag: eventData.content_tag,
      });

      const familyId = await PrivacyUtils.decryptSensitiveData({
        encrypted: eventData.encrypted_family_id,
        salt: eventData.family_salt,
        iv: eventData.family_iv,
        tag: eventData.family_tag,
      });

      // Create Nostr event
      const nostrEvent = {
        kind: 1,
        content,
        tags: [
          ["t", "family-federated-event"],
          ["family", familyId],
          ["event-type", eventData.event_type],
        ],
        created_at: Math.floor(Date.now() / 1000),
        pubkey: getPublicKey(nip19.decode(nsec).data as Uint8Array),
      };

      // Sign event
      const privateKeyBytes = nip19.decode(nsec).data as Uint8Array;
      const signedEvent = finalizeEvent(nostrEvent, privateKeyBytes);

      // Clear key from memory immediately
      PrivacyUtils.secureClearMemory(nsec);
      privateKeyBytes.fill(0);

      // Verify signature
      if (!verifyEvent(signedEvent)) {
        return { success: false, error: "Invalid event signature" };
      }

      // Update event status
      await db.query(
        `
        UPDATE sss_federated_events 
        SET status = 'signed', signed_event_id = $1, updated_at = NOW()
        WHERE event_uuid = $2
      `,
        [signedEvent.id, eventUuid],
      );

      // Broadcast to Nostr
      const broadcastResult = await this.relay.publishEvent(signedEvent);

      if (broadcastResult.success) {
        await db.query(
          `
          UPDATE sss_federated_events 
          SET status = 'broadcast', broadcast_timestamp = NOW()
          WHERE event_uuid = $1
        `,
          [eventUuid],
        );
      }

      return {
        success: true,
        eventId: signedEvent.id,
        broadcastResult,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to sign event: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Get pending events requiring guardian approval
   */
  static async getPendingApprovals(params: {
    guardianId: string;
    familyId: string;
  }): Promise<SSSFederatedSigningResponse> {
    try {
      const { guardianId, familyId } = params;

      // Verify guardian authorization
      const isAuthorized = await this.verifyGuardianAuthorization(
        guardianId,
        familyId,
      );
      if (!isAuthorized) {
        return {
          success: false,
          error: "Guardian not authorized for this family",
        };
      }

      const encryptedFamilyId =
        await PrivacyUtils.encryptSensitiveData(familyId);

      const result = await db.query(
        `
        SELECT * FROM sss_federated_events 
        WHERE encrypted_family_id = $1 AND status IN ('pending_guardians', 'signing_ready')
        AND expires_at > NOW()
        ORDER BY created_at DESC
      `,
        [encryptedFamilyId.encrypted],
      );

      const pendingEvents = [];

      for (const row of result.rows) {
        try {
          // Decrypt content for display
          const content = await PrivacyUtils.decryptSensitiveData({
            encrypted: row.encrypted_content,
            salt: row.content_salt,
            iv: row.content_iv,
            tag: row.content_tag,
          });

          const authorId = await PrivacyUtils.decryptSensitiveData({
            encrypted: row.encrypted_author_id,
            salt: row.author_salt,
            iv: row.author_iv,
            tag: row.author_tag,
          });

          // Check if this guardian has already approved
          const guardianApprovals = JSON.parse(row.guardian_approvals || "[]");
          const hasApproved = guardianApprovals.some(
            (a: any) => a.guardianId === guardianId,
          );

          if (!hasApproved || row.status === "signing_ready") {
            pendingEvents.push({
              id: row.event_uuid,
              eventType: row.event_type,
              content,
              authorId,
              timestamp: new Date(row.created_at),
              status: row.status,
              requiredApprovals: row.required_guardian_approvals,
              currentApprovals: row.current_guardian_approvals,
              expiresAt: new Date(row.expires_at),
              hasApproved,
              needsShare: row.status === "signing_ready" && !hasApproved,
            });
          }
        } catch (decryptError) {
          console.warn("Failed to decrypt event:", decryptError);
        }
      }

      return {
        success: true,
        data: {
          events: pendingEvents,
          count: pendingEvents.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: "Failed to get pending approvals",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Helper methods
   */
  private static async getFamilyConfig(familyId: string): Promise<{
    success: boolean;
    data?: any;
  }> {
    // Implementation would get family SSS configuration
    // This is a simplified version
    return {
      success: true,
      data: {
        threshold: 3,
        shareDistribution: [
          { guardianId: "guardian1", shareIndices: [1, 2] },
          { guardianId: "guardian2", shareIndices: [3] },
          { guardianId: "guardian3", shareIndices: [4, 5] },
        ],
      },
    };
  }

  private static async verifyGuardianAuthorization(
    guardianId: string,
    familyId: string,
  ): Promise<boolean> {
    try {
      const encryptedGuardianId =
        await PrivacyUtils.encryptSensitiveData(guardianId);
      const encryptedFamilyId =
        await PrivacyUtils.encryptSensitiveData(familyId);

      const result = await db.query(
        `
        SELECT id FROM secure_family_guardians 
        WHERE encrypted_guardian_id = $1 AND encrypted_family_id = $2 AND active = true
      `,
        [encryptedGuardianId.encrypted, encryptedFamilyId.encrypted],
      );

      return result.rows.length > 0;
    } catch (error) {
      console.warn("Failed to verify guardian authorization:", error);
      return false;
    }
  }

  private static async notifyGuardians(
    familyId: string,
    eventId: string,
    eventType: string,
    content: string,
  ): Promise<void> {
    // Implementation would send notifications to guardians
    // This could be via email, Nostr DMs, push notifications, etc.
    console.log(
      `📢 Notifying guardians for family ${familyId} about new ${eventType} event: ${eventId}`,
    );
  }
}

// Database schema for SSS federated events
export const SSS_FEDERATED_EVENTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS sss_federated_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_uuid UUID NOT NULL UNIQUE,
    
    encrypted_family_id TEXT NOT NULL,
    family_salt TEXT NOT NULL,
    family_iv TEXT NOT NULL,
    family_tag TEXT NOT NULL,
    
    event_type TEXT NOT NULL CHECK (event_type IN ('family_announcement', 'payment_request', 'member_update', 'coordination', 'key_rotation')),
    
    encrypted_content TEXT NOT NULL,
    content_salt TEXT NOT NULL,
    content_iv TEXT NOT NULL,
    content_tag TEXT NOT NULL,
    
    encrypted_author_id TEXT NOT NULL,
    author_salt TEXT NOT NULL,
    author_iv TEXT NOT NULL,
    author_tag TEXT NOT NULL,
    
    required_guardian_approvals INTEGER NOT NULL,
    current_guardian_approvals INTEGER NOT NULL DEFAULT 0,
    guardian_approvals JSONB NOT NULL DEFAULT '[]',
    
    status TEXT NOT NULL DEFAULT 'pending_guardians' CHECK (status IN ('pending_guardians', 'guardians_approved', 'signing_ready', 'signed', 'broadcast', 'expired')),
    
    reconstruction_request_id TEXT,
    signed_event_id TEXT,
    broadcast_timestamp TIMESTAMP WITH TIME ZONE,
    
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    privacy_level INTEGER NOT NULL DEFAULT 3
);

CREATE INDEX IF NOT EXISTS idx_sss_events_event_uuid ON sss_federated_events(event_uuid);
CREATE INDEX IF NOT EXISTS idx_sss_events_status ON sss_federated_events(status);
CREATE INDEX IF NOT EXISTS idx_sss_events_expires_at ON sss_federated_events(expires_at);
CREATE INDEX IF NOT EXISTS idx_sss_events_family_id ON sss_federated_events(encrypted_family_id);
`;
