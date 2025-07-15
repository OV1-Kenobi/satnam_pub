import { vault } from "../lib/vault.js";
import {
  SecureSessionManager,
} from "../netlify/functions/security/session-manager.js";

function getEnvVar(key) {
  return process.env[key];
}

async function getAllowedOrigins() {
  try {
    const vaultOrigins = await vault.getCredentials("allowed_origins");
    if (vaultOrigins) {
      return JSON.parse(vaultOrigins);
    }
  } catch (error) {
    // Vault not available, fall back to environment variables
  }

  return getEnvVar("NODE_ENV") === "production"
    ? [getEnvVar("FRONTEND_URL") || "https://satnam.pub"]
    : ["http://localhost:3000", "http://localhost:5173", "http://localhost:3002"];
}

/**
 * @typedef {Object} HealthStatus
 * @property {"healthy"|"degraded"|"unhealthy"} status
 * @property {string} timestamp
 * @property {string} service
 * @property {string} version
 * @property {number} uptime
 * @property {ServiceStatus} services
 */

/**
 * @typedef {Object} ServiceStatus
 * @property {"online"|"offline"|"degraded"} lightning
 * @property {"online"|"offline"|"degraded"} phoenixd
 * @property {"online"|"offline"|"degraded"} fedimint
 * @property {"online"|"offline"|"degraded"} database
 */

async function setCorsHeaders(req, res) {
  const allowedOrigins = await getAllowedOrigins();
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

/**
 * Health Check API Endpoint
 * GET /api/health
 */
export default async function handler(req, res) {
  try {
    await setCorsHeaders(req, res);

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

    const authHeader = req.headers.authorization;
    const sessionData = await SecureSessionManager.validateSessionFromHeader(authHeader);

    if (!sessionData?.isAuthenticated || !sessionData.sessionToken) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    if (!["adult", "steward", "guardian"].includes(sessionData.federationRole)) {
      res.status(403).json({
        success: false,
        error: "Insufficient privileges for health check access",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const healthStatus = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "Satnam Family Banking API",
      version: "1.0.0",
      uptime: Math.floor(Math.random() * 86400000),
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
    res.status(500).json({
      success: false,
      error: "Health check failed",
      message: error instanceof Error ? error.message : "Unknown error occurred",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }
}