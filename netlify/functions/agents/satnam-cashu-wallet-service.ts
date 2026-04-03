import { Buffer } from "node:buffer";
import {
  CashuMint,
  CashuWallet,
  getDecodedToken,
  getEncodedToken,
  type MeltTokensResponse,
  type MintQuoteResponse,
  type Proof,
  type Token,
  type TokenEntry,
} from "@cashu/cashu-ts";
import type { SupabaseClient } from "@supabase/supabase-js";

interface StoredProofRow {
  id: string;
  mint_url: string;
  amount_sats: number;
  proof_json: Proof;
  secret_hash: string;
}

export interface CashuTokenResult {
  amountSats: number;
  mintUrl: string;
  cashuToken: string;
}

export interface CashuMintQuoteResult {
  mintUrl: string;
  quote: MintQuoteResponse;
}

export interface CashuLightningPaymentResult {
  amountSats: number;
  feeSats: number;
  mintUrl: string;
  preimage?: string | null;
}

export class SatnamCashuWalletService {
  constructor(private readonly supabase: SupabaseClient) {}

  async getBalance(agentId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from("agent_cashu_proofs")
      .select("amount_sats")
      .eq("agent_id", agentId)
      .eq("state", "active");

    if (error) throw new Error(`Failed to load Cashu balance: ${error.message}`);
    return (data ?? []).reduce((sum, row) => sum + Number(row.amount_sats ?? 0), 0);
  }

  async receiveToken(
    agentId: string,
    encodedToken: string,
    sourceTransactionId?: string,
  ): Promise<{ amountSats: number; mintUrl: string }> {
    const decoded = getDecodedToken(encodedToken);
    const proofsToPersist: Array<{ mintUrl: string; proofs: Proof[] }> = [];
    let totalAmount = 0;
    let lastMintUrl = "";

    for (const entry of decoded.token) {
      const wallet = this.createWallet(entry.mint);
      const proofs = await wallet.receiveTokenEntry(entry as TokenEntry);
      totalAmount += proofs.reduce((sum, proof) => sum + Number(proof.amount ?? 0), 0);
      lastMintUrl = entry.mint;
      proofsToPersist.push({ mintUrl: entry.mint, proofs });
    }

    for (const item of proofsToPersist) {
      await this.persistProofs(agentId, item.mintUrl, item.proofs, sourceTransactionId);
    }

    return { amountSats: totalAmount, mintUrl: lastMintUrl };
  }

  async createToken(
    agentId: string,
    amountSats: number,
    mintUrl: string,
    memo?: string,
    sourceTransactionId?: string,
  ): Promise<CashuTokenResult> {
    const wallet = this.createWallet(mintUrl);
    const activeProofs = await this.getActiveProofRows(agentId, mintUrl);
    const proofs = activeProofs.map((row) => row.proof_json);

    if (this.sumProofs(proofs) < amountSats) {
      throw new Error("Insufficient Cashu balance for requested token");
    }

    const sendResponse = await wallet.send(amountSats, proofs);
    await this.markProofsSpent(activeProofs);
    await this.persistProofs(
      agentId,
      mintUrl,
      sendResponse.returnChange,
      sourceTransactionId,
    );

    const token: Token = {
      memo,
      token: [{ mint: mintUrl, proofs: sendResponse.send }],
    };

    return {
      amountSats,
      mintUrl,
      cashuToken: getEncodedToken(token),
    };
  }

  async createMintQuote(
    amountSats: number,
    mintUrl: string,
    description?: string,
  ): Promise<CashuMintQuoteResult> {
    const wallet = this.createWallet(mintUrl);
    const quote = await wallet.createMintQuote(amountSats, description);
    return { mintUrl, quote };
  }

  async payLightningInvoice(
    agentId: string,
    invoice: string,
    mintUrl: string,
    sourceTransactionId?: string,
  ): Promise<CashuLightningPaymentResult> {
    const wallet = this.createWallet(mintUrl);
    const meltQuote = await wallet.createMeltQuote(invoice);
    const activeProofs = await this.getActiveProofRows(agentId, mintUrl);
    const proofs = activeProofs.map((row) => row.proof_json);
    const totalRequired = Number(meltQuote.amount ?? 0) + Number(meltQuote.fee_reserve ?? 0);

    if (this.sumProofs(proofs) < totalRequired) {
      throw new Error("Insufficient Cashu balance to pay Lightning invoice");
    }

    const split = await wallet.send(totalRequired, proofs);
    await this.markProofsSpent(activeProofs);
    await this.persistProofs(
      agentId,
      mintUrl,
      split.returnChange,
      sourceTransactionId,
    );

    const meltResult = (await wallet.payLnInvoice(
      invoice,
      split.send,
      meltQuote,
    )) as MeltTokensResponse;

    await this.persistProofs(
      agentId,
      mintUrl,
      meltResult.change ?? [],
      sourceTransactionId,
    );

    return {
      amountSats: Number(meltQuote.amount ?? 0),
      feeSats: Number(meltQuote.fee_reserve ?? 0),
      mintUrl,
      preimage:
        typeof meltResult.preimage === "string" ? meltResult.preimage : null,
    };
  }

  private createWallet(mintUrl: string): CashuWallet {
    return new CashuWallet(new CashuMint(mintUrl));
  }

  private async getActiveProofRows(
    agentId: string,
    mintUrl: string,
  ): Promise<StoredProofRow[]> {
    const { data, error } = await this.supabase
      .from("agent_cashu_proofs")
      .select("id, mint_url, amount_sats, proof_json, secret_hash")
      .eq("agent_id", agentId)
      .eq("mint_url", mintUrl)
      .eq("state", "active")
      .order("created_at", { ascending: true });

    if (error) throw new Error(`Failed to load Cashu proofs: ${error.message}`);
    return (data ?? []) as StoredProofRow[];
  }

  private async persistProofs(
    agentId: string,
    mintUrl: string,
    proofs: Proof[],
    sourceTransactionId?: string,
  ): Promise<void> {
    if (proofs.length === 0) return;

    const rows = await Promise.all(
      proofs.map(async (proof) => ({
        agent_id: agentId,
        mint_url: mintUrl,
        amount_sats: Number(proof.amount ?? 0),
        secret_hash: await this.sha256Hex(String(proof.secret ?? "")),
        proof_json: proof,
        source_transaction_id: sourceTransactionId ?? null,
        state: "active",
      })),
    );

    const { error } = await this.supabase
      .from("agent_cashu_proofs")
      .upsert(rows, { onConflict: "secret_hash" });

    if (error) throw new Error(`Failed to persist Cashu proofs: ${error.message}`);
  }

  private async markProofsSpent(proofRows: StoredProofRow[]): Promise<void> {
    if (proofRows.length === 0) return;
    const ids = proofRows.map((row) => row.id);
    const { error } = await this.supabase
      .from("agent_cashu_proofs")
      .update({ state: "spent", spent_at: new Date().toISOString() })
      .in("id", ids);

    if (error) throw new Error(`Failed to mark Cashu proofs spent: ${error.message}`);
  }

  private sumProofs(proofs: Proof[]): number {
    return proofs.reduce((sum, proof) => sum + Number(proof.amount ?? 0), 0);
  }

  private async sha256Hex(value: string): Promise<string> {
    const encoded = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    return Buffer.from(digest).toString("hex");
  }
}
