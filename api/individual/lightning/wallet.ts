import { Request, Response } from "../../../types/netlify-functions";
import { setCorsHeaders } from "../../../utils/cors";

// Note: CORS handling is now managed by the shared utility

/**
 * Lightning Wallet API Endpoint
 * GET /api/individual/lightning/wallet - Get Lightning wallet data
 */
export default async function handler(
  req: Request,
  res: Response
) {
  // Set CORS headers with appropriate methods for this endpoint
  setCorsHeaders(req, res, { methods: "GET, OPTIONS" });

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
    const { memberId } = req.query;

    if (!memberId || typeof memberId !== "string") {
      res.status(400).json({
        success: false,
        error: "Member ID is required",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Fetch Lightning-specific wallet data
    const lightningData = await getLightningWalletData(memberId);

    res.status(200).json({
      success: true,
      data: lightningData,
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  } catch (error) {
    console.error("Failed to fetch Lightning wallet data:", error);

    res.status(500).json({
      success: false,
      error: "Failed to fetch Lightning wallet data",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}

async function getLightningWalletData(memberId: string) {
  // Mock Lightning wallet data
  const mockZapHistory = [
    {
      id: "zap_1",
      amount: 1000,
      recipient:
        "npub1abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567890",
      memo: "Great post! ⚡",
      timestamp: new Date(Date.now() - 3600000), // 1 hour ago
      status: "completed" as const,
    },
    {
      id: "zap_2",
      amount: 500,
      recipient: "npub1xyz987wvu654tsr321qpo098nml765kji432hgf109edc876baz543",
      memo: "Thanks for sharing",
      timestamp: new Date(Date.now() - 7200000), // 2 hours ago
      status: "completed" as const,
    },
    {
      id: "zap_3",
      amount: 2100,
      recipient: "user456@lightning.pub",
      memo: "Zap for the content",
      timestamp: new Date(Date.now() - 86400000), // 1 day ago
      status: "failed" as const,
    },
  ];

  const mockLightningTransactions = [
    {
      id: "ln_tx_1",
      type: "payment" as const,
      amount: 25000,
      fee: 10,
      recipient: "merchant@store.com",
      memo: "Online purchase",
      timestamp: new Date(Date.now() - 1800000), // 30 minutes ago
      status: "completed" as const,
      paymentHash:
        "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
    },
    {
      id: "ln_tx_2",
      type: "invoice" as const,
      amount: 50000,
      fee: 0,
      sender: "client@business.com",
      memo: "Service payment",
      timestamp: new Date(Date.now() - 3600000), // 1 hour ago
      status: "completed" as const,
      paymentHash:
        "b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567",
    },
    {
      id: "ln_tx_3",
      type: "zap" as const,
      amount: 1000,
      fee: 1,
      recipient:
        "npub1abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567890",
      memo: "Great content!",
      timestamp: new Date(Date.now() - 7200000), // 2 hours ago
      status: "completed" as const,
      paymentHash:
        "c3d4e5f6789012345678901234567890abcdef1234567890abcdef12345678",
    },
  ];

  return {
    zapHistory: mockZapHistory,
    transactions: mockLightningTransactions,
  };
}
