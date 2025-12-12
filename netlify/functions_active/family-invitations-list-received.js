/**
 * List Received Invitations Netlify Function
 * GET /api/family/invitations/list-received
 *
 * Returns pending invitations targeted at the authenticated user's npub
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

async function hashNpub(npub) {
  const encoder = new TextEncoder();
  const data = encoder.encode(npub);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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

    // Get user's npub from user_identities
    const { data: user, error: userError } = await supabaseAdmin
      .from('user_identities')
      .select('npub')
      .eq('id', session.userId)
      .single();

    if (userError) {
      console.error('Failed to fetch user identity:', userError);
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to fetch user identity' })
      };
    }

    if (!user?.npub) {
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, invitations: [], message: 'No npub associated' })
      };
    }

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
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to fetch invitations' })
      };
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

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, invitations: formattedInvitations })
    };

  } catch (err) {
    console.error('List received invitations error:', err);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};

