/**
 * Family Foundry Steward Approval Integration
 *
 * Integrates StewardApprovalClient with federation creation workflow.
 * Sends approval requests to stewards/guardians for federation validation.
 *
 * MASTER CONTEXT COMPLIANCE:
 * - Privacy-first approval workflow with NIP-59 gift-wrapped messaging
 * - Steward threshold-based consensus requirements
 * - Integration with existing StewardApprovalClient
 * - Zero-knowledge architecture (no sensitive data in logs)
 *
 * Phase 3 - FROST & NFC Integration
 */

import { StewardApprovalClient } from "./steward/approval-client";

// Lazy import to prevent client creation on page load
let supabaseClient: any = null;
const getSupabaseClient = async () => {
  if (!supabaseClient) {
    const { supabase } = await import("./supabase");
    supabaseClient = supabase;
  }
  return supabaseClient;
};

export interface FederationApprovalRequest {
  federationDuid: string;
  federationName: string;
  creatorUserDuid: string;
  stewardThreshold: number;
  stewardPubkeys: string[]; // hex pubkeys of stewards/guardians
  operationHash: string; // hash of federation data
  expiresAtSeconds: number; // unix seconds
}

export interface FederationApprovalResult {
  success: boolean;
  requestsSent?: number;
  requestsFailed?: number;
  error?: string;
}

/**
 * Generate deterministic hash of federation data for approval
 * Uses SHA-256 to create consistent operation hash
 */
export async function generateFederationOperationHash(
  federationDuid: string,
  federationName: string,
  creatorUserDuid: string
): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(
      `federation_approval_${federationDuid}_${federationName}_${creatorUserDuid}`
    );
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    throw new Error(
      `Failed to generate federation operation hash: ${errorMsg}`
    );
  }
}

/**
 * Send federation creation approval requests to stewards
 * Uses NIP-59 gift-wrapped messaging for privacy
 */
export async function sendFederationApprovalRequests(
  request: FederationApprovalRequest
): Promise<FederationApprovalResult> {
  try {
    // Validate input
    if (!request.federationDuid || !request.federationName) {
      return {
        success: false,
        error: "Federation DUID and name required",
      };
    }

    if (!request.stewardPubkeys || request.stewardPubkeys.length === 0) {
      return {
        success: false,
        error: "At least one steward pubkey required",
      };
    }

    if (request.stewardThreshold > request.stewardPubkeys.length) {
      return {
        success: false,
        error: `Steward threshold (${request.stewardThreshold}) exceeds steward count (${request.stewardPubkeys.length})`,
      };
    }

    // Create approval client
    const approvalClient = new StewardApprovalClient();

    // Send approval requests via NIP-59 gift-wrapped messaging
    const result = await approvalClient.publishApprovalRequests({
      operationHash: request.operationHash,
      operationKind: "ntag424_sign",
      uidHint: request.federationDuid.substring(0, 8),
      stewardThreshold: request.stewardThreshold,
      federationDuid: request.federationDuid,
      expiresAt: request.expiresAtSeconds,
      recipients: request.stewardPubkeys.map((pubkey) => ({
        pubkeyHex: pubkey,
      })),
      operationAmount: 0, // Federation creation is not a spending operation
      familyId: request.federationDuid,
    });

    return {
      success: true,
      requestsSent: result.sent,
      requestsFailed: result.failed,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      error: `Failed to send federation approval requests: ${errorMsg}`,
    };
  }
}

/**
 * Wait for steward approvals on federation creation
 * Blocks until threshold approvals received or timeout
 *
 * The same operationHash used when calling sendFederationApprovalRequests()
 * must be provided here so responses are correctly matched.
 */
export async function awaitFederationApprovals(
  operationHash: string,
  federationDuid: string,
  stewardThreshold: number,
  timeoutMs: number = 300000 // 5 minutes default
): Promise<{
  status: "approved" | "rejected" | "expired";
  approvalCount?: number;
}> {
  try {
    const approvalClient = new StewardApprovalClient();

    // Wait for approvals with timeout
    const result = await approvalClient.awaitApprovals(operationHash, {
      required: stewardThreshold,
      timeoutMs,
      federationDuid,
    });

    return {
      status: result.status,
      approvalCount: result.approvals.length,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    return {
      status: "expired",
    };
  }
}
