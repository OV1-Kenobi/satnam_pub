import type { HandlerEvent } from "@netlify/functions";
import { getRequestClient } from "../../functions_active/supabase";
import { validateUUID } from "../../functions_active/utils/input-validation.js";
import { createErrorResponse, generateRequestId } from "../utils/error-handler";

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

  const agentId = event.queryStringParameters?.agent_id || "";
  if (!agentId || !validateUUID(agentId)) {
    return {
      statusCode: 400,
      body: JSON.stringify(createErrorResponse("agent_id is required", undefined, requestId)),
    };
  }

  const supabase = getRequestClient(accessToken);
  const { data, error } = await supabase
    .from("agent_intent_configurations")
    .select("*")
    .eq("agent_id", agentId)
    .maybeSingle();

  if (error || !data) {
    return {
      statusCode: 404,
      body: JSON.stringify(createErrorResponse("Intent not found", undefined, requestId)),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify(data),
  };
};
