/**
 * Netlify Function: Query Agent Sessions
 * GET /api/agent-session-query
 *
 * Phase 2.5 - Step 7.4: Session Query Endpoint
 *
 * Queries session data from various views with filtering and pagination
 *
 * Query Parameters (SessionQueryParams):
 * - view: "active_summary" | "cost_analysis" | "history" | "timeline" | "task_summary"
 * - page: number (default: 1)
 * - limit: number (default: 50, max: 100)
 * - agent_id: UUID filter
 * - session_id: session ID filter
 * - session_type: SessionType filter
 * - channel: SessionChannel filter
 * - status: SessionStatus filter
 * - start_date: ISO 8601 date
 * - end_date: ISO 8601 date
 * - min_sats: number
 * - max_sats: number
 * - min_duration_minutes: number
 * - max_duration_minutes: number
 * - sort_by: "started_at" | "last_activity_at" | "duration" | "sats_spent" | "tokens_consumed"
 * - sort_order: "asc" | "desc" (default: "desc")
 *
 * Response:
 * {
 *   "success": true,
 *   "data": [...],
 *   "pagination": {
 *     "page": 1,
 *     "limit": 50,
 *     "total": 150,
 *     "totalPages": 3
 *   }
 * }
 *
 * Cache-Control: Short TTL for analytics views
 */

import type { Handler } from "@netlify/functions";
import type { SessionQueryParams } from "../../types/agent-sessions.js";
import { logQuery } from "../../utils/session-logger.js";
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
  generateRequestId,
  logError,
} from "./utils/error-handler.js";
import { validateUUID } from "./utils/input-validation.js";
import {
  errorResponse,
  getSecurityHeaders,
  jsonResponse,
  preflightResponse,
} from "./utils/security-headers.js";
import {
  validateSessionChannel,
  validateSessionStatus,
  validateSessionType,
} from "./utils/session-validation.js";

export const handler: Handler = async (event, context) => {
  const requestId = generateRequestId();
  const origin = event.headers.origin || event.headers.Origin;

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return preflightResponse(origin);
  }

  // Only allow GET
  if (event.httpMethod !== "GET") {
    return errorResponse(405, "Method not allowed", origin);
  }

  try {
    // Rate limiting
    const clientIP = getClientIP(
      event.headers as Record<string, string | string[]>,
    );
    const rateLimitId = createRateLimitIdentifier("session-query", clientIP);
    const rateLimitCheck = await checkRateLimitStatus(
      rateLimitId,
      RATE_LIMITS.SESSION_QUERY || { limit: 30, windowMs: 60000 },
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

    // Parse query parameters
    const params = event.queryStringParameters || {};
    const queryParams: SessionQueryParams = {
      view: (params.view as any) || "active_summary",
      page: parseInt(params.page || "1", 10),
      limit: Math.min(parseInt(params.limit || "50", 10), 100),
      agent_id: params.agent_id,
      session_id: params.session_id,
      session_type: params.session_type as any,
      channel: params.channel as any,
      status: params.status as any,
      start_date: params.start_date,
      end_date: params.end_date,
      min_sats: params.min_sats ? parseInt(params.min_sats, 10) : undefined,
      max_sats: params.max_sats ? parseInt(params.max_sats, 10) : undefined,
      min_duration_minutes: params.min_duration_minutes
        ? parseInt(params.min_duration_minutes, 10)
        : undefined,
      max_duration_minutes: params.max_duration_minutes
        ? parseInt(params.max_duration_minutes, 10)
        : undefined,
      sort_by: (params.sort_by as any) || "started_at",
      sort_order: (params.sort_order as any) || "desc",
    };

    // Validate view parameter
    const validViews = [
      "active_summary",
      "cost_analysis",
      "history",
      "timeline",
      "task_summary",
    ];
    if (!validViews.includes(queryParams.view || "")) {
      return errorResponse(400, "Invalid view parameter", origin);
    }

    // Validate filters
    if (queryParams.agent_id && !validateUUID(queryParams.agent_id)) {
      return errorResponse(400, "Invalid agent_id format", origin);
    }

    if (
      queryParams.session_type &&
      !validateSessionType(queryParams.session_type)
    ) {
      return errorResponse(400, "Invalid session_type", origin);
    }

    if (queryParams.channel && !validateSessionChannel(queryParams.channel)) {
      return errorResponse(400, "Invalid channel", origin);
    }

    if (queryParams.status && !validateSessionStatus(queryParams.status)) {
      return errorResponse(400, "Invalid status", origin);
    }

    // Map view to table name
    const viewMap: Record<string, string> = {
      active_summary: "active_sessions_summary",
      cost_analysis: "session_cost_analysis",
      history: "agent_session_history",
      timeline: "session_event_timeline",
      task_summary: "session_task_summary",
    };

    const viewName = viewMap[queryParams.view || "active_summary"];

    // Build query
    const supabase = getRequestClient(accessToken);
    let query = supabase.from(viewName).select("*", { count: "exact" });

    // Apply filters
    if (queryParams.agent_id) {
      query = query.eq("agent_id", queryParams.agent_id);
    }

    if (queryParams.session_id) {
      query = query.eq("session_id", queryParams.session_id);
    }

    if (queryParams.session_type) {
      query = query.eq("session_type", queryParams.session_type);
    }

    if (queryParams.channel) {
      query = query.eq("channel", queryParams.channel);
    }

    if (queryParams.status) {
      query = query.eq("status", queryParams.status);
    }

    // Date range filters
    if (queryParams.start_date) {
      query = query.gte("started_at", queryParams.start_date);
    }

    if (queryParams.end_date) {
      query = query.lte("started_at", queryParams.end_date);
    }

    // Cost filters (for views that have sats columns)
    if (queryParams.min_sats !== undefined) {
      const satsColumn =
        viewName === "session_cost_analysis"
          ? "total_sats_spent"
          : "total_sats_cost";
      query = query.gte(satsColumn, queryParams.min_sats);
    }

    if (queryParams.max_sats !== undefined) {
      const satsColumn =
        viewName === "session_cost_analysis"
          ? "total_sats_spent"
          : "total_sats_cost";
      query = query.lte(satsColumn, queryParams.max_sats);
    }

    // Duration filters (for views that have duration columns)
    if (queryParams.min_duration_minutes !== undefined) {
      const durationColumn =
        viewName === "session_cost_analysis"
          ? "avg_duration_minutes"
          : "duration_minutes";
      query = query.gte(durationColumn, queryParams.min_duration_minutes);
    }

    if (queryParams.max_duration_minutes !== undefined) {
      const durationColumn =
        viewName === "session_cost_analysis"
          ? "avg_duration_minutes"
          : "duration_minutes";
      query = query.lte(durationColumn, queryParams.max_duration_minutes);
    }

    // Sorting
    const sortColumn =
      queryParams.sort_by ||
      (viewName === "session_event_timeline" ? "created_at" : "started_at");
    const sortOrder = queryParams.sort_order === "asc" ? true : false;
    query = query.order(sortColumn, { ascending: sortOrder });

    // Pagination
    const page = queryParams.page || 1;
    const limit = queryParams.limit || 50;
    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    // Execute query (with logging)
    const { data, error, count } = await logQuery(
      `session-query-${viewName}`,
      async () => {
        return await query;
      },
      {
        component: "agent-session-query",
        view: queryParams.view,
        page,
        limit,
      },
    );

    if (error) {
      logError(error, {
        context: "session-query",
        requestId,
        view: queryParams.view,
      });
      return errorResponse(500, "Failed to query sessions", origin);
    }

    // Calculate pagination metadata
    const totalPages = count ? Math.ceil(count / limit) : 0;

    // Return success response with cache headers
    const response = {
      success: true,
      data: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages,
      },
    };

    // Add cache-control headers for analytics views (5 minute TTL)
    const headers = {
      ...getSecurityHeaders(origin),
      "Content-Type": "application/json",
      "Cache-Control": "private, max-age=300", // 5 minutes
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    logError(error, { context: "agent-session-query", requestId });
    return errorResponse(500, "Internal server error", origin);
  }
};
