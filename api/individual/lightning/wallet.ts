// Lightning Wallet API Endpoints
// File: api/individual/lightning/wallet.ts
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
    // Fetch Lightning-specific wallet data
    const lightningData = await getLightningWalletData(memberId);

    return res.json(lightningData);
  } catch (error) {
    console.error("Failed to fetch Lightning wallet data:", error);
    return res
      .status(500)
      .json({ error: "Failed to fetch Lightning wallet data" });
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
