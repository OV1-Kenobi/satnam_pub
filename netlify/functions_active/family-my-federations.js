/**
 * My Federations Netlify Function
 * GET /api/family/my-federations
 *
 * Returns all federations the authenticated user is a member of
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

		    const userId = session.userId; // In current architecture this is the user's DUID

	    // Step 1: Fetch memberships for this user (privacy-first: filter by user_duid)
	    const { data: memberships, error: membershipError } = await supabaseAdmin
	      .from('family_members')
	      .select('id, federation_duid, role, joined_at, is_active')
	      .eq('user_duid', userId)
	      .eq('is_active', true);

	    if (membershipError) {
	      console.error('Failed to fetch federations:', membershipError);
	      return {
	        statusCode: 500,
	        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
	        body: JSON.stringify({ error: 'Failed to fetch federations' })
	      };
	    }

	    if (!memberships || memberships.length === 0) {
	      return {
	        statusCode: 200,
	        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
	        body: JSON.stringify({ success: true, federations: [] })
	      };
	    }

	    // Step 2: Load federation details for all referenced federations (by federation_duid)
	    const federationDuids = Array.from(
	      new Set(
	        memberships
	          .map((m) => m.federation_duid)
	          .filter((duid) => typeof duid === 'string' && duid.length > 0)
	      )
	    );

	    let federationsByDuid = {};
	    if (federationDuids.length > 0) {
	      const { data: federationRows, error: federationError } = await supabaseAdmin
	        .from('family_federations')
	        .select('id, federation_duid, federation_name, status')
	        .in('federation_duid', federationDuids);

	      if (federationError) {
	        console.error('Failed to fetch federation details:', federationError);
	      } else if (federationRows) {
	        federationsByDuid = Object.fromEntries(
	          federationRows.map((fed) => [fed.federation_duid, fed])
	        );
	      }
	    }

	    const federations = memberships.map((m) => {
	      const fed = m.federation_duid ? federationsByDuid[m.federation_duid] : null;
	      return {
	        id: m.id,
	        federation_duid: m.federation_duid || (fed ? fed.federation_duid : null),
	        federation_name: (fed && fed.federation_name) || 'Family Federation',
	        role: m.role || 'adult',
	        joined_at: m.joined_at,
	        is_active: m.is_active,
	        // Map federation.status (generic lifecycle) into optional charter_status field for UI
	        charter_status: fed && fed.status ? fed.status : undefined,
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

