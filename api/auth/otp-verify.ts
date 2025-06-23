import crypto from "crypto";
import { z } from "zod";

// In-memory OTP storage (should match the one in otp-initiate.ts)
const otpStorage = new Map<
  string,
  {
    otp: string;
    npub: string;
    nip05?: string;
    createdAt: number;
    attempts: number;
  }
>();

// OTP expiry time (5 minutes)
const OTP_EXPIRY_MS = 5 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 3;

// Progressive delay for failed attempts (in milliseconds)
const PROGRESSIVE_DELAYS = [0, 1000, 2000, 5000, 10000]; // 0s, 1s, 2s, 5s, 10s

/**
 * Handle CORS for the API endpoint
 */
function setCorsHeaders(req: any, res: any) {
  const allowedOrigins =
    process.env.NODE_ENV === "production"
      ? [process.env.FRONTEND_URL || "https://satnam.pub"]
      : [
          "http://localhost:3000",
          "http://localhost:5173",
          "http://localhost:3002",
        ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

/**
 * Apply progressive delay based on failed attempts
 */
async function applyProgressiveDelay(attempts: number): Promise<void> {
  const delayIndex = Math.min(attempts, PROGRESSIVE_DELAYS.length - 1);
  const delay = PROGRESSIVE_DELAYS[delayIndex];

  if (delay > 0) {
    console.log(
      `🕐 Applying progressive delay: ${delay}ms for attempt ${attempts + 1}`
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

/**
 * Generate a secure session token
 */
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * OTP Verification API Endpoint
 * POST /api/auth/otp-verify - Verify OTP and create session
 */
export default async function handler(req: any, res: any) {
  // Set CORS headers
  setCorsHeaders(req, res);

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    res.status(405).json({
      success: false,
      error: "Method not allowed",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  try {
    const requestSchema = z.object({
      otpKey: z.string().min(1, "OTP key is required"),
      otp: z.string().length(6, "OTP must be 6 digits"),
    });

    const validationResult = requestSchema.safeParse(req.body);

    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        error: "Invalid request data",
        details: validationResult.error.errors,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const { otpKey, otp } = validationResult.data;

    // Retrieve OTP data
    const otpData = otpStorage.get(otpKey);

    if (!otpData) {
      res.status(400).json({
        success: false,
        error: "Invalid or expired OTP key",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Check if OTP has expired
    if (Date.now() - otpData.createdAt > OTP_EXPIRY_MS) {
      otpStorage.delete(otpKey);
      res.status(400).json({
        success: false,
        error: "OTP has expired",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Check if max attempts exceeded
    if (otpData.attempts >= MAX_OTP_ATTEMPTS) {
      otpStorage.delete(otpKey);
      res.status(429).json({
        success: false,
        error: "Maximum OTP attempts exceeded",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Apply progressive delay for failed attempts
    await applyProgressiveDelay(otpData.attempts);

    // Verify OTP
    if (otpData.otp !== otp) {
      // Increment attempts
      otpData.attempts += 1;
      otpStorage.set(otpKey, otpData);

      res.status(400).json({
        success: false,
        error: "Invalid OTP",
        attemptsRemaining: MAX_OTP_ATTEMPTS - otpData.attempts,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // OTP verified successfully - clean up
    otpStorage.delete(otpKey);

    // Generate session token
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // In a real implementation, this would:
    // 1. Create a session in the database
    // 2. Set secure HTTP-only cookies
    // 3. Return user profile data

    // Mock user data
    const userData = {
      npub: otpData.npub,
      nip05: otpData.nip05,
      username: otpData.nip05?.split("@")[0] || otpData.npub.slice(-8),
      role: "family_member",
      permissions: ["read", "write", "transfer"],
    };

    // Set session cookie (in production, use secure HTTP-only cookies)
    res.setHeader("Set-Cookie", [
      `session=${sessionToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${24 * 60 * 60}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    ]);

    res.status(200).json({
      success: true,
      data: {
        user: userData,
        sessionToken,
        expiresAt: expiresAt.toISOString(),
        message: "Authentication successful",
      },
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  } catch (error) {
    console.error("OTP verification error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to verify OTP",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}
