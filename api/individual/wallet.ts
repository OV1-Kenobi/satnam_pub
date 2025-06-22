// Individual Wallet API Endpoints
// File: api/individual/wallet.ts
import { Request, Response } from "express";

export default async function handler(req: Request, res: Response) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { memberId } = req.query;

  if (!memberId || typeof memberId !== "string") {
    return res.status(400).json({ error: "Member ID is required" });
  }

  try {
    // Fetch individual wallet data
    const walletData = await getIndividualWallet(memberId);

    return res.json(walletData);
  } catch (error) {
    console.error("Failed to fetch wallet data:", error);
    return res.status(500).json({ error: "Failed to fetch wallet data" });
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
