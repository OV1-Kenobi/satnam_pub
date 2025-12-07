/**
 * Family Foundry Status API
 * GET /api/family/foundry/status?charterId={id}
 * 
 * Returns federation creation status for a given charter ID.
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

    // Query federation creation status
    const { data, error } = await supabase
      .from('family_federation_creations')
      .select('id, charter_id, status, progress, error_message, activated_at, created_at')
      .eq('charter_id', charterId)
      .single();

    if (error) {
      // Not found is not an error, just return null data
      if (error.code === 'PGRST116') {
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({ success: true, data: null })
        };
      }
      console.error('Error fetching foundry status:', error);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Failed to fetch foundry status' })
      };
    }

    // Return status data
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: {
          charterId: data.charter_id,
          federationId: data.id,
          status: data.status,
          progress: data.progress,
          errorMessage: data.error_message,
          activatedAt: data.activated_at,
          createdAt: data.created_at
        }
      })
    };

  } catch (error) {
    console.error('Foundry status error:', error);
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

