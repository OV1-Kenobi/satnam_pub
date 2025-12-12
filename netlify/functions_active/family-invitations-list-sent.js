/**
 * List Sent Invitations Netlify Function
 * GET /api/family/invitations/list-sent
 *
 * Returns invitations created by the authenticated user
 */

import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const JWT_SECRET = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;

const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || process.env.VITE_APP_URL || 'https://www.satnam.pub',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

function validateSession(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // Support both userId (custom JWT) and sub (standard JWT claim)
    const userId = payload.userId || payload.sub;
    if (!userId) return null;
    return { userId };
  } catch (err) {
    console.error('JWT validation failed:', err.message);
    return null;
  }
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Authentication required' })
      };
    }

    const session = validateSession(token);
    if (!session?.userId) {
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid session' })
      };
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
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to fetch invitations' })
      };
    }

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
      invite_url: `${baseUrl}/invite?token=${encodeURIComponent(inv.invitation_token)}`
    }));

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, invitations: formattedInvitations })
    };

  } catch (err) {
    console.error('List sent invitations error:', err);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};

