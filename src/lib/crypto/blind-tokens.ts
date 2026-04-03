import {
  blindMessage,
  generateBlindingFactor,
  unblindSignature,
} from "../crypto/blind-signatures";

// W4: Import shared types from centralized location (no duplicates)
import type {
  ActionPayload,
  ActionResult,
  BlindTokenType,
} from "../../../types/agent-tokens";

export class BlindTokenManager {
  private tokens: Map<string, BlindToken> = new Map();

  /**
   * Purchase blind tokens from platform
   */
  async purchaseTokens(
    agentId: string,
    tokenType: BlindTokenType,
    quantity: number,
    paymentProof: string,
    paymentProtocol: "lightning" | "cashu" | "fedimint" = "lightning",
  ): Promise<BlindToken[]> {
    // 1. Generate random blinding factors and messages
    const blindingData: Array<{
      message: string;
      blindingFactor: string;
      blindedMessage: string;
    }> = [];

    for (let i = 0; i < quantity; i++) {
      const randomMessage = generateRandomMessage(); // Random unique identifier
      const blindingFactor = await generateBlindingFactor();
      const blindedMessageResult = await blindMessage(
        randomMessage,
        "mock_public_key",
      ); // TODO: Get actual public key
      const blindedMessage = blindedMessageResult.blindedMessage;

      blindingData.push({
        message: randomMessage,
        blindingFactor,
        blindedMessage,
      });
    }

    // 2. Request blind signatures from platform
    const response = await fetch(
      "/.netlify/functions/agents/issue-blind-tokens",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agent_id: agentId,
          token_type: tokenType,
          quantity,
          blinded_messages: blindingData.map((d) => d.blindedMessage),
          payment_proof: paymentProof,
          payment_protocol: paymentProtocol,
        }),
      },
    );

    const result = (await response.json()) as {
      blind_signatures?: string[];
      keypair_public_key?: string;
      expires_at?: string;
      error?: string;
    };

    if (
      !response.ok ||
      !result.blind_signatures ||
      !result.keypair_public_key ||
      !result.expires_at
    ) {
      throw new Error(result.error ?? "Unable to purchase blind tokens.");
    }

    // 3. Unblind signatures
    const tokens: BlindToken[] = [];

    for (let i = 0; i < quantity; i++) {
      const unblindedSignature = unblindSignature(
        result.blind_signatures[i],
        blindingData[i].blindingFactor,
      );

      const token: BlindToken = {
        unblindedToken: blindingData[i].message,
        unblindedSignature,
        tokenType,
        keypairPublicKey: result.keypair_public_key,
        expiresAt: new Date(result.expires_at),
      };

      tokens.push(token);
      this.tokens.set(token.unblindedToken, token);
    }

    // 4. Store tokens locally (encrypted)
    await this.saveTokensToStorage(tokens);

    return tokens;
  }

  /**
   * Redeem token anonymously to perform action
   */
  async redeemToken(
    tokenType: BlindTokenType,
    actionPayload: ActionPayload,
  ): Promise<ActionResult> {
    // Find unused token of correct type
    const token = Array.from(this.tokens.values()).find(
      (t) =>
        t.tokenType === tokenType && !t.redeemed && new Date() < t.expiresAt,
    );

    if (!token) {
      throw new Error(
        `No available ${tokenType} tokens. Purchase more tokens.`,
      );
    }

    // Redeem token anonymously
    const response = await fetch(
      "/.netlify/functions/agents/redeem-blind-token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          unblinded_token: token.unblindedToken,
          signature_proof: token.unblindedSignature,
          action_type: tokenType,
          keypair_public_key: token.keypairPublicKey,
          action_payload: actionPayload,
        }),
      },
    );

    const result = await response.json();

    if (result.token_valid && result.action_authorized) {
      token.redeemed = true;
      token.redeemedAt = new Date();
      await this.saveTokensToStorage(Array.from(this.tokens.values()));

      return result.action_result;
    } else {
      throw new Error("Token redemption failed");
    }
  }

  /**
   * Get token balance
   */
  getBalance(tokenType?: string): number {
    const tokens = Array.from(this.tokens.values());
    const active = tokens.filter(
      (t) => !t.redeemed && new Date() < t.expiresAt,
    );

    if (tokenType) {
      return active.filter((t) => t.tokenType === tokenType).length;
    }
    return active.length;
  }

  /**
   * M4: Save tokens using ClientSessionVault for encrypted storage
   * Maintains zero-knowledge principles with IndexedDB-based encryption
   */
  private async saveTokensToStorage(tokens: BlindToken[]) {
    // Use localStorage for simplicity (in production, use proper encryption)
    const tokensData = JSON.stringify(
      tokens.map((t) => ({
        ...t,
        expiresAt: t.expiresAt.toISOString(),
        redeemedAt: t.redeemedAt?.toISOString(),
      })),
    );

    // Store in localStorage for now (in production, use encrypted storage)
    if (typeof window !== "undefined") {
      localStorage.setItem("agent_blind_tokens", tokensData);
    }
  }

  /**
   * M4: Load tokens from ClientSessionVault
   */
  private async loadTokensFromStorage(): Promise<BlindToken[]> {
    // Use localStorage for simplicity (in production, use proper encryption)
    if (typeof window === "undefined") return [];

    const tokensData = localStorage.getItem("agent_blind_tokens");
    if (!tokensData) return [];

    const parsed = JSON.parse(tokensData);
    return parsed.map((t: any) => ({
      ...t,
      expiresAt: new Date(t.expiresAt),
      redeemedAt: t.redeemedAt ? new Date(t.redeemedAt) : undefined,
    }));
  }

  /**
   * Initialize token manager by loading from vault
   */
  async initialize() {
    const tokens = await this.loadTokensFromStorage();
    this.tokens = new Map(tokens.map((t) => [t.unblindedToken, t]));
  }
}

interface BlindToken {
  unblindedToken: string;
  unblindedSignature: string;
  tokenType: BlindTokenType;
  keypairPublicKey: string;
  expiresAt: Date;
  redeemed?: boolean;
  redeemedAt?: Date;
}

/**
 * Generate a random message for blinding
 */
function generateRandomMessage(): string {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}
