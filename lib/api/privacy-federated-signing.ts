/**
 * @fileoverview Privacy-Enhanced Federated Family Nostr Signing API
 * @description Handles multi-signature Nostr events with comprehensive encryption,
 * zero-knowledge principles, and privacy-first data protection
 */

import { finalizeEvent, nip19, verifyEvent } from "nostr-tools";
import { CitadelRelay } from "../citadel/relay";
import db from "../db";
import { PrivacyUtils } from "../privacy/encryption";

/**
 * Privacy-enhanced federated Nostr event
 */
export interface SecureFederatedNostrEvent {
  id: string;
  eventUuid: string;
  familyId: string; // This will be encrypted in storage
  eventType:
    | "family_announcement"
    | "payment_request"
    | "member_update"
    | "coordination";
  content: string; // This will be encrypted in storage
  author: string; // This will be encrypted in storage
  authorPubkey: string; // This will be encrypted in storage
  timestamp: Date;
  status: "pending" | "signed" | "broadcast" | "expired";
  signaturesRequired: number;
  signaturesReceived: number;
  memberSignatures: Record<string, SecureMemberSignature>;
  nostrEventId?: string;
  broadcastTimestamp?: Date;
  expiresAt: Date;
  privacyLevel: 1 | 2 | 3; // 1=basic, 2=enhanced, 3=maximum
}

/**
 * Privacy-enhanced member signature
 */
export interface SecureMemberSignature {
  memberId: string; // Encrypted in storage
  memberPubkey: string; // Encrypted in storage
  signed: boolean;
  signature?: string;
  timestamp?: Date;
  deviceInfo?: {
    userAgent: string; // Hashed in storage
    ipAddress: string; // Hashed in storage
  };
  privacyConsent: boolean;
}

/**
 * Privacy-enhanced API response
 */
export interface SecureFederatedSigningResponse {
  success: boolean;
  data?: any;
  error?: string;
  details?: any;
  privacyAuditId?: string;
}

/**
 * Privacy-Enhanced Federated Signing API
 */
export class PrivacyFederatedSigningAPI {
  private static relay = new CitadelRelay();

  /**
   * Create a new federated event with full encryption
   */
  static async createSecureFederatedEvent(params: {
    familyId: string;
    eventType: SecureFederatedNostrEvent["eventType"];
    content: string;
    authorId: string;
    authorPubkey: string;
    requiredSigners?: string[];
    privacyLevel?: 1 | 2 | 3;
  }): Promise<SecureFederatedSigningResponse> {
    let auditId: string | undefined;

    try {
      const {
        familyId,
        eventType,
        content,
        authorId,
        authorPubkey,
        requiredSigners,
        privacyLevel = 3,
      } = params;

      // Log privacy operation
      const auditEntry = PrivacyUtils.logPrivacyOperation({
        action: "create",
        dataType: "event",
        userId: authorId,
        familyId,
        success: false, // Will update on success
      });
      auditId = auditEntry.id;

      // Generate secure identifiers
      const eventUuid = PrivacyUtils.generateSecureUUID();
      const eventId = `federated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Encrypt sensitive data
      const encryptedFamilyId =
        await PrivacyUtils.encryptSensitiveData(familyId);
      const encryptedContent = await PrivacyUtils.encryptSensitiveData(content);
      const encryptedAuthorId =
        await PrivacyUtils.encryptSensitiveData(authorId);
      const encryptedAuthorPubkey =
        await PrivacyUtils.encryptNpub(authorPubkey);

      // Create member signatures with privacy protection
      const signaturesRequired = 2;
      const defaultSigners = requiredSigners || [authorId, "2"];

      const memberSignatures = defaultSigners.reduce(
        (acc, signerId) => {
          acc[signerId] = {
            memberId: signerId,
            memberPubkey: signerId === authorId ? authorPubkey : "",
            signed: false,
            privacyConsent: true, // Should be explicitly obtained
          };
          return acc;
        },
        {} as Record<string, SecureMemberSignature>,
      );

      // Encrypt member signatures
      const encryptedMemberSignatures = await PrivacyUtils.encryptSensitiveData(
        JSON.stringify(memberSignatures),
      );

      // Store in secure database
      try {
        await db.query(
          `INSERT INTO secure_federated_events (
            event_uuid, encrypted_family_id, family_salt, family_iv, family_tag,
            event_type, encrypted_content, content_salt, content_iv, content_tag,
            encrypted_author_id, author_salt, author_iv, author_tag,
            encrypted_author_pubkey, pubkey_salt, pubkey_iv, pubkey_tag,
            signatures_required, signatures_received,
            encrypted_member_signatures, signatures_salt, signatures_iv, signatures_tag,
            status, expires_at, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)`,
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
            encryptedAuthorPubkey.encryptedNpub,
            encryptedAuthorPubkey.salt,
            encryptedAuthorPubkey.iv,
            encryptedAuthorPubkey.tag,
            signaturesRequired,
            0,
            encryptedMemberSignatures.encrypted,
            encryptedMemberSignatures.salt,
            encryptedMemberSignatures.iv,
            encryptedMemberSignatures.tag,
            "pending",
            expiresAt.toISOString(),
            new Date().toISOString(),
          ],
        );

        // Update audit log with success
        await db.query(
          `INSERT INTO privacy_audit_log (id, action, data_type, encrypted_user_id, user_salt, user_iv, user_tag, encrypted_family_id, family_salt, family_iv, family_tag, success) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            auditId,
            "create",
            "event",
            encryptedAuthorId.encrypted,
            encryptedAuthorId.salt,
            encryptedAuthorId.iv,
            encryptedAuthorId.tag,
            encryptedFamilyId.encrypted,
            encryptedFamilyId.salt,
            encryptedFamilyId.iv,
            encryptedFamilyId.tag,
            true,
          ],
        );
      } catch (dbError) {
        return {
          success: false,
          error: "Failed to create secure federated event",
          details: dbError,
          privacyAuditId: auditId,
        };
      }

      // Create secure signing session
      const sessionUuid = PrivacyUtils.generateSecureUUID();
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      try {
        const encryptedSessionId =
          await PrivacyUtils.encryptSensitiveData(sessionId);
        const encryptedEventId =
          await PrivacyUtils.encryptSensitiveData(eventId);
        const encryptedInitiator =
          await PrivacyUtils.encryptSensitiveData(authorId);
        const encryptedRequiredSigners =
          await PrivacyUtils.encryptSensitiveData(
            JSON.stringify(defaultSigners),
          );
        const encryptedCompletedSigners =
          await PrivacyUtils.encryptSensitiveData(JSON.stringify([]));

        await db.query(
          `INSERT INTO secure_federated_signing_sessions (
            session_uuid, encrypted_session_id, session_salt, session_iv, session_tag,
            encrypted_event_id, event_salt, event_iv, event_tag,
            encrypted_family_id, family_salt, family_iv, family_tag,
            event_type, encrypted_initiator, initiator_salt, initiator_iv, initiator_tag,
            encrypted_initiator_pubkey, pubkey_salt, pubkey_iv, pubkey_tag,
            encrypted_required_signers, required_salt, required_iv, required_tag,
            encrypted_completed_signers, completed_salt, completed_iv, completed_tag,
            status, expires_at, created_at, last_activity
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33)`,
          [
            sessionUuid,
            encryptedSessionId.encrypted,
            encryptedSessionId.salt,
            encryptedSessionId.iv,
            encryptedSessionId.tag,
            encryptedEventId.encrypted,
            encryptedEventId.salt,
            encryptedEventId.iv,
            encryptedEventId.tag,
            encryptedFamilyId.encrypted,
            encryptedFamilyId.salt,
            encryptedFamilyId.iv,
            encryptedFamilyId.tag,
            eventType,
            encryptedInitiator.encrypted,
            encryptedInitiator.salt,
            encryptedInitiator.iv,
            encryptedInitiator.tag,
            encryptedAuthorPubkey.encryptedNpub,
            encryptedAuthorPubkey.salt,
            encryptedAuthorPubkey.iv,
            encryptedAuthorPubkey.tag,
            encryptedRequiredSigners.encrypted,
            encryptedRequiredSigners.salt,
            encryptedRequiredSigners.iv,
            encryptedRequiredSigners.tag,
            encryptedCompletedSigners.encrypted,
            encryptedCompletedSigners.salt,
            encryptedCompletedSigners.iv,
            encryptedCompletedSigners.tag,
            "active",
            expiresAt.toISOString(),
            new Date().toISOString(),
            new Date().toISOString(),
          ],
        );
      } catch (sessionError) {
        console.warn("Failed to create secure signing session:", sessionError);
        // Continue even if session creation fails
      }

      const secureFederatedEvent: SecureFederatedNostrEvent = {
        id: eventId,
        eventUuid,
        familyId,
        eventType,
        content,
        author: authorId,
        authorPubkey,
        timestamp: new Date(),
        status: "pending",
        signaturesRequired,
        signaturesReceived: 0,
        memberSignatures,
        expiresAt,
        privacyLevel,
      };

      return {
        success: true,
        data: {
          event: secureFederatedEvent,
          sessionId,
          sessionUuid,
        },
        privacyAuditId: auditId,
      };
    } catch (error) {
      // Log error in audit
      if (auditId) {
        try {
          await db.query(
            `UPDATE privacy_audit_log SET success = false, error_message = $1 WHERE id = $2`,
            [error instanceof Error ? error.message : String(error), auditId],
          );
        } catch (auditError) {
          console.error("Failed to update audit log:", auditError);
        }
      }

      return {
        success: false,
        error: "Failed to create secure federated event",
        details: error instanceof Error ? error.message : String(error),
        privacyAuditId: auditId,
      };
    }
  }

  /**
   * Sign a federated event with full privacy protection
   */
  static async signSecureFederatedEvent(params: {
    eventId: string;
    memberId: string;
    memberPubkey: string;
    memberPrivateKey: string;
    deviceInfo?: SecureMemberSignature["deviceInfo"];
    privacyConsent?: boolean;
  }): Promise<SecureFederatedSigningResponse> {
    let auditId: string | undefined;

    try {
      const {
        eventId,
        memberId,
        memberPubkey,
        memberPrivateKey,
        deviceInfo,
        privacyConsent = true,
      } = params;

      if (!privacyConsent) {
        return {
          success: false,
          error: "Privacy consent is required for signing operations",
        };
      }

      // Log privacy operation
      const auditEntry = PrivacyUtils.logPrivacyOperation({
        action: "decrypt",
        dataType: "event",
        userId: memberId,
        success: false,
        ipAddress: deviceInfo?.ipAddress,
        userAgent: deviceInfo?.userAgent,
      });
      auditId = auditEntry.id;

      // Find and decrypt the event
      const eventResult = await db.query(
        `SELECT * FROM secure_federated_events WHERE event_uuid = $1 OR id = $2`,
        [eventId, eventId],
      );

      if (eventResult.rows.length === 0) {
        return {
          success: false,
          error: "Event not found",
          privacyAuditId: auditId,
        };
      }

      const eventData = eventResult.rows[0];

      // Decrypt event data
      const decryptedFamilyId = await PrivacyUtils.decryptSensitiveData({
        encrypted: eventData.encrypted_family_id,
        salt: eventData.family_salt,
        iv: eventData.family_iv,
        tag: eventData.family_tag,
      });

      const decryptedContent = await PrivacyUtils.decryptSensitiveData({
        encrypted: eventData.encrypted_content,
        salt: eventData.content_salt,
        iv: eventData.content_iv,
        tag: eventData.content_tag,
      });

      const decryptedMemberSignatures = JSON.parse(
        await PrivacyUtils.decryptSensitiveData({
          encrypted: eventData.encrypted_member_signatures,
          salt: eventData.signatures_salt,
          iv: eventData.signatures_iv,
          tag: eventData.signatures_tag,
        }),
      );

      // Validate event is still pending and not expired
      if (eventData.status !== "pending") {
        return {
          success: false,
          error: "Event is no longer pending signatures",
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

      // Validate member is allowed to sign
      if (!decryptedMemberSignatures[memberId]) {
        return {
          success: false,
          error: "Member not authorized to sign this event",
          privacyAuditId: auditId,
        };
      }

      if (decryptedMemberSignatures[memberId].signed) {
        return {
          success: false,
          error: "Member has already signed this event",
          privacyAuditId: auditId,
        };
      }

      // Create the Nostr event for signing
      const nostrEvent = {
        kind: 1,
        content: decryptedContent,
        tags: [
          ["e", eventId],
          ["t", "secure-federated-family-event"],
          ["family", decryptedFamilyId],
          ["event-type", eventData.event_type],
        ],
        created_at: Math.floor(new Date(eventData.created_at).getTime() / 1000),
        pubkey: memberPubkey,
      };

      // Sign the event with privacy protection
      let privateKeyBytes: Uint8Array;
      try {
        if (memberPrivateKey.startsWith("nsec")) {
          const decoded = nip19.decode(memberPrivateKey);
          privateKeyBytes = decoded.data as Uint8Array;
        } else {
          privateKeyBytes = new Uint8Array(
            Buffer.from(memberPrivateKey, "hex"),
          );
        }
      } catch (error) {
        return {
          success: false,
          error: "Invalid private key format",
          privacyAuditId: auditId,
        };
      }

      const signedEvent = finalizeEvent(nostrEvent, privateKeyBytes);

      // Clear private key from memory (best effort)
      PrivacyUtils.secureClearMemory(memberPrivateKey);

      // Verify the signature
      if (!verifyEvent(signedEvent)) {
        return {
          success: false,
          error: "Invalid event signature",
          privacyAuditId: auditId,
        };
      }

      // Update member signature with privacy protection
      const updatedSignatures = {
        ...decryptedMemberSignatures,
        [memberId]: {
          memberId,
          memberPubkey,
          signed: true,
          signature: signedEvent.sig,
          timestamp: new Date(),
          deviceInfo: {
            userAgent: deviceInfo?.userAgent
              ? crypto
                  .createHash("sha256")
                  .update(deviceInfo.userAgent)
                  .digest("hex")
              : "",
            ipAddress: deviceInfo?.ipAddress
              ? crypto
                  .createHash("sha256")
                  .update(deviceInfo.ipAddress)
                  .digest("hex")
              : "",
          },
          privacyConsent,
        },
      };

      const newSignaturesReceived = Object.values(updatedSignatures).filter(
        (sig) => sig.signed,
      ).length;
      const newStatus =
        newSignaturesReceived >= eventData.signatures_required
          ? "signed"
          : "pending";

      // Re-encrypt updated signatures
      const encryptedUpdatedSignatures =
        await PrivacyUtils.encryptSensitiveData(
          JSON.stringify(updatedSignatures),
        );

      // Update database with encrypted data
      try {
        await db.query(
          `UPDATE secure_federated_events 
           SET encrypted_member_signatures = $1, signatures_salt = $2, signatures_iv = $3, signatures_tag = $4,
               signatures_received = $5, status = $6, nostr_event_id = $7, updated_at = $8
           WHERE event_uuid = $9`,
          [
            encryptedUpdatedSignatures.encrypted,
            encryptedUpdatedSignatures.salt,
            encryptedUpdatedSignatures.iv,
            encryptedUpdatedSignatures.tag,
            newSignaturesReceived,
            newStatus,
            signedEvent.id,
            new Date().toISOString(),
            eventData.event_uuid,
          ],
        );

        // Update audit log with success
        await db.query(
          `UPDATE privacy_audit_log SET success = true WHERE id = $1`,
          [auditId],
        );
      } catch (updateError) {
        return {
          success: false,
          error: "Failed to update event signatures",
          details: updateError,
          privacyAuditId: auditId,
        };
      }

      // If all signatures collected, broadcast to Nostr
      let broadcastResult = null;
      if (newStatus === "signed") {
        try {
          broadcastResult = await this.relay.publishEvent(signedEvent);
          if (broadcastResult.success) {
            await db.query(
              `UPDATE secure_federated_events SET status = 'broadcast', broadcast_timestamp = $1 WHERE event_uuid = $2`,
              [new Date().toISOString(), eventData.event_uuid],
            );
          }
        } catch (broadcastError) {
          console.warn("Failed to broadcast event:", broadcastError);
          // Don't fail the signing process if broadcast fails
        }
      }

      return {
        success: true,
        data: {
          eventId,
          status: newStatus,
          signaturesReceived: newSignaturesReceived,
          signaturesRequired: eventData.signatures_required,
          broadcastResult,
        },
        privacyAuditId: auditId,
      };
    } catch (error) {
      // Log error in audit
      if (auditId) {
        try {
          await db.query(
            `UPDATE privacy_audit_log SET success = false, error_message = $1 WHERE id = $2`,
            [error instanceof Error ? error.message : String(error), auditId],
          );
        } catch (auditError) {
          console.error("Failed to update audit log:", auditError);
        }
      }

      return {
        success: false,
        error: "Failed to sign secure federated event",
        details: error instanceof Error ? error.message : String(error),
        privacyAuditId: auditId,
      };
    }
  }

  /**
   * Get pending events with privacy protection
   */
  static async getSecurePendingEvents(params: {
    familyId: string;
    memberId: string;
    includeAuditId?: boolean;
  }): Promise<SecureFederatedSigningResponse> {
    let auditId: string | undefined;

    try {
      const { familyId, memberId, includeAuditId = false } = params;

      // Log privacy operation
      const auditEntry = PrivacyUtils.logPrivacyOperation({
        action: "access",
        dataType: "event",
        userId: memberId,
        familyId,
        success: false,
      });
      auditId = auditEntry.id;

      // Encrypt family ID for search
      const encryptedFamilyId =
        await PrivacyUtils.encryptSensitiveData(familyId);

      const result = await db.query(
        `SELECT * FROM secure_federated_events 
         WHERE encrypted_family_id = $1 AND status = 'pending' AND expires_at > $2
         ORDER BY created_at DESC`,
        [encryptedFamilyId.encrypted, new Date().toISOString()],
      );

      // Decrypt and filter events where this member needs to sign
      const memberEvents = [];

      for (const event of result.rows) {
        try {
          // Decrypt member signatures to check if member can sign
          const decryptedMemberSignatures = JSON.parse(
            await PrivacyUtils.decryptSensitiveData({
              encrypted: event.encrypted_member_signatures,
              salt: event.signatures_salt,
              iv: event.signatures_iv,
              tag: event.signatures_tag,
            }),
          );

          if (
            decryptedMemberSignatures[memberId] &&
            !decryptedMemberSignatures[memberId].signed
          ) {
            // Decrypt other fields for display
            const decryptedContent = await PrivacyUtils.decryptSensitiveData({
              encrypted: event.encrypted_content,
              salt: event.content_salt,
              iv: event.content_iv,
              tag: event.content_tag,
            });

            const decryptedAuthorId = await PrivacyUtils.decryptSensitiveData({
              encrypted: event.encrypted_author_id,
              salt: event.author_salt,
              iv: event.author_iv,
              tag: event.author_tag,
            });

            memberEvents.push({
              id: event.id || event.event_uuid,
              eventUuid: event.event_uuid,
              familyId,
              eventType: event.event_type,
              content: decryptedContent,
              author: decryptedAuthorId,
              timestamp: new Date(event.created_at),
              status: event.status,
              signaturesRequired: event.signatures_required,
              signaturesReceived: event.signatures_received,
              expiresAt: new Date(event.expires_at),
              privacyLevel: event.privacy_level || 3,
            });
          }
        } catch (decryptError) {
          console.warn("Failed to decrypt event:", decryptError);
          // Skip events that can't be decrypted
        }
      }

      // Update audit log with success
      await db.query(
        `UPDATE privacy_audit_log SET success = true WHERE id = $1`,
        [auditId],
      );

      return {
        success: true,
        data: {
          events: memberEvents,
          count: memberEvents.length,
        },
        privacyAuditId: includeAuditId ? auditId : undefined,
      };
    } catch (error) {
      // Log error in audit
      if (auditId) {
        try {
          await db.query(
            `UPDATE privacy_audit_log SET success = false, error_message = $1 WHERE id = $2`,
            [error instanceof Error ? error.message : String(error), auditId],
          );
        } catch (auditError) {
          console.error("Failed to update audit log:", auditError);
        }
      }

      return {
        success: false,
        error: "Failed to get secure pending events",
        details: error instanceof Error ? error.message : String(error),
        privacyAuditId: auditId,
      };
    }
  }
}
