/**
 * @fileoverview Simplified Federated Family Nostr Account Event Signing API
 * @description Handles multi-signature Nostr events for family coordination
 * with privacy-first and secure signing workflows
 */

import { finalizeEvent, nip19, verifyEvent } from "../../src/lib/nostr-browser";
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
      const uniqueSigners = Array.from(new Set(requiredSigners));
      if (uniqueSigners.length !== requiredSigners.length) {
        return {
          success: false,
          error: "requiredSigners cannot contain duplicate member IDs",
        };
      }

      const defaultSigners = requiredSigners;

      // Create event record
      const eventId = `federated_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      const memberSignatures = defaultSigners.reduce((acc, signerId) => {
        acc[signerId] = {
          memberId: signerId,
          memberPubkey: signerId === authorId ? authorPubkey : "", // Will be filled when signing
          signed: false,
        };
        return acc;
      }, {} as Record<string, MemberSignature>);

      // Store in database using proper Supabase client
      const client = await db.getClient();
      try {
        await client.from("federated_events").insert({
          id: eventId,
          family_id: familyId,
          event_type: eventType,
          content: content,
          author_id: authorId,
          author_pubkey: authorPubkey,
          signatures_required: signaturesRequired,
          signatures_received: 0,
          member_signatures: JSON.stringify(memberSignatures),
          status: "pending",
          expires_at: expiresAt.toISOString(),
          created_at: new Date().toISOString(),
        });
      } catch (dbError) {
        return {
          success: false,
          error: "Failed to create federated event",
          details: dbError,
        };
      }

      // Create signing session
      const sessionId = `session_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      try {
        await client.from("federated_signing_sessions").insert({
          session_id: sessionId,
          event_id: eventId,
          family_id: familyId,
          event_type: eventType,
          initiator: authorId,
          initiator_pubkey: authorPubkey,
          required_signers: JSON.stringify(defaultSigners),
          completed_signers: JSON.stringify([]),
          status: "active",
          expires_at: expiresAt.toISOString(),
          created_at: new Date().toISOString(),
          last_activity: new Date().toISOString(),
        });
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
      const client = await db.getClient();
      const eventResult = await client
        .from("federated_events")
        .select("*")
        .eq("id", eventId)
        .limit(1);

      if (!eventResult.data || eventResult.data.length === 0) {
        return { success: false, error: "Event not found" };
      }

      const eventData = eventResult.data[0];
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
      const nostrEventBase = {
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

      // Generate interoperable event ID using your existing UUID/salt system
      const eventUUID = crypto.randomUUID();
      const saltedEventData = `${eventUUID}-${memberPubkey}-${eventData.family_id}-${eventData.event_type}`;
      const eventNostrId = await finalizeEvent.generateEventId({
        ...nostrEventBase,
        id: saltedEventData, // Use salted UUID that will be properly hashed
      });

      const nostrEvent = {
        ...nostrEventBase,
        id: eventNostrId,
      };

      // Sign the event
      let privateKeyBytes: Uint8Array;
      try {
        if (memberPrivateKey.startsWith("nsec")) {
          const decoded = nip19.decode(memberPrivateKey);
          privateKeyBytes = nip19.hexToBytes(decoded.data);
        } else {
          privateKeyBytes = nip19.hexToBytes(memberPrivateKey);
        }
      } catch (error) {
        return { success: false, error: "Invalid private key format" };
      }

      const signedEvent = await finalizeEvent.sign(
        nostrEvent,
        nip19.bytesToHex(privateKeyBytes)
      );

      // Verify the signature
      if (!(await verifyEvent.verify(signedEvent))) {
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

      const newSignaturesReceived = (
        Object.values(updatedSignatures) as MemberSignature[]
      ).filter((sig: MemberSignature) => sig.signed).length;
      const newStatus =
        newSignaturesReceived >= eventData.signatures_required
          ? "signed"
          : "pending";

      // Update database
      try {
        await client
          .from("federated_events")
          .update({
            member_signatures: JSON.stringify(updatedSignatures),
            signatures_received: newSignaturesReceived,
            status: newStatus,
            nostr_event_id: signedEvent.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", eventId);
      } catch (updateError) {
        return {
          success: false,
          error: "Failed to update event signatures",
          details: updateError,
        };
      }

      // Update signing session
      try {
        const sessionResult = await client
          .from("federated_signing_sessions")
          .select("completed_signers")
          .eq("event_id", eventId)
          .limit(1);

        if (sessionResult.data && sessionResult.data.length > 0) {
          const currentCompletedSigners = JSON.parse(
            sessionResult.data[0].completed_signers || "[]"
          );
          if (!currentCompletedSigners.includes(memberId)) {
            currentCompletedSigners.push(memberId);

            await client
              .from("federated_signing_sessions")
              .update({
                completed_signers: JSON.stringify(currentCompletedSigners),
                status: newStatus === "signed" ? "completed" : "active",
                last_activity: new Date().toISOString(),
              })
              .eq("event_id", eventId);
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
          broadcastResult = await CitadelRelay.publishEvent(signedEvent);
          if (broadcastResult.success) {
            await client
              .from("federated_events")
              .update({
                status: "broadcast",
                broadcast_timestamp: new Date().toISOString(),
              })
              .eq("id", eventId);
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

      const client = await db.getClient();
      const result = await client
        .from("federated_events")
        .select("*")
        .eq("family_id", familyId)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });

      // Filter events where this member needs to sign
      const memberEvents = (result.data || []).filter((event) => {
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
    familyId: string
  ): Promise<FederatedSigningResponse> {
    try {
      const client = await db.getClient();
      const result = await client
        .from("federated_signing_sessions")
        .select("*")
        .eq("family_id", familyId)
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });

      const sessions = (result.data || []).map((session) => ({
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
