/**
 * Auth Session API Endpoint
 * GET /api/auth/session - Get current session
 */

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
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export default function handler(req, res) {
  // Set CORS headers
  setCorsHeaders(req, res);

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    res.status(401).json({
      success: false,
      error: "Method not allowed",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  try {
    // Mock session check for development - standardized SessionData payload
    const mockUser = {
      id: 'demo-user',
      npub: '',
      username: 'demo',
      nip05: undefined,
      role: 'parent',
      is_active: false,
    };

    res.status(200).json({
      success: true,
      data: {
        user: mockUser,
        authenticated: false, // Change to true for testing
        sessionToken: '',
        expiresAt: undefined,
      },
    });
  } catch (error) {
    console.error("Session check error:", error);

    res.status(500).json({
      success: false,
      error: "Session check failed",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}