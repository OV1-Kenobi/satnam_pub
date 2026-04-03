// ARCHITECTURE: Netlify Function (ESM) — import portable reputation bundle
import { getRequestClient } from "../../functions_active/supabase";
import {
  createErrorResponse,
  logErrorWithContext as logError,
  generateRequestId,
} from "../utils/error-handler";
import type { HandlerEvent } from "@netlify/functions";

interface ReputationImportRequest {
  agent_id: string; // Importing agent's ID
  reputation_bundle: {
    agent_id: string; // Source agent's ID
    export_timestamp: string;
    aggregated_score: number;
    recent_events_count: number;
    events?: ReputationEvent[];
    nostr_event_ids: string[];
    signature?: string;
  };
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
  const supabase = getRequestClient();
  const request: ReputationImportRequest = JSON.parse(event.body || "{}");

  // Verify signature of the reputation bundle
  const signatureValid = await verifyReputationBundleSignature(
    request.reputation_bundle,
    request.reputation_bundle.signature,
  );

  if (!signatureValid) {
    return createErrorResponse(
      "Invalid reputation bundle signature",
      undefined,
      requestId,
    );
  }

  // Check if source agent exists
  const { data: sourceAgent } = await supabase
    .from("user_identities")
    .select("id")
    .eq("id", request.reputation_bundle.agent_id)
    .single();

  if (!sourceAgent) {
    return createErrorResponse("Source agent not found", undefined, requestId);
  }

  // Import reputation events if provided
  let importedEventsCount = 0;
  if (
    request.reputation_bundle.events &&
    request.reputation_bundle.events.length > 0
  ) {
    for (const event of request.reputation_bundle.events) {
      try {
        // Check if event already exists to avoid duplicates
        const { data: existingEvent } = await supabase
          .from("agent_reputation_events")
          .select("id")
          .eq("nostr_event_id", event.nostr_event_id)
          .single();

        if (!existingEvent) {
          const { error } = await supabase
            .from("agent_reputation_events")
            .insert({
              subject_agent_id: request.agent_id,
              rater_identity_id: sourceAgent.id, // Source agent as rater
              nostr_event_id: event.nostr_event_id,
              nostr_event_kind: event.label_namespace ? 32 : 1985, // NIP-32 or custom kind
              label_namespace: event.label_namespace,
              label_name: event.label_name,
              raw_score: event.raw_score,
              weight: event.weight,
              context: event.context || {},
              created_at: new Date(event.created_at),
            });

          if (!error) {
            importedEventsCount++;
          }
        }
      } catch (error) {
        logError(error instanceof Error ? error : new Error(String(error)), {
          component: "reputation_import",
          action: "event_insert",
          metadata: { eventId: event.id },
        });
      }
    }
  }

  // Update agent's aggregated reputation score
  await supabase
    .rpc("update_agent_reputation_scores")
    .eq("p_agent_id", request.agent_id);

  return {
    statusCode: 200,
    body: JSON.stringify({
      import_successful: true,
      imported_events_count: importedEventsCount,
      source_agent_id: request.reputation_bundle.agent_id,
      aggregated_score: request.reputation_bundle.aggregated_score,
    }),
  };
};

// Helper function to verify reputation bundle signature
async function verifyReputationBundleSignature(
  bundle: any,
  signature?: string,
): Promise<boolean> {
  // TODO: Implement actual signature verification using NIP-46 or SecureNsecManager
  // For now, return true as placeholder
  return true;
}
