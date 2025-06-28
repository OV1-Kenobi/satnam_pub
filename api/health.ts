import { ApiRequest, ApiResponse } from "../types/api";
import { setCorsHeaders } from "../utils/cors";

interface HealthStatus {
  status: "ok" | "degraded" | "down";
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
  services: {
    lightning: "online" | "offline" | "degraded";
    phoenixd: "online" | "offline" | "degraded";
    fedimint: "online" | "offline" | "degraded";
    database: "online" | "offline" | "degraded";
  };
}

/**
 * Health Check API Endpoint
 * GET /api/health - Get system health status
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
    // In a real implementation, this would check actual service health
    // const lightningHealth = await checkLightningHealth();
    // const phoenixdHealth = await checkPhoenixdHealth();
    // const fedimintHealth = await checkFedimintHealth();
    // const databaseHealth = await checkDatabaseHealth();

    // Mock health status for demonstration
    const healthStatus: HealthStatus = {
      status: "ok",
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

    // Determine overall status based on service health
    const serviceStatuses = Object.values(healthStatus.services);
    if (serviceStatuses.includes("offline")) {
      healthStatus.status = "down";
    } else if (serviceStatuses.includes("degraded")) {
      healthStatus.status = "degraded";
    }

    const statusCode =
      healthStatus.status === "ok"
        ? 200
        : healthStatus.status === "degraded"
          ? 200
          : 503;

    res.status(statusCode).json({
      success: healthStatus.status !== "down",
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
