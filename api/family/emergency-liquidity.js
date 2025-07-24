/**
 * Emergency Liquidity API - Netlify Function
 * Advanced emergency liquidity management with Lightning Network integration
 */

/**
 * Mock liquidity assessment
 * @param {string} familyId - Family ID
 * @returns {Promise<Object>} Liquidity status
 */
async function assessLiquidityStatus(familyId) {
  return {
    totalCapacity: 5000000,
    availableLiquidity: 2500000,
    emergencyReserve: 1000000,
    utilizationRate: 0.5,
    channels: [
      {
        channelId: 'channel_1',
        capacity: 2000000,
        localBalance: 1000000,
        remoteBalance: 1000000,
        status: 'active'
      }
    ],
    riskLevel: 'low'
  };
}

/**
 * Mock emergency liquidity processing
 * @param {Object} params - Emergency parameters
 * @returns {Promise<Object>} Processing result
 */
async function processEmergencyLiquidity(params) {
  const { familyId, amount, urgency, reason } = params;
  
  const approved = urgency === 'critical' || Math.random() > 0.2;
  
  return {
    approved,
    amount: approved ? amount : 0,
    fees: approved ? Math.floor(amount * 0.002) : 0,
    channelId: approved ? `emergency_${Math.random().toString(36).substr(2, 9)}` : null,
    estimatedTime: urgency === 'critical' ? 30 : 300,
    message: approved ? 'Emergency liquidity approved' : 'Emergency liquidity denied - insufficient capacity'
  };
}

/**
 * Main Netlify Function handler
 * @param {Object} event - Netlify event object
 * @param {Object} context - Netlify context object
 * @returns {Promise<Object>} Response object
 */
export const handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const method = event.httpMethod;
    const path = event.path;

    if (path.endsWith('/status') && method === 'GET') {
      return await handleGetLiquidityStatus(event, headers);
    } else if (path.endsWith('/request') && method === 'POST') {
      return await handleEmergencyRequest(event, headers);
    } else if (path.endsWith('/protocols') && method === 'GET') {
      return await handleGetProtocols(event, headers);
    } else {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Endpoint not found',
          timestamp: new Date().toISOString(),
        }),
      };
    }
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Internal server error',
        timestamp: new Date().toISOString(),
      }),
    };
  }
};

/**
 * Handle liquidity status query
 * @param {Object} event - Netlify event
 * @param {Object} headers - Response headers
 * @returns {Promise<Object>} Response
 */
async function handleGetLiquidityStatus(event, headers) {
  const { familyId } = event.queryStringParameters || {};
  
  if (!familyId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Family ID required',
        timestamp: new Date().toISOString(),
      }),
    };
  }

  const liquidityStatus = await assessLiquidityStatus(familyId);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      data: {
        familyId,
        status: liquidityStatus,
        emergencyProtocols: {
          available: true,
          maxAmount: liquidityStatus.emergencyReserve,
          responseTime: '30-300 seconds'
        }
      },
      timestamp: new Date().toISOString(),
    }),
  };
}

/**
 * Handle emergency liquidity request
 * @param {Object} event - Netlify event
 * @param {Object} headers - Response headers
 * @returns {Promise<Object>} Response
 */
async function handleEmergencyRequest(event, headers) {
  const requestData = JSON.parse(event.body);
  
  const { familyId, amount, urgency, reason } = requestData;
  
  if (!familyId || !amount || !urgency || !reason) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Family ID, amount, urgency, and reason required',
        timestamp: new Date().toISOString(),
      }),
    };
  }

  if (!['low', 'medium', 'high', 'critical'].includes(urgency)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Urgency must be low, medium, high, or critical',
        timestamp: new Date().toISOString(),
      }),
    };
  }

  const emergencyResult = await processEmergencyLiquidity({
    familyId,
    amount,
    urgency,
    reason
  });

  return {
    statusCode: emergencyResult.approved ? 200 : 400,
    headers,
    body: JSON.stringify({
      success: emergencyResult.approved,
      data: {
        familyId,
        emergency: emergencyResult,
        liquidityStatus: await assessLiquidityStatus(familyId)
      },
      timestamp: new Date().toISOString(),
    }),
  };
}

/**
 * Handle emergency protocols query
 * @param {Object} event - Netlify event
 * @param {Object} headers - Response headers
 * @returns {Promise<Object>} Response
 */
async function handleGetProtocols(event, headers) {
  const protocols = {
    automated: {
      enabled: true,
      thresholds: {
        low: { amount: 100000, responseTime: 300 },
        medium: { amount: 500000, responseTime: 120 },
        high: { amount: 1000000, responseTime: 60 },
        critical: { amount: 2000000, responseTime: 30 }
      }
    },
    manual: {
      enabled: true,
      requiresApproval: true,
      maxAmount: 5000000
    },
    monitoring: {
      enabled: true,
      alertThresholds: {
        utilizationRate: 0.8,
        emergencyReserve: 500000
      }
    }
  };

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      data: protocols,
      timestamp: new Date().toISOString(),
    }),
  };
}