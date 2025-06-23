/**
 * Health Check API Endpoint
 * GET /api/health - Get system health status
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
    // Mock health status for demonstration
    const healthStatus = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "Satnam Family Banking API",
      version: "1.0.0",
      uptime: Math.floor(Math.random() * 86400000), // Random uptime in ms
      services: {
        lightning: "online",
        phoenixd: "online",
        fedimint: "online",
        database: "online",
      },
    };

    res.status(200).json({
      success: true,
      data: healthStatus,
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  } catch (error) {
    console.error("Health check error:", error);

    res.status(503).json({
      success: false,
      error: "Health check failed",
      data: {
        status: "down",
        timestamp: new Date().toISOString(),
        service: "Satnam Family Banking API",
        version: "1.0.0",
        uptime: 0,
        services: {
          lightning: "offline",
          phoenixd: "offline",
          fedimint: "offline",
          database: "offline",
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}