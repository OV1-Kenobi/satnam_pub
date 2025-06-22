// Multi-Nut Payment API
// File: api/individual/cross-mint/multi-nut-payment.ts

import { Request, Response } from "express";
import { SatnamCrossMintCashuManager } from "../../../src/lib/cross-mint-cashu-manager";

interface MultiNutPaymentRequest {
  memberId: string;
  amount: number;
  recipient: string;
  memo?: string;
  mintPreference?: "satnam-first" | "external-first" | "balanced";
}

async function getExternalMints(memberId: string): Promise<string[]> {
  // Mock implementation - in real app, this would query user's external mint preferences
  return [
    "https://mint.minibits.cash",
    "https://mint.coinos.io",
    "https://mint.bitcoinmints.com",
  ];
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      memberId,
      amount,
      recipient,
      memo,
      mintPreference,
    }: MultiNutPaymentRequest = req.body;

    // Validate required fields
    if (!memberId || !amount || !recipient) {
      return res.status(400).json({
        error: "Missing required fields: memberId, amount, recipient",
      });
    }

    // Validate amount
    if (amount <= 0 || amount > 1000000) {
      // Max 1M sats
      return res.status(400).json({
        error: "Invalid amount. Must be between 1 and 1,000,000 sats",
      });
    }

    const crossMintManager = new SatnamCrossMintCashuManager();

    // Determine preferred mints based on preference
    let preferredMints: string[];
    switch (mintPreference) {
      case "satnam-first":
        preferredMints = ["https://mint.satnam.pub"];
        break;
      case "external-first":
        preferredMints = await getExternalMints(memberId);
        break;
      case "balanced":
      default:
        preferredMints = [
          "https://mint.satnam.pub",
          ...(await getExternalMints(memberId)),
        ];
        break;
    }

    // Create multi-nut payment
    const result = await crossMintManager.createMultiNutPayment(
      amount,
      recipient,
      memo
    );

    // Transform the result to match API response format
    const response = {
      success: true,
      paymentId: result.id,
      totalAmount: result.totalAmount,
      mintSources: result.mintSources,
      status: result.status,
      created: result.created.toISOString(),
    };

    return res.json(response);
  } catch (error) {
    console.error("Multi-nut payment creation failed:", error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : "Multi-nut payment creation failed";

    return res.status(500).json({
      error: errorMessage,
      success: false,
    });
  }
}
