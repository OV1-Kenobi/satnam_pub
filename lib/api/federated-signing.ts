/**
 * @fileoverview Federated Family Nostr Account Event Signing API
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
  author: string; // Member ID who created the event
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
    ipAddress: string; // For audit trail
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
 * Configuration for family signing rules
 */
export interface FamilySigningRules {
  familyId: string;
  rules: {
    family_announcement: {
      signaturesRequired: number;
      allowedSigners: string[];
    };
    payment_request: {
      signaturesRequired: number;
      allowedSigners: string[];
      amountThreshold?: number;
    };
    member_update: { signaturesRequired: number; allowedSigners: string[] };
    coordination: { signaturesRequired: number; allowedSigners: string[] };
  };
  defaultExpiration: number; // Hours
  parentOverride: boolean; // Allow parents to override rules
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
 * Main API class for federated family Nostr event signing
 */
export class FederatedSigningAPI {
  private static db = db;
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

      // Get family signing rules
      const signingRules = await this.getFamilySigningRules(familyId);
      if (!signingRules.success) {
        return { success: false, error: "Failed to get family signing rules" };
      }

      const rules = signingRules.data.rules[eventType];
      if (!rules) {
        return {
          success: false,
          error: `No signing rules defined for event type: ${eventType}`,
        };
      }

      // Validate author is allowed to create this type of event
      if (!rules.allowedSigners.includes(authorId)) {
        return {
          success: false,
          error: "Author not authorized to create this event type",
        };
      }

      // Determine required signers (use provided list or default from rules)
      const eventSigners = requiredSigners || rules.allowedSigners;

      // Create event record
      const eventId = `federated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const expiresAt = new Date(
        Date.now() + signingRules.data.defaultExpiration * 60 * 60 * 1000,
      );

      const federatedEvent: FederatedNostrEvent = {
        id: eventId,
        familyId,
        eventType,
        content,
        author: authorId,
        authorPubkey,
        timestamp: new Date(),
        status: "pending",
        signaturesRequired: rules.signaturesRequired,
        signaturesReceived: 0,
        memberSignatures: eventSigners.reduce(
          (acc, signerId) => {
            acc[signerId] = {
              memberId: signerId,
              memberPubkey: "", // Will be filled when signing
              signed: false,
            };
            return acc;
          },
          {} as Record<string, MemberSignature>,
        ),
        expiresAt,
      };

      // Store in database
      try {
        await this.db.query(
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
            rules.signaturesRequired,
            0,
            JSON.stringify(federatedEvent.memberSignatures),
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
      const sessionResult = await this.createSigningSession({
        eventId,
        eventType,
        initiator: authorId,
        initiatorPubkey: authorPubkey,
        requiredSigners: eventSigners,
      });

      if (!sessionResult.success) {
        return { success: false, error: "Failed to create signing session" };
      }

      return {
        success: true,
        data: {
          event: federatedEvent,
          session: sessionResult.data,
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
    memberPrivateKey: string; // Should be provided by user's secure storage
    deviceInfo?: MemberSignature["deviceInfo"];
  }): Promise<FederatedSigningResponse> {
    try {
      const { eventId, memberId, memberPubkey, memberPrivateKey, deviceInfo } =
        params;

      // Get the event
      const eventResult = await this.db.query(
        `SELECT * FROM federated_events WHERE id = $1`,
        [eventId],
      );

      if (eventResult.rows.length === 0) {
        return { success: false, error: "Event not found" };
      }

      const eventData = eventResult.rows[0];

      const event: FederatedNostrEvent = {
        id: eventData.id,
        familyId: eventData.family_id,
        eventType: eventData.event_type,
        content: eventData.content,
        author: eventData.author_id,
        authorPubkey: eventData.author_pubkey,
        timestamp: new Date(eventData.created_at),
        status: eventData.status,
        signaturesRequired: eventData.signatures_required,
        signaturesReceived: eventData.signatures_received,
        memberSignatures:
          typeof eventData.member_signatures === "string"
            ? JSON.parse(eventData.member_signatures)
            : eventData.member_signatures || {},
        nostrEventId: eventData.nostr_event_id,
        broadcastTimestamp: eventData.broadcast_timestamp
          ? new Date(eventData.broadcast_timestamp)
          : undefined,
        expiresAt: new Date(eventData.expires_at),
      };

      // Validate event is still pending and not expired
      if (event.status !== "pending") {
        return {
          success: false,
          error: "Event is no longer pending signatures",
        };
      }

      if (event.expiresAt < new Date()) {
        return { success: false, error: "Event has expired" };
      }

      // Validate member is allowed to sign
      if (!event.memberSignatures[memberId]) {
        return {
          success: false,
          error: "Member not authorized to sign this event",
        };
      }

      if (event.memberSignatures[memberId].signed) {
        return {
          success: false,
          error: "Member has already signed this event",
        };
      }

      // Create the Nostr event for signing
      const nostrEvent = {
        kind: 1,
        content: event.content,
        tags: [
          ["e", eventId],
          ["t", "federated-family-event"],
          ["family", event.familyId],
          ["event-type", event.eventType],
        ],
        created_at: Math.floor(event.timestamp.getTime() / 1000),
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
        ...event.memberSignatures,
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
        newSignaturesReceived >= event.signaturesRequired
          ? "signed"
          : "pending";

      // Update database
      try {
        await this.db.query(
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
      await this.updateSigningSession(
        eventId,
        memberId,
        newStatus === "signed" ? "completed" : "active",
      );

      // If all signatures collected, broadcast to Nostr
      let broadcastResult = null;
      if (newStatus === "signed") {
        broadcastResult = await this.broadcastFederatedEvent(
          eventId,
          signedEvent,
        );
      }

      return {
        success: true,
        data: {
          eventId,
          status: newStatus,
          signaturesReceived: newSignaturesReceived,
          signaturesRequired: event.signaturesRequired,
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

      const { data: events, error } = await this.db
        .from("federated_events")
        .select("*")
        .eq("family_id", familyId)
        .eq("status", "pending")
        .gte("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });

      if (error) {
        return {
          success: false,
          error: "Failed to fetch pending events",
          details: error,
        };
      }

      // Filter events where this member needs to sign
      const memberEvents = (events || []).filter((event) => {
        const signatures = event.member_signatures || {};
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
        memberSignatures: event.member_signatures || {},
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
      const { data: sessions, error } = await this.db
        .from("federated_signing_sessions")
        .select("*")
        .eq("family_id", familyId)
        .in("status", ["active"])
        .gte("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });

      if (error) {
        return {
          success: false,
          error: "Failed to fetch active sessions",
          details: error,
        };
      }

      return {
        success: true,
        data: {
          sessions: sessions || [],
          count: (sessions || []).length,
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

  /**
   * Get family signing rules
   */
  private static async getFamilySigningRules(
    familyId: string,
  ): Promise<FederatedSigningResponse> {
    try {
      const { data: rules, error } = await this.db
        .from("family_signing_rules")
        .select("*")
        .eq("family_id", familyId)
        .single();

      if (error && error.code !== "PGRST116") {
        // Not found error
        return {
          success: false,
          error: "Failed to fetch signing rules",
          details: error,
        };
      }

      // Return default rules if none found
      const defaultRules: FamilySigningRules = {
        familyId,
        rules: {
          family_announcement: { signaturesRequired: 2, allowedSigners: [] },
          payment_request: {
            signaturesRequired: 2,
            allowedSigners: [],
            amountThreshold: 10000,
          },
          member_update: { signaturesRequired: 1, allowedSigners: [] },
          coordination: { signaturesRequired: 2, allowedSigners: [] },
        },
        defaultExpiration: 24, // 24 hours
        parentOverride: true,
      };

      return {
        success: true,
        data: rules || defaultRules,
      };
    } catch (error) {
      return {
        success: false,
        error: "Failed to get family signing rules",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Create a signing session
   */
  private static async createSigningSession(params: {
    eventId: string;
    eventType: string;
    initiator: string;
    initiatorPubkey: string;
    requiredSigners: string[];
  }): Promise<FederatedSigningResponse> {
    try {
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      const session: FederatedSigningSession = {
        sessionId,
        eventId: params.eventId,
        eventType: params.eventType,
        initiator: params.initiator,
        initiatorPubkey: params.initiatorPubkey,
        requiredSigners: params.requiredSigners,
        completedSigners: [],
        status: "active",
        createdAt: new Date(),
        expiresAt,
        lastActivity: new Date(),
      };

      const { error } = await this.db
        .from("federated_signing_sessions")
        .insert({
          session_id: sessionId,
          event_id: params.eventId,
          event_type: params.eventType,
          initiator: params.initiator,
          initiator_pubkey: params.initiatorPubkey,
          required_signers: params.requiredSigners,
          completed_signers: [],
          status: "active",
          expires_at: expiresAt.toISOString(),
          created_at: new Date().toISOString(),
          last_activity: new Date().toISOString(),
        });

      if (error) {
        return {
          success: false,
          error: "Failed to create signing session",
          details: error,
        };
      }

      return {
        success: true,
        data: session,
      };
    } catch (error) {
      return {
        success: false,
        error: "Failed to create signing session",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Update signing session progress
   */
  private static async updateSigningSession(
    eventId: string,
    memberId: string,
    newStatus: FederatedSigningSession["status"],
  ): Promise<void> {
    try {
      // Get current session
      const { data: session } = await this.db
        .from("federated_signing_sessions")
        .select("*")
        .eq("event_id", eventId)
        .single();

      if (session) {
        const completedSigners = [...(session.completed_signers || [])];
        if (!completedSigners.includes(memberId)) {
          completedSigners.push(memberId);
        }

        await this.db
          .from("federated_signing_sessions")
          .update({
            completed_signers: completedSigners,
            status: newStatus,
            last_activity: new Date().toISOString(),
          })
          .eq("event_id", eventId);
      }
    } catch (error) {
      console.error("Failed to update signing session:", error);
    }
  }

  /**
   * Broadcast completed federated event to Nostr network
   */
  private static async broadcastFederatedEvent(
    eventId: string,
    signedEvent: any,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Broadcast to Nostr relays
      const publishResult = await this.relay.publishEvent(signedEvent);

      if (publishResult.success) {
        // Update database with broadcast timestamp
        await this.db
          .from("federated_events")
          .update({
            status: "broadcast",
            broadcast_timestamp: new Date().toISOString(),
            nostr_event_id: signedEvent.id,
          })
          .eq("id", eventId);
      }

      return publishResult;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
