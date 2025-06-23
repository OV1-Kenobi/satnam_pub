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
 * Extract session token from request
 */
function extractSessionToken(req: any): string | null {
  // Try Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  // Try cookies
  const cookies = req.headers.cookie;
  if (cookies) {
    const sessionMatch = cookies.match(/session=([^;]+)/);
    if (sessionMatch) {
      return sessionMatch[1];
    }
  }

  return null;
}

/**
 * Mock session validation (in production, check database)
 */
function validateSession(sessionToken: string): any {
  // Mock validation - in production this would check the database
  if (sessionToken && sessionToken.length === 64) {
    return {
      npub: "npub1mockuser123456789",
      nip05: "demo@satnam.pub",
      username: "demo",
      role: "family_member",
      permissions: ["read", "write", "transfer"],
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }
  return null;
}

/**
 * Session Management API Endpoint
 * GET /api/auth/session - Get current session
 * DELETE /api/auth/session - Logout (delete session)
 */
export default async function handler(req: any, res: any) {
  // Set CORS headers
  setCorsHeaders(req, res);

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  try {
    if (req.method === "GET") {
      // Get current session
      const sessionToken = extractSessionToken(req);

      if (!sessionToken) {
        res.status(401).json({
          success: false,
          error: "No session token provided",
          meta: {
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      const sessionData = validateSession(sessionToken);

      if (!sessionData) {
        res.status(401).json({
          success: false,
          error: "Invalid or expired session",
          meta: {
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          user: sessionData,
          isAuthenticated: true,
        },
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
    } else if (req.method === "DELETE") {
      // Logout - delete session
      const sessionToken = extractSessionToken(req);

      if (sessionToken) {
        // In production, this would delete the session from the database
        console.log(`🔓 Session logged out: ${sessionToken.slice(0, 8)}...`);
      }

      // Clear session cookie
      res.setHeader("Set-Cookie", [
        "session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0",
      ]);

      res.status(200).json({
        success: true,
        data: {
          message: "Logged out successfully",
        },
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
    } else {
      res.setHeader("Allow", ["GET", "DELETE"]);
      res.status(405).json({
        success: false,
        error: "Method not allowed",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }
  } catch (error) {
    console.error("Session management error:", error);

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
