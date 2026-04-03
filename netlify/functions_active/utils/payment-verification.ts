/**
 * Payment verification utilities for Lightning, Cashu, and Fedimint
 * TODO: Implement actual verification logic for each protocol
 */

/**
 * Constant-time comparison to prevent timing attacks
 * Used for webhook signature verification
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export interface PaymentVerificationResult {
  valid: boolean;
  amount_sats: number;
  payment_hash?: string;
  token_hash?: string;
  txid?: string;
}

/**
 * Verify Lightning preimage against payment hash
 * @param preimage - Hex-encoded preimage (32 bytes)
 * @returns Verification result with amount
 */
export async function verifyLightningPreimage(
  preimage: string,
): Promise<PaymentVerificationResult> {
  try {
    // Validate preimage format (64 hex characters = 32 bytes)
    if (!/^[0-9a-fA-F]{64}$/.test(preimage)) {
      console.error("Invalid preimage format (expected 64 hex characters)");
      return { valid: false, amount_sats: 0 };
    }

    // Compute payment hash from preimage using SHA-256
    const preimageBytes = new Uint8Array(
      preimage.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
    );
    const hashBuffer = await crypto.subtle.digest("SHA-256", preimageBytes);
    const paymentHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Query Lightning node to verify payment
    const phoenixdUrl = process.env.PHOENIXD_NODE_URL;
    const phoenixdPassword = process.env.PHOENIXD_API_PASSWORD;
    const lnbitsUrl =
      process.env.VITE_VOLTAGE_LNBITS_URL || process.env.VOLTAGE_LNBITS_URL;
    const lnbitsAdminKey =
      process.env.VITE_VOLTAGE_LNBITS_ADMIN_KEY ||
      process.env.VOLTAGE_LNBITS_ADMIN_KEY;

    // Try PhoenixD first
    if (phoenixdUrl && phoenixdPassword) {
      const authHeader =
        "Basic " + Buffer.from(":" + phoenixdPassword).toString("base64");
      const response = await fetch(`${phoenixdUrl}/listpayments`, {
        headers: { Authorization: authHeader },
      });

      if (response.ok) {
        const payments = await response.json();
        const payment = payments.find(
          (p: any) => p.paymentHash === paymentHash,
        );
        if (payment && payment.status === "succeeded") {
          return {
            valid: true,
            amount_sats: Math.floor(payment.amountMsat / 1000),
            payment_hash: paymentHash,
          };
        }
      }
    }

    // Fallback to LNbits
    if (lnbitsUrl && lnbitsAdminKey) {
      const response = await fetch(
        `${lnbitsUrl}/api/v1/payments/${paymentHash}`,
        {
          headers: { "X-Api-Key": lnbitsAdminKey },
        },
      );

      if (response.ok) {
        const payment = await response.json();
        if (payment.paid) {
          return {
            valid: true,
            amount_sats: payment.amount,
            payment_hash: paymentHash,
          };
        }
      }
    }

    console.warn("Payment not found or not paid");
    return { valid: false, amount_sats: 0, payment_hash: paymentHash };
  } catch (error) {
    console.error("Lightning preimage verification failed:", error);
    return { valid: false, amount_sats: 0 };
  }
}

export async function verifyLightningPayment(
  paymentProof: string,
): Promise<PaymentVerificationResult> {
  // Alias for verifyLightningPreimage for backward compatibility
  return verifyLightningPreimage(paymentProof);
}

/**
 * Verify Cashu token via mint API
 * @param token - Cashu token (JSON or base64-encoded)
 * @returns Verification result with amount
 */
export async function verifyCashuToken(
  token: string,
): Promise<PaymentVerificationResult> {
  try {
    // Get Cashu mint URL from environment
    const mintUrl =
      process.env.VITE_CASHU_MINT_URL || process.env.CASHU_MINT_URL;

    if (!mintUrl) {
      console.warn(
        "⚠️ Cashu mint not configured (VITE_CASHU_MINT_URL required)",
      );
      return { valid: false, amount_sats: 0 };
    }

    // Decode Cashu token (can be JSON or base64)
    let tokenData: any;
    try {
      // Try parsing as JSON first
      tokenData = JSON.parse(token);
    } catch {
      // Try decoding from base64
      try {
        const decoded = Buffer.from(token, "base64").toString("utf-8");
        tokenData = JSON.parse(decoded);
      } catch {
        console.error("Invalid Cashu token format");
        return { valid: false, amount_sats: 0 };
      }
    }

    // Verify token with mint API
    const response = await fetch(`${mintUrl}/v1/checkstate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        Ys:
          tokenData.token
            ?.map((t: any) => t.proofs?.map((p: any) => p.Y))
            .flat() || [],
      }),
    });

    if (!response.ok) {
      console.error(`Cashu token verification failed: ${response.status}`);
      return { valid: false, amount_sats: 0 };
    }

    const result = await response.json();

    // Calculate total amount from valid proofs
    let totalAmount = 0;
    const states = result.states || [];

    tokenData.token?.forEach((t: any, idx: number) => {
      t.proofs?.forEach((proof: any, proofIdx: number) => {
        const state = states[idx * (t.proofs?.length || 0) + proofIdx];
        if (state?.state === "UNSPENT") {
          totalAmount += proof.amount || 0;
        }
      });
    });

    if (totalAmount > 0) {
      return {
        valid: true,
        amount_sats: totalAmount,
        token_hash: tokenData.token?.[0]?.proofs?.[0]?.Y || undefined,
      };
    }

    console.warn("Cashu token already spent or invalid");
    return { valid: false, amount_sats: 0 };
  } catch (error) {
    console.error("Cashu token verification failed:", error);
    return { valid: false, amount_sats: 0 };
  }
}

/**
 * Verify Fedimint transaction via gateway API
 * @param txid - Fedimint transaction ID
 * @returns Verification result with amount
 */
export async function verifyFedimintTxid(
  txid: string,
): Promise<PaymentVerificationResult> {
  try {
    // Get Fedimint gateway configuration
    const gatewayUrl =
      process.env.VITE_FEDIMINT_GATEWAY_URL || process.env.FEDIMINT_GATEWAY_URL;
    const federationId =
      process.env.VITE_FEDIMINT_FEDERATION_ID ||
      process.env.FEDIMINT_FEDERATION_ID;
    const apiToken =
      process.env.VITE_FEDIMINT_API_TOKEN || process.env.FEDIMINT_API_TOKEN;

    if (!gatewayUrl || !federationId) {
      console.warn(
        "⚠️ Fedimint gateway not configured (VITE_FEDIMINT_GATEWAY_URL and VITE_FEDIMINT_FEDERATION_ID required)",
      );
      return { valid: false, amount_sats: 0 };
    }

    // Query gateway for transaction status
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (apiToken) {
      headers["Authorization"] = `Bearer ${apiToken}`;
    }

    const response = await fetch(`${gatewayUrl}/gateway/transaction/${txid}`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      console.error(
        `Fedimint transaction verification failed: ${response.status}`,
      );
      return { valid: false, amount_sats: 0 };
    }

    const transaction = await response.json();

    // Check if transaction is confirmed
    if (
      transaction.status === "confirmed" ||
      transaction.status === "completed"
    ) {
      return {
        valid: true,
        amount_sats: transaction.amount_sats || transaction.amount || 0,
        txid: txid,
      };
    }

    console.warn(`Fedimint transaction not confirmed: ${transaction.status}`);
    return { valid: false, amount_sats: 0, txid: txid };
  } catch (error) {
    console.error("Fedimint transaction verification failed:", error);
    return { valid: false, amount_sats: 0 };
  }
}

export async function generateCashuPaymentRequest(
  amount: number,
  options: { agent_id: string; action_type: string },
): Promise<string> {
  // TODO: Generate Cashu payment request via mint API
  console.warn("generateCashuPaymentRequest not yet implemented");
  return "";
}

export async function generateFedimintPaymentAddress(
  amount: number,
  description: string,
): Promise<string> {
  // TODO: Generate Fedimint payment address via gateway
  console.warn("generateFedimintPaymentAddress not yet implemented");
  return "";
}

export async function decodeCashuToken(
  token: string,
): Promise<{ amount: number; mint: string }> {
  // TODO: Decode Cashu token to extract amount and mint URL
  console.warn("decodeCashuToken not yet implemented");
  return { amount: 0, mint: "" };
}

export async function verifyPayment(
  paymentProof: string,
  protocol: "lightning" | "cashu" | "fedimint",
  expectedAmount: number,
): Promise<boolean> {
  // TODO: Unified payment verification wrapper
  console.warn("verifyPayment not yet implemented");
  return false;
}

export async function generatePaymentRequest(
  amount: number,
  options: { purpose: string },
): Promise<string> {
  // TODO: Generate payment request (Lightning invoice, Cashu request, or Fedimint address)
  console.warn("generatePaymentRequest not yet implemented");
  return "";
}

export async function getFeeForAction(actionType: string): Promise<number> {
  // TODO: Lookup fee from platform_fee_schedule table
  console.warn("getFeeForAction not yet implemented");
  return 0;
}

export function decryptKeypair(encryptedPrivateKey: string): string {
  // TODO: Decrypt platform blind signing keypair using platform master key
  console.warn("decryptKeypair not yet implemented");
  return "";
}

export async function publishNostrEvent(event: any): Promise<string> {
  // TODO: Publish Nostr event via CentralEventPublishingService
  console.warn("publishNostrEvent not yet implemented");
  return "";
}

export async function createTaskRecord(task: any): Promise<string> {
  // TODO: Create task record in database
  console.warn("createTaskRecord not yet implemented");
  return "";
}

export async function addContact(contact: any): Promise<string> {
  // TODO: Add contact to user's contact list
  console.warn("addContact not yet implemented");
  return "";
}

export async function sendEncryptedDM(
  recipientNpub: string,
  content: string,
): Promise<string> {
  // TODO: Send encrypted DM via NIP-04 or NIP-17
  console.warn("sendEncryptedDM not yet implemented");
  return "";
}

export async function emitEvent(
  eventType: string,
  payload: any,
): Promise<void> {
  // TODO: Emit platform event for downstream processing
  console.warn("emitEvent not yet implemented");
}

export async function generateCashuPubkey(agentId: string): Promise<string> {
  // TODO: Generate Cashu pubkey for agent
  console.warn("generateCashuPubkey not yet implemented");
  return "";
}

export async function publishAgentCreationEvent(
  agentNpub: string,
  agentMetadata: any,
): Promise<string> {
  // TODO: Publish agent creation event to Nostr
  console.warn("publishAgentCreationEvent not yet implemented");
  return "";
}
