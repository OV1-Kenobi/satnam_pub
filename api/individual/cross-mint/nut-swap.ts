// Nut-Swap API
// File: api/individual/cross-mint/nut-swap.ts

import { Request, Response } from "express";
import { SatnamCrossMintCashuManager } from "../../../src/lib/cross-mint-cashu-manager";

interface NutSwapRequest {
  memberId: string;
  fromMint: string;
  toMint: string;
  amount: number;
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { memberId, fromMint, toMint, amount }: NutSwapRequest = req.body;

    // Validate required fields
    if (!memberId || !fromMint || !toMint || !amount) {
      return res.status(400).json({
        error: "Missing required fields: memberId, fromMint, toMint, amount",
      });
    }

    // Validate amount
    if (amount <= 0 || amount > 1000000) {
      // Max 1M sats
      return res.status(400).json({
        error: "Invalid amount. Must be between 1 and 1,000,000 sats",
      });
    }

    // Validate that fromMint and toMint are different
    if (fromMint === toMint) {
      return res.status(400).json({
        error: "Source and destination mints must be different",
      });
    }

    // Validate mint URLs
    const validMints = [
      "https://mint.satnam.pub",
      "https://mint.minibits.cash",
      "https://mint.coinos.io",
      "https://mint.bitcoinmints.com",
    ];

    if (!validMints.includes(fromMint) || !validMints.includes(toMint)) {
      return res.status(400).json({
        error: "Invalid mint URL. Only supported mints are allowed",
      });
    }

    const crossMintManager = new SatnamCrossMintCashuManager();

    // Perform nut swap
    const result = await crossMintManager.createNutSwap(
      fromMint,
      toMint,
      amount
    );

    // Transform the result to match API response format
    const response = {
      success: true,
      swapId: result.id,
      fromMint: result.fromMint,
      toMint: result.toMint,
      amount: result.amount,
      status: result.status,
      created: result.created.toISOString(),
    };

    return res.json(response);
  } catch (error) {
    console.error("Nut-swap failed:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Nut-swap failed";

    return res.status(500).json({
      error: errorMessage,
      success: false,
    });
  }
}
