/**
 * Type declarations for SSS-Based Federated Signing API
 * MASTER CONTEXT COMPLIANCE: Browser-only serverless architecture with privacy-first principles
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
  eventTemplate: Record<string, unknown>;
  requiredGuardians: string[];
  threshold: number;
  createdBy: string;
  expiresAt: number;
  status: string;
  shares: SSSShare[];
  signatures: GuardianSignature[];
}

export interface SSSShare {
  shareId: string;
  guardianPubkey: string;
  encryptedShare: string;
  shareIndex: string;
  used: boolean;
}

export interface GuardianSignature {
  guardianPubkey: string;
  signature: string;
  shareId: string;
  timestamp: number;
}

export class SSSFederatedSigningAPI {
  constructor();

  /**
   * Create a new federated signing event
   */
  createFederatedEvent(
    familyId: string,
    eventType: string,
    eventTemplate: Record<string, unknown>,
    requiredGuardians: string[],
    threshold: number,
    createdBy: string,
    expiresInMinutes?: number
  ): Promise<SSSFederatedEvent>;

  /**
   * Submit guardian signature for an event
   */
  submitGuardianSignature(
    eventId: string,
    guardianPubkey: string,
    signature: string,
    shareId: string
  ): Promise<{ success: boolean; eventComplete: boolean; finalEvent?: any }>;

  /**
   * Get federated event by ID
   */
  getFederatedEvent(eventId: string): Promise<SSSFederatedEvent | null>;

  /**
   * List federated events for a family
   */
  listFederatedEvents(
    familyId: string,
    status?: string
  ): Promise<SSSFederatedEvent[]>;
}

// Module declaration for the .js file import
declare module "../api/sss-federated-signing.js" {
  export {
    GuardianSignature,
    SSSFederatedEvent,
    SSSFederatedSigningAPI,
    SSSShare,
  };
}
