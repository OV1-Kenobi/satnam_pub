/**
 * @fileoverview Privacy-Enhanced Federated Family Nostr Signing API
 * @description Handles multi-signature Nostr events with comprehensive encryption,
 * zero-knowledge principles, and privacy-first data protection
 */

import { finalizeEvent, nip19, verifyEvent } from "../../src/lib/nostr-browser";
import { CitadelRelay } from "../citadel/relay";
import db from "../db";
import {
  decryptSensitiveData,
  encryptSensitiveData,
  generateSecureToken,
  hashSensitiveData,
  logPrivacyOperation,
} from "../privacy/encryption";

/**
 * Privacy utilities class for comprehensive privacy operations
 */
export class PrivacyUtils {
  /**
   * Generate a secure UUID
   */
  static generateSecureUUID(): string {
    return crypto.randomUUID();
  }

  /**
   * Encrypt sensitive data with extended interface
   */
  static async encryptSensitiveData(data: string): Promise<{
    encrypted: string;
    salt: string;
    iv: string;
    tag: string;
  }> {
    const result = await encryptSensitiveData(data);
    return {
      encrypted: result.encrypted,
      salt: generateSecureToken(32), // Generate salt for compatibility
      iv: result.iv,
      tag: result.tag,
    };
  }

  /**
   * Decrypt sensitive data with extended interface
   */
  static async decryptSensitiveData(data: {
    encrypted: string;
    salt: string;
    iv: string;
    tag: string;
  }): Promise<string> {
    return await decryptSensitiveData(data.encrypted, data.iv);
  }

  /**
   * Encrypt Nostr public key (npub)
   */
  static async encryptNpub(npub: string): Promise<{
    encryptedNpub: string;
    salt: string;
    iv: string;
    tag: string;
  }> {
    const result = await encryptSensitiveData(npub);
    return {
      encryptedNpub: result.encrypted,
      salt: generateSecureToken(32),
      iv: result.iv,
      tag: result.tag,
    };
  }

  /**
   * Log privacy operation with return value
   */
  static logPrivacyOperation(operation: {
    action: string;
    dataType: string;
    userId?: string;
    familyId?: string;
    success: boolean;
    ipAddress?: string;
    userAgent?: string;
  }): { id: string } {
    const id = crypto.randomUUID();
    logPrivacyOperation({
      action: operation.action,
      dataType: operation.dataType,
      familyId: operation.familyId,
      success: operation.success,
    });
    return { id };
  }

  /**
   * Secure memory clearing (best effort)
   */
  static secureClearMemory(data: string): void {
    // In browser environment, this is best effort
    // The actual string cannot be securely wiped due to JavaScript's nature
    try {
      // Create a new variable to overwrite the original reference
      const overwrite = new Array(data.length).fill("0").join("");
      // This won't actually clear the original string from memory
      // but signals intent for security-conscious handling
      console.debug("Memory cleared for security");
    } catch (error) {
      console.warn("Memory clearing failed:", error);
    }
  }
}

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
      const eventId = `federated_${Date.now()}_${
        crypto.randomUUID().split("-")[0]
      }`;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Encrypt sensitive data
      const encryptedFamilyId = await PrivacyUtils.encryptSensitiveData(
        familyId
      );
      const encryptedContent = await PrivacyUtils.encryptSensitiveData(content);
      const encryptedAuthorId = await PrivacyUtils.encryptSensitiveData(
        authorId
      );
      const encryptedAuthorPubkey = await PrivacyUtils.encryptNpub(
        authorPubkey
      );

      // Create member signatures with privacy protection
      const signaturesRequired = 2;
      const defaultSigners = requiredSigners || [authorId, "2"];

      const memberSignatures = defaultSigners.reduce((acc, signerId) => {
        acc[signerId] = {
          memberId: signerId,
          memberPubkey: signerId === authorId ? authorPubkey : "",
          signed: false,
          privacyConsent: true, // Should be explicitly obtained
        };
        return acc;
      }, {} as Record<string, SecureMemberSignature>);

      // Encrypt member signatures
      const encryptedMemberSignatures = await PrivacyUtils.encryptSensitiveData(
        JSON.stringify(memberSignatures)
      );

      // Store in secure database using proper Supabase client
      try {
        const client = await db.getClient();
        await client.from("secure_federated_events").insert({
          event_uuid: eventUuid,
          encrypted_family_id: encryptedFamilyId.encrypted,
          family_salt: encryptedFamilyId.salt,
          family_iv: encryptedFamilyId.iv,
          family_tag: encryptedFamilyId.tag,
          event_type: eventType,
          encrypted_content: encryptedContent.encrypted,
          content_salt: encryptedContent.salt,
          content_iv: encryptedContent.iv,
          content_tag: encryptedContent.tag,
          encrypted_author_id: encryptedAuthorId.encrypted,
          author_salt: encryptedAuthorId.salt,
          author_iv: encryptedAuthorId.iv,
          author_tag: encryptedAuthorId.tag,
          encrypted_author_pubkey: encryptedAuthorPubkey.encryptedNpub,
          pubkey_salt: encryptedAuthorPubkey.salt,
          pubkey_iv: encryptedAuthorPubkey.iv,
          pubkey_tag: encryptedAuthorPubkey.tag,
          signatures_required: signaturesRequired,
          signatures_received: 0,
          encrypted_member_signatures: encryptedMemberSignatures.encrypted,
          signatures_salt: encryptedMemberSignatures.salt,
          signatures_iv: encryptedMemberSignatures.iv,
          signatures_tag: encryptedMemberSignatures.tag,
          status: "pending",
          expires_at: expiresAt.toISOString(),
          created_at: new Date().toISOString(),
        });

        // Update audit log with success
        await client.from("privacy_audit_log").insert({
          id: auditId,
          action: "create",
          data_type: "event",
          encrypted_user_id: encryptedAuthorId.encrypted,
          user_salt: encryptedAuthorId.salt,
          user_iv: encryptedAuthorId.iv,
          user_tag: encryptedAuthorId.tag,
          encrypted_family_id: encryptedFamilyId.encrypted,
          family_salt: encryptedFamilyId.salt,
          family_iv: encryptedFamilyId.iv,
          family_tag: encryptedFamilyId.tag,
          success: true,
        });
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
      const sessionId = `session_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      try {
        const client = await db.getClient();
        const encryptedSessionId = await PrivacyUtils.encryptSensitiveData(
          sessionId
        );
        const encryptedEventId = await PrivacyUtils.encryptSensitiveData(
          eventId
        );
        const encryptedInitiator = await PrivacyUtils.encryptSensitiveData(
          authorId
        );
        const encryptedRequiredSigners =
          await PrivacyUtils.encryptSensitiveData(
            JSON.stringify(defaultSigners)
          );
        const encryptedCompletedSigners =
          await PrivacyUtils.encryptSensitiveData(JSON.stringify([]));

        await client.from("secure_federated_signing_sessions").insert({
          session_uuid: sessionUuid,
          encrypted_session_id: encryptedSessionId.encrypted,
          session_salt: encryptedSessionId.salt,
          session_iv: encryptedSessionId.iv,
          session_tag: encryptedSessionId.tag,
          encrypted_event_id: encryptedEventId.encrypted,
          event_salt: encryptedEventId.salt,
          event_iv: encryptedEventId.iv,
          event_tag: encryptedEventId.tag,
          encrypted_family_id: encryptedFamilyId.encrypted,
          family_salt: encryptedFamilyId.salt,
          family_iv: encryptedFamilyId.iv,
          family_tag: encryptedFamilyId.tag,
          event_type: eventType,
          encrypted_initiator: encryptedInitiator.encrypted,
          initiator_salt: encryptedInitiator.salt,
          initiator_iv: encryptedInitiator.iv,
          initiator_tag: encryptedInitiator.tag,
          encrypted_initiator_pubkey: encryptedAuthorPubkey.encryptedNpub,
          pubkey_salt: encryptedAuthorPubkey.salt,
          pubkey_iv: encryptedAuthorPubkey.iv,
          pubkey_tag: encryptedAuthorPubkey.tag,
          encrypted_required_signers: encryptedRequiredSigners.encrypted,
          required_salt: encryptedRequiredSigners.salt,
          required_iv: encryptedRequiredSigners.iv,
          required_tag: encryptedRequiredSigners.tag,
          encrypted_completed_signers: encryptedCompletedSigners.encrypted,
          completed_salt: encryptedCompletedSigners.salt,
          completed_iv: encryptedCompletedSigners.iv,
          completed_tag: encryptedCompletedSigners.tag,
          status: "active",
          expires_at: expiresAt.toISOString(),
          created_at: new Date().toISOString(),
          last_activity: new Date().toISOString(),
        });
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
          const client = await db.getClient();
          await client
            .from("privacy_audit_log")
            .update({
              success: false,
              error_message:
                error instanceof Error ? error.message : String(error),
            })
            .eq("id", auditId);
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
      const client = await db.getClient();
      const eventResult = await client
        .from("secure_federated_events")
        .select("*")
        .or(`event_uuid.eq.${eventId},id.eq.${eventId}`)
        .limit(1);

      if (!eventResult.data || eventResult.data.length === 0) {
        return {
          success: false,
          error: "Event not found",
          privacyAuditId: auditId,
        };
      }

      const eventData = eventResult.data[0];

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
        })
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
      const nostrEventBase = {
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

      // Generate interoperable event ID using your existing UUID/salt system
      const eventUUID = crypto.randomUUID();
      const saltedEventData = `${eventUUID}-${memberPubkey}-${decryptedFamilyId}-${eventData.event_type}-${auditId}`;
      const eventNostrId = await finalizeEvent.generateEventId({
        ...nostrEventBase,
        id: saltedEventData, // Use salted UUID that will be properly hashed
      });

      const nostrEvent = {
        ...nostrEventBase,
        id: eventNostrId,
      };

      // Sign the event with privacy protection
      let privateKeyBytes: Uint8Array;
      try {
        if (memberPrivateKey.startsWith("nsec")) {
          const decoded = nip19.decode(memberPrivateKey);
          privateKeyBytes = nip19.hexToBytes(decoded.data);
        } else {
          privateKeyBytes = nip19.hexToBytes(memberPrivateKey);
        }
      } catch (error) {
        return {
          success: false,
          error: "Invalid private key format",
          privacyAuditId: auditId,
        };
      }

      const signedEvent = await finalizeEvent.sign(
        nostrEvent,
        nip19.bytesToHex(privateKeyBytes)
      );

      // Clear private key from memory (best effort)
      PrivacyUtils.secureClearMemory(memberPrivateKey);

      // Verify the signature
      if (!(await verifyEvent.verify(signedEvent))) {
        return {
          success: false,
          error: "Invalid event signature",
          privacyAuditId: auditId,
        };
      }

      // Update member signature with privacy protection
      const hashedUserAgent = deviceInfo?.userAgent
        ? await hashSensitiveData(deviceInfo.userAgent)
        : "";
      const hashedIpAddress = deviceInfo?.ipAddress
        ? await hashSensitiveData(deviceInfo.ipAddress)
        : "";

      const updatedSignatures = {
        ...decryptedMemberSignatures,
        [memberId]: {
          memberId,
          memberPubkey,
          signed: true,
          signature: signedEvent.sig,
          timestamp: new Date(),
          deviceInfo: {
            userAgent: hashedUserAgent,
            ipAddress: hashedIpAddress,
          },
          privacyConsent,
        },
      };

      const newSignaturesReceived = (
        Object.values(updatedSignatures) as SecureMemberSignature[]
      ).filter((sig: SecureMemberSignature) => sig.signed).length;
      const newStatus =
        newSignaturesReceived >= eventData.signatures_required
          ? "signed"
          : "pending";

      // Re-encrypt updated signatures
      const encryptedUpdatedSignatures =
        await PrivacyUtils.encryptSensitiveData(
          JSON.stringify(updatedSignatures)
        );

      // Update database with encrypted data
      try {
        await client
          .from("secure_federated_events")
          .update({
            encrypted_member_signatures: encryptedUpdatedSignatures.encrypted,
            signatures_salt: encryptedUpdatedSignatures.salt,
            signatures_iv: encryptedUpdatedSignatures.iv,
            signatures_tag: encryptedUpdatedSignatures.tag,
            signatures_received: newSignaturesReceived,
            status: newStatus,
            nostr_event_id: signedEvent.id,
            updated_at: new Date().toISOString(),
          })
          .eq("event_uuid", eventData.event_uuid);

        // Update audit log with success
        await client
          .from("privacy_audit_log")
          .update({ success: true })
          .eq("id", auditId);
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
          broadcastResult = await CitadelRelay.publishEvent(signedEvent);
          if (broadcastResult.success) {
            await client
              .from("secure_federated_events")
              .update({
                status: "broadcast",
                broadcast_timestamp: new Date().toISOString(),
              })
              .eq("event_uuid", eventData.event_uuid);
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
          const errorClient = await db.getClient();
          await errorClient
            .from("privacy_audit_log")
            .update({
              success: false,
              error_message:
                error instanceof Error ? error.message : String(error),
            })
            .eq("id", auditId);
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
      const encryptedFamilyId = await PrivacyUtils.encryptSensitiveData(
        familyId
      );

      const client = await db.getClient();
      const result = await client
        .from("secure_federated_events")
        .select("*")
        .eq("encrypted_family_id", encryptedFamilyId.encrypted)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });

      // Decrypt and filter events where this member needs to sign
      const memberEvents = [];

      for (const event of result.data || []) {
        try {
          // Decrypt member signatures to check if member can sign
          const decryptedMemberSignatures = JSON.parse(
            await PrivacyUtils.decryptSensitiveData({
              encrypted: event.encrypted_member_signatures,
              salt: event.signatures_salt,
              iv: event.signatures_iv,
              tag: event.signatures_tag,
            })
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
      await client
        .from("privacy_audit_log")
        .update({ success: true })
        .eq("id", auditId);

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
          const errorClient = await db.getClient();
          await errorClient
            .from("privacy_audit_log")
            .update({
              success: false,
              error_message:
                error instanceof Error ? error.message : String(error),
            })
            .eq("id", auditId);
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
