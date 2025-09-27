/**
 * LNURL Callback API - Netlify Function
 * Handle LNURL-pay callbacks for Lightning Address payments
 */

function getApprovedDomains() {
  const v = process.env.VITE_NIP05_ALLOWED_DOMAINS || "satnam.pub,citadel.academy";
  return v.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
}

function parseHostFromEvent(event) {
  const headers = event.headers || {};
  const xfwd = headers["x-forwarded-host"] || headers["X-Forwarded-Host"];
  const host = (xfwd || headers.host || "").toString().toLowerCase();
  return host.split(":")[0];
}

function getRequestDomainFromEvent(event) {
  try {
    const host = parseHostFromEvent(event);
    const allowed = new Set(getApprovedDomains());
    return allowed.has(host) ? host : (process.env.LIGHTNING_ADDRESS_DOMAIN || "satnam.pub");
  } catch (_) {
    return process.env.LIGHTNING_ADDRESS_DOMAIN || "satnam.pub";
  }
}

/**
 * Generate Lightning invoice for LNURL payment
 * @param {Object} params - Payment parameters
 * @returns {Promise<Object>} Invoice response
 */
async function generateLNURLInvoice(params) {
  const { amount, comment, username, domain } = params;

  return {
    pr: `lnbc${Math.floor(amount/1000)}u1p${Math.random().toString(36).substr(2, 20)}`,
    routes: [],
    successAction: {
      tag: 'message',
      message: `Payment sent to ${username}@${domain || 'satnam.pub'}`
    },
    disposable: false
  };
}

/**
 * Get user LNURL-pay info
 * @param {string} username - Username
 * @returns {Promise<Object>} LNURL-pay info
 */
async function getLNURLPayInfo(username, domain) {
  const mockUsers = {
    'satnam_dad': { name: 'Satnam Singh', avatar: `https://${domain}/avatars/dad.jpg` },
    'arjun_teen': { name: 'Arjun Singh', avatar: `https://${domain}/avatars/arjun.jpg` },
    'priya_kid': { name: 'Priya Kaur', avatar: `https://${domain}/avatars/priya.jpg` }
  };

  const user = mockUsers[username];
  if (!user) return null;

  return {
    callback: `https://${domain}/api/lnurl/${username}/callback`,
    maxSendable: 100000000, // 1 BTC in millisats
    minSendable: 1000, // 1 sat in millisats
    metadata: JSON.stringify([
      ['text/identifier', `${username}@${domain}`],
      ['text/plain', `Pay to ${user.name} on ${domain}`]
    ]),
    tag: 'payRequest',
    commentAllowed: 280,
    payerData: {
      name: { mandatory: false },
      email: { mandatory: false }
    }
  };
}

/**
 * Main Netlify Function handler
 */
export const handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        status: 'ERROR',
        reason: 'Method not allowed'
      }),
    };
  }

  try {
    const { username, amount, comment } = event.queryStringParameters || {};
    const domain = getRequestDomainFromEvent(event);

    // Extract username from path if not in query params
    const pathUsername = event.path.split('/').find(segment =>
      segment && !segment.startsWith('[') && !segment.endsWith(']')
    );
    const targetUsername = username || pathUsername;

    if (!targetUsername) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          status: 'ERROR',
          reason: 'Username required'
        }),
      };
    }

    // If amount is provided, this is a payment callback
    if (amount) {
      const amountMsat = parseInt(amount);
      if (isNaN(amountMsat) || amountMsat < 1000) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            status: 'ERROR',
            reason: 'Invalid amount'
          }),
        };
      }

      const invoiceResponse = await generateLNURLInvoice({
        amount: amountMsat,
        comment,
        username: targetUsername,
        domain,
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(invoiceResponse),
      };
    }

    // Otherwise, return LNURL-pay info
    const lnurlInfo = await getLNURLPayInfo(targetUsername, domain);
    if (!lnurlInfo) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          status: 'ERROR',
          reason: 'User not found'
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(lnurlInfo),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        status: 'ERROR',
        reason: 'Internal server error'
      }),
    };
  }
};