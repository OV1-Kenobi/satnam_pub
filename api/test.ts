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
 * API Test Endpoint
 * GET /api/test - Simple test endpoint to verify API is working
 */
export default async function handler(req: any, res: any) {
  // Set CORS headers
  setCorsHeaders(req, res);

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
