/**
 * Netlify Function: /api/admin/dashboard
 * Purpose: Hierarchical admin dashboard API with role-based access control
 * Methods: POST (all actions)
 *
 * Actions:
 * - get_dashboard: Fetch admin dashboard data
 * - get_subordinates: Get list of subordinate accounts
 * - generate_bypass_code: Generate emergency bypass code
 * - generate_recovery_codes: Generate recovery codes
 * - revoke_code: Revoke bypass or recovery code
 * - get_audit_log: Fetch audit log entries
 */

import { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { getEnvVar } from "./utils/env.js";
import { allowRequest } from "./utils/rate-limiter.js";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin":
    process.env.ALLOWED_ORIGIN || "https://yourdomain.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

// Initialize Supabase client
const supabaseUrl = getEnvVar("VITE_SUPABASE_URL");
const supabaseServiceKey = getEnvVar("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing Supabase configuration");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface AdminDashboardRequest {
  action:
    | "get_dashboard"
    | "get_subordinates"
    | "generate_bypass_code"
    | "generate_recovery_codes"
    | "revoke_code"
    | "get_audit_log";
  targetUserDuid?: string;
  codeType?: "bypass" | "recovery";
  limit?: number;
  offset?: number;
}

export const handler: Handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders };
  }

  try {
    // Rate limiting
    const clientIp =
      event.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
    if (!allowRequest(clientIp, 30, 60000)) {
      return {
        statusCode: 429,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: "Rate limit exceeded" }),
      };
    }

    // Validate authentication
    const authHeader =
      event.headers.authorization || event.headers.Authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: "Unauthorized" }),
      };
    }

    // Extract and verify JWT token with signature verification
    const token = authHeader.substring(7);
    const jwtSecret = getEnvVar("JWT_SECRET");

    if (!jwtSecret) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Server configuration error",
        }),
      };
    }

    let payload: any;
    try {
      payload = jwt.verify(token, jwtSecret) as any;
    } catch {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Invalid or expired token",
        }),
      };
    }

    if (!payload.nip05) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: "Invalid session" }),
      };
    }

    // Get user DUID from nip05
    const { data: user, error: userError } = await supabase
      .from("user_identities")
      .select("id")
      .eq("nip05", payload.nip05)
      .single();

    if (userError || !user) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: "User not found" }),
      };
    }

    const userDuid = user.id;

    // Parse request body with error handling
    let body: AdminDashboardRequest;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Invalid JSON in request body",
        }),
      };
    }

    // Route to appropriate handler
    switch (body.action) {
      case "get_dashboard":
        return await handleGetDashboard(userDuid, corsHeaders);
      case "get_subordinates":
        return await handleGetSubordinates(
          userDuid,
          body.targetUserDuid,
          corsHeaders
        );
      case "generate_bypass_code":
        return await handleGenerateBypassCode(
          userDuid,
          body.targetUserDuid,
          corsHeaders
        );
      case "generate_recovery_codes":
        return await handleGenerateRecoveryCodes(userDuid, corsHeaders);
      case "revoke_code":
        return await handleRevokeCode(
          userDuid,
          body.codeType,
          body.targetUserDuid,
          corsHeaders
        );
      case "get_audit_log":
        return await handleGetAuditLog(
          userDuid,
          body.limit || 50,
          body.offset || 0,
          corsHeaders
        );
      default:
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, error: "Invalid action" }),
        };
    }
  } catch (error) {
    console.error("Admin dashboard error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      }),
    };
  }
};

async function handleGetDashboard(userDuid: string, corsHeaders: any) {
  // Get user's admin role
  const { data: adminRole, error: roleError } = await supabase
    .from("admin_roles")
    .select("*")
    .eq("user_duid", userDuid)
    .single();

  if (roleError || !adminRole) {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: "Not an admin" }),
    };
  }

  // Get subordinates
  const { data: subordinates } = await supabase
    .from("admin_roles")
    .select("*")
    .eq("parent_admin_duid", userDuid);

  // Get recent audit log
  const { data: auditLog } = await supabase
    .from("admin_audit_log")
    .select("*")
    .eq("admin_user_duid", userDuid)
    .order("timestamp", { ascending: false })
    .limit(50);

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      success: true,
      dashboard: {
        role: adminRole.role,
        subordinates: subordinates || [],
        recentActions: auditLog || [],
        stats: {
          totalSubordinates: subordinates?.length || 0,
          activeBypassCodes: 0,
          expiredRecoveryCodes: 0,
        },
      },
    }),
  };
}

async function handleGetSubordinates(
  userDuid: string,
  targetUserDuid: string | undefined,
  corsHeaders: any
) {
  if (!targetUserDuid) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: "targetUserDuid required",
      }),
    };
  }

  // Verify caller is an admin
  const { data: adminRole } = await supabase
    .from("admin_roles")
    .select("*")
    .eq("user_duid", userDuid)
    .single();

  if (!adminRole) {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: "Not an admin" }),
    };
  }

  // Verify caller has permission over target user
  const { data: targetRole } = await supabase
    .from("admin_roles")
    .select("parent_admin_duid")
    .eq("user_duid", targetUserDuid)
    .single();

  if (!targetRole || targetRole.parent_admin_duid !== userDuid) {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: "Not authorized for this user",
      }),
    };
  }

  // Get subordinates of target user
  const { data: subordinates } = await supabase
    .from("admin_roles")
    .select("*")
    .eq("parent_admin_duid", targetUserDuid);

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      success: true,
      subordinates: subordinates || [],
    }),
  };
}

async function handleGenerateBypassCode(
  adminDuid: string,
  targetUserDuid: string | undefined,
  corsHeaders: any
) {
  if (!targetUserDuid) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: "targetUserDuid required",
      }),
    };
  }

  // Verify admin has permission over target user
  const { data: adminRole } = await supabase
    .from("admin_roles")
    .select("role")
    .eq("user_duid", adminDuid)
    .single();

  if (!adminRole) {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: "Not an admin" }),
    };
  }

  // Verify target is subordinate to admin
  const { data: targetRole } = await supabase
    .from("admin_roles")
    .select("parent_admin_duid")
    .eq("user_duid", targetUserDuid)
    .single();

  if (!targetRole || targetRole.parent_admin_duid !== adminDuid) {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: "Not authorized for this user",
      }),
    };
  }

  // Generate bypass code (18 characters, hex)
  const bypassCode = crypto.randomBytes(9).toString("hex").toUpperCase();
  const codeSalt = crypto.randomBytes(16).toString("hex");

  // Hash code with PBKDF2-SHA512
  const hashedCode = crypto
    .pbkdf2Sync(bypassCode, codeSalt, 100000, 64, "sha512")
    .toString("hex");

  // Store in database
  const { data: stored, error } = await supabase
    .from("bypass_codes")
    .insert({
      user_duid: targetUserDuid,
      hashed_code: hashedCode,
      code_salt: codeSalt,
      generated_by_duid: adminDuid,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    })
    .select()
    .single();

  if (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: error.message }),
    };
  }

  // Log action
  await supabase.from("admin_audit_log").insert({
    admin_user_duid: adminDuid,
    action: "generate_bypass_code",
    target_user_duid: targetUserDuid,
    resource_type: "bypass_code",
    resource_id: stored.id,
    details: { expiresAt: stored.expires_at },
  });

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      success: true,
      bypassCode: bypassCode, // Only shown once
      expiresAt: stored.expires_at,
    }),
  };
}

async function handleGenerateRecoveryCodes(userDuid: string, corsHeaders: any) {
  // Verify user is an admin
  const { data: adminRole } = await supabase
    .from("admin_roles")
    .select("role")
    .eq("user_duid", userDuid)
    .single();

  if (!adminRole) {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: "Not an admin" }),
    };
  }

  // Generate 10 recovery codes
  const codes = [];
  const codeRecords = [];

  for (let i = 0; i < 10; i++) {
    const code = crypto.randomBytes(6).toString("hex").toUpperCase();
    const salt = crypto.randomBytes(16).toString("hex");
    const hashedCode = crypto
      .pbkdf2Sync(code, salt, 100000, 64, "sha512")
      .toString("hex");

    codes.push(code);
    codeRecords.push({
      user_duid: userDuid,
      hashed_code: hashedCode,
      code_salt: salt,
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    });
  }

  // Store all codes
  const { error } = await supabase.from("recovery_codes").insert(codeRecords);

  if (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: error.message }),
    };
  }

  // Log action
  await supabase.from("admin_audit_log").insert({
    admin_user_duid: userDuid,
    action: "generate_recovery_codes",
    target_user_duid: userDuid,
    resource_type: "recovery_codes",
    details: { count: 10 },
  });

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      success: true,
      recoveryCodes: codes, // Only shown once
      count: codes.length,
    }),
  };
}

async function handleRevokeCode(
  userDuid: string,
  codeType: string | undefined,
  targetUserDuid: string | undefined,
  corsHeaders: any
) {
  if (!codeType || !targetUserDuid) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: "codeType and targetUserDuid required",
      }),
    };
  }

  // Verify caller is an admin
  const { data: adminRole } = await supabase
    .from("admin_roles")
    .select("role")
    .eq("user_duid", userDuid)
    .single();

  if (!adminRole) {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: "Not an admin" }),
    };
  }

  // Verify admin has permission over target user
  const { data: targetRole } = await supabase
    .from("admin_roles")
    .select("parent_admin_duid")
    .eq("user_duid", targetUserDuid)
    .single();

  if (!targetRole || targetRole.parent_admin_duid !== userDuid) {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: "Not authorized for this user",
      }),
    };
  }

  const table = codeType === "bypass" ? "bypass_codes" : "recovery_codes";

  // Revoke all unused codes for target user
  const { error } = await supabase
    .from(table)
    .update({ used: true, used_at: new Date().toISOString() })
    .eq("user_duid", targetUserDuid)
    .eq("used", false);

  if (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: error.message }),
    };
  }

  // Log action
  await supabase.from("admin_audit_log").insert({
    admin_user_duid: userDuid,
    action: `revoke_${codeType}_codes`,
    target_user_duid: targetUserDuid,
    resource_type: `${codeType}_codes`,
  });

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ success: true, message: "Codes revoked" }),
  };
}

async function handleGetAuditLog(
  userDuid: string,
  limit: number,
  offset: number,
  corsHeaders: any
) {
  // Verify user is an admin
  const { data: adminRole } = await supabase
    .from("admin_roles")
    .select("role")
    .eq("user_duid", userDuid)
    .single();

  if (!adminRole) {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: "Not an admin" }),
    };
  }

  // Validate and cap pagination parameters
  const cappedLimit = Math.min(Math.max(1, limit), 1000);
  const cappedOffset = Math.max(0, offset);

  // Get audit log entries
  const { data: auditLog, error } = await supabase
    .from("admin_audit_log")
    .select("*")
    .eq("admin_user_duid", userDuid)
    .order("timestamp", { ascending: false })
    .range(cappedOffset, cappedOffset + cappedLimit - 1);

  if (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: error.message }),
    };
  }

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      success: true,
      auditLog: auditLog || [],
      limit: cappedLimit,
      offset: cappedOffset,
    }),
  };
}
