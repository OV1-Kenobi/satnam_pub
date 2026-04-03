/**
 * Netlify Function: Agent Performance Report
 * GET /api/agents/performance-report
 *
 * Phase 4.2: Reporting & Dashboards (Adult agent LLM cost tracking initiative)
 *
 * Notes:
 * - Uses RLS-safe Supabase access via getRequestClient(accessToken)
 * - Reads from reporting views: agent_daily_report | agent_weekly_report
 */

import type { Handler } from "@netlify/functions";

import {
  RATE_LIMITS,
  checkRateLimitStatus,
  createRateLimitIdentifier,
  getClientIP,
} from "../../functions_active/utils/enhanced-rate-limiter.js";
import {
  createRateLimitErrorResponse,
  generateRequestId,
  logError,
} from "../../functions_active/utils/error-handler.js";
import {
  errorResponse,
  jsonResponse,
  preflightResponse,
} from "../../functions_active/utils/security-headers.js";
import { validateUUID } from "../../functions_active/utils/input-validation.js";

import { SecureSessionManager } from "../security/session-manager.js";
import { getRequestClient } from "../supabase.js";

type ReportRange = "daily" | "weekly";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const CACHE_SECONDS = 300;

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
): number | null {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || Number.isNaN(n) || n < 1) return null;
  return n;
}

export const handler: Handler = async (event) => {
  const requestId = generateRequestId();
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  // CORS preflight
  if ((event.httpMethod || "GET").toUpperCase() === "OPTIONS") {
    return preflightResponse(requestOrigin);
  }

  // GET only
  if ((event.httpMethod || "").toUpperCase() !== "GET") {
    return errorResponse(405, "Method not allowed", requestOrigin);
  }

  try {
    // Rate limiting
    const clientIP = getClientIP(
      (event.headers || {}) as Record<string, string | string[]>,
    );
    const rateLimitId = createRateLimitIdentifier(
      "agents-performance-report",
      clientIP,
    );
    const rateLimitCheck = await checkRateLimitStatus(
      rateLimitId,
      RATE_LIMITS.SESSION_QUERY || { limit: 30, windowMs: 60 * 1000 },
    );
    if (!rateLimitCheck.allowed) {
      return jsonResponse(
        429,
        createRateLimitErrorResponse(requestId, undefined, rateLimitCheck),
        requestOrigin,
      );
    }

    // Auth
    const authHeader =
      event.headers?.authorization || event.headers?.Authorization;
    if (!authHeader) {
      return errorResponse(401, "Authorization header required", requestOrigin);
    }

    const sessionData = await SecureSessionManager.validateSessionFromHeader(
      authHeader,
    );
    if (!sessionData || !sessionData.userId) {
      return errorResponse(401, "Invalid or expired token", requestOrigin);
    }

    if (!authHeader.startsWith("Bearer ")) {
      return errorResponse(401, "Invalid authorization scheme", requestOrigin);
    }
    const accessToken = authHeader.substring(7);

    // Query params
    const qs = (event.queryStringParameters || {}) as Record<string, string>;
    const rangeRaw = (qs.range || "daily").toLowerCase();
    if (rangeRaw !== "daily" && rangeRaw !== "weekly") {
      return errorResponse(
        400,
        "Invalid range (expected 'daily' or 'weekly')",
        requestOrigin,
      );
    }
    const range = rangeRaw as ReportRange;

    const page = parsePositiveInt(qs.page, DEFAULT_PAGE);
    if (page === null) {
      return errorResponse(400, "Invalid page", requestOrigin);
    }

    const limitParsed = parsePositiveInt(qs.limit, DEFAULT_LIMIT);
    if (limitParsed === null) {
      return errorResponse(400, "Invalid limit", requestOrigin);
    }
    const limit = Math.min(limitParsed, MAX_LIMIT);

    const agentId = qs.agent_id;
    if (agentId && !validateUUID(agentId)) {
      return errorResponse(400, "Invalid agent_id", requestOrigin);
    }

    const viewName = range === "weekly" ? "agent_weekly_report" : "agent_daily_report";
    const orderColumn = range === "weekly" ? "week_start_date" : "report_date";

    // RLS-safe request client (Authorization header set)
    const supabase = getRequestClient(accessToken);

    let query = supabase.from(viewName).select("*", { count: "exact" });
    if (agentId) query = query.eq("agent_id", agentId);
    query = query.order(orderColumn, { ascending: false });

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const { data, error, count } = await query.range(from, to);

    if (error) {
      logError(error, {
        requestId,
        endpoint: "agents/performance-report",
        viewName,
      });
      return errorResponse(500, "Failed to fetch performance report", requestOrigin);
    }

    const total = typeof count === "number" ? count : 0;
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    const res = jsonResponse(
      200,
      {
        success: true,
        range,
        data: data || [],
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      },
      requestOrigin,
    );
    res.headers["Cache-Control"] = `private, max-age=${CACHE_SECONDS}`;
    return res;
  } catch (e) {
    logError(e, {
      requestId,
      endpoint: "agents/performance-report",
    });
    return errorResponse(500, "Server error", requestOrigin);
  }
};
