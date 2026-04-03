/**
 * NIP-SKL Registry Function
 * POST /.netlify/functions/nip-skl-registry
 *
 * Server-side skill manifest registration, validation, and querying
 * Aligned with: docs/planning/NIP-Triumvirate-Satnam-Integration-Plan.md §7.1
 * Spec: docs/specs/SKL.md
 */

import { verifyEvent } from "nostr-tools";
import { supabaseAdmin } from "../functions/supabase.js";
import { createLogger } from "../functions/utils/logging.ts";
import {
    checkRateLimit,
    createRateLimitIdentifier,
    getClientIP,
    RATE_LIMITS,
} from "./utils/enhanced-rate-limiter.ts";
import {
    createRateLimitErrorResponse,
    generateRequestId,
    logError,
} from "./utils/error-handler.ts";
import { errorResponse, preflightResponse } from "./utils/security-headers.ts";

const logger = createLogger({ component: "NIPSKLRegistry" });

/**
 * Handler for NIP-SKL registry operations
 */
export const handler = async (event) => {
  const requestId = generateRequestId();

  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return preflightResponse();
  }

  // Rate limiting
  const clientIP = getClientIP(event);
  const rateLimitId = createRateLimitIdentifier(clientIP, "nip-skl-registry");
  const rateLimitCheck = await checkRateLimit(
    rateLimitId,
    RATE_LIMITS.SKILL_REGISTRY,
  );

  if (!rateLimitCheck.allowed) {
    return createRateLimitErrorResponse(rateLimitCheck, requestId);
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { action } = body;

    switch (action) {
      case "register-skill":
        return await registerSkill(body, requestId);
      case "query-skills":
        return await querySkills(body, requestId);
      case "attest-skill":
        return await attestSkill(body, requestId);
      default:
        return errorResponse(
          400,
          "Invalid action. Must be: register-skill, query-skills, or attest-skill",
          requestId,
        );
    }
  } catch (error) {
    logError(error, { requestId, component: "NIPSKLRegistry" });
    return errorResponse(500, "Internal server error", requestId);
  }
};

/**
 * Register a skill manifest (kind 33400)
 * Validates Nostr event signature, inserts into skill_manifests table
 */
async function registerSkill(body, requestId) {
  const { nostr_event } = body;

  if (!nostr_event) {
    return errorResponse(400, "Missing nostr_event", requestId);
  }

  // Validate event kind
  if (nostr_event.kind !== 33400) {
    return errorResponse(
      400,
      "Invalid event kind. Must be 33400 (skill manifest)",
      requestId,
    );
  }

  // Verify Nostr event signature
  const isValid = verifyEvent(nostr_event);
  if (!isValid) {
    return errorResponse(400, "Invalid Nostr event signature", requestId);
  }

  // Extract manifest data from event tags
  const getTag = (name) => nostr_event.tags.find((t) => t[0] === name)?.[1];
  const getAllTags = (name) =>
    nostr_event.tags.filter((t) => t[0] === name).map((t) => t[1]);

  const dTag = getTag("d");
  const version = getTag("version");
  const name = getTag("name");
  const description = getTag("description") || nostr_event.content;
  const skillScopeId =
    getTag("skillscopeid") || `33400:${nostr_event.pubkey}:${dTag}:${version}`;

  // Parse input/output schemas from content if present
  let inputSchema = {};
  let outputSchema = {};
  try {
    const contentJson = JSON.parse(nostr_event.content || "{}");
    inputSchema = contentJson.inputSchema || {};
    outputSchema = contentJson.outputSchema || {};
  } catch {
    // Content is not JSON, use empty schemas
  }

  // Insert into skill_manifests table (service role bypasses RLS)
  const { data, error } = await supabaseAdmin.from("skill_manifests").insert({
    skill_scope_id: skillScopeId,
    manifest_event_id: nostr_event.id,
    version,
    name,
    description,
    input_schema: inputSchema,
    output_schema: outputSchema,
    runtime_constraints: getAllTags("constraint"),
    publisher_pubkey: nostr_event.pubkey,
    attestation_status: "unverified",
    relay_hint: getTag("relay"),
    raw_event: nostr_event,
  });

  if (error) {
    logError(error, { requestId, action: "register-skill" });
    return errorResponse(
      500,
      `Failed to register skill: ${error.message}`,
      requestId,
    );
  }

  logger.info("Skill registered", {
    requestId,
    skill_scope_id: skillScopeId,
    publisher_pubkey: nostr_event.pubkey,
  });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      success: true,
      skill_scope_id: skillScopeId,
      manifest_event_id: nostr_event.id,
    }),
  };
}

/**
 * Query skills by publisher, attestation status, or skill_scope_id
 */
async function querySkills(body, requestId) {
  const {
    publisher_pubkey,
    attestation_status,
    skill_scope_id,
    limit = 50,
  } = body;

  let query = supabaseAdmin.from("skill_manifests").select("*");

  if (publisher_pubkey) {
    query = query.eq("publisher_pubkey", publisher_pubkey);
  }

  if (attestation_status) {
    query = query.eq("attestation_status", attestation_status);
  }

  if (skill_scope_id) {
    query = query.eq("skill_scope_id", skill_scope_id);
  }

  query = query.order("created_at", { ascending: false }).limit(limit);

  const { data, error } = await query;

  if (error) {
    logError(error, { requestId, action: "query-skills" });
    return errorResponse(
      500,
      `Failed to query skills: ${error.message}`,
      requestId,
    );
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      success: true,
      skills: data || [],
      count: data?.length || 0,
    }),
  };
}

/**
 * Attest skill (guardian attestation workflow)
 * Validates kind 1985 attestation event, updates attestation_status
 */
async function attestSkill(body, requestId) {
  const { nostr_event, skill_scope_id } = body;

  if (!nostr_event || !skill_scope_id) {
    return errorResponse(
      400,
      "Missing nostr_event or skill_scope_id",
      requestId,
    );
  }

  // Validate event kind
  if (nostr_event.kind !== 1985) {
    return errorResponse(
      400,
      "Invalid event kind. Must be 1985 (attestation)",
      requestId,
    );
  }

  // Verify Nostr event signature
  const isValid = verifyEvent(nostr_event);
  if (!isValid) {
    return errorResponse(400, "Invalid Nostr event signature", requestId);
  }

  // Verify guardian pubkey is trusted
  const trustedGuardians = (process.env.VITE_GUARDIAN_PUBKEYS || "").split(",");
  if (!trustedGuardians.includes(nostr_event.pubkey)) {
    return errorResponse(
      403,
      "Attestation must be from trusted guardian",
      requestId,
    );
  }

  // Verify attestation label is valid
  const labelTag = nostr_event.tags.find((t) => t[0] === "l");
  const validLabels = [
    "skill/verified",
    "skill/audited",
    "skill/verified/tier1",
    "skill/verified/tier2",
    "skill/verified/tier3",
    "skill/verified/tier4",
  ];

  if (!labelTag || !validLabels.includes(labelTag[1])) {
    return errorResponse(
      400,
      "Invalid attestation label. Must be skill/verified, skill/audited, or tier label",
      requestId,
    );
  }

  // Update skill_manifests table
  const { data, error } = await supabaseAdmin
    .from("skill_manifests")
    .update({
      attestation_status: "verified",
      attestation_event_ids: supabaseAdmin.raw(
        `array_append(attestation_event_ids, '${nostr_event.id}')`,
      ),
    })
    .eq("skill_scope_id", skill_scope_id)
    .select();

  if (error) {
    logError(error, { requestId, action: "attest-skill" });
    return errorResponse(
      500,
      `Failed to attest skill: ${error.message}`,
      requestId,
    );
  }

  logger.info("Skill attested", {
    requestId,
    skill_scope_id,
    guardian_pubkey: nostr_event.pubkey,
    attestation_event_id: nostr_event.id,
  });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      success: true,
      skill_scope_id,
      attestation_event_id: nostr_event.id,
      attestation_status: "verified",
    }),
  };
}
