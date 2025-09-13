// Netlify Function: /.netlify/functions/groups
// Lists user groups (GET) and updates group preferences or leaves group (POST)

// Per-request Supabase client with Authorization header for RLS
let getRequestClient: any;
async function getClient(accessToken: string) {
  if (!getRequestClient) {
    const mod = await import("../supabase.js");
    getRequestClient = (mod as any).getRequestClient;
  }
  return getRequestClient(accessToken);
}

// Shared rate limiter (lazy)
let allowRequestFn:
  | undefined
  | ((ip: string, limit?: number, windowMs?: number) => boolean);
async function allowRate(ip: string): Promise<boolean> {
  if (!allowRequestFn) {
    const mod = await import("../utils/rate-limiter.js");
    allowRequestFn = (mod as any).allowRequest;
  }
  return allowRequestFn!(ip, 10, 60_000);
}

/**
 * Standardized API response handler with consistent error parsing
 * Note: Included for consistency across functions; not used directly here because
 * this Netlify function interacts with Supabase SDK rather than fetch Responses.
 * Keeping it here ensures future HTTP calls can adopt a single parser.
 */
async function handleApiResponse(
  res: Response
): Promise<{ success: boolean; data?: any; error?: string }> {
  if (!res.ok) {
    let err = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data && typeof (data as any).error === "string")
        err = (data as any).error;
    } catch {}
    return { success: false, error: err };
  }
  try {
    const data = await res.json();
    return { success: true, data };
  } catch {
    return { success: true };
  }
}

/**
 * Netlify Function handler for privacy groups
 * - GET: list groups for the authenticated user
 * - POST: update preferences (mute) or leave group
 *
 * Authentication: requires Authorization: Bearer <JWT>
 * Rate limiting: basic per-IP limiter via shared utility
 *
 * @param event Netlify request event
 * @returns Standard JSON response with { success, data?, error? }
 */
export const handler = async (event: any) => {
  // Origin-based CORS whitelist for production hardening
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) || ["*"];
  const origin = (event.headers?.origin ||
    event.headers?.Origin ||
    "*") as string;
  const corsOrigin = allowedOrigins.includes("*")
    ? "*"
    : allowedOrigins.includes(origin)
    ? origin
    : allowedOrigins[0] || "*";

  const headers = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  } as const;

  // Rate limit
  // If behind a trusted proxy, use the rightmost untrusted IP from X-Forwarded-For
  const forwardedFor = event.headers?.["x-forwarded-for"];
  const clientIP = forwardedFor
    ? forwardedFor
        .split(",")
        .map((ip: string) => ip.trim())
        .pop() || "unknown"
    : event.headers?.["x-real-ip"] || "unknown";
  if (!(await allowRate(String(clientIP)))) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({ success: false, error: "Rate limit exceeded" }),
    };
  }

  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  // Require Authorization: Bearer <token>
  const authHeader =
    event.headers?.authorization || event.headers?.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Authentication required",
      }),
    };
  }
  const accessToken = authHeader.substring(7);

  const client = await getClient(accessToken);

  // Validate token (ensures RLS context binds to auth.uid())
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData?.user) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ success: false, error: "Invalid token" }),
    };
  }

  // Gather allowed hashed IDs via targeted lookup
  const userId = userData.user.id;
  let userHashes: Array<{ hashed_uuid: string }> | null = null;
  let hashErr: any = null;
  try {
    const resp = await client
      .from("privacy_users")
      .select("hashed_uuid")
      .eq("user_id", userId)
      .limit(10);
    if (resp.error) {
      hashErr = resp.error;
    } else {
      userHashes = resp.data as any;
    }
    if (!userHashes || userHashes.length === 0) {
      const resp2 = await client
        .from("privacy_users")
        .select("hashed_uuid")
        .eq("auth_user_id", userId)
        .limit(10);
      if (resp2.error) {
        hashErr = resp2.error;
      } else {
        userHashes = resp2.data as any;
      }
    }
  } catch (e) {
    hashErr = e;
  }
  if (hashErr || !userHashes?.length) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ success: false, error: "User not authorized" }),
    };
  }
  const allowedHashes: string[] = (userHashes || [])
    .map((r) => r.hashed_uuid)
    .filter(Boolean);

  try {
    switch (event.httpMethod) {
      case "GET": {
        if (allowedHashes.length === 0) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, data: [] }),
          };
        }

        // Fetch group memberships for any of the caller's allowed hashes
        const { data: memberRows, error: memErr } = await client
          .from("privacy_group_members")
          .select("group_session_id, role, muted")
          .in("member_hash", allowedHashes)
          .limit(2000);
        if (memErr) {
          console.error("groups membership query error:", memErr);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
              success: false,
              error: "Failed to load groups",
            }),
          };
        }

        // Aggregate membership by group with role priority: admin > moderator > member
        const byGroupId = new Map<string, { role?: string; muted?: boolean }>();
        const rolePriority: Record<string, number> = {
          admin: 3,
          moderator: 2,
          member: 1,
        };
        for (const row of memberRows || []) {
          const existing = byGroupId.get(row.group_session_id);
          const existingPriority = existing?.role
            ? rolePriority[existing.role] || 0
            : 0;
          const newPriority = row?.role ? rolePriority[row.role] || 1 : 1;
          if (!existing || newPriority > existingPriority) {
            byGroupId.set(row.group_session_id, {
              role: row.role,
              muted: !!row.muted,
            });
          } else if (
            newPriority === existingPriority &&
            !existing.muted &&
            row.muted
          ) {
            existing.muted = true;
          }
        }

        const groupIds = Array.from(byGroupId.keys());
        if (groupIds.length === 0) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, data: [] }),
          };
        }

        // Try selecting avatar_url if exists; if it errors, fallback without it
        let groupsRows: any[] | null = null;
        let gErr: any = null;
        {
          const { data, error } = await client
            .from("privacy_groups")
            .select(
              "session_id, name_hash, group_type, encryption_type, member_count, updated_at, avatar_url"
            )
            .in("session_id", groupIds)
            .limit(2000);
          groupsRows = data || null;
          gErr = error || null;
        }
        if (gErr) {
          // Fallback without avatar_url column
          const { data, error } = await client
            .from("privacy_groups")
            .select(
              "session_id, name_hash, group_type, encryption_type, member_count, updated_at"
            )
            .in("session_id", groupIds)
            .limit(2000);
          if (error) {
            console.error("groups list query error:", error);
            return {
              statusCode: 500,
              headers,
              body: JSON.stringify({
                success: false,
                error: "Failed to load groups",
              }),
            };
          }
          groupsRows = data || [];
        }

        const payload = (groupsRows || []).map((g: any) => {
          const m = byGroupId.get(g.session_id) || {};
          return {
            id: g.session_id,
            name: g.name_hash,
            group_type: g.group_type,
            encryption_type: g.encryption_type,
            member_count: g.member_count,
            lastActivity: g.updated_at,
            role: m.role || "member",
            avatar_url: ("avatar_url" in g ? g.avatar_url : null) || null,
            muted: typeof m.muted === "boolean" ? m.muted : false,
          };
        });

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, data: payload }),
        };
      }

      case "POST": {
        let body: any = {};
        try {
          body = event.body ? JSON.parse(event.body) : {};
        } catch {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, error: "Invalid JSON" }),
          };
        }

        const { action } = body || {};

        if (action === "update_preferences") {
          const { groupId, muted } = body || {};
          if (!groupId || typeof muted !== "boolean") {
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({
                success: false,
                error: "Invalid request",
              }),
            };
          }

          try {
            const { error: updErr } = await client
              .from("privacy_group_members")
              .update({ muted })
              .eq("group_session_id", groupId)
              .in("member_hash", allowedHashes);

            if (updErr) {
              // Robust detection for missing 'muted' column (Postgres 42703) or other engines
              const errorCode = (updErr as any)?.code;
              const msg = String(updErr.message || "").toLowerCase();
              if (
                errorCode === "42703" ||
                (msg.includes("column") && msg.includes("muted")) ||
                msg.includes("no such column")
              ) {
                return {
                  statusCode: 200,
                  headers,
                  body: JSON.stringify({
                    success: false,
                    error: "Group preferences not supported",
                  }),
                };
              }
              return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                  success: false,
                  error: "Failed to update preferences",
                }),
              };
            }

            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({ success: true }),
            };
          } catch (e) {
            return {
              statusCode: 500,
              headers,
              body: JSON.stringify({
                success: false,
                error: "Failed to update preferences",
              }),
            };
          }
        }

        if (action === "leave_group") {
          const { groupId } = body || {};
          if (!groupId) {
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({
                success: false,
                error: "Invalid request",
              }),
            };
          }

          try {
            // Remove membership for any of caller's allowed hashes
            const { error: delErr } = await client
              .from("privacy_group_members")
              .delete()
              .eq("group_session_id", groupId)
              .in("member_hash", allowedHashes);
            if (delErr) {
              return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                  success: false,
                  error: "Failed to leave group",
                }),
              };
            }

            // Recompute member_count (best-effort; ignore error if RLS prevents)
            let memberCount: number | null = null;
            try {
              const { count, error: cntErr } = await client
                .from("privacy_group_members")
                .select("member_hash", { count: "exact", head: true })
                .eq("group_session_id", groupId);
              if (!cntErr && typeof count === "number") memberCount = count;
            } catch {}

            if (memberCount !== null) {
              try {
                await client
                  .from("privacy_groups")
                  .update({ member_count: memberCount })
                  .eq("session_id", groupId);
              } catch {}
            }

            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({ success: true }),
            };
          } catch (e) {
            return {
              statusCode: 500,
              headers,
              body: JSON.stringify({
                success: false,
                error: "Failed to leave group",
              }),
            };
          }
        }

        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: "Unknown action" }),
        };
      }

      default:
        return {
          statusCode: 405,
          headers,
          body: JSON.stringify({ success: false, error: "Method not allowed" }),
        };
    }
  } catch (e) {
    console.error("groups endpoint error:", e);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: "Unexpected error" }),
    };
  }
};
