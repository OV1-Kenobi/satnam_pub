/**
 * .well-known/agent.json Endpoint
 * GET /.well-known/agent.json?address=agent-name@ai.satnam.pub
 *
 * Serve agent discovery metadata (NIP-SA kind 39200 profile)
 * Aligned with: docs/planning/NIP-Triumvirate-Satnam-Integration-Plan.md §7.3
 * Spec: docs/specs/SA.md
 */

import { supabaseAdmin } from '../functions/supabase.js';
import {
  errorResponse,
  preflightResponse,
} from './utils/security-headers.ts';
import { generateRequestId, logError } from './utils/error-handler.ts';
import { createLogger } from '../functions/utils/logging.ts';

const logger = createLogger({ component: 'WellKnownAgent' });

// Cache TTL: 60 seconds
const CACHE_TTL = 60;

/**
 * Handler for .well-known/agent.json endpoint
 * Public endpoint (no authentication required)
 */
export const handler = async (event) => {
  const requestId = generateRequestId();

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return preflightResponse();
  }

  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return errorResponse(405, 'Method not allowed', requestId);
  }

  try {
    // Parse query parameters
    const params = event.queryStringParameters || {};
    const { address } = params;

    if (!address) {
      return errorResponse(
        400,
        'Missing required query parameter: address (e.g. agent-name@ai.satnam.pub)',
        requestId
      );
    }

    // Query agent_profiles by unified_address
    const { data: agent, error } = await supabaseAdmin
      .from('agent_profiles')
      .select('*')
      .eq('unified_address', address)
      .single();

    if (error || !agent) {
      return errorResponse(404, 'Agent not found', requestId);
    }

    // Build .well-known/agent.json response
    const agentMetadata = {
      version: '1.0',
      agent_address: agent.unified_address,
      agent_username: agent.agent_username,
      agent_pubkey: agent.agent_pubkey || null,
      capabilities: {
        accepts_encrypted_dms: agent.accepts_encrypted_dms || false,
        public_portfolio_enabled: agent.public_portfolio_enabled || false,
        enabled_skills: agent.enabled_skill_scope_ids || [],
      },
      wallet_policy: {
        max_single_spend_sats: agent.max_single_spend_sats || 1000,
        daily_limit_sats: agent.daily_limit_sats || 100000,
        requires_approval_above_sats:
          agent.requires_approval_above_sats || 10000,
        preferred_spend_rail: agent.preferred_spend_rail || 'lightning',
        sweep_threshold_sats: agent.sweep_threshold_sats || 50000,
      },
      reputation: {
        reputation_score: agent.reputation_score || 0,
        total_tasks_completed: agent.total_tasks_completed || 0,
        total_tasks_failed: agent.total_tasks_failed || 0,
        settlement_success_count: agent.settlement_success_count || 0,
        settlement_default_count: agent.settlement_default_count || 0,
      },
      relay_hints: agent.coordination_relay_urls || [],
      nip_sa_profile_event_id: agent.nip_sa_profile_event_id || null,
      well_known_published_at: agent.well_known_published_at || null,
    };

    logger.info('Agent metadata served', {
      requestId,
      agent_address: address,
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_TTL}`,
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(agentMetadata),
    };
  } catch (error) {
    logError(error, { requestId, component: 'WellKnownAgent' });
    return errorResponse(500, 'Internal server error', requestId);
  }
};

