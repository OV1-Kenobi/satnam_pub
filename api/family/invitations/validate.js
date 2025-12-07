/**
 * Family Federation Invitation Validation API
 * GET /api/family/invitations/validate?token=inv_xxx
 * 
 * Validates invitation tokens and returns invitation details.
 * This is a public endpoint (no auth required) to allow
 * invitation preview before account creation.
 * 
 * MASTER CONTEXT COMPLIANCE:
 * ✅ JavaScript API route per browser-only serverless architecture
 * ✅ Public endpoint for invitation preview
 * ✅ Privacy-first - only exposes necessary details
 */

import { supabase } from '../../../netlify/functions/supabase.js';

/**
 * Get role-specific guide URL
 * @param {string} role - Invited role
 * @returns {string} Guide URL
 */
function getRoleGuideUrl(role) {
  const guides = {
    guardian: '/docs/guardian-onboarding-guide',
    steward: '/docs/steward-onboarding-guide',
    adult: '/docs/adult-onboarding-guide',
    offspring: '/docs/offspring-onboarding-guide'
  };
  return guides[role] || '/docs/member-onboarding-guide';
}

/**
 * Get role description for display
 * @param {string} role - Invited role
 * @returns {string} Role description
 */
function getRoleDescription(role) {
  const descriptions = {
    guardian: 'Family Guardian with full oversight and approval authority',
    steward: 'Family Steward with day-to-day management responsibilities',
    adult: 'Adult member with standard access and capabilities',
    offspring: 'Offspring member with guided access and learning features'
  };
  return descriptions[role] || 'Family member';
}

/**
 * Main handler
 */
export default async function handler(event, context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Allow': 'GET' },
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    };
  }

  try {
    // Extract token from query params
    const params = new URLSearchParams(event.rawQuery || '');
    const token = params.get('token');

    if (!token) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Token parameter is required' })
      };
    }

    // Look up invitation
    // PRIVACY-FIRST: Query encrypted_invitee_npub, never cleartext npub
    const { data: invitation, error } = await supabase
      .from('family_federation_invitations')
      .select(`
        id,
        invitation_token,
        invited_role,
        personal_message,
        encrypted_invitee_npub,
        status,
        expires_at,
        view_count,
        metadata,
        federation_duid,
        require_safeword,
        safeword_locked_until
      `)
      .eq('invitation_token', token)
      .single();

    if (error || !invitation) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ 
          valid: false, 
          error: 'Invitation not found or invalid token' 
        })
      };
    }

    // Check if expired
    const now = new Date();
    const expiresAt = new Date(invitation.expires_at);
    if (expiresAt < now) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ 
          valid: false, 
          error: 'Invitation has expired',
          expired_at: invitation.expires_at
        })
      };
    }

    // Check if already used
    if (invitation.status !== 'pending') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ 
          valid: false, 
          error: `Invitation has already been ${invitation.status}`,
          status: invitation.status
        })
      };
    }

    // Increment view count and update viewed_at with race condition protection
    const { data: updateResult } = await supabase
      .from('family_federation_invitations')
      .update({
        view_count: (invitation.view_count || 0) + 1,
        viewed_at: invitation.view_count === 0 ? new Date().toISOString() : undefined,
        status: 'viewed'
      })
      .eq('id', invitation.id)
      .eq('status', 'pending')  // Only update if still pending
      .select();

    // If update failed because status changed, re-fetch and return appropriate error
    if (!updateResult || updateResult.length === 0) {
      const { data: currentInvitation } = await supabase
        .from('family_federation_invitations')
        .select('status')
        .eq('id', invitation.id)
        .single();

      if (currentInvitation && currentInvitation.status !== 'pending') {
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            valid: false,
            error: `Invitation has already been ${currentInvitation.status}`,
            status: currentInvitation.status
          })
        };
      }
    }

    // Check if invitation is locked due to too many safeword attempts
    const isLocked = invitation.safeword_locked_until &&
      new Date(invitation.safeword_locked_until) > new Date();

    if (isLocked) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          valid: false,
          error: 'Too many failed passphrase attempts. Invitation locked for 1 hour.',
          locked: true,
          locked_until: invitation.safeword_locked_until
        })
      };
    }

    // Return invitation details
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        valid: true,
        invitation: {
          federation_name: invitation.metadata?.federation_name || 'Family Federation',
          invited_role: invitation.invited_role,
          role_description: getRoleDescription(invitation.invited_role),
          personal_message: invitation.personal_message,
          expires_at: invitation.expires_at,
          role_guide_url: getRoleGuideUrl(invitation.invited_role),
          targeted: !!invitation.encrypted_invitee_npub,
          federation_duid: invitation.federation_duid,
          // Phase 3: Safeword requirement for UI to show passphrase input
          require_safeword: invitation.require_safeword === true
        }
      })
    };

  } catch (error) {
    console.error('Invitation validation error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        valid: false,
        error: 'Internal server error'
      })
    };
  }
}

