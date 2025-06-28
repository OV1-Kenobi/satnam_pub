import { NextApiRequest, NextApiResponse } from "next";
import { setCorsHeaders } from "../../../utils/cors";

// Note: CORS handling is now managed by the shared utility

/**
 * Lightning Zap API Endpoint
 * POST /api/individual/lightning/zap - Send a Lightning zap
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Set CORS headers with appropriate methods for this endpoint
  setCorsHeaders(req, res, { methods: "POST, OPTIONS" });

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
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
    const { memberId, amount, recipient, memo } = req.body;

    // Validate required fields
    if (!memberId || !amount || !recipient) {
      res.status(400).json({
        success: false,
        error:
          "Missing required fields: memberId, amount, and recipient are required",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Validate amount
    if (typeof amount !== "number" || amount <= 0) {
      res.status(400).json({
        success: false,
        error: "Amount must be a positive number",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Validate recipient format (basic validation)
    if (typeof recipient !== "string" || recipient.length < 10) {
      res.status(400).json({
        success: false,
        error: "Invalid recipient format",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Process Lightning zap
    const zapResult = await processLightningZap({
      memberId,
      amount,
      recipient,
      memo: memo || "",
    });

    res.status(200).json({
      success: true,
      data: zapResult,
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  } catch (error) {
    console.error("Zap processing failed:", error);

    res.status(500).json({
      success: false,
      error: "Zap failed to process",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}

async function processLightningZap(zapData: {
  memberId: string;
  amount: number;
  recipient: string;
  memo: string;
}) {
  // Mock zap processing - in real implementation this would:
  // 1. Validate user has sufficient balance
  // 2. Check spending limits
  // 3. Process the Lightning payment/zap
  // 4. Update user balance
  // 5. Record transaction in database

  const { memberId, amount, recipient, memo } = zapData;

  // Simulate processing delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Mock success response
  const zapId = `zap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return {
    zapId,
    amount,
    recipient,
    memo,
    status: "completed",
    timestamp: new Date().toISOString(),
    fee: Math.ceil(amount * 0.001), // Mock 0.1% fee
    paymentHash: generateMockPaymentHash(),
  };
}

function generateMockPaymentHash(): string {
  // Generate a mock 64-character hex string (like a real payment hash)
  const chars = "0123456789abcdef";
  let hash = "";
  for (let i = 0; i < 64; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}
