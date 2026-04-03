/**
 * Session Management Validation Utilities
 * Provides validation helpers for agent session management endpoints
 *
 * Phase 2.5 - Step 7: Session Management API Endpoints
 *
 * Features:
 * - Session ownership validation
 * - Request body parsing and validation
 * - JSONB field sanitization
 * - Type-safe validation with TypeScript
 */

import type { HandlerEvent } from "@netlify/functions";
import type {
  SessionChannel,
  SessionEventType,
  SessionStatus,
  SessionType,
} from "../../../types/agent-sessions.js";
import { getRequestClient } from "../supabase.js";
import { sanitizeInput } from "./input-validation.js";

interface SessionOwnershipRow {
  agent_id: string;
  human_creator_id: string | null;
  created_by_user_id?: string | null;
  family_federation_id?: string | null;
}

interface FederationAuthorityRow {
  created_by: string | null;
}

/**
 * Validate session ownership
 * Ensures the authenticated user owns the session (either as agent or creator)
 *
 * @param sessionId - Session ID to validate
 * @param userId - Authenticated user ID
 * @returns true if user owns the session
 */
export async function validateSessionOwnership(
  sessionId: string,
  userId: string,
  accessToken: string,
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Get session from database
    const supabase = getRequestClient(accessToken);
    const { data: session, error } = await supabase
      .from("agent_sessions")
      .select(
        "agent_id, human_creator_id, created_by_user_id, family_federation_id",
      )
      .eq("session_id", sessionId)
      .single<SessionOwnershipRow>();

    if (error || !session) {
      return {
        valid: false,
        error: "Session not found",
      };
    }

    // Check if user is either the agent or the creator
    const isOwner =
      session.agent_id === userId ||
      session.created_by_user_id === userId ||
      session.human_creator_id === userId;

    if (isOwner) {
      return { valid: true };
    }

    if (session.family_federation_id) {
      const { data: federation, error: federationError } = await supabase
        .from("family_federations")
        .select("created_by")
        .eq("id", session.family_federation_id)
        .maybeSingle<FederationAuthorityRow>();

      if (!federationError && federation?.created_by === userId) {
        return { valid: true };
      }

      const { data: guardianMembership, error: guardianError } = await supabase
        .from("family_members")
        .select("id")
        .eq("family_federation_id", session.family_federation_id)
        .eq("user_duid", userId)
        .eq("family_role", "guardian")
        .eq("is_active", true)
        .maybeSingle();

      if (!guardianError && guardianMembership) {
        return { valid: true };
      }
    }

    return {
      valid: false,
      error: "Unauthorized: You do not own this session",
    };
  } catch (error) {
    console.error("Session ownership validation error:", error);
    return {
      valid: false,
      error: "Failed to validate session ownership",
    };
  }
}

/**
 * Parse and validate request body
 * Generic function for type-safe body parsing with validation
 *
 * @param event - Netlify function event
 * @param validator - Validation function
 * @returns Parsed and validated body or error
 */
export function parseAndValidateBody<T>(
  event: HandlerEvent,
  validator: (body: any) => { valid: boolean; error?: string; data?: T },
): { valid: boolean; error?: string; data?: T } {
  try {
    // Parse JSON body
    if (!event.body) {
      return {
        valid: false,
        error: "Request body is required",
      };
    }

    const body = JSON.parse(event.body);

    // Run validator
    return validator(body);
  } catch (error) {
    return {
      valid: false,
      error: "Invalid JSON in request body",
    };
  }
}

/**
 * Validate SessionType
 */
export function validateSessionType(type: unknown): type is SessionType {
  return (
    typeof type === "string" &&
    ["INTERACTIVE", "AUTONOMOUS", "DELEGATED", "SUPERVISED"].includes(type)
  );
}

/**
 * Validate SessionStatus
 */
export function validateSessionStatus(
  status: unknown,
): status is SessionStatus {
  return (
    typeof status === "string" &&
    ["ACTIVE", "PAUSED", "HIBERNATED", "TERMINATED"].includes(status)
  );
}

/**
 * Validate SessionChannel
 */
export function validateSessionChannel(
  channel: unknown,
): channel is SessionChannel {
  return (
    typeof channel === "string" &&
    ["nostr", "telegram", "web_ui", "api", "cli"].includes(channel)
  );
}

/**
 * Validate SessionEventType
 */
export function validateSessionEventType(
  eventType: unknown,
): eventType is SessionEventType {
  return (
    typeof eventType === "string" &&
    [
      "MESSAGE",
      "TOOL_CALL",
      "CONTEXT_REFRESH",
      "INTERRUPTION",
      "DELEGATION",
      "TASK_ASSIGNMENT",
      "TASK_COMPLETION",
      "TASK_FAILURE",
      "STATE_SNAPSHOT",
      "CHANNEL_SWITCH",
      "SESSION_PAUSED",
      "SESSION_RESUMED",
      "SESSION_TERMINATED",
      "ERROR",
      "WARNING",
      "INFO",
    ].includes(eventType)
  );
}

/**
 * Sanitize JSONB field to prevent injection
 * Recursively sanitizes string values in objects and arrays
 *
 * @param data - Data to sanitize
 * @returns Sanitized data
 */
export function sanitizeJSONB(data: any): any {
  if (typeof data === "string") {
    return sanitizeInput(data);
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeJSONB);
  }

  if (typeof data === "object" && data !== null) {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      sanitized[sanitizeInput(key)] = sanitizeJSONB(value);
    }
    return sanitized;
  }

  return data;
}
