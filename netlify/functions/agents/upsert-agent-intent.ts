import type { HandlerEvent } from "@netlify/functions";
import { getRequestClient } from "../../functions_active/supabase";
import { validateUUID } from "../../functions_active/utils/input-validation.js";
import { createErrorResponse, generateRequestId } from "../utils/error-handler";

interface AgentIntentConfigPayload {
  vision_title: string;
  vision_summary: string;
  mission_summary: string;
  mission_checklist?: string[];
  value_context: string;
  constraints?: string[];
  success_metrics?: string[];
  extra_config?: Record<string, unknown>;
}

interface UpsertIntentRequest {
  agent_id: string;
  intent: AgentIntentConfigPayload;
}

export const handler = async (event: HandlerEvent) => {
  const requestId = generateRequestId();

  if (event.httpMethod !== "POST") {
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

  let payload: UpsertIntentRequest;
  try {
    payload = JSON.parse(event.body || "{}") as UpsertIntentRequest;
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify(createErrorResponse("Invalid request body", undefined, requestId)),
    };
  }

  if (!payload.agent_id || !validateUUID(payload.agent_id) || !payload.intent) {
    return {
      statusCode: 400,
      body: JSON.stringify(
        createErrorResponse("agent_id and intent are required", undefined, requestId),
      ),
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

  const { data: existing } = await supabase
    .from("agent_intent_configurations")
    .select("created_by_user_id, version")
    .eq("agent_id", payload.agent_id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("agent_intent_configurations")
    .upsert(
      {
        agent_id: payload.agent_id,
        created_by_user_id: existing?.created_by_user_id ?? user.id,
        vision_title: payload.intent.vision_title,
        vision_summary: payload.intent.vision_summary,
        mission_summary: payload.intent.mission_summary,
        mission_checklist: normalizeStringArray(payload.intent.mission_checklist),
        value_context: payload.intent.value_context,
        constraints: normalizeStringArray(payload.intent.constraints),
        success_metrics: normalizeStringArray(payload.intent.success_metrics),
        extra_config: payload.intent.extra_config ?? {},
        version: (existing?.version ?? 0) + 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "agent_id" },
    )
    .select()
    .single();

  if (error) {
    return {
      statusCode: 500,
      body: JSON.stringify(createErrorResponse("Failed to save agent intent", undefined, requestId)),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify(data),
  };
};

function normalizeStringArray(values?: string[]): string[] | null {
  const normalized = (values ?? [])
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return normalized.length > 0 ? normalized : null;
}
