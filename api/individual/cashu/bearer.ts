// Cashu Bearer Note API
// File: api/individual/cashu/bearer.ts
import { Request, Response } from "express";

export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { memberId, amount, formFactor, recipientNpub } = req.body;

  // Validate required fields
  if (!memberId || !amount || !formFactor) {
    return res.status(400).json({
      error:
        "Missing required fields: memberId, amount, and formFactor are required",
    });
  }

  // Validate amount
  if (typeof amount !== "number" || amount <= 0) {
    return res.status(400).json({ error: "Amount must be a positive number" });
  }

  // Validate form factor
  const validFormFactors = ["qr", "nfc", "dm", "physical"];
  if (!validFormFactors.includes(formFactor)) {
    return res.status(400).json({
      error: "Invalid form factor. Must be one of: qr, nfc, dm, physical",
    });
  }

  // Validate recipient for DM form factor
  if (
    formFactor === "dm" &&
    (!recipientNpub || typeof recipientNpub !== "string")
  ) {
    return res.status(400).json({
      error: "recipientNpub is required for DM form factor",
    });
  }

  try {
    // Create Cashu bearer instrument
    const bearerResult = await createBearerInstrument({
      memberId,
      amount,
      formFactor,
      recipientNpub,
    });

    return res.json(bearerResult);
  } catch (error) {
    console.error("Bearer note creation failed:", error);
    return res.status(500).json({ error: "Bearer note creation failed" });
  }
}

async function createBearerInstrument(bearerData: {
  memberId: string;
  amount: number;
  formFactor: "qr" | "nfc" | "dm" | "physical";
  recipientNpub?: string;
}) {
  // Mock bearer instrument creation - in real implementation this would:
  // 1. Validate user has sufficient Cashu balance
  // 2. Check spending limits
  // 3. Create the bearer instrument/token
  // 4. Update user balance
  // 5. Record transaction in database
  // 6. For DM: Send gift-wrapped message to recipient

  const { memberId, amount, formFactor, recipientNpub } = bearerData;

  // Simulate processing delay
  await new Promise((resolve) => setTimeout(resolve, 800));

  // Generate mock token
  const token = generateMockCashuToken();
  const bearerId = `bearer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const bearerInstrument = {
    success: true,
    bearerId,
    amount,
    formFactor,
    token,
    created: new Date().toISOString(),
    redeemed: false,
    qrCode: formFactor === "qr" ? generateMockQRCode(token) : undefined,
    nfcData: formFactor === "nfc" ? generateMockNFCData(token) : undefined,
    dmStatus:
      formFactor === "dm"
        ? {
            recipientNpub,
            sent: true,
            messageId: `dm_${Date.now()}`,
          }
        : undefined,
  };

  return bearerInstrument;
}

function generateMockCashuToken(): string {
  // Generate a mock Cashu token (simplified)
  const prefix = "cashuA";
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = prefix;
  for (let i = 0; i < 55; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

function generateMockQRCode(token: string): string {
  // In real implementation, this would generate an actual QR code
  return `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==`;
}

function generateMockNFCData(token: string): object {
  return {
    type: "cashu-bearer-token",
    token,
    format: "NDEF",
    writeInstructions: "Tap NFC tag to write bearer token data",
  };
}
