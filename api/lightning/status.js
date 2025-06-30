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
    
    // Enhanced mock Lightning node status
    const mockLightningStatus = {
      nodeId: "03abcd1234567890abcdef1234567890abcdef1234567890abcdef",
      alias: "Satnam Family Node",
      version: "0.17.4-beta",
      network: "bitcoin",
      status: "online",
      isOnline: true,
      syncStatus: {
        chainSynced: true,
        graphSynced: true,
        bestBlockHeight: 820000,
        bestBlockHash: "00000000000000000001a2b3c4d5e6f7890abcdef1234567890abcdef123456"
      },
      balance: {
        onChain: 100000000, // sats
        lightning: 50000000,
        pending: 5000000,
        confirmed: 5000000,
        unconfirmed: 0,
        total: 5000000,
      },
      channels: {
        active: 12,
        inactive: 1,
        pending: 2,
        total: 13,
        totalCapacity: 200000000,
        localBalance: 120000000,
        remoteBalance: 80000000
      },
      peers: 24,
      fees: {
        baseFee: 1000,
        feeRate: 0.000001,
      },
      lastUpdated: new Date().toISOString()
    };

    // Simulate some variance in status (85% chance of being healthy)
    const isHealthy = Math.random() > 0.15;

    if (!isHealthy) {
      mockLightningStatus.status = "syncing";
      mockLightningStatus.isOnline = false;
      mockLightningStatus.syncStatus.chainSynced = false;
      mockLightningStatus.channels.inactive = 3;
    }

    res.status(200).json({
      success: true,
      data: {
        node: mockLightningStatus,
        healthy: isHealthy,
        timestamp: new Date().toISOString()
      },
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
        source: "mock-lightning-node"
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