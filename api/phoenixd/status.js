/**
 * PhoenixD Daemon Status API
 * GET /api/phoenixd/status - Get PhoenixD daemon status
 */

import { RATE_LIMITS, checkRateLimit, createRateLimitIdentifier, getClientIP } from '../../netlify/functions_active/utils/enhanced-rate-limiter.js';
import { createRateLimitErrorResponse, generateRequestId, logError } from '../../netlify/functions_active/utils/error-handler.js';
import { errorResponse, getSecurityHeaders, preflightResponse } from '../../netlify/functions_active/utils/security-headers.js';

// Security utilities (Phase 2 hardening)

export default async function handler(req, res) {
  const requestId = generateRequestId();
  const clientIP = getClientIP(req.headers || {});
  const requestOrigin = req.headers?.origin || req.headers?.Origin;

  console.log('🚀 PhoenixD status handler started:', {
    requestId,
    method: req.method,
    path: '/api/phoenixd/status',
    timestamp: new Date().toISOString(),
  });

  // Handle CORS preflight
  if ((req.method || 'GET').toUpperCase() === 'OPTIONS') {
    return preflightResponse(requestOrigin);
  }

  try {
    // Database-backed rate limiting
    const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
    const rateLimitAllowed = await checkRateLimit(
      rateLimitKey,
      RATE_LIMITS.WALLET_OPERATIONS
    );

    if (!rateLimitAllowed) {
      logError(new Error('Rate limit exceeded'), {
        requestId,
        endpoint: 'phoenixd-status',
        method: req.method,
      });
      return createRateLimitErrorResponse(requestId, requestOrigin);
    }

    // Only allow GET requests
    if (req.method !== "GET") {
      return errorResponse(
        405,
        'Method not allowed',
        requestId,
        requestOrigin
      );
    }
    // In production, this would connect to actual PhoenixD daemon
    // const phoenixdClient = await connectToPhoenixd(process.env.PHOENIXD_URL);
    // const daemonInfo = await phoenixdClient.getInfo();

    // Mock PhoenixD daemon status for demo
    const phoenixdStatus = {
      status: "running",
      version: "0.2.3",
      nodeId: "03b2c4d6e8f0a1b3c5d7e9f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9b1c3",
      alias: "SatnamFamily-Phoenix",
      isConnected: true,
      network: "mainnet",
      blockHeight: 850000 + Math.floor(Math.random() * 1000),
      balance: {
        onchain: 2000000, // sats
        lightning: 1500000, // sats
        total: 3500000, // sats
      },
      channels: {
        active: 3,
        inactive: 0,
        pending: 0,
        total: 3,
      },
      peers: [
        {
          nodeId: "03a1b2c3d4e5f6789abcdef0123456789abcdef0123456789abcdef0123456789ab",
          alias: "ACINQ",
          isConnected: true,
        },
        {
          nodeId: "03c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5",
          alias: "Bitrefill",
          isConnected: true,
        },
      ],
      fees: {
        baseFee: 1000, // msat
        feeRate: 100, // ppm
      },
      uptime: Math.floor(Math.random() * 2592000000), // Random uptime up to 30 days
      lastRestart: new Date(Date.now() - Math.floor(Math.random() * 86400000)).toISOString(), // Last restart within 24 hours
      config: {
        autoLiquidity: true,
        maxFeePercent: 0.5,
        maxRelayFee: 3000,
      },
    };

    res.setHeader('Content-Type', 'application/json');
    Object.entries(getSecurityHeaders(requestOrigin)).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    res.status(200).json({
      success: true,
      data: phoenixdStatus,
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  } catch (error) {
    logError(error, {
      requestId,
      endpoint: 'phoenixd-status',
      method: req.method,
    });

    res.setHeader('Content-Type', 'application/json');
    Object.entries(getSecurityHeaders(requestOrigin)).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    res.status(500).json({
      success: false,
      error: "Failed to get PhoenixD daemon status",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}