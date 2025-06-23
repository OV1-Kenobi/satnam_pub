import { z } from "zod";

// Enhanced PhoenixD status interface
interface PhoenixDNodeStatus {
  nodeId: string;
  isOnline: boolean;
  blockHeight: number;
  channelCount: number;
  totalCapacity: number;
  totalBalance: number;
  pendingHtlcs: number;
  lastSync: Date;
  version: string;
  network: "mainnet" | "testnet" | "regtest";
  peers: PhoenixDPeer[];
  channels: PhoenixDChannel[];
  liquidity: LiquidityStatus;
  autoLiquidity: AutoLiquidityConfig;
}

interface PhoenixDPeer {
  nodeId: string;
  alias: string;
  address: string;
  isConnected: boolean;
  lastSeen: Date;
}

interface PhoenixDChannel {
  channelId: string;
  peerId: string;
  capacity: number;
  localBalance: number;
  remoteBalance: number;
  status: "active" | "inactive" | "pending" | "closing";
  isPrivate: boolean;
  fundingTxId: string;
  shortChannelId?: string;
  createdAt: Date;
  lastUpdate: Date;
}

interface LiquidityStatus {
  totalInbound: number;
  totalOutbound: number;
  ratio: number;
  recommendedAction:
    | "none"
    | "increase_inbound"
    | "increase_outbound"
    | "rebalance";
  emergencyThreshold: number;
  warningThreshold: number;
}

interface AutoLiquidityConfig {
  enabled: boolean;
  targetRatio: number;
  minChannelSize: number;
  maxChannelSize: number;
  rebalanceThreshold: number;
  lastRebalance?: Date;
}

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

/**
 * PhoenixD Status API Endpoint
 * GET /api/phoenixd/status - Get PhoenixD node status
 * POST /api/phoenixd/status - Update auto-liquidity configuration
 */
export default async function handler(req: any, res: any) {
  // Set CORS headers
  setCorsHeaders(req, res);

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  try {
    if (req.method === "GET") {
      await handleGetStatus(req, res);
    } else if (req.method === "POST") {
      await handleUpdateAutoLiquidity(req, res);
    } else {
      res.setHeader("Allow", ["GET", "POST"]);
      res.status(405).json({
        success: false,
        error: "Method not allowed",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }
  } catch (error) {
    console.error("PhoenixD status API error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}

/**
 * Get PhoenixD Node Status
 */
async function handleGetStatus(req: any, res: any): Promise<void> {
  try {
    // In a real implementation, this would connect to PhoenixD API
    // const phoenixdClient = new PhoenixDClient(process.env.PHOENIXD_URL);
    // const status = await phoenixdClient.getNodeInfo();

    // Mock PhoenixD status for demonstration
    const mockStatus: PhoenixDNodeStatus = {
      nodeId:
        "03a1b2c3d4e5f6789abcdef0123456789abcdef0123456789abcdef0123456789ab",
      isOnline: true,
      blockHeight: 820450,
      channelCount: 8,
      totalCapacity: 50000000, // 0.5 BTC
      totalBalance: 35000000, // 0.35 BTC
      pendingHtlcs: 3,
      lastSync: new Date(),
      version: "0.3.2",
      network: "mainnet",
      peers: [
        {
          nodeId: "02acinq1234567890abcdef",
          alias: "ACINQ",
          address: "3.33.236.230:9735",
          isConnected: true,
          lastSeen: new Date(),
        },
        {
          nodeId: "02bitrefill987654321fed",
          alias: "Bitrefill",
          address: "52.50.244.44:9735",
          isConnected: true,
          lastSeen: new Date(Date.now() - 5 * 60 * 1000),
        },
      ],
      channels: [
        {
          channelId: "ch_1234567890abcdef",
          peerId: "02acinq1234567890abcdef",
          capacity: 5000000,
          localBalance: 3000000,
          remoteBalance: 2000000,
          status: "active",
          isPrivate: false,
          fundingTxId: "tx_abcdef1234567890",
          shortChannelId: "820450x1234x0",
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          lastUpdate: new Date(),
        },
        {
          channelId: "ch_fedcba0987654321",
          peerId: "02bitrefill987654321fed",
          capacity: 10000000,
          localBalance: 7500000,
          remoteBalance: 2500000,
          status: "active",
          isPrivate: true,
          fundingTxId: "tx_fedcba0987654321",
          shortChannelId: "820445x5678x1",
          createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
          lastUpdate: new Date(Date.now() - 2 * 60 * 60 * 1000),
        },
      ],
      liquidity: {
        totalInbound: 4500000,
        totalOutbound: 10500000,
        ratio: 0.7,
        recommendedAction: "none",
        emergencyThreshold: 0.1,
        warningThreshold: 0.3,
      },
      autoLiquidity: {
        enabled: true,
        targetRatio: 0.5,
        minChannelSize: 1000000,
        maxChannelSize: 20000000,
        rebalanceThreshold: 0.2,
        lastRebalance: new Date(Date.now() - 6 * 60 * 60 * 1000),
      },
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
    console.error("PhoenixD status error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to retrieve PhoenixD status",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}

/**
 * Update Auto-Liquidity Configuration
 */
async function handleUpdateAutoLiquidity(req: any, res: any): Promise<void> {
  try {
    const configSchema = z.object({
      enabled: z.boolean(),
      targetRatio: z.number().min(0.1).max(0.9).optional(),
      minChannelSize: z.number().positive().optional(),
      maxChannelSize: z.number().positive().optional(),
      rebalanceThreshold: z.number().min(0.05).max(0.5).optional(),
    });

    const validationResult = configSchema.safeParse(req.body);

    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        error: "Invalid auto-liquidity configuration",
        details: validationResult.error.errors,
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
      return;
    }

    const config = validationResult.data;

    // In a real implementation, this would update PhoenixD configuration
    // await phoenixdClient.updateAutoLiquidityConfig(config);

    console.log("Auto-liquidity configuration updated:", config);

    res.status(200).json({
      success: true,
      data: {
        message: "Auto-liquidity configuration updated successfully",
        config,
      },
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  } catch (error) {
    console.error("Auto-liquidity update error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to update auto-liquidity configuration",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}
