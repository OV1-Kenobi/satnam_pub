/**
 * Auth Session API Endpoint
 * GET /api/auth/session - Get current session
 * DELETE /api/auth/session - Logout (delete session)
 */

// In-memory session storage (in production, use Redis or database)
const sessionStorage = new Map();

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
    "GET, DELETE, OPTIONS"
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

  if (req.method === "GET") {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: "No authorization token provided",
          meta: {
            timestamp: new Date().toISOString(),
          },
        });
      }

      const token = authHeader.substring(7);
      const session = sessionStorage.get(token);

      if (!session) {
        return res.status(401).json({
          success: false,
          error: "Invalid or expired session",
          meta: {
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Check if session has expired
      if (Date.now() > session.expiresAt) {
        sessionStorage.delete(token);
        return res.status(401).json({
          success: false,
          error: "Session has expired",
          meta: {
            timestamp: new Date().toISOString(),
          },
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          npub: session.npub,
          nip05: session.nip05,
          expiresAt: session.expiresAt,
          isValid: true,
        },
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });

    } catch (error) {
      console.error("Session get error:", error);

      return res.status(500).json({
        success: false,
        error: "Failed to get session",
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
    }
  }

  if (req.method === "DELETE") {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: "No authorization token provided",
          meta: {
            timestamp: new Date().toISOString(),
          },
        });
      }

      const token = authHeader.substring(7);
      const deleted = sessionStorage.delete(token);

      return res.status(200).json({
        success: true,
        data: {
          message: deleted ? "Session terminated successfully" : "Session was already invalid",
          loggedOut: true,
        },
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });

    } catch (error) {
      console.error("Session delete error:", error);

      return res.status(500).json({
        success: false,
        error: "Failed to terminate session",
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
    }
  }

  // Method not allowed
  res.setHeader("Allow", ["GET", "DELETE"]);
  return res.status(405).json({
    success: false,
    error: "Method not allowed",
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}