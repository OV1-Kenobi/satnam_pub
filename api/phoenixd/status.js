/**
 * PhoenixD Daemon Status API
 * GET /api/phoenixd/status - Get PhoenixD daemon status
 * POST /api/phoenixd/status - Update PhoenixD automation configuration
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

  if (req.method === "GET") {

    try {
      // Simulate PhoenixD status with enhanced automation features
      const mockPhoenixDStatus = {
        nodeId: "02phoenixd1234567890abcdef1234567890abcdef1234567890abcdef",
        version: "0.3.2",
        network: "bitcoin",
        status: "running",
        automation: {
          enabled: true,
          autoLiquidity: true,
          autoChannelOpening: true,
          swapInEnabled: true,
          feeBudget: {
            maxOnchainFees: 10000, // sats
            maxLightningFees: 1000
          }
        },
        balance: {
          onChain: 75000000, // sats
          lightning: 25000000,
          totalCapacity: 150000000
        },
        channels: {
          count: 8,
          state: "normal",
          averageCapacity: 18750000,
          inboundLiquidity: 80000000,
          outboundLiquidity: 70000000
        },
        liquidity: {
          status: "optimal",
          needsRebalancing: false,
          lastSwapIn: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
          nextSwapThreshold: 5000000
        },
        lastUpdated: new Date().toISOString()
      };

      // Simulate some variance in liquidity status
      const liquidityHealth = Math.random();
      
      if (liquidityHealth < 0.2) {
        mockPhoenixDStatus.liquidity.status = "low";
        mockPhoenixDStatus.liquidity.needsRebalancing = true;
        mockPhoenixDStatus.balance.lightning = 5000000;
      } else if (liquidityHealth < 0.4) {
        mockPhoenixDStatus.liquidity.status = "rebalancing";
        mockPhoenixDStatus.liquidity.needsRebalancing = true;
      }

      return res.status(200).json({
        success: true,
        data: {
          phoenixd: mockPhoenixDStatus,
          healthy: mockPhoenixDStatus.status === "running",
          timestamp: new Date().toISOString()
        },
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
          source: "mock-phoenixd-node"
        }
      });

    } catch (error) {
      console.error("PhoenixD status error:", error);

      return res.status(500).json({
        success: false,
        error: "Failed to get PhoenixD status",
        data: {
          status: "offline",
          error: error.message
        },
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
    }
  }

  if (req.method === "POST") {
    try {
      const body = req.body;
      
      // Handle automation configuration updates
      if (body.automation) {
        console.log("🔧 Updating PhoenixD automation config:", body.automation);
        
        return res.status(200).json({
          success: true,
          data: {
            message: "Automation configuration updated successfully",
            config: body.automation,
            appliedAt: new Date().toISOString()
          },
          meta: {
            timestamp: new Date().toISOString(),
            demo: true,
          }
        });
      }

      return res.status(400).json({
        success: false,
        error: "Invalid configuration data",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });

    } catch (error) {
      console.error("PhoenixD config update error:", error);

      return res.status(500).json({
        success: false,
        error: "Failed to update PhoenixD configuration",
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
    }
  }

  // Method not allowed
  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({
    success: false,
    error: "Method not allowed",
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}