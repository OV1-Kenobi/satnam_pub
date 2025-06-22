// Atomic Swap API Endpoints
// File: api/bridge/atomic-swap.ts
import type { Request, Response } from "express";
import { SatnamInternalLightningBridge } from "../../src/lib/internal-lightning-bridge";

export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    fromContext,
    toContext,
    fromMemberId,
    toMemberId,
    amount,
    swapType,
    purpose,
    requiresApproval,
  } = req.body;

  try {
    const bridge = new SatnamInternalLightningBridge();

    const swapRequest = {
      fromContext,
      toContext,
      fromMemberId,
      toMemberId,
      amount,
      swapType,
      purpose,
      requiresApproval,
    };

    const result = await bridge.executeAtomicSwap(swapRequest);

    if (result.success) {
      return res.json({
        success: true,
        swapId: result.swapId,
        amount: result.amount,
        fees: result.fees,
        message: "Atomic swap completed successfully",
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.error,
        swapId: result.swapId,
      });
    }
  } catch (error) {
    console.error("Atomic swap API error:", error);
    return res.status(500).json({
      error: "Internal server error during atomic swap",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
