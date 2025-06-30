/**
 * OTP Verification API Endpoint
 * POST /api/auth/otp-verify - Verify OTP and create encrypted session
 * Privacy-first: Uses encrypted session IDs and user hashes
 */

// OTP expiry time (5 minutes)
const OTP_EXPIRY_MS = 5 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 3;
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// Progressive delay for failed attempts (in milliseconds)
const PROGRESSIVE_DELAYS = [0, 1000, 2000, 5000, 10000]; // 0s, 1s, 2s, 5s, 10s

/**
 * Apply progressive delay based on failed attempts
 */
async function applyProgressiveDelay(attempts) {
  const delayIndex = Math.min(attempts, PROGRESSIVE_DELAYS.length - 1);
  const delay = PROGRESSIVE_DELAYS[delayIndex];
  
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

/**
 * Generate encrypted session ID
 */
async function generateEncryptedSessionId() {
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY environment variable required');
  }
  
  try {
    // Generate base session token
    const array = crypto.getRandomValues(new Uint8Array(32));
    const baseToken = btoa(String.fromCharCode(...array))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    
    // Create encrypted session ID
    const timestamp = Date.now().toString();
    const encoder = new TextEncoder();
    const data = encoder.encode(baseToken + timestamp + process.env.ENCRYPTION_KEY);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const encryptedSessionId = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return encryptedSessionId;
  } catch (error) {
    throw new Error(`Failed to generate encrypted session ID: ${error.message}`);
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
    const { otpKey, otp } = req.body;

    // Validate required fields
    if (!otpKey || !otp) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: otpKey and otp are required",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Validate OTP format
    if (typeof otp !== 'string' || otp.length !== 6 || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        error: "OTP must be a 6-digit number",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Check if OTP exists
    const storedOtpData = otpStorage.get(otpKey);
    if (!storedOtpData) {
      return res.status(400).json({
        success: false,
        error: "Invalid or expired OTP key",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Check if OTP has expired
    if (Date.now() - storedOtpData.createdAt > OTP_EXPIRY_MS) {
      otpStorage.delete(otpKey);
      return res.status(400).json({
        success: false,
        error: "OTP has expired",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Apply progressive delay for failed attempts
    await applyProgressiveDelay(storedOtpData.attempts);

    // Check if max attempts reached
    if (storedOtpData.attempts >= MAX_OTP_ATTEMPTS) {
      otpStorage.delete(otpKey);
      return res.status(429).json({
        success: false,
        error: "Maximum verification attempts exceeded",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Verify OTP
    if (storedOtpData.otp !== otp) {
      // Increment attempts
      storedOtpData.attempts += 1;
      otpStorage.set(otpKey, storedOtpData);

      return res.status(400).json({
        success: false,
        error: "Invalid OTP",
        meta: {
          timestamp: new Date().toISOString(),
          attemptsRemaining: MAX_OTP_ATTEMPTS - storedOtpData.attempts,
        },
      });
    }

    // OTP verified successfully - clean up
    otpStorage.delete(otpKey);

    // Generate session token
    const sessionToken = await generateEncryptedSessionId();
    const expiresAt = Date.now() + SESSION_EXPIRY_MS;

    // In a real implementation, store session in database
    console.log(`✅ Session created for ${storedOtpData.npub}: ${sessionToken}`);

    return res.status(200).json({
      success: true,
      data: {
        sessionToken,
        npub: storedOtpData.npub,
        nip05: storedOtpData.nip05,
        expiresAt,
        message: "Authentication successful",
      },
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });

  } catch (error) {
    console.error("OTP verification error:", error);

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
      error: "Failed to verify OTP",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}