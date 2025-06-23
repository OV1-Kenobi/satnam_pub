/**
 * PhoenixD Daemon Status API
 * GET /api/phoenixd/status - Get PhoenixD daemon status
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

export default async function handler(req, res) {
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

    res.status(200).json({
      success: true,
      data: phoenixdStatus,
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  } catch (error) {
    console.error("PhoenixD status error:", error);

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