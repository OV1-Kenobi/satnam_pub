/**
 * Unified Federated Signing Service
 * MASTER CONTEXT COMPLIANCE: Privacy-first, zero-knowledge architecture
 *
 * Integrates FROST (Flexible Round-Optimized Schnorr Threshold) and SSS (Shamir Secret Sharing)
 * under a single service with intelligent method selection based on use case.
 *
 * FROST: Multi-round threshold signatures (never reconstructs key)
 * SSS: Single-round key reconstruction (temporarily reconstructs key)
 */

import type { Event } from "nostr-tools";
import { supabase as createSupabaseClient } from "../../src/lib/supabase";
import { central_event_publishing_service as CEPS } from "../central_event_publishing_service";
import type {
  AggregationResult,
  CreateSessionParams,
  NonceSubmissionResult,
  SignatureSubmissionResult,
} from "../frost/frost-session-manager";
import { FrostSessionManager } from "../frost/frost-session-manager";

/**
 * Signing method selection
 */
export type SigningMethod = "frost" | "sss";

/**
 * Use case categories for intelligent method selection
 */
export type UseCase =
  | "daily_operations" // FROST preferred
  | "high_value_transaction" // FROST preferred
  | "fedimint_integration" // FROST preferred
  | "emergency_recovery" // SSS preferred
  | "key_rotation" // SSS preferred
  | "performance_critical" // SSS preferred
  | "offline_guardians"; // SSS preferred

/**
 * Unified signing request
 */
export interface UnifiedSigningRequest {
  familyId: string;
  messageHash: string;
  eventTemplate?: any;
  eventType?: string;
  participants: string[];
  threshold: number;
  createdBy: string;
  useCase?: UseCase;
  preferredMethod?: SigningMethod;
  expirationSeconds?: number;
}

/**
 * Unified signing result
 */
export interface UnifiedSigningResult {
  success: boolean;
  sessionId?: string;
  method?: SigningMethod;
  status?: string;
  error?: string;
  data?: any;
}

/**
 * Unified Federated Signing Service
 * Provides intelligent method selection between FROST and SSS
 */
export class UnifiedFederatedSigningService {
  private static instance: UnifiedFederatedSigningService;

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): UnifiedFederatedSigningService {
    if (!UnifiedFederatedSigningService.instance) {
      UnifiedFederatedSigningService.instance =
        new UnifiedFederatedSigningService();
    }
    return UnifiedFederatedSigningService.instance;
  }

  /**
   * Intelligent method selection based on use case
   * @param useCase - Use case category
   * @param preferredMethod - Optional method override
   * @returns Selected signing method
   */
  public selectSigningMethod(
    useCase?: UseCase,
    preferredMethod?: SigningMethod
  ): SigningMethod {
    // Honor explicit preference
    if (preferredMethod) {
      return preferredMethod;
    }

    // Default to FROST for maximum security
    if (!useCase) {
      return "frost";
    }

    // Use case-based selection
    switch (useCase) {
      case "daily_operations":
      case "high_value_transaction":
      case "fedimint_integration":
        return "frost";

      case "emergency_recovery":
      case "key_rotation":
      case "performance_critical":
      case "offline_guardians":
        return "sss";

      default:
        return "frost";
    }
  }

  /**
   * Create a unified signing request
   * Automatically selects FROST or SSS based on use case
   */
  public async createSigningRequest(
    request: UnifiedSigningRequest
  ): Promise<UnifiedSigningResult> {
    try {
      const method = this.selectSigningMethod(
        request.useCase,
        request.preferredMethod
      );

      if (method === "frost") {
        return await this.createFrostSigningRequest(request);
      } else {
        return await this.createSSSSigningRequest(request);
      }
    } catch (error) {
      console.error("[UnifiedService] Error creating signing request:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  /**
   * Create FROST signing request
   * @private
   */
  private async createFrostSigningRequest(
    request: UnifiedSigningRequest
  ): Promise<UnifiedSigningResult> {
    try {
      const params: CreateSessionParams = {
        familyId: request.familyId,
        messageHash: request.messageHash,
        eventTemplate: request.eventTemplate
          ? JSON.stringify(request.eventTemplate)
          : undefined,
        eventType: request.eventType,
        participants: request.participants,
        threshold: request.threshold,
        createdBy: request.createdBy,
        expirationSeconds: request.expirationSeconds,
      };

      const result = await FrostSessionManager.createSession(params);

      if (!result.success) {
        return {
          success: false,
          method: "frost",
          error: result.error,
        };
      }

      return {
        success: true,
        sessionId: result.data?.session_id,
        method: "frost",
        status: result.data?.status,
        data: result.data,
      };
    } catch (error) {
      console.error("[UnifiedService] FROST request creation failed:", error);
      return {
        success: false,
        method: "frost",
        error: error instanceof Error ? error.message : "FROST creation failed",
      };
    }
  }

  /**
   * Create SSS signing request
   * @private
   */
  private async createSSSSigningRequest(
    request: UnifiedSigningRequest
  ): Promise<UnifiedSigningResult> {
    try {
      // Import SSS API dynamically to avoid circular dependencies
      const { SSSFederatedSigningAPI } = await import(
        "../api/sss-federated-signing.js"
      );
      const sssAPI = new SSSFederatedSigningAPI();

      const result = await sssAPI.createSSSSigningRequest({
        familyId: request.familyId,
        eventTemplate: request.eventTemplate,
        requiredGuardians: request.participants,
        threshold: request.threshold,
        createdBy: request.createdBy,
        eventType: request.eventType,
      });

      if (!result.success) {
        return {
          success: false,
          method: "sss",
          error: result.error,
        };
      }

      return {
        success: true,
        sessionId: result.requestId,
        method: "sss",
        status: "pending",
        data: result,
      };
    } catch (error) {
      console.error("[UnifiedService] SSS request creation failed:", error);
      return {
        success: false,
        method: "sss",
        error: error instanceof Error ? error.message : "SSS creation failed",
      };
    }
  }

  /**
   * Submit nonce commitment (FROST only)
   */
  public async submitNonceCommitment(
    sessionId: string,
    participantId: string,
    nonceCommitment: string
  ): Promise<NonceSubmissionResult> {
    return await FrostSessionManager.submitNonceCommitment(
      sessionId,
      participantId,
      nonceCommitment
    );
  }

  /**
   * Submit partial signature (FROST only)
   */
  public async submitPartialSignature(
    sessionId: string,
    participantId: string,
    partialSignature: string
  ): Promise<SignatureSubmissionResult> {
    return await FrostSessionManager.submitPartialSignature(
      sessionId,
      participantId,
      partialSignature
    );
  }

  /**
   * Aggregate signatures (FROST only)
   */
  public async aggregateSignatures(
    sessionId: string
  ): Promise<AggregationResult> {
    return await FrostSessionManager.aggregateSignatures(sessionId);
  }

  /**
   * Get session status (works for both FROST and SSS)
   */
  public async getSessionStatus(
    sessionId: string,
    method?: SigningMethod
  ): Promise<UnifiedSigningResult> {
    try {
      // Try FROST first if method not specified
      if (!method || method === "frost") {
        const frostResult = await FrostSessionManager.getSession(sessionId);
        if (frostResult.success) {
          return {
            success: true,
            sessionId,
            method: "frost",
            status: frostResult.data?.status,
            data: frostResult.data,
          };
        }
      }

      // Try SSS if FROST failed or method is SSS
      if (!method || method === "sss") {
        const { data: sssRequest, error } = await createSupabaseClient
          .from("sss_signing_requests")
          .select("*")
          .eq("request_id", sessionId)
          .single();

        if (!error && sssRequest) {
          return {
            success: true,
            sessionId,
            method: "sss",
            status: sssRequest.status,
            data: sssRequest,
          };
        }
      }

      return {
        success: false,
        error: "Session not found",
      };
    } catch (error) {
      console.error("[UnifiedService] Error getting session status:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Publish signed event via CEPS
   * Works for both FROST and SSS completed sessions
   */
  public async publishSignedEvent(
    sessionId: string,
    method?: SigningMethod
  ): Promise<{ success: boolean; eventId?: string; error?: string }> {
    try {
      const statusResult = await this.getSessionStatus(sessionId, method);

      if (!statusResult.success) {
        return {
          success: false,
          error: statusResult.error || "Session not found",
        };
      }

      const actualMethod = statusResult.method;
      const sessionData = statusResult.data;

      // Verify session is completed
      if (sessionData.status !== "completed") {
        return {
          success: false,
          error: `Session not completed (status: ${sessionData.status})`,
        };
      }

      // Get event template
      let eventTemplate: any;
      if (actualMethod === "frost") {
        eventTemplate = sessionData.event_template
          ? JSON.parse(sessionData.event_template)
          : null;
      } else {
        eventTemplate = sessionData.event_template
          ? JSON.parse(sessionData.event_template)
          : null;
      }

      if (!eventTemplate) {
        return {
          success: false,
          error: "No event template found in session",
        };
      }

      // Get final signature
      let finalSignature: any;
      if (actualMethod === "frost") {
        finalSignature = sessionData.final_signature;
      } else {
        // For SSS, the event should already be signed
        finalSignature = sessionData.final_event_id;
      }

      if (!finalSignature) {
        return {
          success: false,
          error: "No final signature found",
        };
      }

      // Publish via CEPS (use singleton instance directly)
      const ceps = CEPS;

      // For FROST, we need to construct the signed event
      if (actualMethod === "frost") {
        const signedEvent: Event = {
          ...eventTemplate,
          id: sessionData.final_event_id || "",
          sig: finalSignature.s || "",
        };

        const eventId = await ceps.publishEvent(signedEvent);

        // Update session with published event ID
        await this.updateSessionEventId(sessionId, eventId, "frost");

        return {
          success: true,
          eventId,
        };
      } else {
        // For SSS, event is already published
        return {
          success: true,
          eventId: finalSignature,
        };
      }
    } catch (error) {
      console.error("[UnifiedService] Error publishing signed event:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Update session with published event ID
   * @private
   */
  private async updateSessionEventId(
    sessionId: string,
    eventId: string,
    method: SigningMethod
  ): Promise<void> {
    try {
      if (method === "frost") {
        await createSupabaseClient
          .from("frost_signing_sessions")
          .update({
            final_event_id: eventId,
            updated_at: Date.now(),
          })
          .eq("session_id", sessionId);
      } else {
        await createSupabaseClient
          .from("sss_signing_requests")
          .update({
            final_event_id: eventId,
            updated_at: Date.now(),
          })
          .eq("request_id", sessionId);
      }
    } catch (error) {
      console.error("[UnifiedService] Error updating session event ID:", error);
      // Non-critical error, don't throw
    }
  }

  /**
   * Fail a session with error message
   */
  public async failSession(
    sessionId: string,
    errorMessage: string,
    method?: SigningMethod
  ): Promise<UnifiedSigningResult> {
    try {
      // Try FROST first if method not specified
      if (!method || method === "frost") {
        const result = await FrostSessionManager.failSession(
          sessionId,
          errorMessage
        );
        if (result.success) {
          return {
            success: true,
            sessionId,
            method: "frost",
            status: "failed",
          };
        }
      }

      // Try SSS if FROST failed or method is SSS
      if (!method || method === "sss") {
        const { error } = await createSupabaseClient
          .from("sss_signing_requests")
          .update({
            status: "failed",
            error_message: errorMessage,
            failed_at: Date.now(),
            updated_at: Date.now(),
          })
          .eq("request_id", sessionId);

        if (!error) {
          return {
            success: true,
            sessionId,
            method: "sss",
            status: "failed",
          };
        }
      }

      return {
        success: false,
        error: "Session not found",
      };
    } catch (error) {
      console.error("[UnifiedService] Error failing session:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Cleanup expired sessions (both FROST and SSS)
   */
  public async cleanupExpiredSessions(): Promise<{
    success: boolean;
    frostCleaned?: number;
    sssCleaned?: number;
    error?: string;
  }> {
    try {
      // Cleanup FROST sessions
      const frostResult = await FrostSessionManager.expireOldSessions();
      const frostCleaned = frostResult.success ? frostResult.data || 0 : 0;

      // Cleanup SSS sessions
      const now = Date.now();

      const { data: expiredSSS, error: sssError } = await createSupabaseClient
        .from("sss_signing_requests")
        .update({
          status: "expired",
          updated_at: now,
        })
        .lt("expires_at", now)
        .in("status", ["pending", "partial"])
        .select("request_id");

      const sssCleaned = expiredSSS?.length || 0;

      return {
        success: true,
        frostCleaned,
        sssCleaned,
      };
    } catch (error) {
      console.error("[UnifiedService] Error cleaning up sessions:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get method recommendation for a use case
   * Provides explanation for the recommendation
   */
  public getMethodRecommendation(useCase: UseCase): {
    method: SigningMethod;
    reason: string;
    performance: string;
    security: string;
  } {
    const recommendations = {
      daily_operations: {
        method: "frost" as SigningMethod,
        reason:
          "FROST provides maximum security for routine operations without key reconstruction",
        performance: "450-900ms (multi-round)",
        security: "Maximum - never reconstructs private key",
      },
      high_value_transaction: {
        method: "frost" as SigningMethod,
        reason: "FROST ensures highest security for high-value transactions",
        performance: "450-900ms (multi-round)",
        security: "Maximum - never reconstructs private key",
      },
      fedimint_integration: {
        method: "frost" as SigningMethod,
        reason: "FROST is designed for Fedimint guardian consensus operations",
        performance: "450-900ms (multi-round)",
        security: "Maximum - never reconstructs private key",
      },
      emergency_recovery: {
        method: "sss" as SigningMethod,
        reason: "SSS provides fast key recovery in emergency situations",
        performance: "150-300ms (single-round)",
        security: "Good - temporarily reconstructs key with immediate cleanup",
      },
      key_rotation: {
        method: "sss" as SigningMethod,
        reason: "SSS enables efficient key rotation with guardian consensus",
        performance: "150-300ms (single-round)",
        security: "Good - temporarily reconstructs key with immediate cleanup",
      },
      performance_critical: {
        method: "sss" as SigningMethod,
        reason: "SSS offers faster signing for time-sensitive operations",
        performance: "150-300ms (single-round)",
        security: "Good - temporarily reconstructs key with immediate cleanup",
      },
      offline_guardians: {
        method: "sss" as SigningMethod,
        reason: "SSS works better when some guardians may be offline",
        performance: "150-300ms (single-round)",
        security: "Good - temporarily reconstructs key with immediate cleanup",
      },
    };

    return recommendations[useCase];
  }
}
