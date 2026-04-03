/**
 * NIP-AC Revocation Handler
 * POST /.netlify/functions/nip-ac-revocation-handler
 *
 * Guardian/steward revokes credit envelope
 * Aligned with: docs/planning/NIP-Triumvirate-Satnam-Integration-Plan.md §7.4
 * Spec: docs/specs/AC.md
 */

import { verifyEvent } from 'nostr-tools';
import { supabaseAdmin } from '../functions/supabase.js';
import {
  errorResponse,
  preflightResponse,
} from './utils/security-headers.ts';
import {
  checkRateLimit,
  createRateLimitIdentifier,
  getClientIP,
  RATE_LIMITS,
} from './utils/enhanced-rate-limiter.ts';
import {
  createRateLimitErrorResponse,
  generateRequestId,
  logError,
} from './utils/error-handler.ts';
import { createLogger } from '../functions/utils/logging.ts';

const logger = createLogger({ component: 'NIPACRevocation' });

/**
 * Handler for NIP-AC revocation operations
 */
export const handler = async (event) => {
  const requestId = generateRequestId();

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return preflightResponse();
  }

  // Rate limiting
  const clientIP = getClientIP(event);
  const rateLimitId = createRateLimitIdentifier(
    clientIP,
    'nip-ac-revocation'
  );
  const rateLimitCheck = await checkRateLimit(
    rateLimitId,
    RATE_LIMITS.ENVELOPE_REVOCATION
  );

  if (!rateLimitCheck.allowed) {
    return createRateLimitErrorResponse(rateLimitCheck, requestId);
  }

  try {
    const body = JSON.parse(event.body || '{}');
    return await revokeEnvelope(body, requestId);
  } catch (error) {
    logError(error, { requestId, component: 'NIPACRevocation' });
    return errorResponse(500, 'Internal server error', requestId);
  }
};

/**
 * Revoke a credit envelope
 * Guardian/steward only
 */
async function revokeEnvelope(body, requestId) {
  const {
    envelope_id,
    revocation_event,
    guardian_pubkey,
    revocation_reason,
  } = body;

  if (!envelope_id || !revocation_event || !guardian_pubkey) {
    return errorResponse(
      400,
      'Missing required fields: envelope_id, revocation_event, guardian_pubkey',
      requestId
    );
  }

  // Validate revocation event kind (kind 1985 with revocation label)
  if (revocation_event.kind !== 1985) {
    return errorResponse(
      400,
      'Invalid event kind. Must be 1985 (revocation)',
      requestId
    );
  }

  // Verify Nostr event signature
  const isValid = verifyEvent(revocation_event);
  if (!isValid) {
    return errorResponse(400, 'Invalid Nostr event signature', requestId);
  }

  // Verify guardian pubkey is trusted
  const trustedGuardians = (
    process.env.VITE_GUARDIAN_PUBKEYS || ''
  ).split(',');
  if (!trustedGuardians.includes(guardian_pubkey)) {
    return errorResponse(
      403,
      'Revocation must be from trusted guardian/steward',
      requestId
    );
  }

  // Verify revocation label is present
  const labelTag = revocation_event.tags.find((t) => t[0] === 'l');
  if (!labelTag || !labelTag[1].includes('revoked')) {
    return errorResponse(
      400,
      'Revocation event must have revocation label',
      requestId
    );
  }

  // Update credit_envelopes table
  const { data: envelope, error: updateError } = await supabaseAdmin
    .from('credit_envelopes')
    .update({
      revocationStatus: 'revoked',
      revoked_at: new Date().toISOString(),
    })
    .eq('id', envelope_id)
    .select()
    .single();

  if (updateError) {
    logError(updateError, { requestId, action: 'revoke-envelope' });
    return errorResponse(
      500,
      `Failed to revoke envelope: ${updateError.message}`,
      requestId
    );
  }

  // Insert row into nip_revocation_events table (if exists)
  // TODO: Create nip_revocation_events table in future migration
  // await supabaseAdmin.from('nip_revocation_events').insert({
  //   envelope_id,
  //   revocation_event_id: revocation_event.id,
  //   guardian_pubkey,
  //   revocation_reason,
  //   revoked_at: new Date().toISOString(),
  // });

  // Queue OTS proof generation for revocation event
  try {
    await fetch('/.netlify/functions/ots-proof-generator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attested_event_kind: 1985,
        attested_event_id: revocation_event.id,
        agent_pubkey: envelope.agent_pubkey,
        data: JSON.stringify(revocation_event),
        storage_backend: 'supabase',
      }),
    });
  } catch (error) {
    // Non-fatal: log error but don't block revocation
    logger.warn('OTS proof generation failed (non-fatal)', {
      requestId,
      error: error.message,
    });
  }

  logger.info('Envelope revoked', {
    requestId,
    envelope_id,
    guardian_pubkey,
    revocation_event_id: revocation_event.id,
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success: true,
      envelope_id,
      revocation_event_id: revocation_event.id,
      revocationStatus: 'revoked',
    }),
  };
}

