/*
 * Steward Policy Helper Netlify Function (Task 5.2)
 * POST /.netlify/functions/steward-policy
 *
 * Computes whether NFC spend/sign operations require steward approval
 * for the authenticated user, based on privacy-first federation data.
 */

import type { Handler } from "@netlify/functions";

import {
  RATE_LIMITS,
  checkRateLimitStatus,
  createRateLimitIdentifier,
  getClientIP,
} from "./utils/enhanced-rate-limiter.ts";
import {
  createRateLimitErrorResponse,
  generateRequestId,
  logError,
} from "./utils/error-handler.ts";
import {
  errorResponse,
  getSecurityHeaders,
  preflightResponse,
} from "./utils/security-headers.ts";

import { SecureSessionManager } from "./security/session-manager.js";
import { getRequestClient, getServiceClient } from "./supabase.js";
import { generateDUIDFromNIP05 } from "../../lib/security/duid-generator.js";

export const config = {
  path: "/steward-policy",
};

interface StewardPolicy {
  requiresStewardApproval: boolean;
  stewardThreshold: number;
  eligibleApproverPubkeys: string[];
  eligibleCount: number;
  federationDuid: string | null;
}

interface StewardPolicyRequest {
  operation_type?: string;
}

async function setCurrentUserDuidContext(supabase: any, duid: string) {
  try {
    await supabase.rpc("app_set_config", {
      setting_name: "app.current_user_duid",
      setting_value: duid,
      is_local: true,
    });
  } catch {
    try {
      await supabase.rpc("set_app_config", {
        setting_name: "app.current_user_duid",
        setting_value: duid,
        is_local: true,
      });
    } catch {
      // As a last resort, continue without explicit context; RLS may block queries.
    }
  }
}

export const handler: Handler = async (event) => {
  const requestId = generateRequestId();
  const clientIP = getClientIP(
    event.headers as Record<string, string | string[]>
  );
  const requestOrigin = (event.headers?.origin || event.headers?.Origin) as
    | string
    | undefined;

  console.log("🚀 Steward policy handler started", {
    requestId,
    method: event.httpMethod,
    path: event.path,
    timestamp: new Date().toISOString(),
  });

  if (event.httpMethod === "OPTIONS") {
    return preflightResponse(requestOrigin);
  }

  if (event.httpMethod !== "POST") {
    return errorResponse(405, "Method not allowed", requestOrigin);
  }

  try {
    const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
    const rateLimitResult = await checkRateLimitStatus(
      rateLimitKey,
      RATE_LIMITS.NFC_OPERATIONS
    );

    if (!rateLimitResult.allowed) {
      logError(new Error("Rate limit exceeded"), {
        requestId,
        endpoint: "steward-policy",
        method: event.httpMethod,
      });
      return createRateLimitErrorResponse(requestId, requestOrigin);
    }

    const authHeader = (event.headers?.authorization ||
      event.headers?.Authorization) as string | undefined;

    const session = await SecureSessionManager.validateSessionFromHeader(
      typeof authHeader === "string" ? authHeader : undefined
    );

    if (!session) {
      return errorResponse(401, "Unauthorized", requestOrigin);
    }

    const accessToken =
      typeof authHeader === "string"
        ? authHeader.replace(/^Bearer\s+/i, "")
        : "";

    const body = (() => {
      try {
        return JSON.parse(event.body || "{}");
      } catch {
        return {};
      }
    })() as StewardPolicyRequest;

    const op = (body.operation_type || "").toLowerCase();
    if (op !== "spend" && op !== "sign") {
      return errorResponse(400, "Invalid operation_type", requestOrigin);
    }

    let userDuid: string | null = null;
    if (session.nip05) {
      try {
        userDuid = await generateDUIDFromNIP05(session.nip05);
      } catch (error) {
        logError(error, {
          requestId,
          endpoint: "steward-policy",
          method: event.httpMethod,
        });
      }
    }

    // Default policy for private users or when DUID mapping is unavailable
    if (!userDuid) {
      const headers = getSecurityHeaders(requestOrigin);
      const policy: StewardPolicy = {
        requiresStewardApproval: false,
        stewardThreshold: 0,
        eligibleApproverPubkeys: [],
        eligibleCount: 0,
        federationDuid: null,
      };
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, policy }),
      };
    }

    const supabase = getRequestClient(accessToken);
    await setCurrentUserDuidContext(supabase, userDuid);

    // Resolve federation membership for current user
    const { data: memberships, error: membershipError } = await supabase
      .from("family_members")
      .select("family_federation_id")
      .eq("user_duid", userDuid)
      .eq("is_active", true);

    if (membershipError) {
      logError(membershipError, {
        requestId,
        endpoint: "steward-policy",
        method: event.httpMethod,
      });
      return errorResponse(500, "Internal server error", requestOrigin);
    }

    if (!memberships || memberships.length === 0) {
      const headers = getSecurityHeaders(requestOrigin);
      const policy: StewardPolicy = {
        requiresStewardApproval: false,
        stewardThreshold: 0,
        eligibleApproverPubkeys: [],
        eligibleCount: 0,
        federationDuid: null,
      };
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, policy }),
      };
    }

    const federationId = memberships[0]?.family_federation_id;

    if (!federationId) {
      logError("Missing federation id for member", {
        requestId,
        endpoint: "steward-policy",
        method: event.httpMethod,
      });
      return errorResponse(500, "Internal server error", requestOrigin);
    }

    const { data: federationRows, error: federationError } = await supabase
      .from("family_federations")
      .select("federation_duid")
      .eq("id", federationId)
      .eq("is_active", true)
      .limit(1);

    if (federationError) {
      logError(federationError, {
        requestId,
        endpoint: "steward-policy",
        method: event.httpMethod,
      });
      return errorResponse(500, "Internal server error", requestOrigin);
    }

    const federationDuid =
      federationRows && federationRows.length > 0
        ? (federationRows[0] as any).federation_duid || null
        : null;

    // Fetch eligible steward/adult pubkeys via privacy-preserving RPC
    let eligibleApproverPubkeys: string[] = [];
    try {
      const serviceSupabase = getServiceClient();
      const { data: pubkeyRows, error: pubkeyError } =
        await serviceSupabase.rpc(
          "get_eligible_steward_pubkeys_for_federation",
          {
            p_federation_id: federationId,
            p_requester_duid: userDuid,
          }
        );

      if (pubkeyError) {
        logError(pubkeyError, {
          requestId,
          endpoint: "steward-policy",
          method: event.httpMethod,
        });
        return errorResponse(500, "Internal server error", requestOrigin);
      }

      if (Array.isArray(pubkeyRows)) {
        eligibleApproverPubkeys = pubkeyRows
          .map((row: any) => row.pubkey_hex)
          .filter(
            (value: unknown): value is string =>
              typeof value === "string" && value.length > 0
          );
      }
    } catch (rpcError) {
      logError(rpcError, {
        requestId,
        endpoint: "steward-policy",
        method: event.httpMethod,
      });
      return errorResponse(500, "Internal server error", requestOrigin);
    }

    const eligibleCount = eligibleApproverPubkeys.length;
    const requiresStewardApproval = eligibleCount >= 1;

    let stewardThreshold = 0;
    if (requiresStewardApproval) {
      if (op === "spend") {
        // For spend operations: require 2 approvals if available, otherwise 1
        // Math.min(2, eligibleCount) guarantees: 1 <= stewardThreshold <= eligibleCount
        stewardThreshold = Math.min(2, eligibleCount);
      } else {
        // For sign operations: require 1 approval
        // This is always valid since requiresStewardApproval is only true when eligibleCount >= 1
        stewardThreshold = 1;
      }
    }

    // NOTE: Threshold validation is guaranteed by the calculation logic above:
    // - requiresStewardApproval is only true when eligibleCount >= 1
    // - For "spend": Math.min(2, eligibleCount) produces 1 <= threshold <= eligibleCount
    // - For "sign": threshold = 1, which is always <= eligibleCount (since eligibleCount >= 1)
    // Therefore, the condition (stewardThreshold < 1 || stewardThreshold > eligibleCount)
    // can never be true when requiresStewardApproval is true. This validation is removed
    // as dead code to improve code clarity and maintainability.

    const policy: StewardPolicy = {
      requiresStewardApproval,
      stewardThreshold,
      eligibleApproverPubkeys,
      eligibleCount,
      federationDuid,
    };

    const headers = getSecurityHeaders(requestOrigin);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, policy }),
    };
  } catch (error) {
    logError(error, {
      requestId,
      endpoint: "steward-policy",
      method: event.httpMethod,
    });
    return errorResponse(500, "Internal server error", requestOrigin);
  }
};
