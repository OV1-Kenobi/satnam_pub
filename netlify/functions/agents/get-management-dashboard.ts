import type { HandlerEvent } from "@netlify/functions";
import { getRequestClient } from "../../functions_active/supabase";
import { createErrorResponse, generateRequestId } from "../utils/error-handler";

interface ManagedAgentRow {
  user_identity_id: string;
  unified_address: string | null;
  reputation_score: number | null;
  free_tier_claimed: boolean | null;
  free_tier_allocation_number: number | null;
  lifecycle_state: string | null;
  created_by_user_id: string | null;
  family_federation_id: string | null;
  user_identity: { role?: string | null } | { role?: string | null }[] | null;
  agent_intent:
    | { vision_title?: string | null; mission_summary?: string | null }
    | { vision_title?: string | null; mission_summary?: string | null }[]
    | null;
}

export const handler = async (event: HandlerEvent) => {
  const requestId = generateRequestId();

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: JSON.stringify(createErrorResponse("Method not allowed", undefined, requestId)),
    };
  }

  const authHeader =
    event.headers.authorization || event.headers.Authorization || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!accessToken) {
    return {
      statusCode: 401,
      body: JSON.stringify(createErrorResponse("Authentication required", undefined, requestId)),
    };
  }

  const supabase = getRequestClient(accessToken);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      statusCode: 401,
      body: JSON.stringify(createErrorResponse("Authentication required", undefined, requestId)),
    };
  }

  const { data: federations } = await supabase
    .from("family_federations")
    .select("id")
    .eq("created_by", user.id);

  const governedFederationIds = (federations ?? [])
    .map((row) => row.id as string)
    .filter((value) => value.length > 0);

  const filters = [`created_by_user_id.eq.${user.id}`, `user_identity_id.eq.${user.id}`];
  if (governedFederationIds.length > 0) {
    filters.push(`family_federation_id.in.(${governedFederationIds.join(",")})`);
  }

  const { data, error } = await supabase
    .from("agent_profiles")
    .select(
      `user_identity_id,
       unified_address,
       reputation_score,
       free_tier_claimed,
       free_tier_allocation_number,
       lifecycle_state,
       created_by_user_id,
       family_federation_id,
       user_identity:user_identities(role),
       agent_intent:agent_intent_configurations(vision_title, mission_summary)`,
    )
    .or(filters.join(","))
    .order("created_at", { ascending: false });

  if (error) {
    return {
      statusCode: 500,
      body: JSON.stringify(createErrorResponse("Failed to load managed agents", undefined, requestId)),
    };
  }

  const { data: bondRequirements } = await supabase
    .from("bond_requirements")
    .select("account_type, required_amount_sats")
    .eq("operation", "account_creation");

  const bondByRole = new Map<string, number>(
    (bondRequirements ?? []).map((row) => [row.account_type as string, Number(row.required_amount_sats ?? 0)]),
  );

  const agents = ((data ?? []) as ManagedAgentRow[]).map((row) => {
    const identity = normalizeRelation(row.user_identity);
    const intent = normalizeRelation(row.agent_intent);
    const agentRole = identity?.role ?? "adult";

    return {
      id: row.user_identity_id,
      unified_address: row.unified_address ?? null,
      agent_role: agentRole,
      lifecycle_state: row.lifecycle_state ?? null,
      reputation_score: row.reputation_score ?? 0,
      free_tier_claimed: row.free_tier_claimed ?? false,
      free_tier_allocation_number: row.free_tier_allocation_number ?? null,
      required_bond_amount_sats: bondByRole.get(agentRole) ?? 0,
      intent_vision_title: intent?.vision_title ?? null,
      intent_mission_summary: intent?.mission_summary ?? null,
    };
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ agents }),
  };
};

function normalizeRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}