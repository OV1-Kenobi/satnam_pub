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

interface LightningNodeStatus {
  nodeId: string;
  alias: string;
  isOnline: boolean;
  blockHeight: number;
  channelCount: number;
  totalCapacity: number;
  totalBalance: number;
  version: string;
  network: "mainnet" | "testnet" | "regtest";
  peers: number;
  pendingChannels: number;
  activeChannels: number;
  lastSync: Date;
}

/**
 * Lightning Network Status API Endpoint
 * GET /api/lightning/status - Get Lightning node status
 */
export default async function handler(req: any, res: any) {
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
    // In a real implementation, this would connect to your Lightning node
    // const lndClient = new LndClient(process.env.LND_MACAROON, process.env.LND_SOCKET);
    // const nodeInfo = await lndClient.getInfo();

    // Mock Lightning node status for demonstration
    const mockStatus: LightningNodeStatus = {
      nodeId:
        "03a1b2c3d4e5f6789abcdef0123456789abcdef0123456789abcdef0123456789ab",
      alias: "SatnamFamily⚡",
      isOnline: true,
      blockHeight: 820450,
      channelCount: 12,
      totalCapacity: 75000000, // 0.75 BTC
      totalBalance: 45000000, // 0.45 BTC
      version: "0.17.4-beta",
      network: "mainnet",
      peers: 8,
      pendingChannels: 1,
      activeChannels: 11,
      lastSync: new Date(),
    };

    res.status(200).json({
      success: true,
      data: mockStatus,
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  } catch (error) {
    console.error("Lightning status error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to retrieve Lightning node status",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}
