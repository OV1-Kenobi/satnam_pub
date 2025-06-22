// External Nuts Reception API
// File: api/individual/cross-mint/receive-external.ts

import { Request, Response } from "express";
import { SatnamCrossMintCashuManager } from "../../../src/lib/cross-mint-cashu-manager";

interface ExternalNutsRequest {
  memberId: string;
  externalToken: string;
  storagePreference?: "satnam-mint" | "keep-external" | "auto";
}

interface ParsedCashuToken {
  mint: string;
  amount: number;
  token: string;
}

function parseCashuToken(token: string): ParsedCashuToken {
  // Mock implementation - in real app, this would parse the actual Cashu token
  // Cashu tokens are typically base64 encoded JSON with mint info and proofs
  try {
    // This is a simplified parser - real implementation would be more robust
    const decoded = JSON.parse(atob(token));
    return {
      mint: decoded.mint || "https://mint.unknown.com",
      amount: decoded.amount || 1000,
      token: token,
    };
  } catch (error) {
    // Fallback for invalid tokens
    return {
      mint: "https://mint.external.com",
      amount: 1000,
      token: token,
    };
  }
}

function validateCashuToken(token: string): boolean {
  // Basic validation - in real app, this would be more comprehensive
  if (!token || token.length < 10) return false;

  // Check if it looks like a base64 encoded token
  try {
    atob(token);
    return true;
  } catch {
    return false;
  }
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      memberId,
      externalToken,
      storagePreference = "auto",
    }: ExternalNutsRequest = req.body;

    // Validate required fields
    if (!memberId || !externalToken) {
      return res.status(400).json({
        error: "Missing required fields: memberId, externalToken",
      });
    }

    // Validate token format
    if (!validateCashuToken(externalToken)) {
      return res.status(400).json({
        error: "Invalid Cashu token format",
      });
    }

    // Validate storage preference
    const validPreferences = ["satnam-mint", "keep-external", "auto"];
    if (!validPreferences.includes(storagePreference)) {
      return res.status(400).json({
        error:
          "Invalid storage preference. Must be one of: satnam-mint, keep-external, auto",
      });
    }

    // Parse the external token
    const parsedToken = parseCashuToken(externalToken);

    // Validate amount is reasonable
    if (parsedToken.amount <= 0 || parsedToken.amount > 1000000) {
      return res.status(400).json({
        error: "Token amount is invalid or too large (max 1M sats)",
      });
    }

    const crossMintManager = new SatnamCrossMintCashuManager();

    // Determine destination mint based on storage preference
    let destinationMint: string;
    switch (storagePreference) {
      case "satnam-mint":
        destinationMint = "https://mint.satnam.pub";
        break;
      case "keep-external":
        destinationMint = parsedToken.mint;
        break;
      case "auto":
      default:
        // Auto mode: prefer Satnam mint for better integration
        destinationMint = "https://mint.satnam.pub";
        break;
    }

    // Process the external nuts reception
    // In a real implementation, this would:
    // 1. Validate the token with the source mint
    // 2. Redeem the token from the source mint
    // 3. If storage preference requires it, mint new tokens at destination mint
    // 4. Update user's balance records

    // Mock processing delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const response = {
      success: true,
      amount: parsedToken.amount,
      sourceMint: parsedToken.mint,
      destinationMint: destinationMint,
      storagePreference: storagePreference,
      processed: new Date().toISOString(),
    };

    return res.json(response);
  } catch (error) {
    console.error("External nuts reception failed:", error);

    const errorMessage =
      error instanceof Error ? error.message : "External nuts reception failed";

    return res.status(500).json({
      error: errorMessage,
      success: false,
    });
  }
}
