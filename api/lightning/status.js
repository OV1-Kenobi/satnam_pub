/**
 * Lightning Node Status API
 * GET /api/lightning/status - Get Lightning node status
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
    // In production, this would connect to actual Lightning node
    // const lightningClient = await connectToLightningNode(process.env.LIGHTNING_NODE_URL);
    // const nodeInfo = await lightningClient.getInfo();
    
    // Mock Lightning node status for demo
    const lightningStatus = {
      nodeId: "03a1b2c3d4e5f6789abcdef0123456789abcdef0123456789abcdef0123456789ab",
      alias: "SatnamFamily-Lightning",
      isOnline: true,
      blockHeight: 850000 + Math.floor(Math.random() * 1000),
      channels: {
        active: 12,
        pending: 1,
        total: 13,
      },
      balance: {
        confirmed: 5000000, // sats
        unconfirmed: 0,
        total: 5000000,
      },
      peers: 8,
      version: "0.17.4-beta",
      network: "mainnet",
      fees: {
        baseFee: 1000,
        feeRate: 0.000001,
      },
    };

    res.status(200).json({
      success: true,
      data: lightningStatus,
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  } catch (error) {
    console.error("Lightning status error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to get Lightning node status",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}