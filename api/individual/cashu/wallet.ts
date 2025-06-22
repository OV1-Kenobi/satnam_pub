// Cashu Wallet API Endpoints
// File: api/individual/cashu/wallet.ts
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
    // Fetch Cashu-specific wallet data
    const cashuData = await getCashuWalletData(memberId);

    return res.json(cashuData);
  } catch (error) {
    console.error("Failed to fetch Cashu wallet data:", error);
    return res.status(500).json({ error: "Failed to fetch Cashu wallet data" });
  }
}

async function getCashuWalletData(memberId: string) {
  // Mock Cashu wallet data
  const mockBearerInstruments = [
    {
      id: "bearer_1",
      amount: 10000,
      formFactor: "qr" as const,
      created: new Date(Date.now() - 86400000), // 1 day ago
      redeemed: false,
      token: "cashuAbc123def456ghi789jkl012mno345pqr678stu901vwx234yz567890",
    },
    {
      id: "bearer_2",
      amount: 5000,
      formFactor: "nfc" as const,
      created: new Date(Date.now() - 172800000), // 2 days ago
      redeemed: true,
      token: "cashuXyz987wvu654tsr321qpo098nml765kji432hgf109edc876baz543",
    },
    {
      id: "bearer_3",
      amount: 2100,
      formFactor: "dm" as const,
      created: new Date(Date.now() - 259200000), // 3 days ago
      redeemed: false,
      token: "cashuMno456pqr789stu012vwx345yz678abc901def234ghi567jkl890",
    },
  ];

  const mockCashuTransactions = [
    {
      id: "cashu_tx_1",
      type: "mint" as const,
      amount: 25000,
      fee: 0,
      memo: "Lightning to Cashu conversion",
      timestamp: new Date(Date.now() - 1800000), // 30 minutes ago
      status: "completed" as const,
      tokenId: "token_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567890",
    },
    {
      id: "cashu_tx_2",
      type: "send" as const,
      amount: 10000,
      fee: 0,
      recipient: "Bearer note recipient",
      memo: "Gift for friend",
      timestamp: new Date(Date.now() - 3600000), // 1 hour ago
      status: "completed" as const,
      tokenId: "token_def456ghi789jkl012mno345pqr678stu901vwx234yz567890abc123",
    },
    {
      id: "cashu_tx_3",
      type: "receive" as const,
      amount: 15000,
      fee: 0,
      sender: "Family member",
      memo: "Received bearer note",
      timestamp: new Date(Date.now() - 7200000), // 2 hours ago
      status: "completed" as const,
      tokenId: "token_ghi789jkl012mno345pqr678stu901vwx234yz567890abc123def456",
    },
    {
      id: "cashu_tx_4",
      type: "melt" as const,
      amount: 8000,
      fee: 0,
      memo: "Cashu to Lightning conversion",
      timestamp: new Date(Date.now() - 10800000), // 3 hours ago
      status: "completed" as const,
      tokenId: "token_jkl012mno345pqr678stu901vwx234yz567890abc123def456ghi789",
    },
  ];

  return {
    bearerInstruments: mockBearerInstruments,
    transactions: mockCashuTransactions,
  };
}
