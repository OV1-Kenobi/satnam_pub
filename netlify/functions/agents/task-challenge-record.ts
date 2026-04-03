import type { HandlerEvent } from "@netlify/functions";

import { getRequestClient, supabaseAdmin } from "../supabase";
import { validateUUID } from "../../functions_active/utils/input-validation.js";
import {
  createErrorResponse,
  generateRequestId,
  logErrorWithContext as logError,
} from "../utils/error-handler";

const ALLOWED_REASONS = new Set([
  "AMBIGUOUS_SPEC",
  "RESOURCE_EXCEED",
  "ETHICAL_CONCERN",
  "CAPABILITY_MISMATCH",
  "CONTEXT_SATURATION",
]);

interface TaskChallengeRecordRequest {
  task_id: string;
  agent_id: string;
  challenge: {
    challenge_reason: string;
    agent_concern: string;
    suggested_modification?: string;
    confidence_in_challenge: number;
  };
}

export const handler = async (event: HandlerEvent) => {
  const requestId = generateRequestId();

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify(
        createErrorResponse("Method not allowed", undefined, requestId),
      ),
    };
  }

  const accessToken = event.headers.authorization?.replace(/^Bearer\s+/iu, "");

  if (!accessToken) {
    return {
      statusCode: 401,
      body: JSON.stringify(
        createErrorResponse("Missing authorization token", undefined, requestId),
      ),
    };
  }

  try {
    const request = JSON.parse(event.body ?? "{}") as TaskChallengeRecordRequest;

    if (!validateUUID(request.task_id) || !validateUUID(request.agent_id)) {
      return {
        statusCode: 400,
        body: JSON.stringify(
          createErrorResponse(
            "task_id and agent_id must be valid UUIDs",
            undefined,
            requestId,
          ),
        ),
      };
    }

    if (!ALLOWED_REASONS.has(request.challenge?.challenge_reason)) {
      return {
        statusCode: 400,
        body: JSON.stringify(
          createErrorResponse("Invalid challenge_reason", undefined, requestId),
        ),
      };
    }

    if (
      typeof request.challenge.agent_concern !== "string" ||
      request.challenge.agent_concern.trim().length < 10
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify(
          createErrorResponse(
            "agent_concern must be at least 10 characters",
            undefined,
            requestId,
          ),
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
        body: JSON.stringify(
          createErrorResponse("Authentication failed", undefined, requestId),
        ),
      };
    }

    const { data: isGovernor, error: governorError } = await supabase.rpc(
      "is_agent_governor",
      {
        p_agent_id: request.agent_id,
        p_user_id: user.id,
      },
    );

    if (governorError || !isGovernor) {
      return {
        statusCode: 403,
        body: JSON.stringify(
          createErrorResponse(
            "Caller is not authorized to delegate to this agent",
            undefined,
            requestId,
          ),
        ),
      };
    }

    // SECURITY: bypass RLS only for the insert. The delegator is authenticated
    // and verified as a valid governor for the target agent above.
    const { data, error } = await supabaseAdmin
      .from("agent_task_challenges")
      .insert({
        task_id: request.task_id,
        agent_id: request.agent_id,
        delegator_id: user.id,
        challenge_reason: request.challenge.challenge_reason,
        agent_concern: request.challenge.agent_concern.trim(),
        suggested_modification:
          request.challenge.suggested_modification?.trim() || null,
        confidence_in_challenge: request.challenge.confidence_in_challenge,
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(error?.message || "Insert failed");
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        challenge_id: data.id,
        request_id: requestId,
      }),
    };
  } catch (error) {
    logError(error instanceof Error ? error : String(error), {
      component: "task-challenge-record",
      action: "record_challenge",
      requestId,
    });

    return {
      statusCode: 500,
      body: JSON.stringify(
        createErrorResponse("Failed to record task challenge", undefined, requestId),
      ),
    };
  }
};