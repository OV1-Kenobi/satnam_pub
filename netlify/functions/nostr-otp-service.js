// Thin wrapper delegating to central_event_publishing_service

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function getEnvVar(key) { return process.env[key]; }

/**
 * @typedef {Object} OTPDMConfig
 * @property {string[]} relays
 * @property {number} otpLength
 * @property {number} expiryMinutes
 * @property {boolean} preferGiftWrap
 * @property {string[]} fallbackRelays
 */

/**
 * @typedef {Object} OTPResult
 * @property {boolean} success
 * @property {string} [otp]
 * @property {string} [messageId]
 * @property {Date} [expiresAt]
 * @property {"gift-wrap"|"nip04"} [messageType]
 * @property {string} [error]
 */

/**
 * @typedef {Object} OTPVerificationResult
 * @property {boolean} valid
 * @property {boolean} expired
 * @property {string} [error]
 */

// Delegate all operations to central_event_publishing_service
async function getCentralService() {
  let svc;
  try {
    svc = await import('../../lib/central_event_publishing_service.js');
  } catch (e) {
    // Try without extension as fallback
    svc = await import('../../lib/central_event_publishing_service');
  }
  const service = svc?.central_event_publishing_service;
  if (!service) {
    throw new Error('Central service not available');
  }
  return service;
}

class RebuildingCamelotOTPService {
  constructor() {
    this.config = null;
  }

  async getConfig() {
    if (this.config) return this.config;
    // Optional: could call vault to override defaults; keep simple here
    this.config = {
      relays: ["wss://relay.damus.io","wss://relay.satnam.pub","wss://nos.lol"],
      otpLength: 6,
      expiryMinutes: 10,
      preferGiftWrap: true,
      fallbackRelays: ["wss://relay.nostr.band","wss://relay.primal.net"],
    };
    return this.config;
  }

  /**
   * @param {string} recipientNpub
   * @param {string} [userNip05]
   * @returns {Promise<OTPResult>}
   */
  async sendOTPDM(recipientNpub, userNip05) {
    const start = Date.now();
    const MAX_BUDGET_MS = 15000;
    try {
      const service = await getCentralService();
      if (typeof service.sendOTPDM !== 'function') {
        throw new Error('Central service missing sendOTPDM method');
      }
      const result = await service.sendOTPDM(recipientNpub, userNip05);
      const elapsed = Date.now() - start;
      if (elapsed > MAX_BUDGET_MS) {
        console.warn(`OTP delivery exceeded budget: ${elapsed}ms`);
      }
      return result;
    } catch (error) {
      return {
        success: false,
        otp: "",
        messageId: "",
        expiresAt: new Date(),
        error: error instanceof Error ? error.message : "Failed to send OTP DM",
      };
    }
  }

  generateOTP(length = 6) {
    const digits = "0123456789";
    let otp = "";
    const randomBytes = crypto.getRandomValues(new Uint8Array(length));

    for (let i = 0; i < length; i++) {
      const randomIndex = randomBytes[i] % digits.length;
      otp += digits[randomIndex];
    }

    return otp;
  }

  // Remove unused helpers; all ops are delegated centrally now
}


export { RebuildingCamelotOTPService };



// Netlify Function handler wrapper
export async function handler(event /** @type {any} */) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
    const action = body.action;
    const service = new RebuildingCamelotOTPService();

    if (action === 'send') {
      const { recipientNpub, userNip05 } = body;
      if (!recipientNpub) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'recipientNpub is required' }) };
      }
      const result = await service.sendOTPDM(recipientNpub, userNip05);
      return { statusCode: 200, headers, body: JSON.stringify(result) };
    }

    if (action === 'verify') {
      const { recipientNpub, otp } = body;
      if (!recipientNpub || !otp) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'recipientNpub and otp are required' }) };
      }
      let svc;
      try {
        svc = await import('../../lib/central_event_publishing_service.js');
      } catch (e) {
        svc = await import('../../lib/central_event_publishing_service');
      }
      const central = svc?.central_event_publishing_service;
      if (!central || typeof central.verifyOTP !== 'function') {
        throw new Error('Central service not available or missing verifyOTP method');
      }
      const result = await central.verifyOTP(recipientNpub, otp);
      return { statusCode: 200, headers, body: JSON.stringify(result) };
    }

    if (action === 'cleanup') {
      let svc;
      try {
        svc = await import('../../lib/central_event_publishing_service.js');
      } catch (e) {
        svc = await import('../../lib/central_event_publishing_service');
      }
      const central = svc?.central_event_publishing_service;
      if (!central || typeof central.cleanupOTPExpired !== 'function') {
        throw new Error('Central service not available or missing cleanupOTPExpired method');
      }
      const result = await central.cleanupOTPExpired();
      return { statusCode: 200, headers, body: JSON.stringify({ success: Boolean(result) }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action. Use send, verify, or cleanup.' }) };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' })
    };
  }
}
