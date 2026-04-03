// ARCHITECTURE: Netlify Function (ESM) — export portable reputation bundle
import type { HandlerEvent } from "@netlify/functions";
import { getRequestClient } from "../../functions_active/supabase";
import { validateUUID } from "../../functions_active/utils/input-validation.js";
import {
  createErrorResponse,
  generateRequestId,
  logErrorWithContext as logError,
} from "../utils/error-handler";

interface ReputationExportRequest {
  agent_id: string;
  session_id?: string;
  include_events?: boolean; // Include recent reputation events
  max_events?: number; // Maximum events to include (default: 500)
}

interface ReputationBundle {
  agent_id: string;
  export_timestamp: string;
  aggregated_score: number;
  recent_events_count: number;
  events?: ReputationEvent[];
  nostr_event_ids: string[];
  signature?: string;
}

interface ReputationEvent {
  id: string;
  raw_score: number;
  weight: number;
  created_at: string;
  label_namespace?: string;
  label_name?: string;
  nostr_event_id?: string;
  context?: any;
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

  const authHeader =
    event.headers.authorization || event.headers.Authorization || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!accessToken) {
    return {
      statusCode: 401,
      body: JSON.stringify(
        createErrorResponse("Authentication required", undefined, requestId),
      ),
    };
  }

  let request: ReputationExportRequest;
  try {
    request = JSON.parse(event.body || "{}") as ReputationExportRequest;
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify(
        createErrorResponse("Invalid request body", undefined, requestId),
      ),
    };
  }

  if (!validateUUID(request.agent_id)) {
    return {
      statusCode: 400,
      body: JSON.stringify(
        createErrorResponse("agent_id is required", undefined, requestId),
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
        createErrorResponse("Authentication required", undefined, requestId),
      ),
    };
  }

  const { data: callerIdentity, error: callerError } = await supabase
    .from("user_identities")
    .select("id, is_agent")
    .eq("id", user.id)
    .single();

  if (callerError || !callerIdentity) {
    return {
      statusCode: 403,
      body: JSON.stringify(
        createErrorResponse(
          "Unable to resolve caller identity",
          undefined,
          requestId,
        ),
      ),
    };
  }

  const { data: canExport, error: governorError } = await supabase.rpc(
    "is_agent_governor",
    {
      p_agent_id: request.agent_id,
      p_user_id: user.id,
    },
  );

  if (governorError || !canExport) {
    return {
      statusCode: 403,
      body: JSON.stringify(
        createErrorResponse(
          "Caller is not authorized to export this agent reputation",
          undefined,
          requestId,
        ),
      ),
    };
  }

  if (callerIdentity.is_agent) {
    if (!request.session_id || !validateSessionId(request.session_id)) {
      return {
        statusCode: 400,
        body: JSON.stringify(
          createErrorResponse(
            "session_id is required for agent exports",
            undefined,
            requestId,
          ),
        ),
      };
    }

    const { data: sessionContext, error: sessionError } = await supabase
      .from("agent_sessions")
      .select("session_id, agent_id, status, expires_at, family_federation_id")
      .eq("session_id", request.session_id)
      .eq("agent_id", request.agent_id)
      .maybeSingle();

    if (
      sessionError ||
      !sessionContext ||
      sessionContext.status === "TERMINATED"
    ) {
      return {
        statusCode: 403,
        body: JSON.stringify(
          createErrorResponse(
            "An active agent session is required for export",
            undefined,
            requestId,
          ),
        ),
      };
    }

    if (new Date(sessionContext.expires_at).getTime() <= Date.now()) {
      return {
        statusCode: 403,
        body: JSON.stringify(
          createErrorResponse(
            "Agent session has expired",
            undefined,
            requestId,
          ),
        ),
      };
    }
  }

  // Get agent identity
  const { data: agent, error: agentError } = await supabase
    .from("user_identities")
    .select("id, npub, is_agent")
    .eq("id", request.agent_id)
    .single();

  if (agentError || !agent || !agent.is_agent) {
    return {
      statusCode: 404,
      body: JSON.stringify(
        createErrorResponse("Agent not found", undefined, requestId),
      ),
    };
  }

  // Calculate aggregated decayed reputation
  const { data: reputationData, error: reputationError } = await supabase.rpc(
    "calculate_decayed_reputation",
    {
      p_agent_id: request.agent_id,
    },
  );

  if (reputationError) {
    logError(reputationError, {
      component: "export-reputation",
      action: "calculate_decayed_reputation",
      requestId,
      metadata: { agent_id: request.agent_id },
    });
    return {
      statusCode: 500,
      body: JSON.stringify(
        createErrorResponse(
          "Failed to calculate reputation",
          undefined,
          requestId,
        ),
      ),
    };
  }

  const aggregatedScore = reputationData || 0;

  // Get recent reputation events if requested
  let events: ReputationEvent[] = [];
  let nostrEventIds: string[] = [];

  if (request.include_events !== false) {
    const maxEvents = request.max_events || 500;
    const { data: eventsData } = await supabase
      .from("agent_reputation_events")
      .select(
        `
        id,
        raw_score,
        weight,
        created_at,
        label_namespace,
        label_name,
        nostr_event_id,
        context
      `,
      )
      .eq("subject_agent_id", request.agent_id)
      .order("created_at", { ascending: false })
      .limit(maxEvents);

    if (eventsData) {
      events = eventsData.map((event) => ({
        id: event.id,
        raw_score: event.raw_score,
        weight: event.weight,
        created_at: event.created_at,
        label_namespace: event.label_namespace,
        label_name: event.label_name,
        nostr_event_id: event.nostr_event_id,
        context: event.context,
      }));

      nostrEventIds = eventsData
        .filter((event) => event.nostr_event_id)
        .map((event) => event.nostr_event_id!);
    }
  }

  // Create reputation bundle
  const bundle: ReputationBundle = {
    agent_id: request.agent_id,
    export_timestamp: new Date().toISOString(),
    aggregated_score: aggregatedScore,
    recent_events_count: events.length,
    events: events.length > 0 ? events : undefined,
    nostr_event_ids: nostrEventIds,
  };

  // Sign the bundle with agent's key via remote signer
  const signature = await signReputationBundleViaRemoteSigner(
    bundle,
    request.agent_id,
  );
  bundle.signature = signature;

  return {
    statusCode: 200,
    body: JSON.stringify(bundle),
  };
};

function validateSessionId(sessionId: string): boolean {
  return /^sess_[A-Za-z0-9]+$/.test(sessionId);
}

// Helper function to sign reputation bundle via remote signer
async function signReputationBundleViaRemoteSigner(
  bundle: ReputationBundle,
  agentId: string,
): Promise<string> {
  // TODO: Implement remote signing via NIP-46 or SecureNsecManager
  // For now, return a mock signature
  return `mock-reputation-signature-${Date.now()}`;
}
