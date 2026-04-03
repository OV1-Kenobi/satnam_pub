/**
 * NIP-SA Agent Profile Management Function
 * POST /.netlify/functions/nip-sa-agent
 *
 * Server-side agent profile creation, wallet policy updates, skill licensing
 * Aligned with: docs/planning/NIP-Triumvirate-Satnam-Integration-Plan.md §7.2
 * Spec: docs/specs/SA.md
 */

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

const logger = createLogger({ component: "NIPSAAgent" });

/**
 * Handler for NIP-SA agent profile operations
 */
export const handler = async (event) => {
  const requestId = generateRequestId();

  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return preflightResponse();
  }

  // Rate limiting
  const clientIP = getClientIP(event);
  const rateLimitId = createRateLimitIdentifier(clientIP, "nip-sa-agent");
  const rateLimitCheck = await checkRateLimit(
    rateLimitId,
    RATE_LIMITS.AGENT_PROFILE,
  );

  if (!rateLimitCheck.allowed) {
    return createRateLimitErrorResponse(rateLimitCheck, requestId);
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { action } = body;

    switch (action) {
      case "create-agent-profile":
        return await createAgentProfile(body, requestId);
      case "update-wallet-policy":
        return await updateWalletPolicy(body, requestId);
      case "enable-skill":
        return await enableSkill(body, requestId);
      case "disable-skill":
        return await disableSkill(body, requestId);
      default:
        return errorResponse(
          400,
          "Invalid action. Must be: create-agent-profile, update-wallet-policy, enable-skill, or disable-skill",
          requestId,
        );
    }
  } catch (error) {
    logError(error, { requestId, component: "NIPSAAgent" });
    return errorResponse(500, "Internal server error", requestId);
  }
};

/**
 * Create agent profile with wallet policy defaults
 */
async function createAgentProfile(body, requestId) {
  const {
    user_identity_id,
    agent_username,
    agent_pubkey,
    guardian_pubkey,
    wallet_policy = {},
  } = body;

  if (!user_identity_id || !agent_username || !agent_pubkey) {
    return errorResponse(
      400,
      "Missing required fields: user_identity_id, agent_username, agent_pubkey",
      requestId,
    );
  }

  // Verify guardian has authority (TODO: implement guardian authorization check)
  // For now, assume guardian_pubkey is provided and valid

  // Create agent profile with NIP-SA wallet policy defaults
  const { data, error } = await supabaseAdmin.from("agent_profiles").insert({
    user_identity_id,
    is_agent: true,
    agent_username,
    unified_address: `${agent_username}@ai.satnam.pub`,
    // NIP-SA wallet policy defaults
    max_single_spend_sats: wallet_policy.max_single_spend_sats || 1000,
    daily_limit_sats: wallet_policy.daily_limit_sats || 100000,
    requires_approval_above_sats:
      wallet_policy.requires_approval_above_sats || 10000,
    preferred_spend_rail: wallet_policy.preferred_spend_rail || "lightning",
    allowed_mints: wallet_policy.allowed_mints || [],
    sweep_threshold_sats: wallet_policy.sweep_threshold_sats || 50000,
    sweep_destination: wallet_policy.sweep_destination || null,
    sweep_rail: wallet_policy.sweep_rail || "lightning",
    enabled_skill_scope_ids: [],
    // OTS/SimpleProof defaults
    simpleproof_enabled: false,
    ots_attestation_count: 0,
    // Reputation defaults
    reputation_score: 0,
    credit_limit_sats: 0,
    total_settled_sats: 0,
    settlement_success_count: 0,
    settlement_default_count: 0,
    // Performance bond defaults
    total_bonds_staked_sats: 0,
    total_bonds_released_sats: 0,
    total_bonds_slashed_sats: 0,
    bond_slash_count: 0,
    current_bonded_sats: 0,
    // Work history defaults
    total_tasks_completed: 0,
    total_tasks_failed: 0,
    tier1_validations: 0,
    tier2_validations: 0,
    tier3_validations: 0,
    // Communication defaults
    accepts_encrypted_dms: true,
    public_portfolio_enabled: false,
    // Token balance defaults
    event_tokens_balance: 0,
    task_tokens_balance: 0,
    contact_tokens_balance: 0,
    dm_tokens_balance: 0,
    // Monetization defaults
    total_platform_fees_paid_sats: 0,
    free_tier_claimed: false,
  });

  if (error) {
    logError(error, { requestId, action: "create-agent-profile" });
    return errorResponse(
      500,
      `Failed to create agent profile: ${error.message}`,
      requestId,
    );
  }

  logger.info("Agent profile created", {
    requestId,
    agent_username,
    user_identity_id,
  });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      success: true,
      agent_profile: data,
    }),
  };
}

/**
 * Update wallet policy for an agent
 * Guardian authentication required
 */
async function updateWalletPolicy(body, requestId) {
  const { agent_pubkey, guardian_pubkey, wallet_policy } = body;

  if (!agent_pubkey || !guardian_pubkey || !wallet_policy) {
    return errorResponse(
      400,
      "Missing required fields: agent_pubkey, guardian_pubkey, wallet_policy",
      requestId,
    );
  }

  // Validate wallet policy constraints
  if (
    wallet_policy.max_single_spend_sats &&
    wallet_policy.daily_limit_sats &&
    wallet_policy.max_single_spend_sats > wallet_policy.daily_limit_sats
  ) {
    return errorResponse(
      400,
      "max_single_spend_sats cannot exceed daily_limit_sats",
      requestId,
    );
  }

  // TODO: Verify guardian has authority over this agent
  // For now, assume guardian_pubkey is valid

  // Update wallet policy fields
  const updateFields = {};
  if (wallet_policy.max_single_spend_sats !== undefined) {
    updateFields.max_single_spend_sats = wallet_policy.max_single_spend_sats;
  }
  if (wallet_policy.daily_limit_sats !== undefined) {
    updateFields.daily_limit_sats = wallet_policy.daily_limit_sats;
  }
  if (wallet_policy.requires_approval_above_sats !== undefined) {
    updateFields.requires_approval_above_sats =
      wallet_policy.requires_approval_above_sats;
  }
  if (wallet_policy.preferred_spend_rail !== undefined) {
    updateFields.preferred_spend_rail = wallet_policy.preferred_spend_rail;
  }
  if (wallet_policy.allowed_mints !== undefined) {
    updateFields.allowed_mints = wallet_policy.allowed_mints;
  }
  if (wallet_policy.sweep_threshold_sats !== undefined) {
    updateFields.sweep_threshold_sats = wallet_policy.sweep_threshold_sats;
  }
  if (wallet_policy.sweep_destination !== undefined) {
    updateFields.sweep_destination = wallet_policy.sweep_destination;
  }
  if (wallet_policy.sweep_rail !== undefined) {
    updateFields.sweep_rail = wallet_policy.sweep_rail;
  }

  const { data, error } = await supabaseAdmin
    .from("agent_profiles")
    .update(updateFields)
    .eq("agent_pubkey", agent_pubkey)
    .select();

  if (error) {
    logError(error, { requestId, action: "update-wallet-policy" });
    return errorResponse(
      500,
      `Failed to update wallet policy: ${error.message}`,
      requestId,
    );
  }

  logger.info("Wallet policy updated", {
    requestId,
    agent_pubkey,
    guardian_pubkey,
  });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      success: true,
      agent_profile: data?.[0],
    }),
  };
}

/**
 * Enable a skill for an agent
 * Adds skill_scope_id to enabled_skill_scope_ids array
 */
async function enableSkill(body, requestId) {
  const { agent_pubkey, skill_scope_id, guardian_pubkey } = body;

  if (!agent_pubkey || !skill_scope_id || !guardian_pubkey) {
    return errorResponse(
      400,
      "Missing required fields: agent_pubkey, skill_scope_id, guardian_pubkey",
      requestId,
    );
  }

  // TODO: Verify guardian has authority over this agent
  // TODO: Verify skill exists in skill_manifests table
  // TODO: Verify skill has valid attestation

  // Add skill_scope_id to enabled_skill_scope_ids array
  const { data, error } = await supabaseAdmin.rpc("enable_agent_skill", {
    agent_pk: agent_pubkey,
    skill_id: skill_scope_id,
  });

  if (error) {
    logError(error, { requestId, action: "enable-skill" });
    return errorResponse(
      500,
      `Failed to enable skill: ${error.message}`,
      requestId,
    );
  }

  logger.info("Skill enabled for agent", {
    requestId,
    agent_pubkey,
    skill_scope_id,
  });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      success: true,
      agent_pubkey,
      skill_scope_id,
    }),
  };
}

/**
 * Disable a skill for an agent
 * Removes skill_scope_id from enabled_skill_scope_ids array
 */
async function disableSkill(body, requestId) {
  const { agent_pubkey, skill_scope_id, guardian_pubkey } = body;

  if (!agent_pubkey || !skill_scope_id || !guardian_pubkey) {
    return errorResponse(
      400,
      "Missing required fields: agent_pubkey, skill_scope_id, guardian_pubkey",
      requestId,
    );
  }

  // TODO: Verify guardian has authority over this agent

  // Remove skill_scope_id from enabled_skill_scope_ids array
  const { data, error } = await supabaseAdmin.rpc("disable_agent_skill", {
    agent_pk: agent_pubkey,
    skill_id: skill_scope_id,
  });

  if (error) {
    logError(error, { requestId, action: "disable-skill" });
    return errorResponse(
      500,
      `Failed to disable skill: ${error.message}`,
      requestId,
    );
  }

  logger.info("Skill disabled for agent", {
    requestId,
    agent_pubkey,
    skill_scope_id,
  });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      success: true,
      agent_pubkey,
      skill_scope_id,
    }),
  };
}
