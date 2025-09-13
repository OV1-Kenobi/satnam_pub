// Netlify Function: /.netlify/functions/group-management
// Administrative group management: create group, add/remove member, create topic, get group details

import * as crypto from "node:crypto";
/**
 * Lazily loads the per-request Supabase client using the provided access token.
 *
 * @param accessToken - The bearer access token from the Authorization header ("Bearer <token>")
 * @returns A Supabase client instance scoped to the request
 * @example
 * const client = await getClient(accessToken);
 */

let getRequestClient: any;
async function getClient(accessToken: string) {
  if (!getRequestClient) {
    const mod = await import("../supabase.js");
    getRequestClient = (mod as any).getRequestClient;
  }
  return getRequestClient(accessToken);
}

let allowRequestFn:
  | undefined
  | ((ip: string, limit?: number, windowMs?: number) => boolean);
/**
 * Checks whether the current user (by any of their allowed hashed identities) has
 * administrative privileges for the specified group.
 *
 * Strategy (in order):
 * 1) privacy_groups.admin_hash match
 * 2) privacy_group_members.is_admin true
 * 3) privacy_group_members.role in ("owner","admin")
 *
 * @param client - Supabase client scoped to the caller
 * @param groupId - Group session id (privacy_groups.session_id)
 * @param allowedHashes - Array of hashed_uuid values associated with the user
 * @returns Promise resolving to true if the user is an admin of the group
 * @example
 * const ok = await isAdmin(client, groupId, allowedHashes);
 */

/**
 * Thin wrapper around the shared rate limiter.
 *
 * @param ip - Client IP address (parsed from X-Forwarded-For or X-Real-IP)
 * @returns Promise that resolves to true if the request is allowed; false otherwise
 * @example
 * // if (!(await allowRate(clientIP))) { return respond429(); }
 */
async function allowRate(ip: string): Promise<boolean> {
  if (!allowRequestFn) {
    const mod = await import("../utils/rate-limiter.js");
    allowRequestFn = (mod as any).allowRequest;
  }
  return allowRequestFn!(ip, 10, 60_000);
}

async function isAdmin(
  client: any,
  groupId: string,
  allowedHashes: string[]
): Promise<boolean> {
  if (!groupId || !allowedHashes || allowedHashes.length === 0) {
    return false;
  }

  // Try privacy_groups.admin_hash first
  try {
    const { data, error } = await client
      .from("privacy_groups")
      .select("admin_hash")
      .eq("session_id", groupId)
      .maybeSingle();
    if (!error && data && "admin_hash" in data && data.admin_hash) {
      return allowedHashes.includes(String(data.admin_hash));
    }
  } catch (err) {
    console.error("Error checking privacy_groups.admin_hash:", err);
  }

  // Fallback: privacy_group_members.is_admin
  try {
    const { data, error } = await client

      .from("privacy_group_members")
      .select("member_hash, is_admin")
      .eq("group_session_id", groupId)
      .in("member_hash", allowedHashes)
      .limit(1);
    if (!error && Array.isArray(data) && data.length) {
      const row = data[0];
      if ("is_admin" in row) return !!row.is_admin;
    }
  } catch (err) {
    console.error("Error checking privacy_group_members.is_admin:", err);
  }

  // Fallback: role in ('owner','admin')
  try {
    const { data, error } = await client
      .from("privacy_group_members")
      .select("member_hash, role")
      .eq("group_session_id", groupId)
      .in("member_hash", allowedHashes)
      .limit(1);
    if (!error && Array.isArray(data) && data.length) {
      const row = data[0] as any;
      const role = (row.role || "").toString().toLowerCase();
      return role === "owner" || role === "admin";
    }
  } catch (err) {
    console.error("Error checking privacy_group_members.role:", err);
  }

  return false;
}

/**
 * Netlify Function handler for administrative group management.
 *
 * Methods:
 * - GET: Retrieve paginated group details (members and topics) for a given groupId.
 *   Query parameters: groupId (string, required), page (number>=1), pageSize (1..200)
 * - POST: Perform a management action specified by `action` in the JSON body.
 *   Supported actions:
 *     - "create_group": { name, group_type, encryption_type, avatar_url?, group_description? }
 *     - "add_member": { groupId, memberHash }
 *     - "remove_member": { groupId, memberHash }
 *     - "create_topic": { groupId, topicName, description? }
 *
 * Authentication: Requires Authorization: Bearer <accessToken>
 * Returns: JSON body with a standardized shape { success: boolean, data?: any, error?: string }
 * CORS: Origin is validated against ALLOWED_ORIGINS; OPTIONS preflight supported.
 *
 * @param event - Netlify Function event
 * @returns Netlify response with JSON body using the standardized success/error format
 * @example
 * // GET group details
 * // curl -H "Authorization: Bearer TOKEN" \
 * //   "https://<site>/.netlify/functions/group-management?groupId=grp_123&page=1&pageSize=50"
 *
 * @example
 * // POST add member
 * // curl -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
 * //   -d '{"action":"add_member","groupId":"grp_123","memberHash":"abcd.."}' \
 * //   "https://<site>/.netlify/functions/group-management"
 */
export const handler = async (event: any) => {
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

  const clientIP =
    event.headers?.["x-forwarded-for"] ||
    event.headers?.["x-real-ip"] ||
    "unknown";
  if (!(await allowRate(String(clientIP))))
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({ success: false, error: "Rate limit exceeded" }),
    };

  if (event.httpMethod === "OPTIONS")
    return { statusCode: 200, headers, body: "" };

  const authHeader =
    event.headers?.authorization || event.headers?.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer "))
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Authentication required",
      }),
    };
  const accessToken = authHeader.substring(7);

  const client = await getClient(accessToken);
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData?.user)
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ success: false, error: "Invalid token" }),
    };

  // Lookup allowed hashes for this user (targeted, avoid unbounded scans)
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
    if (event.httpMethod === "GET") {
      const params = event.queryStringParameters || {};
      const groupId = params.groupId as string;
      if (!groupId)
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: "groupId required" }),
        };

      // Pagination for large datasets
      const page = Math.max(parseInt(String(params.page || "1"), 10) || 1, 1);
      const pageSize = Math.min(
        Math.max(parseInt(String(params.pageSize || "100"), 10) || 100, 1),
        200
      );
      const offset = (page - 1) * pageSize;

      // Members (paged)
      let members: any[] = [];
      let membersTotal = 0;
      try {
        const { data, error } = await client
          .from("privacy_group_members")
          .select("member_hash, role, muted, is_admin")
          .eq("group_session_id", groupId)
          .range(offset, offset + pageSize - 1);
        if (!error) members = data || [];
        // total count (head query)
        const { count: mCount } = await client
          .from("privacy_group_members")
          .select("member_hash", { count: "exact", head: true })
          .eq("group_session_id", groupId);
        membersTotal = mCount || 0;
      } catch {}

      // Topics (paged)
      let topics: any[] = [];
      let topicsTotal = 0;
      try {
        const { data, error } = await client
          .from("privacy_group_topics")
          .select(
            "id, topic_name, description, created_by_hash, created_at, updated_at"
          )
          .eq("group_session_id", groupId)
          .range(offset, offset + pageSize - 1);
        if (!error) topics = data || [];
        const { count: tCount } = await client
          .from("privacy_group_topics")
          .select("id", { count: "exact", head: true })
          .eq("group_session_id", groupId);
        topicsTotal = tCount || 0;
      } catch {}

      const membersMeta = {
        page,
        pageSize,
        total: membersTotal,
        hasMore: membersTotal > page * pageSize,
      };
      const topicsMeta = {
        page,
        pageSize,
        total: topicsTotal,
        hasMore: topicsTotal > page * pageSize,
      };

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          data: { members, topics, membersMeta, topicsMeta },
        }),
      };
    }

    if (event.httpMethod === "POST") {
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

      if (action === "create_group") {
        const {
          name,
          group_type,
          encryption_type,
          avatar_url,
          group_description,
        } = body || {};
        if (!name || !group_type || !encryption_type)
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
              success: false,
              error: "Missing required fields",
            }),
          };

        const groupId = "grp_" + crypto.randomBytes(16).toString("hex");
        const creatorHash = allowedHashes[0];

        // Server-side validation/hashing of name to ensure privacy-safe storage
        const nameHash = /^[a-f0-9]{64}$/i.test(String(name))
          ? String(name)
          : crypto.createHash("sha256").update(String(name)).digest("hex");

        // Insert group (attempt with extra columns; fallback to minimal)
        let inserted = false;
        try {
          const { error } = await client.from("privacy_groups").insert([
            {
              session_id: groupId,
              name_hash: nameHash, // server-validated hashing ensures privacy-safe storage
              group_type,
              encryption_type,
              member_count: 1,
              admin_hash: creatorHash,
              avatar_url: avatar_url || null,
              description: group_description || null,
            },
          ]);
          if (!error) inserted = true;
        } catch {}
        if (!inserted) {
          // fallback
          const { error } = await client.from("privacy_groups").insert([
            {
              session_id: groupId,
              name_hash: nameHash,
              group_type,
              encryption_type,
              member_count: 1,
            },
          ]);
          if (error)
            return {
              statusCode: 500,
              headers,
              body: JSON.stringify({
                success: false,
                error: "Failed to create group",
              }),
            };
        }

        // Insert membership as admin/owner
        let memberInserted = false;
        try {
          const { error } = await client.from("privacy_group_members").insert([
            {
              group_session_id: groupId,
              member_hash: creatorHash,
              is_admin: true,
              role: "owner",
            },
          ]);
          if (!error) memberInserted = true;
        } catch {}
        if (!memberInserted) {
          await client.from("privacy_group_members").insert([
            {
              group_session_id: groupId,
              member_hash: creatorHash,
              role: "owner",
            },
          ]);
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, data: { id: groupId } }),
        };
      }

      if (action === "add_member") {
        const { groupId, memberHash } = body || {};
        if (!groupId || !memberHash)
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, error: "Invalid request" }),
          };
        if (!(await isAdmin(client, groupId, allowedHashes)))
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({ success: false, error: "Admin required" }),
          };

        const { error: insErr } = await client
          .from("privacy_group_members")
          .insert([{ group_session_id: groupId, member_hash: memberHash }]);
        if (insErr)
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
              success: false,
              error: "Failed to add member",
            }),
          };

        // Update count
        try {
          const { count } = await client
            .from("privacy_group_members")
            .select("member_hash", { count: "exact", head: true })
            .eq("group_session_id", groupId);
          if (typeof count === "number")
            await client
              .from("privacy_groups")
              .update({ member_count: count })
              .eq("session_id", groupId);
        } catch {}

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true }),
        };
      }

      if (action === "remove_member") {
        const { groupId, memberHash } = body || {};
        if (!groupId || !memberHash)
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, error: "Invalid request" }),
          };
        if (!(await isAdmin(client, groupId, allowedHashes)))
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({ success: false, error: "Admin required" }),
          };

        const { error: delErr } = await client
          .from("privacy_group_members")
          .delete()
          .eq("group_session_id", groupId)
          .eq("member_hash", memberHash);
        if (delErr)
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
              success: false,
              error: "Failed to remove member",
            }),
          };

        // Update count
        try {
          const { count } = await client
            .from("privacy_group_members")
            .select("member_hash", { count: "exact", head: true })
            .eq("group_session_id", groupId);
          if (typeof count === "number")
            await client
              .from("privacy_groups")
              .update({ member_count: count })
              .eq("session_id", groupId);
        } catch {}

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true }),
        };
      }

      if (action === "create_topic") {
        const { groupId, topicName, description } = body || {};
        if (!groupId || !topicName)
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, error: "Invalid request" }),
          };
        if (!(await isAdmin(client, groupId, allowedHashes)))
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({ success: false, error: "Admin required" }),
          };

        const creatorHash = allowedHashes[0];
        try {
          const { data, error } = await client
            .from("privacy_group_topics")
            .insert([
              {
                group_session_id: groupId,
                topic_name: topicName,
                description: description || null,
                created_by_hash: creatorHash,
              },
            ])
            .select("id")
            .maybeSingle();
          if (error) throw error;
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, data: { id: data?.id } }),
          };
        } catch (e) {
          console.error("Failed to create topic:", e);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
              success: false,
              error: "Failed to create topic",
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

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: "Method not allowed" }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: "Unexpected error" }),
    };
  }
};
