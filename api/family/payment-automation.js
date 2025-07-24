/**
 * Payment Automation API - Netlify Function
 * Automated payment management for family members with Lightning Network integration
 */

/**
 * Validate payment schedule request
 * @param {Object} data - Request data
 * @returns {Object} Validation result
 */
function validatePaymentSchedule(data) {
  const { familyMemberId, amount, frequency, timeOfDay } = data;
  
  if (!familyMemberId || typeof familyMemberId !== 'string') {
    return { valid: false, error: "Invalid family member ID" };
  }
  
  if (!amount || typeof amount !== 'number' || amount < 1000 || amount > 1000000) {
    return { valid: false, error: "Amount must be between 1,000 and 1,000,000 sats" };
  }
  
  if (!['daily', 'weekly', 'monthly'].includes(frequency)) {
    return { valid: false, error: "Frequency must be daily, weekly, or monthly" };
  }
  
  if (!timeOfDay || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(timeOfDay)) {
    return { valid: false, error: "Time must be in HH:MM format" };
  }
  
  return { valid: true };
}

/**
 * Mock family member lookup
 * @param {string} memberId - Family member ID
 * @returns {Promise<Object|null>} Family member data
 */
async function getFamilyMember(memberId) {
  const mockMembers = {
    'member-1': { id: 'member-1', name: 'Arjun Singh', role: 'adult' },
    'member-2': { id: 'member-2', name: 'Priya Kaur', role: 'offspring' },
  };
  return mockMembers[memberId] || null;
}

/**
 * Mock payment processing
 * @param {Object} params - Processing parameters
 * @returns {Promise<Object>} Processing result
 */
async function processPayment(params) {
  const { memberId, amount, type } = params;
  
  return {
    success: Math.random() > 0.1, // 90% success rate
    transactionId: `tx_${Math.random().toString(36).substr(2, 9)}`,
    amount,
    fees: Math.floor(amount * 0.001),
    timestamp: new Date().toISOString(),
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
    const path = event.path;
    const method = event.httpMethod;

    if (path.endsWith('/schedule') && method === 'POST') {
      return await handleSchedulePayment(event, headers);
    } else if (path.endsWith('/distribute') && method === 'POST') {
      return await handleDistributePayment(event, headers);
    } else if (path.endsWith('/status') && method === 'GET') {
      return await handleGetPaymentStatus(event, headers);
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
 * Handle payment scheduling
 * @param {Object} event - Netlify event
 * @param {Object} headers - Response headers
 * @returns {Promise<Object>} Response
 */
async function handleSchedulePayment(event, headers) {
  const requestData = JSON.parse(event.body);
  
  const validation = validatePaymentSchedule(requestData);
  if (!validation.valid) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        error: validation.error,
        timestamp: new Date().toISOString(),
      }),
    };
  }

  const familyMember = await getFamilyMember(requestData.familyMemberId);
  if (!familyMember) {
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Family member not found',
        timestamp: new Date().toISOString(),
      }),
    };
  }

  const scheduleResult = {
    scheduleId: `schedule_${Math.random().toString(36).substr(2, 9)}`,
    familyMemberId: requestData.familyMemberId,
    amount: requestData.amount,
    frequency: requestData.frequency,
    nextDistribution: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    active: true,
  };

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      data: scheduleResult,
      timestamp: new Date().toISOString(),
    }),
  };
}

/**
 * Handle payment distribution
 * @param {Object} event - Netlify event
 * @param {Object} headers - Response headers
 * @returns {Promise<Object>} Response
 */
async function handleDistributePayment(event, headers) {
  const requestData = JSON.parse(event.body);
  
  if (!requestData.familyMemberId || !requestData.amount) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Family member ID and amount required',
        timestamp: new Date().toISOString(),
      }),
    };
  }

  const familyMember = await getFamilyMember(requestData.familyMemberId);
  if (!familyMember) {
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Family member not found',
        timestamp: new Date().toISOString(),
      }),
    };
  }

  const distributionResult = await processPayment({
    memberId: requestData.familyMemberId,
    amount: requestData.amount,
    type: 'instant',
  });

  return {
    statusCode: distributionResult.success ? 200 : 400,
    headers,
    body: JSON.stringify({
      success: distributionResult.success,
      data: distributionResult,
      timestamp: new Date().toISOString(),
    }),
  };
}

/**
 * Handle payment status query
 * @param {Object} event - Netlify event
 * @param {Object} headers - Response headers
 * @returns {Promise<Object>} Response
 */
async function handleGetPaymentStatus(event, headers) {
  const { familyMemberId } = event.queryStringParameters || {};
  
  if (!familyMemberId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Family member ID required',
        timestamp: new Date().toISOString(),
      }),
    };
  }

  const familyMember = await getFamilyMember(familyMemberId);
  if (!familyMember) {
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Family member not found',
        timestamp: new Date().toISOString(),
      }),
    };
  }

  const statusData = {
    familyMemberId,
    activeSchedules: 1,
    totalDistributed: 150000,
    nextDistribution: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    pendingApprovals: 0,
  };

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      data: statusData,
      timestamp: new Date().toISOString(),
    }),
  };
}