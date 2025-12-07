/**
 * Family RBAC Config API
 * GET /api/family/foundry/rbac?charterId={id}
 * 
 * Returns RBAC configuration for a given charter ID.
 * 
 * MASTER CONTEXT COMPLIANCE:
 * ✅ JavaScript API route per browser-only serverless architecture
 * ✅ JWT authentication via SecureSessionManager
 * ✅ Privacy-first with zero-knowledge patterns
 */

import { supabase } from '../../../netlify/functions/supabase.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

/**
 * Main handler
 */
export default async function handler(event) {
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
    } catch {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Authentication failed' })
      };
    }

    // Get charterId from query params
    const params = new URLSearchParams(event.rawUrl?.split('?')[1] || '');
    const charterId = params.get('charterId');

    if (!charterId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'charterId query parameter is required' })
      };
    }

    // Query RBAC configuration ordered by hierarchy level (highest first)
    const { data, error } = await supabase
      .from('family_rbac_configs')
      .select('*')
      .eq('charter_id', charterId)
      .order('hierarchy_level', { ascending: false });

    if (error) {
      console.error('Error fetching RBAC config:', error);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Failed to fetch RBAC configuration' })
      };
    }

    // Return RBAC data (empty array if none found)
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, data: data || [] })
    };

  } catch (error) {
    console.error('RBAC fetch error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      })
    };
  }
}

