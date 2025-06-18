/**
 * @fileoverview Simplified Federated Family Nostr Account Event Signing API
 * @description Handles multi-signature Nostr events for family coordination
 * with privacy-first and secure signing workflows
 */

import { finalizeEvent, nip19, verifyEvent } from "nostr-tools";
import { CitadelRelay } from "../citadel/relay";
import db from "../db";

/**
 * Represents a Nostr event that requires multiple signatures from family members
 */
export interface FederatedNostrEvent {
  id: string;
  familyId: string;
  eventType:
    | "family_announcement"
    | "payment_request"
    | "member_update"
    | "coordination";
  content: string;
  author: string;
  authorPubkey: string;
  timestamp: Date;
  status: "pending" | "signed" | "broadcast" | "expired";
  signaturesRequired: number;
  signaturesReceived: number;
  memberSignatures: Record<string, MemberSignature>;
  nostrEventId?: string;
  broadcastTimestamp?: Date;
  expiresAt: Date;
}

/**
 * Individual member signature for an event
 */
export interface MemberSignature {
  memberId: string;
  memberPubkey: string;
  signed: boolean;
  signature?: string;
  timestamp?: Date;
  deviceInfo?: {
    userAgent: string;
    ipAddress: string;
  };
}

/**
 * Active signing session for coordinating multi-signature events
 */
export interface FederatedSigningSession {
  sessionId: string;
  eventId: string;
  eventType: string;
  initiator: string;
  initiatorPubkey: string;
  requiredSigners: string[];
  completedSigners: string[];
  status: "active" | "completed" | "expired" | "cancelled";
  createdAt: Date;
  expiresAt: Date;
  lastActivity: Date;
}

/**
 * API response structure
 */
export interface FederatedSigningResponse {
  success: boolean;
  data?: any;
  error?: string;
  details?: any;
}

/**
 * Simplified API class for federated family Nostr event signing
 */
export class FederatedSigningAPI {
  private static relay = new CitadelRelay();

  /**
   * Create a new federated event that requires multiple signatures
   */
  static async createFederatedEvent(params: {
    familyId: string;
    eventType: FederatedNostrEvent["eventType"];
    content: string;
    authorId: string;
    authorPubkey: string;
    requiredSigners?: string[];
  }): Promise<FederatedSigningResponse> {
    try {
      const {
        familyId,
        eventType,
        content,
        authorId,
        authorPubkey,
        requiredSigners,
      } = params;

      // Validate required signers are provided
      const signaturesRequired = 2;
      if (!requiredSigners || requiredSigners.length < signaturesRequired) {
        return {
          success: false,
          error: `requiredSigners must supply at least ${signaturesRequired} valid member IDs`,
        };
      }

      // Validate no duplicate signers
      const uniqueSigners = [...new Set(requiredSigners)];
      if (uniqueSigners.length !== requiredSigners.length) {
        return {
          success: false,
          error: "requiredSigners cannot contain duplicate member IDs",
        };
      }

      const defaultSigners = requiredSigners;

      // Create event record
      const eventId = `federated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      const memberSignatures = defaultSigners.reduce(
        (acc, signerId) => {
          acc[signerId] = {
            memberId: signerId,
            memberPubkey: signerId === authorId ? authorPubkey : "", // Will be filled when signing
            signed: false,
          };
          return acc;
        },
        {} as Record<string, MemberSignature>,
      );

      // Store in database
      try {
        await db.query(
          `INSERT INTO federated_events (
            id, family_id, event_type, content, author_id, author_pubkey,
            signatures_required, signatures_received, member_signatures,
            status, expires_at, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            eventId,
            familyId,
            eventType,
            content,
            authorId,
            authorPubkey,
            signaturesRequired,
            0,
            JSON.stringify(memberSignatures),
            "pending",
            expiresAt.toISOString(),
            new Date().toISOString(),
          ],
        );
      } catch (dbError) {
        return {
          success: false,
          error: "Failed to create federated event",
          details: dbError,
        };
      }

      // Create signing session
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      try {
        await db.query(
          `INSERT INTO federated_signing_sessions (
            session_id, event_id, family_id, event_type, initiator, initiator_pubkey,
            required_signers, completed_signers, status, expires_at, created_at, last_activity
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            sessionId,
            eventId,
            familyId,
            eventType,
            authorId,
            authorPubkey,
            JSON.stringify(defaultSigners),
            JSON.stringify([]),
            "active",
            expiresAt.toISOString(),
            new Date().toISOString(),
            new Date().toISOString(),
          ],
        );
      } catch (sessionError) {
        console.warn("Failed to create signing session:", sessionError);
        // Continue even if session creation fails
      }

      const federatedEvent: FederatedNostrEvent = {
        id: eventId,
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
      };

      return {
        success: true,
        data: {
          event: federatedEvent,
          sessionId,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: "Failed to create federated event",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Sign a federated event as a family member
   */
  static async signFederatedEvent(params: {
    eventId: string;
    memberId: string;
    memberPubkey: string;
    memberPrivateKey: string;
    deviceInfo?: MemberSignature["deviceInfo"];
  }): Promise<FederatedSigningResponse> {
    try {
      const { eventId, memberId, memberPubkey, memberPrivateKey, deviceInfo } =
        params;

      // Get the event
      const eventResult = await db.query(
        `SELECT * FROM federated_events WHERE id = $1`,
        [eventId],
      );

      if (eventResult.rows.length === 0) {
        return { success: false, error: "Event not found" };
      }

      const eventData = eventResult.rows[0];
      const memberSignatures =
        typeof eventData.member_signatures === "string"
          ? JSON.parse(eventData.member_signatures)
          : eventData.member_signatures || {};

      // Validate event is still pending and not expired
      if (eventData.status !== "pending") {
        return {
          success: false,
          error: "Event is no longer pending signatures",
        };
      }

      if (new Date(eventData.expires_at) < new Date()) {
        return { success: false, error: "Event has expired" };
      }

      // Validate member is allowed to sign
      if (!memberSignatures[memberId]) {
        return {
          success: false,
          error: "Member not authorized to sign this event",
        };
      }

      if (memberSignatures[memberId].signed) {
        return {
          success: false,
          error: "Member has already signed this event",
        };
      }

      // Create the Nostr event for signing
      const nostrEvent = {
        kind: 1,
        content: eventData.content,
        tags: [
          ["e", eventId],
          ["t", "federated-family-event"],
          ["family", eventData.family_id],
          ["event-type", eventData.event_type],
        ],
        created_at: Math.floor(new Date(eventData.created_at).getTime() / 1000),
        pubkey: memberPubkey,
      };

      // Sign the event
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
        return { success: false, error: "Invalid private key format" };
      }

      const signedEvent = finalizeEvent(nostrEvent, privateKeyBytes);

      // Verify the signature
      if (!verifyEvent(signedEvent)) {
        return { success: false, error: "Invalid event signature" };
      }

      // Update member signature
      const updatedSignatures = {
        ...memberSignatures,
        [memberId]: {
          memberId,
          memberPubkey,
          signed: true,
          signature: signedEvent.sig,
          timestamp: new Date(),
          deviceInfo,
        },
      };

      const newSignaturesReceived = Object.values(updatedSignatures).filter(
        (sig) => sig.signed,
      ).length;
      const newStatus =
        newSignaturesReceived >= eventData.signatures_required
          ? "signed"
          : "pending";

      // Update database
      try {
        await db.query(
          `UPDATE federated_events 
           SET member_signatures = $1, signatures_received = $2, status = $3, 
               nostr_event_id = $4, updated_at = $5
           WHERE id = $6`,
          [
            JSON.stringify(updatedSignatures),
            newSignaturesReceived,
            newStatus,
            signedEvent.id,
            new Date().toISOString(),
            eventId,
          ],
        );
      } catch (updateError) {
        return {
          success: false,
          error: "Failed to update event signatures",
          details: updateError,
        };
      }

      // Update signing session
      try {
        const sessionResult = await db.query(
          `SELECT completed_signers FROM federated_signing_sessions WHERE event_id = $1`,
          [eventId],
        );

        if (sessionResult.rows.length > 0) {
          const currentCompletedSigners = JSON.parse(
            sessionResult.rows[0].completed_signers || "[]",
          );
          if (!currentCompletedSigners.includes(memberId)) {
            currentCompletedSigners.push(memberId);

            await db.query(
              `UPDATE federated_signing_sessions 
               SET completed_signers = $1, status = $2, last_activity = $3
               WHERE event_id = $4`,
              [
                JSON.stringify(currentCompletedSigners),
                newStatus === "signed" ? "completed" : "active",
                new Date().toISOString(),
                eventId,
              ],
            );
          }
        }
      } catch (sessionError) {
        console.warn("Failed to update signing session:", sessionError);
        // Continue even if session update fails
      }

      // If all signatures collected, broadcast to Nostr
      let broadcastResult = null;
      if (newStatus === "signed") {
        try {
          broadcastResult = await this.relay.publishEvent(signedEvent);
          if (broadcastResult.success) {
            await db.query(
              `UPDATE federated_events SET status = 'broadcast', broadcast_timestamp = $1 WHERE id = $2`,
              [new Date().toISOString(), eventId],
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
      };
    } catch (error) {
      return {
        success: false,
        error: "Failed to sign federated event",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get pending events for a family member
   */
  static async getPendingEvents(params: {
    familyId: string;
    memberId: string;
  }): Promise<FederatedSigningResponse> {
    try {
      const { familyId, memberId } = params;

      const result = await db.query(
        `SELECT * FROM federated_events 
         WHERE family_id = $1 AND status = 'pending' AND expires_at > $2
         ORDER BY created_at DESC`,
        [familyId, new Date().toISOString()],
      );

      // Filter events where this member needs to sign
      const memberEvents = result.rows.filter((event) => {
        const signatures =
          typeof event.member_signatures === "string"
            ? JSON.parse(event.member_signatures)
            : event.member_signatures || {};
        return signatures[memberId] && !signatures[memberId].signed;
      });

      const formattedEvents = memberEvents.map((event) => ({
        id: event.id,
        familyId: event.family_id,
        eventType: event.event_type,
        content: event.content,
        author: event.author_id,
        authorPubkey: event.author_pubkey,
        timestamp: new Date(event.created_at),
        status: event.status,
        signaturesRequired: event.signatures_required,
        signaturesReceived: event.signatures_received,
        memberSignatures:
          typeof event.member_signatures === "string"
            ? JSON.parse(event.member_signatures)
            : event.member_signatures || {},
        expiresAt: new Date(event.expires_at),
      }));

      return {
        success: true,
        data: {
          events: formattedEvents,
          count: formattedEvents.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: "Failed to get pending events",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get active signing sessions for a family
   */
  static async getActiveSessions(
    familyId: string,
  ): Promise<FederatedSigningResponse> {
    try {
      const result = await db.query(
        `SELECT * FROM federated_signing_sessions 
         WHERE family_id = $1 AND status = 'active' AND expires_at > $2
         ORDER BY created_at DESC`,
        [familyId, new Date().toISOString()],
      );

      const sessions = result.rows.map((session) => ({
        sessionId: session.session_id,
        eventId: session.event_id,
        eventType: session.event_type,
        initiator: session.initiator,
        initiatorPubkey: session.initiator_pubkey,
        requiredSigners: JSON.parse(session.required_signers || "[]"),
        completedSigners: JSON.parse(session.completed_signers || "[]"),
        status: session.status,
        createdAt: new Date(session.created_at),
        expiresAt: new Date(session.expires_at),
        lastActivity: new Date(session.last_activity),
      }));

      return {
        success: true,
        data: {
          sessions,
          count: sessions.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: "Failed to get active sessions",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
