/**
 * Family Foundry FROST Integration
 *
 * Handles FROST multiparty signing setup for family federation operations.
 * Integrates with FrostSessionManager for threshold signature configuration.
 *
 * MASTER CONTEXT COMPLIANCE:
 * - Privacy-first FROST session management
 * - Zero-knowledge architecture (no key reconstruction)
 * - Steward threshold calculation based on role hierarchy
 * - Integration with existing FROST infrastructure
 *
 * Phase 3 - FROST & NFC Integration
 */

import { FrostSessionManager } from "../../lib/frost/frost-session-manager";
import type { SessionWithPermissionResult } from "../types/permissions";

// Lazy import to prevent client creation on page load
let supabaseClient: any = null;
const getSupabaseClient = async () => {
  if (!supabaseClient) {
    const { supabase } = await import("./supabase");
    supabaseClient = supabase;
  }
  return supabaseClient;
};

/**
 * FROST Threshold Configuration
 * Maps role hierarchy to FROST threshold requirements
 */
export const FROST_THRESHOLD_CONFIG = {
  private: { minParticipants: 1, threshold: 1 },
  offspring: { minParticipants: 2, threshold: 1 },
  adult: { minParticipants: 2, threshold: 2 },
  steward: { minParticipants: 3, threshold: 2 },
  guardian: { minParticipants: 3, threshold: 2 },
} as const;

export interface FrostSessionSetupParams {
  federationDuid: string;
  familyName: string;
  creatorUserDuid: string;
  participants: Array<{
    user_duid: string;
    role: string;
  }>;
  messageHash: string;
  eventTemplate?: string;
  eventType?: string;
  customThreshold?: number; // User-configurable threshold (1-of-2 to 5-of-7)
}

export interface FrostSessionSetupResult {
  success: boolean;
  sessionId?: string;
  threshold?: number;
  participantCount?: number;
  error?: string;
}

/**
 * Validate FROST threshold is within acceptable range
 * Supports 1-of-2 to 5-of-7 configurations
 */
export function validateFrostThreshold(
  threshold: number,
  participantCount: number
): { valid: boolean; error?: string } {
  // Minimum threshold: 1-of-2
  if (threshold < 1) {
    return { valid: false, error: "Threshold must be at least 1" };
  }

  // Maximum threshold: 5-of-7
  if (threshold > 5) {
    return { valid: false, error: "Threshold cannot exceed 5" };
  }

  // Threshold cannot exceed participant count
  if (threshold > participantCount) {
    return {
      valid: false,
      error: `Threshold (${threshold}) cannot exceed participant count (${participantCount})`,
    };
  }

  // Minimum participants: 2 (for 1-of-2)
  if (participantCount < 2) {
    return {
      valid: false,
      error: "At least 2 participants required for FROST",
    };
  }

  // Maximum participants: 7 (for 5-of-7)
  if (participantCount > 7) {
    return { valid: false, error: "Maximum 7 participants supported" };
  }

  return { valid: true };
}

/**
 * Calculate FROST threshold based on participant roles or custom threshold
 * Supports user-configurable thresholds (1-of-2 to 5-of-7)
 * Falls back to 2-of-3 default for guardian operations if no custom threshold
 */
export function calculateFrostThreshold(
  participants: Array<{ user_duid: string; role: string }>,
  customThreshold?: number
): { threshold: number; minRequired: number } {
  const participantCount = participants.length;

  // If custom threshold provided, use it (after validation)
  if (customThreshold !== undefined) {
    const validation = validateFrostThreshold(
      customThreshold,
      participantCount
    );
    if (validation.valid) {
      return { threshold: customThreshold, minRequired: participantCount };
    }
    // Fall through to default calculation if custom threshold invalid
  }

  // Default calculation based on role hierarchy
  const consensusRoles = participants.filter(
    (p) => p.role === "steward" || p.role === "guardian"
  );

  if (consensusRoles.length === 0) {
    return { threshold: 1, minRequired: 1 };
  }

  if (consensusRoles.length === 1) {
    return { threshold: 1, minRequired: 1 };
  }

  if (consensusRoles.length === 2) {
    return { threshold: 2, minRequired: 2 };
  }

  // For 3+ stewards/guardians: 2-of-3 threshold (default)
  return { threshold: 2, minRequired: 3 };
}

/**
 * Create FROST signing session for federation operation
 * Initializes multi-round FROST protocol with participant list
 * Supports user-configurable thresholds (1-of-2 to 5-of-7)
 */
export async function createFrostSession(
  params: FrostSessionSetupParams
): Promise<FrostSessionSetupResult> {
  try {
    // Validate participants
    if (!params.participants || params.participants.length === 0) {
      return {
        success: false,
        error: "At least one participant required for FROST session",
      };
    }

    // Validate custom threshold if provided
    if (params.customThreshold !== undefined) {
      const validation = validateFrostThreshold(
        params.customThreshold,
        params.participants.length
      );
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error || "Invalid FROST threshold",
        };
      }
    }

    // Calculate threshold (uses custom threshold if provided)
    const { threshold, minRequired } = calculateFrostThreshold(
      params.participants,
      params.customThreshold
    );

    if (params.participants.length < minRequired) {
      return {
        success: false,
        error: `Insufficient participants: ${params.participants.length}/${minRequired} required`,
      };
    }

    // Extract participant DUIDs
    const participantDuids = params.participants.map((p) => p.user_duid);

    // Create FROST session via FrostSessionManager
    const sessionResult = await FrostSessionManager.createSession({
      familyId: params.federationDuid,
      messageHash: params.messageHash,
      eventTemplate: params.eventTemplate,
      eventType: params.eventType,
      participants: participantDuids,
      threshold,
      createdBy: params.creatorUserDuid,
    });

    if (!sessionResult.success || !sessionResult.data) {
      return {
        success: false,
        error: sessionResult.error || "Failed to create FROST session",
      };
    }

    return {
      success: true,
      sessionId: sessionResult.data.session_id,
      threshold,
      participantCount: params.participants.length,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      error: `FROST session creation failed: ${errorMsg}`,
    };
  }
}

/**
 * Extended FROST session parameters with permission checking
 */
export interface FrostSessionWithPermissionParams
  extends FrostSessionSetupParams {
  crossFederationContext?: {
    sourceFederationId: string;
    delegationId?: string;
  };
}

/**
 * Extended result type for permission-aware session creation
 */
export interface FrostSessionWithPermissionResult
  extends FrostSessionSetupResult {
  status?: "created" | "approved" | "pending_approval" | "denied";
  approvalRequired?: boolean;
  approvalQueueId?: string;
  permissionCheck?: {
    allowed: boolean;
    reason?: string;
  };
}

/**
 * Create FROST signing session with permission checks
 * Validates event signing permissions before session creation
 *
 * This is the recommended method for production use as it enforces:
 * - Role-based permission validation
 * - Time-based restrictions
 * - Daily usage limits
 * - Approval workflow for restricted actions
 *
 * @param params Session parameters including event type for permission checking
 * @returns Session result with permission status
 */
export async function createFrostSessionWithPermissionCheck(
  params: FrostSessionWithPermissionParams
): Promise<FrostSessionWithPermissionResult> {
  try {
    // Validate participants
    if (!params.participants || params.participants.length === 0) {
      return {
        success: false,
        status: "denied",
        error: "At least one participant required for FROST session",
      };
    }

    // Validate custom threshold if provided
    if (params.customThreshold !== undefined) {
      const validation = validateFrostThreshold(
        params.customThreshold,
        params.participants.length
      );
      if (!validation.valid) {
        return {
          success: false,
          status: "denied",
          error: validation.error || "Invalid FROST threshold",
        };
      }
    }

    // Calculate threshold
    const { threshold, minRequired } = calculateFrostThreshold(
      params.participants,
      params.customThreshold
    );

    if (params.participants.length < minRequired) {
      return {
        success: false,
        status: "denied",
        error: `Insufficient participants: ${params.participants.length}/${minRequired} required`,
      };
    }

    // Extract participant DUIDs
    const participantDuids = params.participants.map((p) => p.user_duid);

    // Use permission-aware session creation
    const sessionResult: SessionWithPermissionResult =
      await FrostSessionManager.createSessionWithPermissionCheck({
        familyId: params.federationDuid,
        messageHash: params.messageHash,
        eventTemplate: params.eventTemplate,
        eventType: params.eventType || "generic",
        participants: participantDuids,
        threshold,
        createdBy: params.creatorUserDuid,
        crossFederationContext: params.crossFederationContext,
      });

    if (!sessionResult.success) {
      return {
        success: false,
        status: sessionResult.status,
        error: sessionResult.error,
        approvalRequired: sessionResult.approvalRequired,
        approvalQueueId: sessionResult.approvalQueueId,
        permissionCheck: sessionResult.permissionCheck,
      };
    }

    return {
      success: true,
      sessionId: sessionResult.sessionId,
      threshold,
      participantCount: params.participants.length,
      status: sessionResult.status,
      approvalRequired: sessionResult.approvalRequired,
      approvalQueueId: sessionResult.approvalQueueId,
      permissionCheck: sessionResult.permissionCheck,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      status: "denied",
      error: `Permission-checked FROST session creation failed: ${errorMsg}`,
    };
  }
}
