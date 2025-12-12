/**
 * My Federations Netlify Function
 * GET /api/family/my-federations
 *
 * Returns all federations the authenticated user is a member of
 */

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || process.env.VITE_APP_URL || 'https://www.satnam.pub',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

async function validateSession(token) {
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return null;
    return { userId: user.id };
  } catch {
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

    const session = await validateSession(token);
    if (!session?.userId) {
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid session' })
      };
    }

    // Fetch user's federation memberships with federation details
    const { data: memberships, error } = await supabaseAdmin
      .from('family_members')
      .select(`
        id,
        family_role,
        joined_at,
        is_active,
        family_federation_id,
        family_federations (
          id,
          federation_duid,
          federation_name,
          charter_status
        )
      `)
      .eq('user_duid', session.userId)
      .eq('is_active', true);

    if (error) {
      console.error('Failed to fetch federations:', error);
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to fetch federations' })
      };
    }

    const federations = (memberships || []).map(m => {
      const fed = Array.isArray(m.family_federations) 
        ? m.family_federations[0] 
        : m.family_federations;
      return {
        id: m.id,
        federation_duid: fed?.federation_duid,
        federation_name: fed?.federation_name || 'Unknown',
        role: m.family_role,
        joined_at: m.joined_at,
        is_active: m.is_active,
        charter_status: fed?.charter_status
      };
    });

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, federations })
    };

  } catch (err) {
    console.error('My federations error:', err);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};

