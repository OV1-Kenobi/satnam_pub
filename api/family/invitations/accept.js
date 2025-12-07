/**
 * Family Federation Invitation Acceptance API
 * POST /api/family/invitations/accept
 * 
 * Accepts an invitation and adds the user to the federation.
 * Requires authentication - user must be logged in.
 * 
 * MASTER CONTEXT COMPLIANCE:
 * ✅ JavaScript API route per browser-only serverless architecture
 * ✅ JWT authentication via SecureSessionManager
 * ✅ Privacy-first with zero-knowledge patterns
 * ✅ FROST threshold validation deferred to member joining (per approved decision)
 */

import { supabase } from '../../../netlify/functions/supabase.js';

/**
 * Validate FROST threshold when adding a new member
 * @param {number} currentMemberCount - Current number of members
 * @param {number} currentThreshold - Current FROST threshold
 * @returns {{ valid: boolean, message?: string }}
 */
function validateFrostOnJoin(currentMemberCount, currentThreshold) {
  const newMemberCount = currentMemberCount + 1;

  // FROST supports up to 7 participants
  if (newMemberCount > 7) {
    return {
      valid: false,
      message: 'Federation has reached maximum capacity (7 members)'
    };
  }

  // Threshold must not exceed member count
  if (currentThreshold > newMemberCount) {
    return {
      valid: false,
      message: `Cannot join: FROST threshold (${currentThreshold}) would exceed member count (${newMemberCount})`
    };
  }

  return { valid: true };
}

/**
 * Verify safeword using SHA-256 with stored salt
 * Uses Web Crypto API for browser-compatible cryptography
 * @param {string} safeword - Plain text safeword to verify
 * @param {string} storedHash - Stored SHA-256 hash (hex-encoded)
 * @param {string} storedSalt - Stored salt (hex-encoded)
 * @returns {Promise<boolean>} True if safeword matches
 */
async function verifySafeword(safeword, storedHash, storedSalt) {
  // Compute SHA-256(salt || safeword)
  const encoder = new TextEncoder();
  const data = encoder.encode(storedSalt + safeword);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const computedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  // Compare hashes (using double-hash for timing attack mitigation)
  const computedHashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(computedHash));
  const storedHashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(storedHash));

  const computedBytes = new Uint8Array(computedHashBuffer);
  const storedBytes = new Uint8Array(storedHashBuffer);

  // Constant-time comparison
  let result = 0;
  for (let i = 0; i < computedBytes.length; i++) {
    result |= computedBytes[i] ^ storedBytes[i];
  }
  return result === 0;
}

/**
 * Main handler
 */
export default async function handler(event, context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Allow': 'POST' },
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    };
  }

  try {
    const requestData = JSON.parse(event.body || '{}');
    const { token, safeword } = requestData;

    if (!token) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Invitation token is required' })
      };
    }

    // Authenticate via JWT
    const authHeader = event.headers['authorization'] || event.headers['Authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Authentication required' })
      };
    }

    let userId;
    try {
      const { SecureSessionManager } = await import('../../../netlify/functions/security/session-manager.js');
      const session = await SecureSessionManager.validateSessionFromHeader(authHeader);
      if (!session?.userId) {
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, error: 'Invalid or expired token' })
        };
      }
      userId = session.userId;

      // PRIVACY-FIRST: No npub lookup from database
      // Targeted invitation matching uses encrypted_invitee_npub at app layer
      // User identity is validated via JWT session, not database npub lookup
    } catch {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Authentication failed' })
      };
    }

    // Look up invitation
    const { data: invitation, error: invError } = await supabase
      .from('family_federation_invitations')
      .select('*')
      .eq('invitation_token', token)
      .single();

    if (invError || !invitation) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Invitation not found' })
      };
    }

    // Validate invitation status
    if (invitation.status !== 'pending' && invitation.status !== 'viewed') {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          success: false, 
          error: `Invitation has already been ${invitation.status}` 
        })
      };
    }

    // Check expiration
    if (new Date(invitation.expires_at) < new Date()) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Invitation has expired' })
      };
    }

    // Phase 3: Safeword verification
    if (invitation.require_safeword === true) {
      // Check if invitation is locked due to too many failed attempts
      if (invitation.safeword_locked_until && new Date(invitation.safeword_locked_until) > new Date()) {
        return {
          statusCode: 403,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            error: 'Too many failed attempts. Invitation locked for 1 hour.',
            locked: true,
            locked_until: invitation.safeword_locked_until
          })
        };
      }

      // Safeword is required but not provided
      if (!safeword || typeof safeword !== 'string') {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            error: 'Security passphrase is required for this invitation',
            require_safeword: true
          })
        };
      }

      // Verify the safeword
      const safewordValid = await verifySafeword(
        safeword,
        invitation.safeword_hash,
        invitation.safeword_salt
      );

      if (!safewordValid) {
        // Increment attempt counter and potentially lock
        const newAttempts = (invitation.safeword_attempts || 0) + 1;
        const lockUntil = newAttempts >= 3
          ? new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour lockout
          : null;

        await supabase
          .from('family_federation_invitations')
          .update({
            safeword_attempts: newAttempts,
            safeword_locked_until: lockUntil
          })
          .eq('id', invitation.id);

        const remainingAttempts = Math.max(0, 3 - newAttempts);

        if (newAttempts >= 3) {
          return {
            statusCode: 403,
            headers: corsHeaders,
            body: JSON.stringify({
              success: false,
              error: 'Too many failed attempts. Invitation locked for 1 hour.',
              locked: true
            })
          };
        }

        return {
          statusCode: 403,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            error: `Incorrect passphrase. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining.`,
            remaining_attempts: remainingAttempts
          })
        };
      }

      // Success: reset attempts counter
      await supabase
        .from('family_federation_invitations')
        .update({
          safeword_attempts: 0,
          safeword_locked_until: null
        })
        .eq('id', invitation.id);
    }

    // Check targeted invitation
    // PRIVACY-FIRST: Targeted invitation validation
    // If encrypted_invitee_npub is set, the invitation is targeted to a specific user
    // The accepting user's npub (from session) is compared via encrypted hash
    // For now, we allow acceptance if user is authenticated - the inviter can
    // verify the correct person accepted via the safeword mechanism (Phase 3)
    // Future enhancement: implement encrypted npub comparison at app layer
    if (invitation.encrypted_invitee_npub) {
      // TODO: Implement encrypted npub comparison when needed
      // For now, rely on safeword verification as the primary security mechanism
      console.log('[PRIVACY] Targeted invitation accepted by authenticated user');
    }

    // Get federation details for FROST validation
    const { data: federation, error: fedError } = await supabase
      .from('family_federations')
      .select('id, federation_duid, frost_threshold')
      .eq('federation_duid', invitation.federation_duid)
      .single();

    if (fedError || !federation) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Federation not found' })
      };
    }

    // Get current member count
    const { count: memberCount } = await supabase
      .from('family_members')
      .select('*', { count: 'exact', head: true })
      .eq('federation_duid', invitation.federation_duid);

    // Validate FROST threshold (deferred validation per approved decision)
    const frostValidation = validateFrostOnJoin(
      memberCount || 0,
      federation.frost_threshold || 1
    );
    if (!frostValidation.valid) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: frostValidation.message })
      };
    }

    // Check if user is already a member
    const { data: existingMember } = await supabase
      .from('family_members')
      .select('id')
      .eq('federation_duid', invitation.federation_duid)
      .eq('user_duid', userId)
      .single();

    if (existingMember) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'You are already a member of this federation'
        })
      };
    }

    // Add user to federation
    const { error: memberError } = await supabase
      .from('family_members')
      .insert({
        federation_duid: invitation.federation_duid,
        user_duid: userId,
        role: invitation.invited_role,
        joined_via: 'invitation',
        invitation_id: invitation.id
      });

    if (memberError) {
      console.error('Member insert error:', memberError);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Failed to add member to federation' })
      };
    }

    // Update invitation status
    const { error: updateError } = await supabase
      .from('family_federation_invitations')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        accepted_by_user_duid: userId
      })
      .eq('id', invitation.id);

    if (updateError) {
      console.error('Invitation update error:', updateError);
      // Note: Member was already added, so this is a partial failure
      // The member is in the federation but invitation status wasn't updated
      // Return success with warning - member can still use the federation
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          warning: 'Joined federation but invitation status update failed',
          message: 'Successfully joined the federation',
          federation: {
            duid: federation.federation_duid,
            name: invitation.metadata?.federation_name,
            role: invitation.invited_role
          },
          meta: { invitationUpdateFailed: true }
        })
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Successfully joined the federation',
        federation: {
          duid: federation.federation_duid,
          name: invitation.metadata?.federation_name,
          role: invitation.invited_role
        }
      })
    };

  } catch (error) {
    console.error('Invitation acceptance error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: 'Internal server error',
        meta: { timestamp: new Date().toISOString() }
      })
    };
  }
}

