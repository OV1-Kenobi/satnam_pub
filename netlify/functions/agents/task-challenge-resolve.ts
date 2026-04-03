import type { HandlerEvent } from "@netlify/functions";

import { getRequestClient } from "../supabase";
import { validateUUID } from "../../functions_active/utils/input-validation.js";
import {
  createErrorResponse,
  generateRequestId,
  logErrorWithContext as logError,
} from "../utils/error-handler";

const ALLOWED_RESOLUTIONS = new Set([
  "REVISED",
  "OVERRIDE_WITH_EXPLANATION",
  "CANCELLED",
  "DELEGATED_TO_ALTERNATIVE",
]);

interface TaskChallengeResolveRequest {
  challenge_id: string;
  resolution: string;
  challenge_accepted: boolean;
  task_proceeded: boolean;
  delegator_explanation?: string;
  revised_task_spec?: Record<string, unknown>;
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
    const request = JSON.parse(event.body ?? "{}") as TaskChallengeResolveRequest;

    if (!validateUUID(request.challenge_id)) {
      return {
        statusCode: 400,
        body: JSON.stringify(
          createErrorResponse(
            "challenge_id must be a valid UUID",
            undefined,
            requestId,
          ),
        ),
      };
    }

    if (!ALLOWED_RESOLUTIONS.has(request.resolution)) {
      return {
        statusCode: 400,
        body: JSON.stringify(
          createErrorResponse("Invalid resolution", undefined, requestId),
        ),
      };
    }

    if (
      request.resolution === "OVERRIDE_WITH_EXPLANATION" &&
      (typeof request.delegator_explanation !== "string" ||
        request.delegator_explanation.trim().length < 20)
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify(
          createErrorResponse(
            "Override explanations must be at least 20 characters",
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

    const { error } = await supabase
      .from("agent_task_challenges")
      .update({
        resolution: request.resolution,
        challenge_accepted: request.challenge_accepted,
        task_proceeded: request.task_proceeded,
        delegator_explanation: request.delegator_explanation?.trim() || null,
        revised_task_spec: request.revised_task_spec ?? null,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", request.challenge_id)
      .eq("delegator_id", user.id);

    if (error) {
      throw new Error(error.message);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, request_id: requestId }),
    };
  } catch (error) {
    logError(error instanceof Error ? error : String(error), {
      component: "task-challenge-resolve",
      action: "resolve_challenge",
      requestId,
    });

    return {
      statusCode: 500,
      body: JSON.stringify(
        createErrorResponse("Failed to resolve task challenge", undefined, requestId),
      ),
    };
  }
};