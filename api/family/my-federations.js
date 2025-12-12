/**
 * My Federations API
 * GET /api/family/my-federations
 * 
 * Returns all federations the authenticated user is a member of
 */

import { SecureSessionManager } from '../../netlify/functions/security/session-manager.js';
import { supabaseAdmin } from '../../netlify/functions/supabase.js';

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
      return new Response(JSON.stringify({ error: 'Failed to fetch federations' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const federations = (memberships || []).map(m => {
      // Supabase returns joined relations as arrays - get first element
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

    return new Response(JSON.stringify({ 
      success: true,
      federations 
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('My federations error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

