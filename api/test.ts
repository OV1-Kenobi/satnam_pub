import { ApiRequest, ApiResponse } from "../types/api";
import { setCorsHeaders } from "../utils/cors";

// Note: CORS handling is now managed by the shared utility

/**
 * API Test Endpoint
 * GET /api/test - Simple test endpoint to verify API is working
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  // Set CORS headers with appropriate methods for this endpoint
  setCorsHeaders(req, res, { methods: "GET, OPTIONS" });

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
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
    res.status(200).json({
      success: true,
      data: {
        message: "API is working correctly!",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || "development",
        endpoints: [
          "/api/health",
          "/api/lightning/status",
          "/api/phoenixd/status",
          "/api/fedimint/status",
          "/api/family/members",
          "/api/payments/send",
          "/api/payments/routes",
          "/api/individual/wallet",
          "/api/individual/lightning/wallet",
          "/api/individual/lightning/zap",
          "/api/auth/otp-initiate",
          "/api/auth/otp-verify",
          "/api/auth/session",
        ],
      },
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  } catch (error) {
    console.error("Test endpoint error:", error);

    res.status(500).json({
      success: false,
      error: "Internal server error",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}
