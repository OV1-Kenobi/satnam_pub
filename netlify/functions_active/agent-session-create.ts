/**
 * Netlify Function: Create Agent Session
 * POST /api/agent-session-create
 *
 * Phase 2.5 - Step 7.1: Session Creation Endpoint
 *
 * Creates a new agent session with full state tracking
 *
 * Request Body (CreateSessionRequest):
 * {
 *   "agent_id": "uuid",
 *   "session_type": "INTERACTIVE" | "AUTONOMOUS" | "DELEGATED" | "SUPERVISED",
 *   "primary_channel"?: "nostr" | "telegram" | "web_ui" | "api" | "cli",
 *   "created_by_user_id"?: "uuid",
 *   "human_creator_id"?: "uuid"
 * }
 *
 * Response (CreateSessionResponse):
 * {
 *   "success": true,
 *   "session_id": "sess_...",
 *   "session": { ... full session object ... }
 * }
 */

import type { Handler } from "@netlify/functions";
import type {
  CreateSessionRequest,
  CreateSessionResponse,
} from "../../types/agent-sessions.js";
import { logRpcCall, logSessionCreate } from "../../utils/session-logger.js";
import { SecureSessionManager } from "./security/session-manager.js";
import { getRequestClient } from "./supabase.js";
import {
  RATE_LIMITS,
  checkRateLimitStatus,
  createRateLimitIdentifier,
  getClientIP,
} from "./utils/enhanced-rate-limiter.js";
import {
  createRateLimitErrorResponse,
  createValidationErrorResponse,
  generateRequestId,
  logError,
} from "./utils/error-handler.js";
import { validateUUID } from "./utils/input-validation.js";
import {
  errorResponse,
  jsonResponse,
  preflightResponse,
} from "./utils/security-headers.js";
import {
  parseAndValidateBody,
  validateSessionChannel,
  validateSessionType,
} from "./utils/session-validation.js";

export const handler: Handler = async (event, context) => {
  const requestId = generateRequestId();
  const origin = event.headers.origin || event.headers.Origin;

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return preflightResponse(origin);
  }

  // Only allow POST
  if (event.httpMethod !== "POST") {
    return errorResponse(405, "Method not allowed", origin);
  }

  try {
    // Rate limiting
    const clientIP = getClientIP(
      event.headers as Record<string, string | string[]>,
    );
    const rateLimitId = createRateLimitIdentifier("session-create", clientIP);
    const rateLimitCheck = await checkRateLimitStatus(
      rateLimitId,
      RATE_LIMITS.SESSION_CREATE || { limit: 10, windowMs: 60000 },
    );

    if (!rateLimitCheck.allowed) {
      return jsonResponse(
        429,
        createRateLimitErrorResponse(requestId, undefined, rateLimitCheck),
        origin,
      );
    }

    // Validate JWT and extract user ID
    const authHeader =
      event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      return errorResponse(401, "Authorization header required", origin);
    }

    const sessionData = await SecureSessionManager.validateSession(
      authHeader.replace("Bearer ", ""),
    );

    if (!sessionData || !sessionData.userId) {
      return errorResponse(401, "Invalid or expired token", origin);
    }

    const authenticatedUserId = sessionData.userId;
    const accessToken = authHeader.replace(/^Bearer\s+/i, "");

    // Parse and validate request body
    const bodyValidation = parseAndValidateBody<CreateSessionRequest>(
      event,
      (body) => {
        // Validate required fields
        if (!body.agent_id || !validateUUID(body.agent_id)) {
          return {
            valid: false,
            error: "Invalid agent_id (must be valid UUID)",
          };
        }

        if (!body.session_type || !validateSessionType(body.session_type)) {
          return {
            valid: false,
            error:
              "Invalid session_type (must be INTERACTIVE, AUTONOMOUS, DELEGATED, or SUPERVISED)",
          };
        }

        // Validate optional fields
        if (
          body.primary_channel &&
          !validateSessionChannel(body.primary_channel)
        ) {
          return {
            valid: false,
            error:
              "Invalid primary_channel (must be nostr, telegram, web_ui, api, or cli)",
          };
        }

        if (body.created_by_user_id && !validateUUID(body.created_by_user_id)) {
          return {
            valid: false,
            error: "Invalid created_by_user_id (must be valid UUID)",
          };
        }

        if (body.human_creator_id && !validateUUID(body.human_creator_id)) {
          return {
            valid: false,
            error: "Invalid human_creator_id (must be valid UUID)",
          };
        }

        return {
          valid: true,
          data: body as CreateSessionRequest,
        };
      },
    );

    if (!bodyValidation.valid || !bodyValidation.data) {
      return jsonResponse(
        400,
        createValidationErrorResponse(
          bodyValidation.error || "Invalid request body",
          requestId,
        ),
        origin,
      );
    }

    const request = bodyValidation.data;
    const effectiveCreatorId =
      request.created_by_user_id ||
      request.human_creator_id ||
      authenticatedUserId;

    if (
      request.created_by_user_id &&
      request.created_by_user_id !== authenticatedUserId
    ) {
      return errorResponse(
        403,
        "created_by_user_id must match the authenticated user",
        origin,
      );
    }

    if (
      request.human_creator_id &&
      request.human_creator_id !== authenticatedUserId
    ) {
      return errorResponse(
        403,
        "human_creator_id must match the authenticated user",
        origin,
      );
    }

    // Call create_agent_session RPC (with logging)
    const supabase = getRequestClient(accessToken);
    const { data, error } = await logRpcCall(
      "create_agent_session",
      async () => {
        return await supabase.rpc("create_agent_session", {
          p_agent_id: request.agent_id,
          p_session_type: request.session_type,
          p_primary_channel: request.primary_channel || "nostr",
          p_created_by_user_id: effectiveCreatorId,
          p_human_creator_id: effectiveCreatorId,
        });
      },
      {
        component: "agent-session-create",
        session_type: request.session_type,
        channel: request.primary_channel || "nostr",
      },
    );

    if (error) {
      logError(error, {
        context: "create_agent_session RPC",
        requestId,
        agentId: request.agent_id,
      });
      return errorResponse(500, "Failed to create session", origin);
    }

    // Log successful session creation
    logSessionCreate({
      session_id: data.session_id,
      agent_id: data.agent_id,
      session_type: data.session_type,
      primary_channel: data.primary_channel,
    });

    // Return success response
    const response: CreateSessionResponse = {
      success: true,
      session_id: data.session_id,
      session: data,
    };

    return jsonResponse(200, response, origin);
  } catch (error) {
    logError(error, { context: "agent-session-create", requestId });
    return errorResponse(500, "Internal server error", origin);
  }
};
