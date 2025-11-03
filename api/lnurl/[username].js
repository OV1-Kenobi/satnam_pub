

function getEnvVar(key) {
  return process.env[key];
}

async function getApiBaseUrl() {
  const envUrl = getEnvVar("API_BASE_URL") || getEnvVar("VITE_API_BASE_URL");
  if (envUrl) {
    return envUrl;
  }

  return "https://api.satnam.pub";
}

async function getLightningDomain() {
  return getEnvVar("VITE_PLATFORM_LIGHTNING_DOMAIN") || getEnvVar("LIGHTNING_ADDRESS_DOMAIN") || "my.satnam.pub";
}
function getApprovedDomains() {
  const v = process.env.VITE_PLATFORM_LIGHTNING_DOMAIN || process.env.VITE_NIP05_ALLOWED_DOMAINS || "my.satnam.pub";
  return v
    .split(",")
    .map(s => s.trim().toLowerCase())
    .map(s => s.split(":")[0])
    .filter(Boolean);
}

function parseHost(req) {
  const xfwd = req.headers["x-forwarded-host"] || req.headers["X-Forwarded-Host"];
  const host = (xfwd || req.headers.host || "").toString().toLowerCase();
  return host.split(":")[0];
}

function getRequestDomain(req) {
  try {
    const host = parseHost(req);
    const allowed = new Set(getApprovedDomains());
    return allowed.has(host) ? host : (process.env.LIGHTNING_ADDRESS_DOMAIN || "satnam.pub");
  } catch (_) {
    return process.env.LIGHTNING_ADDRESS_DOMAIN || "satnam.pub";
  }
}


/**
 * @typedef {Object} LNURLPayResponse
 * @property {string} callback
 * @property {number} maxSendable
 * @property {number} minSendable
 * @property {string} metadata
 * @property {"payRequest"} tag
 * @property {number} commentAllowed
 * @property {boolean} [allowsNostr]
 * @property {string} [nostrPubkey]
 */

/**
 * @typedef {Object} FamilyMember
 * @property {string} id
 * @property {string} name
 * @property {"private"|"offspring"|"adult"|"steward"|"guardian"} role
 * @property {string} [avatar]
 * @property {number} [lightningBalance]
 * @property {string} [nostrPubkey]
 * @property {number} [dailyLimit]
 * @property {"verified"|"pending"|"none"} [nipStatus]
 */

/**
 * @typedef {Object} PaymentLimits
 * @property {number} minSendable
 * @property {number} maxSendable
 */

async function generateRequestId() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function getFamilyMember(username) {
  // Mock implementation - in production, this would query the database
  const mockMembers = {
    alice: {
      id: "alice_001",
      name: "Alice",
      role: "offspring",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=alice",
      lightningBalance: 25000,
      nostrPubkey: "npub1alice...",
      dailyLimit: 50000,
      nipStatus: "verified"
    },
    bob: {
      id: "bob_001",
      name: "Bob",
      role: "adult",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=bob",
      lightningBalance: 100000,
      nostrPubkey: "npub1bob...",
      dailyLimit: 200000,
      nipStatus: "verified"
    },
    charlie: {
      id: "charlie_001",
      name: "Charlie",
      role: "guardian",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=charlie",
      lightningBalance: 500000,
      nostrPubkey: "npub1charlie...",
      dailyLimit: 1000000,
      nipStatus: "verified"
    }
  };

  return mockMembers[username] || null;
}

function calculatePaymentLimits(familyMember) {
  const minSendable = 1000; // 1 sat minimum (in millisats)
  let maxSendable;

  switch (familyMember.role) {
    case "guardian":
      maxSendable = 100000000; // 100,000 sats (0.001 BTC)
      break;
    case "steward":
      maxSendable = 75000000; // 75,000 sats
      break;
    case "adult":
      maxSendable = 50000000; // 50,000 sats
      break;
    case "offspring":
      maxSendable = 25000000; // 25,000 sats
      break;
    case "private":
      maxSendable = 10000000; // 10,000 sats
      break;
    default:
      maxSendable = 25000000; // 25,000 sats
  }

  if (familyMember.dailyLimit && familyMember.dailyLimit > 0) {
    const dailyLimitMillisats = familyMember.dailyLimit * 1000;
    maxSendable = Math.min(maxSendable, dailyLimitMillisats);
  }

  return { minSendable, maxSendable };
}

async function getBaseUrl(req) {
  const url = new URL(req.url);
  const customDomain = await getLightningDomain();

  if (customDomain && customDomain !== "satnam.pub") {
    return `https://${customDomain}`;
  }

  return `${url.protocol}//${url.host}`;
}

/**
 * Lightning Address LNURL Endpoint
 * GET /api/lnurl/[username]
 */
export default async function handler(req, res) {
  const requestId = await generateRequestId();

  try {
    if (req.method !== "GET") {
      res.status(405).json({
        status: "ERROR",
        reason: `Method ${req.method} not allowed for Lightning Address lookup`,
        code: "METHOD_NOT_ALLOWED",
        requestId,
      });
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathParts = url.pathname.split("/");
    const username = pathParts[pathParts.length - 1];

    if (!username || username === "[username]") {
      res.status(400).json({
        status: "ERROR",
        reason: "Username parameter is required for Lightning Address lookup",
        code: "VALIDATION_REQUIRED_FIELD_MISSING",
        requestId,
      });
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      res.status(400).json({
        status: "ERROR",
        reason: `Invalid username format: ${username}. Only alphanumeric characters, underscores, and hyphens are allowed`,
        code: "VALIDATION_INVALID_FORMAT",
        requestId,
      });
      return;
    }

    const familyMember = await getFamilyMember(username);

    const requestDomain = getRequestDomain(req);


    if (!familyMember) {
      res.status(404).json({
        status: "ERROR",
        reason: `Lightning Address ${username}@${requestDomain} is not registered`,
        code: "FAMILY_MEMBER_NOT_FOUND",
        requestId,
      });
      return;
    }

    const limits = calculatePaymentLimits(familyMember);
    const baseUrl = `https://${requestDomain}`;
    const domain = requestDomain;

    const lnurlResponse = {
      callback: `${baseUrl}/api/lnurl/${username}/callback`,
      maxSendable: limits.maxSendable,
      minSendable: limits.minSendable,
      metadata: JSON.stringify([
        ["text/identifier", `${username}@${domain}`],
        ["text/plain", `Payment to ${familyMember.name} - Satnam Family Banking`],
        ["text/long-desc", `Sovereign family banking with privacy protection. Send Bitcoin to ${familyMember.name} using Lightning Address: ${username}@${domain}`],
      ]),
      tag: "payRequest",
      commentAllowed: 280,
      allowsNostr: true,
      nostrPubkey: familyMember.nostrPubkey || undefined,
    };

    res.status(200).json(lnurlResponse);
  } catch (error) {
    res.status(500).json({
      status: "ERROR",
      reason: "Lightning Address service temporarily unavailable",
      code: "INTERNAL_SERVER_ERROR",
      requestId,
    });
  }
}
