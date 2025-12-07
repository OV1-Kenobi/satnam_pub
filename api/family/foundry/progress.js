/**
 * Family Foundry Progress Update API
 * PUT /api/family/foundry/progress
 * 
 * Updates federation creation progress and status.
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
  'Access-Control-Allow-Methods': 'PUT, OPTIONS'
};

/**
 * Validate status value
 */
function isValidStatus(status) {
  return ['creating', 'active', 'failed', 'suspended'].includes(status);
}

/**
 * Main handler
 */
export default async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'PUT') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Allow': 'PUT' },
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

    // Parse request body
    const requestData = JSON.parse(event.body || '{}');
    const { federationId, progress, status } = requestData;

    // Validate required fields
    if (!federationId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'federationId is required' })
      };
    }

    if (typeof progress !== 'number' || progress < 0 || progress > 100) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'progress must be a number between 0 and 100' })
      };
    }

    if (status && !isValidStatus(status)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          success: false, 
          error: 'status must be one of: creating, active, failed, suspended' 
        })
      };
    }

    // Build update data
    const updateData = { progress };
    if (status) {
      updateData.status = status;
      if (status === 'active') {
        updateData.activated_at = new Date().toISOString();
      }
    }

    // Update federation progress
    const { data, error } = await supabase
      .from('family_federation_creations')
      .update(updateData)
      .eq('id', federationId)
      .select()
      .single();

    if (error) {
      console.error('Error updating federation progress:', error);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Failed to update federation progress' })
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, data })
    };

  } catch (error) {
    console.error('Progress update error:', error);
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

