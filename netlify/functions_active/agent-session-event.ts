/**
 * Netlify Function: Log Agent Session Event
 * POST /api/agent-session-event
 *
 * Phase 2.5 - Step 7.2: Session Event Logging Endpoint
 *
 * Logs events to an agent session with automatic cost calculation
 *
 * Request Body (LogEventRequest):
 * {
 *   "session_id": "sess_...",
 *   "event_type": "MESSAGE" | "TOOL_CALL" | ...,
 *   "event_data": { ... },
 *   "tokens_used"?: number,
 *   "sats_cost"?: number,
 *   "input_tokens"?: number,
 *   "output_tokens"?: number,
 *   "tool_name"?: string,
 *   "tool_parameters"?: { ... },
 *   "tool_result"?: { ... }
 * }
 *
 * Response (LogEventResponse):
 * {
 *   "success": true,
 *   "event_id": "uuid"
 * }
 *
 * Rate Limiting: Max 100 events/minute per session
 */

import type { Handler } from "@netlify/functions";
import type {
  LogEventRequest,
  LogEventResponse,
} from "../../types/agent-sessions.js";
import { logRpcCall, logSessionEvent } from "../../utils/session-logger.js";
import { SecureSessionManager } from "./security/session-manager.js";
import { getRequestClient } from "./supabase.js";
import {
  checkRateLimitStatus,
  createRateLimitIdentifier,
} from "./utils/enhanced-rate-limiter.js";
import {
  createRateLimitErrorResponse,
  createValidationErrorResponse,
  generateRequestId,
  logError,
} from "./utils/error-handler.js";
import { validateNonNegativeInt } from "./utils/input-validation.js";
import {
  errorResponse,
  jsonResponse,
  preflightResponse,
} from "./utils/security-headers.js";
import {
  parseAndValidateBody,
  sanitizeJSONB,
  validateSessionEventType,
  validateSessionOwnership,
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
    const bodyValidation = parseAndValidateBody<LogEventRequest>(
      event,
      (body) => {
        // Validate required fields
        if (!body.session_id || typeof body.session_id !== "string") {
          return {
            valid: false,
            error: "Invalid session_id (must be string)",
          };
        }

        if (!body.event_type || !validateSessionEventType(body.event_type)) {
          return {
            valid: false,
            error: "Invalid event_type",
          };
        }

        if (!body.event_data || typeof body.event_data !== "object") {
          return {
            valid: false,
            error: "Invalid event_data (must be object)",
          };
        }

        // Validate optional numeric fields
        if (
          body.tokens_used !== undefined &&
          !validateNonNegativeInt(body.tokens_used)
        ) {
          return {
            valid: false,
            error: "Invalid tokens_used (must be non-negative integer)",
          };
        }

        if (
          body.sats_cost !== undefined &&
          !validateNonNegativeInt(body.sats_cost)
        ) {
          return {
            valid: false,
            error: "Invalid sats_cost (must be non-negative integer)",
          };
        }

        if (
          body.input_tokens !== undefined &&
          !validateNonNegativeInt(body.input_tokens)
        ) {
          return {
            valid: false,
            error: "Invalid input_tokens (must be non-negative integer)",
          };
        }

        if (
          body.output_tokens !== undefined &&
          !validateNonNegativeInt(body.output_tokens)
        ) {
          return {
            valid: false,
            error: "Invalid output_tokens (must be non-negative integer)",
          };
        }

        return {
          valid: true,
          data: body as LogEventRequest,
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

    // Validate session ownership
    const ownershipCheck = await validateSessionOwnership(
      request.session_id,
      authenticatedUserId,
      accessToken,
    );

    if (!ownershipCheck.valid) {
      return errorResponse(403, ownershipCheck.error || "Forbidden", origin);
    }

    // Rate limiting per session (100 events/minute)
    const rateLimitId = createRateLimitIdentifier(
      "session-event",
      request.session_id,
    );
    const rateLimitCheck = await checkRateLimitStatus(rateLimitId, {
      maxRequests: 100,
      windowMs: 60000,
    });

    if (!rateLimitCheck.allowed) {
      return jsonResponse(
        429,
        createRateLimitErrorResponse(requestId, undefined, rateLimitCheck),
        origin,
      );
    }

    // Sanitize JSONB fields to prevent injection
    const sanitizedEventData = sanitizeJSONB(request.event_data);
    const sanitizedToolParams = request.tool_parameters
      ? sanitizeJSONB(request.tool_parameters)
      : null;
    const sanitizedToolResult = request.tool_result
      ? sanitizeJSONB(request.tool_result)
      : null;

    // Call log_session_event RPC (with logging)
    const supabase = getRequestClient(accessToken);
    const { data, error } = await logRpcCall(
      "log_session_event",
      async () => {
        return await supabase.rpc("log_session_event", {
          p_session_id: request.session_id,
          p_event_type: request.event_type,
          p_event_data: sanitizedEventData,
          p_tokens_used: request.tokens_used || null,
          p_sats_cost: request.sats_cost || null,
          p_input_tokens: request.input_tokens || null,
          p_output_tokens: request.output_tokens || null,
          p_tool_name: request.tool_name || null,
          p_tool_parameters: sanitizedToolParams,
          p_tool_result: sanitizedToolResult,
        });
      },
      {
        component: "agent-session-event",
        event_type: request.event_type,
        tokens_used: request.tokens_used,
        sats_cost: request.sats_cost,
      },
    );

    if (error) {
      logError(error, {
        context: "log_session_event RPC",
        requestId,
        sessionId: request.session_id,
      });
      return errorResponse(500, "Failed to log event", origin);
    }

    // Log successful event logging
    logSessionEvent({
      session_id: request.session_id,
      event_type: request.event_type,
      event_data: sanitizedEventData,
      tokens_used: request.tokens_used,
      sats_cost: request.sats_cost,
    });

    // Return success response
    const response: LogEventResponse = {
      success: true,
      event_id: data,
    };

    return jsonResponse(200, response, origin);
  } catch (error) {
    logError(error, { context: "agent-session-event", requestId });
    return errorResponse(500, "Internal server error", origin);
  }
};
