import crypto from "crypto";
import { z } from "zod";

// In-memory OTP storage (in production, use Redis or database)
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
 * Generate a secure 6-digit OTP
 */
function generateOTP(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Generate a secure OTP key
 */
function generateOTPKey(npub: string): string {
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString("hex");
  return `otp_${npub.slice(-8)}_${timestamp}_${random}`;
}

/**
 * OTP Initiation API Endpoint
 * POST /api/auth/otp-initiate - Generate and send OTP
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
      npub: z.string().optional(),
      pubkey: z.string().optional(),
      nip05: z.string().email().optional(),
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

    const { npub, pubkey, nip05 } = validationResult.data;

    // Validate that at least one identifier is provided
    if (!npub && !pubkey && !nip05) {
      res.status(400).json({
        success: false,
        error: "At least one identifier (npub, pubkey, or nip05) is required",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // For demo purposes, use the provided identifier
    const targetNpub =
      npub || `npub_${pubkey?.slice(0, 8)}` || `npub_${nip05?.split("@")[0]}`;

    // Generate OTP and key
    const otp = generateOTP();
    const otpKey = generateOTPKey(targetNpub);

    // Store OTP (in production, this would be in Redis/database)
    otpStorage.set(otpKey, {
      otp,
      npub: targetNpub,
      nip05,
      createdAt: Date.now(),
      attempts: 0,
    });

    // Clean up expired OTPs
    for (const [key, value] of otpStorage.entries()) {
      if (Date.now() - value.createdAt > OTP_EXPIRY_MS) {
        otpStorage.delete(key);
      }
    }

    // In a real implementation, this would send the OTP via Nostr DM
    console.log(`🔐 OTP for ${targetNpub}: ${otp} (Demo mode)`);

    // Simulate network delay
    await new Promise((resolve) =>
      setTimeout(resolve, 1000 + Math.random() * 1000)
    );

    res.status(200).json({
      success: true,
      data: {
        otpKey,
        message: "OTP sent successfully",
        expiresIn: OTP_EXPIRY_MS / 1000, // seconds
        // In demo mode, include the OTP for testing
        ...(process.env.NODE_ENV !== "production" && { otp }),
      },
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  } catch (error) {
    console.error("OTP initiation error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to initiate OTP authentication",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}
