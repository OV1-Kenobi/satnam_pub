/**
 * List Received Invitations API
 * GET /api/family/invitations/list-received
 * 
 * Returns pending invitations targeted at the authenticated user's npub
 */

import { supabaseAdmin } from '../../../netlify/functions/supabase.js';
import { SecureSessionManager } from '../../../netlify/functions/security/session-manager.js';

/**
 * Hash npub for privacy-first matching
 */
async function hashNpub(npub) {
  const encoder = new TextEncoder();
  const data = encoder.encode(npub);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // Validate authentication
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const session = await SecureSessionManager.validateSession(token);
    if (!session?.userId) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get user's npub from user_identities
    const { data: user } = await supabaseAdmin
      .from('user_identities')
      .select('npub')
      .eq('id', session.userId)
      .single();

    if (!user?.npub) {
      return new Response(JSON.stringify({ 
        success: true, 
        invitations: [],
        message: 'No npub associated with account'
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Hash the npub for privacy-first matching
    const npubHash = await hashNpub(user.npub);

    // Fetch pending invitations targeted at this user
    const { data: invitations, error } = await supabaseAdmin
      .from('family_federation_invitations')
      .select(`
        id,
        invitation_token,
        invited_role,
        personal_message,
        expires_at,
        metadata
      `)
      .eq('encrypted_invitee_npub', npubHash)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch received invitations:', error);
      return new Response(JSON.stringify({ error: 'Failed to fetch invitations' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const formattedInvitations = (invitations || []).map(inv => ({
      id: inv.id,
      token: inv.invitation_token,
      federation_name: inv.metadata?.federation_name || 'Unknown',
      invited_role: inv.invited_role,
      personal_message: inv.personal_message,
      expires_at: inv.expires_at,
      inviter_name: inv.metadata?.inviter_name
    }));

    return new Response(JSON.stringify({ 
      success: true,
      invitations: formattedInvitations 
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('List received invitations error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

