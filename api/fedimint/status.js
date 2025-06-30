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
    
    // Enhanced mock Fedimint federation status
    const mockFedimintStatus = {
      federationId: "fed1abcd1234567890abcdef",
      name: "Satnam Family Federation",
      status: "online",
      guardianCount: 4,
      guardianThreshold: 3,
      onlineGuardians: 4,
      guardians: {
        total: 4,
        online: 4,
        threshold: 3,
      },
      balance: {
        total: 50000000, // msat
        spendable: 48500000,
        reserved: 1500000,
        totalEcash: 15000000, // Total ecash in federation (sats)
        familyBalance: 875000, // Family's ecash balance (sats)
      },
      lastSeen: new Date().toISOString(),
      version: "0.3.0",
      network: "bitcoin",
      modules: {
        wallet: { enabled: true, status: "active", onchainAddress: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh" },
        lightning: { 
          enabled: true, 
          status: "active",
          gateway: "gw1abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567",
        },
        mint: { 
          enabled: true, 
          status: "active",
          denominations: [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000],
        }
      },
      uptime: Math.floor(Math.random() * 2592000000), // Random uptime up to 30 days
      lastSync: new Date(Date.now() - Math.floor(Math.random() * 300000)).toISOString(), // Last sync within 5 minutes
    };

    // Simulate some variance in status (90% chance of being healthy)
    const isHealthy = Math.random() > 0.1;

    if (!isHealthy) {
      mockFedimintStatus.status = "degraded";
      mockFedimintStatus.onlineGuardians = 3;
      mockFedimintStatus.guardians.online = 3;
    }

    res.status(200).json({
      success: true,
      data: {
        federation: mockFedimintStatus,
        timestamp: new Date().toISOString(),
        healthy: isHealthy,
      },
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
        source: "mock-federation"
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