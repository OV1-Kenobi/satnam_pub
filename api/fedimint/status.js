/**
 * Fedimint Federation Status API
 * GET /api/fedimint/status - Get federation status
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
    // In production, this would connect to actual Fedimint gateway
    // const fedimintClient = await connectToFedimint(process.env.FEDIMINT_GATEWAY_URL);
    // const federationInfo = await fedimintClient.getFederationInfo();
    
    // Mock Fedimint federation status for demo
    const fedimintStatus = {
      federationId: "fed1qw2e3r4t5y6u7i8o9p0a1s2d3f4g5h6j7k8l9z0x1c2v3b4n5m6",
      name: "Satnam Family Federation",
      status: "online",
      guardians: {
        total: 5,
        online: 5,
        threshold: 3,
      },
      balance: {
        totalEcash: 15000000, // Total ecash in federation (sats)
        familyBalance: 875000, // Family's ecash balance (sats)
      },
      modules: {
        lightning: {
          enabled: true,
          gateway: "gw1abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567",
          status: "connected",
        },
        mint: {
          enabled: true,
          denominations: [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000],
        },
        wallet: {
          enabled: true,
          onchainAddress: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        },
      },
      network: "mainnet",
      version: "0.3.0",
      uptime: Math.floor(Math.random() * 2592000000), // Random uptime up to 30 days
      lastSync: new Date(Date.now() - Math.floor(Math.random() * 300000)).toISOString(), // Last sync within 5 minutes
    };

    res.status(200).json({
      success: true,
      data: fedimintStatus,
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  } catch (error) {
    console.error("Fedimint status error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to get Fedimint federation status",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}