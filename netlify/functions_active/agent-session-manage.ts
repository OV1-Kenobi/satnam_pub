/**
 * Netlify Function: Manage Agent Session
 * POST /api/agent-session-manage
 *
 * Phase 2.5 - Step 7.3: Session Management Endpoint
 *
 * Manages session lifecycle: pause, resume, terminate, switch_channel
 *
 * Request Body (ManageSessionRequest):
 * {
 *   "session_id": "sess_...",
 *   "action": "pause" | "resume" | "terminate" | "switch_channel",
 *   "reason"?: "string",  // For pause/terminate
 *   "new_channel"?: "nostr" | "telegram" | "web_ui" | "api" | "cli"  // For switch_channel
 * }
 *
 * Response (ManageSessionResponse):
 * {
 *   "success": true,
 *   "session_id": "sess_...",
 *   "new_status": "PAUSED" | "ACTIVE" | "TERMINATED",
 *   "message": "Session paused successfully"
 * }
 *
 * Idempotent: Pausing an already-paused session returns success (no-op)
 */

import type { Handler } from "@netlify/functions";
import type {
  ManageSessionRequest,
  ManageSessionResponse,
} from "../../types/agent-sessions.js";
import {
  logRpcCall,
  logSessionTransition,
} from "../../utils/session-logger.js";
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
import {
  errorResponse,
  jsonResponse,
  preflightResponse,
} from "./utils/security-headers.js";
import {
  parseAndValidateBody,
  validateSessionChannel,
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
    // Rate limiting
    const clientIP = getClientIP(
      event.headers as Record<string, string | string[]>,
    );
    const rateLimitId = createRateLimitIdentifier("session-manage", clientIP);
    const rateLimitCheck = await checkRateLimitStatus(
      rateLimitId,
      RATE_LIMITS.SESSION_MANAGE || { limit: 20, windowMs: 60000 },
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
    const bodyValidation = parseAndValidateBody<ManageSessionRequest>(
      event,
      (body) => {
        // Validate required fields
        if (!body.session_id || typeof body.session_id !== "string") {
          return {
            valid: false,
            error: "Invalid session_id (must be string)",
          };
        }

        const validActions = ["pause", "resume", "terminate", "switch_channel"];
        if (!body.action || !validActions.includes(body.action)) {
          return {
            valid: false,
            error:
              "Invalid action (must be pause, resume, terminate, or switch_channel)",
          };
        }

        // Validate action-specific fields
        if (body.action === "switch_channel") {
          if (!body.new_channel || !validateSessionChannel(body.new_channel)) {
            return {
              valid: false,
              error: "new_channel is required for switch_channel action",
            };
          }
        }

        return {
          valid: true,
          data: body as ManageSessionRequest,
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

    // Route to appropriate RPC function based on action (with logging)
    const supabase = getRequestClient(accessToken);
    let rpcResult: any;
    let newStatus: string;
    let message: string;
    let fromStatus: string = "ACTIVE"; // Will be updated based on action

    switch (request.action) {
      case "pause":
        const { data: pauseData, error: pauseError } = await logRpcCall(
          "pause_session",
          async () => {
            return await supabase.rpc("pause_session", {
              p_session_id: request.session_id,
              p_reason: request.reason || "user_requested",
            });
          },
          {
            component: "agent-session-manage",
            session_id: request.session_id,
          },
        );
        if (pauseError) throw pauseError;
        rpcResult = pauseData;
        newStatus = "PAUSED";
        message = "Session paused successfully";
        logSessionTransition(
          request.session_id,
          fromStatus,
          newStatus,
          request.reason,
        );
        break;

      case "resume":
        fromStatus = "PAUSED";
        const { data: resumeData, error: resumeError } = await logRpcCall(
          "resume_session",
          async () => {
            return await supabase.rpc("resume_session", {
              p_session_id: request.session_id,
            });
          },
          {
            component: "agent-session-manage",
            session_id: request.session_id,
          },
        );
        if (resumeError) throw resumeError;
        rpcResult = resumeData;
        newStatus = "ACTIVE";
        message = "Session resumed successfully";
        logSessionTransition(request.session_id, fromStatus, newStatus);
        break;

      case "terminate":
        const { data: terminateData, error: terminateError } = await logRpcCall(
          "terminate_session",
          async () => {
            return await supabase.rpc("terminate_session", {
              p_session_id: request.session_id,
              p_reason: request.reason || "user_requested",
            });
          },
          {
            component: "agent-session-manage",
            session_id: request.session_id,
          },
        );
        if (terminateError) throw terminateError;
        rpcResult = terminateData;
        newStatus = "TERMINATED";
        message = "Session terminated successfully";
        logSessionTransition(
          request.session_id,
          fromStatus,
          newStatus,
          request.reason,
        );
        break;

      case "switch_channel":
        const { data: switchData, error: switchError } = await logRpcCall(
          "switch_session_channel",
          async () => {
            return await supabase.rpc("switch_session_channel", {
              p_session_id: request.session_id,
              p_new_channel: request.new_channel!,
            });
          },
          {
            component: "agent-session-manage",
            session_id: request.session_id,
            channel: request.new_channel,
          },
        );
        if (switchError) throw switchError;
        rpcResult = switchData;
        newStatus = "ACTIVE";
        message = `Session switched to ${request.new_channel} channel`;
        logSessionTransition(
          request.session_id,
          fromStatus,
          newStatus,
          `Switched to ${request.new_channel}`,
        );
        break;

      default:
        return errorResponse(400, "Invalid action", origin);
    }

    // Return success response
    const response: ManageSessionResponse = {
      success: true,
      session_id: request.session_id,
      new_status: newStatus as any,
      message,
    };

    return jsonResponse(200, response, origin);
  } catch (error) {
    logError(error, { context: "agent-session-manage", requestId });
    return errorResponse(500, "Internal server error", origin);
  }
};
