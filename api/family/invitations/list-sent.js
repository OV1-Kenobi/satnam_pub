/**
 * List Sent Invitations API
 * GET /api/family/invitations/list-sent
 * 
 * Returns invitations created by the authenticated user
 */

import { supabaseAdmin } from '../../../netlify/functions/supabase.js';
import { SecureSessionManager } from '../../../netlify/functions/security/session-manager.js';

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

    // Get user's DUID
    const { data: user } = await supabaseAdmin
      .from('user_identities')
      .select('id')
      .eq('id', session.userId)
      .single();

    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch invitations created by this user
    const { data: invitations, error } = await supabaseAdmin
      .from('family_federation_invitations')
      .select(`
        id,
        invitation_token,
        invited_role,
        status,
        expires_at,
        created_at,
        view_count,
        federation_id,
        metadata
      `)
      .eq('inviter_user_duid', session.userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch sent invitations:', error);
      return new Response(JSON.stringify({ error: 'Failed to fetch invitations' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Build response with invite URLs
    const baseUrl = process.env.VITE_APP_URL || 'https://www.satnam.pub';
    const formattedInvitations = (invitations || []).map(inv => ({
      id: inv.id,
      token: inv.invitation_token,
      federation_name: inv.metadata?.federation_name || 'Unknown',
      invited_role: inv.invited_role,
      status: inv.status || 'pending',
      expires_at: inv.expires_at,
      created_at: inv.created_at,
      view_count: inv.view_count || 0,
      invite_url: `${baseUrl}/invite?token=${inv.invitation_token}`
    }));

    return new Response(JSON.stringify({ 
      success: true,
      invitations: formattedInvitations 
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('List sent invitations error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

