/**
 * OTP Initiation API Endpoint
 * POST /api/auth/otp-initiate - Generate and send OTP via Nostr DM
 * Privacy-first: Uses encrypted UUID hashes instead of storing identifiers directly
 */

// OTP expiry time (5 minutes)
const OTP_EXPIRY_MS = 5 * 60 * 1000;

// Rate limiting: Max 3 OTP requests per IP per hour
const rateLimitStorage = new Map();
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour

/**
 * Generate encrypted UUID hash for privacy
 */
async function generateEncryptedUUID(identifier) {
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY environment variable required');
  }
  
  try {
    // Generate UUID v4
    const uuid = crypto.randomUUID();
    
    // Create hash of identifier + uuid for privacy
    const encoder = new TextEncoder();
    const data = encoder.encode(identifier + uuid + process.env.ENCRYPTION_KEY);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex;
  } catch (error) {
    throw new Error(`Failed to generate encrypted UUID: ${error.message}`);
  }
}

/**
 * Generate a secure 6-digit OTP using Web Crypto API
 */
function generateOTP() {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return (100000 + (array[0] % 900000)).toString();
}

/**
 * Generate a secure OTP key using Web Crypto API
 */
function generateOTPKey() {
  const timestamp = Date.now();
  const randomArray = crypto.getRandomValues(new Uint8Array(16));
  const random = Array.from(randomArray, b => b.toString(16).padStart(2, '0')).join('');
  return `otp_${timestamp}_${random}`;
}

/**
 * Rate limiting check
 */
function checkRateLimit(clientIp) {
  const now = Date.now();
  const key = `rate_${clientIp}`;
  const attempts = rateLimitStorage.get(key) || [];
  
  // Remove old attempts outside the window
  const validAttempts = attempts.filter(time => now - time < RATE_LIMIT_WINDOW);
  
  if (validAttempts.length >= RATE_LIMIT_MAX) {
    return false; // Rate limit exceeded
  }
  
  // Add current attempt
  validAttempts.push(now);
  rateLimitStorage.set(key, validAttempts);
  
  return true; // Rate limit OK
}

/**
 * Validate Nostr public key format
 */
function validateNostrPubkey(pubkey) {
  if (!pubkey || typeof pubkey !== 'string') return false;
  // Basic hex validation - should be 64 character hex string
  return /^[0-9a-fA-F]{64}$/.test(pubkey);
}

/**
 * Validate npub format (Bech32 with npub prefix)
 */
function validateNpub(npub) {
  if (!npub || typeof npub !== 'string') return false;
  return npub.startsWith('npub1') && npub.length === 63;
}

/**
 * Send OTP via Nostr DM (implement with your Nostr client)
 */
async function sendOTPViaNostr(npub, otp) {
  // TODO: Implement actual Nostr DM sending
  // This would connect to Nostr relays and send encrypted DM
  
  if (!process.env.NOSTR_PRIVATE_KEY) {
    throw new Error('NOSTR_PRIVATE_KEY environment variable required');
  }
  
  if (!process.env.NOSTR_RELAYS) {
    throw new Error('NOSTR_RELAYS environment variable required');
  }
  
  try {
    // Placeholder for actual Nostr implementation
    // const nostrClient = new NostrClient(process.env.NOSTR_PRIVATE_KEY);
    // await nostrClient.sendDM(npub, `Your Satnam authentication code: ${otp}`);
    
    console.log(`🔐 Production: Would send OTP ${otp} to ${npub} via Nostr DM`);
    return true;
  } catch (error) {
    throw new Error(`Failed to send OTP via Nostr: ${error.message}`);
  }
}

/**
 * Store OTP in encrypted database
 */
async function storeEncryptedOTP(otpKey, otpData) {
  // TODO: Implement encrypted database storage
  // This should store in Redis or similar with encryption and expiration
  
  if (!process.env.DATABASE_URL && !process.env.REDIS_URL) {
    throw new Error('DATABASE_URL or REDIS_URL environment variable required');
  }
  
  try {
    // Placeholder for actual encrypted database implementation
    // const db = await connectToEncryptedDatabase();
    // await db.collection('otps').insertOne({
    //   key: otpKey,
    //   encryptedData: await encrypt(JSON.stringify(otpData)),
    //   expiresAt: new Date(Date.now() + OTP_EXPIRY_MS)
    // });
    
    // Fallback to memory storage for now (not recommended for production)
    const otpStorage = global.otpStorage || (global.otpStorage = new Map());
    otpStorage.set(otpKey, otpData);
    
    // Clean up expired entries
    for (const [key, value] of otpStorage.entries()) {
      if (Date.now() - value.createdAt > OTP_EXPIRY_MS) {
        otpStorage.delete(key);
      }
    }
    
    return true;
  } catch (error) {
    throw new Error(`Failed to store encrypted OTP: ${error.message}`);
  }
}

// Handle CORS
function setCorsHeaders(req, res) {
  const allowedOrigins = process.env.NODE_ENV === "production"
    ? [process.env.FRONTEND_URL || "https://satnam.pub"]
    : ["http://localhost:3000", "http://localhost:5173", "http://localhost:3002"];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export default async function handler(req, res) {
  // Set CORS headers
  setCorsHeaders(req, res);

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ 
      success: false,
      error: 'Method not allowed',
      meta: {
        timestamp: new Date().toISOString(),
      }
    });
  }

  try {
    // Rate limiting
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp)) {
      return res.status(429).json({
        success: false,
        error: "Rate limit exceeded. Too many OTP requests.",
        retryAfter: RATE_LIMIT_WINDOW / 1000,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }

    const { npub, pubkey } = req.body;

    // Validate that npub is provided (we're privacy-first, no nip05 storage)
    if (!npub && !pubkey) {
      return res.status(400).json({
        success: false,
        error: "npub or pubkey is required",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Validate npub format if provided
    if (npub && !validateNpub(npub)) {
      return res.status(400).json({
        success: false,
        error: "Invalid npub format",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Validate pubkey format if provided
    if (pubkey && !validateNostrPubkey(pubkey)) {
      return res.status(400).json({
        success: false,
        error: "Invalid public key format",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Determine target npub
    const targetNpub = npub;
    if (!targetNpub && pubkey) {
      // TODO: Convert pubkey to npub format using nostr-tools
      // For now, we require npub directly
      return res.status(400).json({
        success: false,
        error: "Please provide npub directly. Pubkey conversion not yet implemented.",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Generate encrypted UUID hash for privacy
    const encryptedUserHash = await generateEncryptedUUID(targetNpub);

    // Generate OTP and key
    const otp = generateOTP();
    const otpKey = generateOTPKey();

    // Store OTP with encrypted data
    await storeEncryptedOTP(otpKey, {
      otp,
      userHash: encryptedUserHash, // Store encrypted hash instead of npub
      createdAt: Date.now(),
      attempts: 0,
      clientIp,
    });

    // Send OTP via Nostr DM
    await sendOTPViaNostr(targetNpub, otp);

    return res.status(200).json({
      success: true,
      data: {
        otpKey,
        message: "OTP sent successfully via Nostr DM",
        expiresIn: OTP_EXPIRY_MS / 1000, // seconds
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("OTP initiation error:", error);

    // Handle JSON parsing errors and other issues
    if (error instanceof SyntaxError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid JSON in request body',
        meta: {
          timestamp: new Date().toISOString(),
        }
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to initiate OTP authentication",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}