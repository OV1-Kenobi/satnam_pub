/**
 * Individual Wallet API Endpoint
 * GET /api/individual/wallet - Get individual wallet data
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
    "GET, OPTIONS"
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
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Generate enhanced mock wallet data (combining both implementations)
    const mockWalletData = {
      userId,
      balance: {
        onChain: Math.floor(Math.random() * 10000000) + 1000000, // 1-11M sats
        lightning: Math.floor(Math.random() * 5000000) + 500000, // 0.5-5.5M sats
        ecash: Math.floor(Math.random() * 1000000) + 100000, // 0.1-1.1M sats
        total: 0 // Will be calculated
      },
      transactions: {
        recent: [
          {
            id: `tx_${Date.now()}_1`,
            type: "received",
            amount: 50000,
            fee: 150,
            status: "confirmed",
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            description: "Lightning payment received"
          },
          {
            id: `tx_${Date.now()}_2`,
            type: "sent",
            amount: 25000,
            fee: 200,
            status: "confirmed",
            timestamp: new Date(Date.now() - 7200000).toISOString(),
            description: "Coffee purchase"
          },
          {
            id: `tx_${Date.now()}_3`,
            type: "received",
            amount: 100000,
            fee: 0,
            status: "pending",
            timestamp: new Date(Date.now() - 1800000).toISOString(),
            description: "Cashu mint"
          }
        ],
        count: Math.floor(Math.random() * 50) + 10
      },
      channels: {
        lightning: {
          active: Math.floor(Math.random() * 5) + 1,
          capacity: Math.floor(Math.random() * 10000000) + 1000000,
          localBalance: 0, // Will be calculated
          remoteBalance: 0 // Will be calculated
        }
      },
      settings: {
        autoBackup: true,
        defaultFeeRate: "normal",
        notificationsEnabled: true,
        privacyMode: true
      },
      // Additional fields from the existing API
      username: `user_${userId}`,
      lightningAddress: `user_${userId}@satnam.pub`,
      spendingLimits: {
        daily: 10000,
        weekly: 50000,
        requiresApproval: 100000,
      },
      privacySettings: {
        defaultRouting: "lightning",
        lnproxyEnabled: true,
        guardianProtected: true,
      },
      lastUpdated: new Date().toISOString()
    };

    // Calculate totals
    mockWalletData.balance.total = 
      mockWalletData.balance.onChain + 
      mockWalletData.balance.lightning + 
      mockWalletData.balance.ecash;

    mockWalletData.channels.lightning.localBalance = 
      Math.floor(mockWalletData.channels.lightning.capacity * 0.6);
    mockWalletData.channels.lightning.remoteBalance = 
      mockWalletData.channels.lightning.capacity - mockWalletData.channels.lightning.localBalance;

    return res.status(200).json({
      success: true,
      data: {
        wallet: mockWalletData,
        timestamp: new Date().toISOString()
      },
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
        userId
      }
    });

  } catch (error) {
    console.error("Individual wallet error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to get wallet data",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}