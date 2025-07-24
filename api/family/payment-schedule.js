/**
 * Payment Schedule API - Netlify Function
 * Manage scheduled payments for family members
 */

/**
 * Mock schedule data
 * @param {string} familyId - Family ID
 * @returns {Promise<Array>} Schedule data
 */
async function getPaymentSchedules(familyId) {
  return [
    {
      id: 'schedule_1',
      familyMemberId: 'member-1',
      amount: 50000,
      frequency: 'weekly',
      nextPayment: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      active: true
    }
  ];
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
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const method = event.httpMethod;
    const { familyId } = event.queryStringParameters || {};

    if (method === 'GET') {
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

      const schedules = await getPaymentSchedules(familyId);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          data: schedules,
          timestamp: new Date().toISOString(),
        }),
      };
    }

    if (method === 'POST') {
      const requestData = JSON.parse(event.body);
      const newSchedule = {
        id: `schedule_${Math.random().toString(36).substr(2, 9)}`,
        ...requestData,
        active: true,
        created: new Date().toISOString()
      };

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({
          success: true,
          data: newSchedule,
          timestamp: new Date().toISOString(),
        }),
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Method not allowed',
        timestamp: new Date().toISOString(),
      }),
    };
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