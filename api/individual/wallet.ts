import { ApiRequest, ApiResponse } from "../../types/api";
import { setCorsHeaders } from "../../utils/cors";

// Note: CORS handling is now managed by the shared utility

/**
 * Individual Wallet API Endpoint
 * GET /api/individual/wallet - Get individual wallet data
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  // Set CORS headers with appropriate methods for this endpoint
  setCorsHeaders(req, res, { methods: "GET, POST, PUT, DELETE, OPTIONS" });

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

    // Fetch individual wallet data
    const walletData = await getIndividualWallet(memberId);

    res.status(200).json({
      success: true,
      data: walletData,
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  } catch (error) {
    console.error("Failed to fetch wallet data:", error);

    res.status(500).json({
      success: false,
      error: "Failed to fetch wallet data",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}

async function getIndividualWallet(memberId: string) {
  // Implementation would fetch from your database
  // This is a mock implementation for now
  return {
    memberId,
    username: `user_${memberId}`,
    lightningAddress: `user_${memberId}@satnam.pub`,
    lightningBalance: Math.floor(Math.random() * 100000) + 10000, // Random balance between 10k-110k sats
    ecashBalance: Math.floor(Math.random() * 50000) + 5000, // Random balance between 5k-55k sats
    spendingLimits: {
      daily: 10000,
      weekly: 50000,
      requiresApproval: 100000,
    },
    recentTransactions: [
      {
        id: "1",
        type: "sent",
        amount: 5000,
        timestamp: new Date(Date.now() - 86400000), // 1 day ago
        status: "completed",
        memo: "Coffee payment",
      },
      {
        id: "2",
        type: "received",
        amount: 15000,
        timestamp: new Date(Date.now() - 172800000), // 2 days ago
        status: "completed",
        memo: "Allowance",
      },
    ],
    privacySettings: {
      defaultRouting: "lightning" as const,
      lnproxyEnabled: true,
      guardianProtected: true,
    },
  };
}
