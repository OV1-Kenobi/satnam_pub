import { Buffer } from "node:buffer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequestClient } from "../supabase.js";
import { performNwcOperationOverNostr } from "../utils/nwc-client.js";
import {
  generateBIP321URI,
  parseBIP321URI,
} from "../utils/bip321-uri-generator.js";
import {
  coerceOptionalInteger,
  hashSafePreview,
  looksLikeBolt11,
  looksLikeCashuToken,
  normalizePrivacyPreference,
  normalizeRail,
  selectSpendRail,
  type PrivacyPreference,
  type SpendRail,
} from "./agent-wallet-helpers.js";
import {
  SatnamCashuWalletService,
  type CashuMintQuoteResult,
  type CashuTokenResult,
} from "./satnam-cashu-wallet-service.js";

interface AgentProfileRow {
  user_identity_id: string;
  is_agent: boolean;
  agent_username: string;
  unified_address: string;
  max_single_spend_sats: number | null;
  daily_limit_sats: number | null;
  requires_approval_above_sats: number | null;
  preferred_spend_rail: SpendRail | null;
  sweep_threshold_sats: number | null;
}

interface AgentPaymentConfigRow {
  agent_id: string;
  unified_address: string;
  lightning_enabled: boolean | null;
  cashu_enabled: boolean | null;
  cashu_mint_url: string | null;
  cashu_pubkey: string | null;
  preferred_protocol: SpendRail | null;
}

interface AgentNwcConnectionRow {
  id: string;
  nwc_connection_string_encrypted: string;
  wallet_endpoint: string | null;
  is_active: boolean | null;
}

interface AgentContext {
  agent: AgentProfileRow;
  paymentConfig: AgentPaymentConfigRow;
  nwcConnection: AgentNwcConnectionRow | null;
  autoProvisioned: boolean;
}

interface BalanceResponse {
  agent_id: string;
  unified_address: string;
  auto_provisioned: boolean;
  balance_sats: {
    total: number;
    lightning: number;
    cashu: number;
  };
  wallet_policy: {
    max_single_spend_sats: number;
    daily_limit_sats: number;
    requires_approval_above_sats: number;
    preferred_spend_rail: SpendRail;
  };
  rails: {
    lightning_enabled: boolean;
    cashu_enabled: boolean;
    preferred_protocol: SpendRail;
    cashu_mint_url: string | null;
    nwc_available: boolean;
  };
}

interface PaymentRequest {
  invoice?: string;
  payment_uri?: string;
  cashu_token?: string;
  rail?: SpendRail;
  privacy_preference?: PrivacyPreference;
  memo?: string;
  credit_envelope_id?: string;
  outcome_scope?: string;
}

interface SendRequest extends PaymentRequest {
  amount_sats?: number;
}

interface ReceiveRequest {
  amount_sats: number;
  rail?: SpendRail;
  memo?: string;
}

export class UnifiedWalletService {
  private readonly supabase: SupabaseClient;
  private readonly cashuService: SatnamCashuWalletService;

  constructor(private readonly authHeader: string) {
    this.supabase = getRequestClient(authHeader) as SupabaseClient;
    this.cashuService = new SatnamCashuWalletService(this.supabase);
  }

  async getBalance(agentId: string): Promise<BalanceResponse> {
    const context = await this.getAgentContext(agentId);
    const lightningBalance = await this.getLightningBalance(context);
    const cashuBalance = await this.cashuService.getBalance(agentId);
    return this.buildBalanceResponse(context, lightningBalance, cashuBalance);
  }

  async pay(agentId: string, request: PaymentRequest) {
    const context = await this.getAgentContext(agentId);
    if (request.cashu_token && looksLikeCashuToken(request.cashu_token)) {
      const tx = await this.recordTransaction(agentId, {
        direction: "in",
        kind: "cashu_receive",
        rail: "cashu",
        status: "pending",
        memo: request.memo,
      });

      try {
        const result = await this.cashuService.receiveToken(
          agentId,
          request.cashu_token,
          tx.id,
        );
        await this.completeTransaction(tx.id, {
          status: "completed",
          amount_sats: result.amountSats,
          reference: `cashu:${hashSafePreview(request.cashu_token)}`,
        });
        return {
          success: true,
          rail: "cashu",
          direction: "inbound",
          amount_sats: result.amountSats,
          mint_url: result.mintUrl,
          transaction_id: tx.id,
        };
      } catch (error) {
        await this.failTransaction(tx.id, error);
        throw error;
      }
    }

    return this.executeOutgoingPayment(agentId, context, request, false);
  }

  async send(agentId: string, request: SendRequest) {
    const context = await this.getAgentContext(agentId);
    return this.executeOutgoingPayment(agentId, context, request, true);
  }

  async receive(agentId: string, request: ReceiveRequest) {
    const context = await this.getAgentContext(agentId);
    const amountSats = Number(request.amount_sats ?? 0);
    if (!Number.isFinite(amountSats) || amountSats <= 0) {
      throw new Error("amount_sats must be a positive integer");
    }

    const rail = normalizeRail(request.rail);
    const memo =
      request.memo?.trim() || `Satnam agent receive ${amountSats} sats`;
    if (rail === "cashu") {
      const mintUrl = this.requireCashuMintUrl(context);
      const quote = await this.cashuService.createMintQuote(
        amountSats,
        mintUrl,
        memo,
      );
      const bip321 = generateBIP321URI({
        amount_sats: amountSats,
        label: context.agent.unified_address,
        message: memo,
        lightning_invoice: quote.quote.request,
      });

      return {
        success: true,
        rail: "cashu",
        amount_sats: amountSats,
        mint_url: quote.mintUrl,
        mint_quote: quote.quote.quote,
        funding_invoice: quote.quote.request,
        funding_state: quote.quote.state,
        payment_uri: bip321,
      };
    }

    const invoice = await this.makeLightningInvoice(context, amountSats, memo);
    return {
      success: true,
      rail: "lightning",
      amount_sats: amountSats,
      payment_request: invoice.payment_request,
      payment_hash: invoice.payment_hash,
      expires_at: invoice.expires_at,
      payment_uri: generateBIP321URI({
        amount_sats: amountSats,
        label: context.agent.unified_address,
        message: memo,
        lightning_invoice: invoice.payment_request,
      }),
    };
  }

  async getHistory(
    agentId: string,
    limitInput?: unknown,
    offsetInput?: unknown,
  ) {
    await this.getAgentContext(agentId);
    const limit = coerceOptionalInteger(limitInput, 20, 1, 100);
    const offset = coerceOptionalInteger(offsetInput, 0, 0, 10_000);
    const { data, error } = await this.supabase
      .from("agent_wallet_transactions")
      .select(
        "id, direction, kind, rail, status, amount_sats, fee_sats, memo, counterparty, reference, credit_envelope_id, created_at",
      )
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error)
      throw new Error(`Failed to load wallet history: ${error.message}`);
    return {
      success: true,
      transactions: data ?? [],
      limit,
      offset,
    };
  }

  private async executeOutgoingPayment(
    agentId: string,
    context: AgentContext,
    request: SendRequest,
    allowCashuTokenSend: boolean,
  ) {
    const parsedTarget = this.parsePaymentTarget(request);
    const amountSats = parsedTarget.amountSats ?? request.amount_sats ?? null;

    if (!amountSats || amountSats <= 0) {
      throw new Error("amount_sats is required for this payment request");
    }

    await this.enforceSpendPolicy(
      context,
      amountSats,
      request.credit_envelope_id,
      request.outcome_scope,
    );

    const cashuBalance = await this.cashuService.getBalance(agentId);
    const selectedRail = selectSpendRail({
      requestedRail: normalizeRail(request.rail),
      preferredRail:
        context.agent.preferred_spend_rail ??
        context.paymentConfig.preferred_protocol ??
        "auto",
      privacyPreference: normalizePrivacyPreference(request.privacy_preference),
      amountSats,
      hasLightningTarget: Boolean(parsedTarget.invoice),
      hasCashuCapability: Boolean(context.paymentConfig.cashu_enabled),
      cashuBalanceSats: cashuBalance,
    });

    const tx = await this.recordTransaction(agentId, {
      direction: "out",
      kind: allowCashuTokenSend ? "send" : "pay",
      rail: selectedRail,
      status: "pending",
      amount_sats: amountSats,
      memo: request.memo,
      counterparty: parsedTarget.counterparty,
      credit_envelope_id: request.credit_envelope_id,
    });

    try {
      if (
        selectedRail === "cashu" &&
        !parsedTarget.invoice &&
        allowCashuTokenSend
      ) {
        const token = await this.cashuService.createToken(
          agentId,
          amountSats,
          this.requireCashuMintUrl(context),
          request.memo,
          tx.id,
        );
        await this.completeTransaction(tx.id, {
          status: "completed",
          amount_sats: token.amountSats,
          reference: `cashu:${token.mintUrl}`,
        });
        await this.bumpCreditEnvelope(request.credit_envelope_id, amountSats);
        return {
          success: true,
          rail: "cashu",
          amount_sats: token.amountSats,
          mint_url: token.mintUrl,
          cashu_token: token.cashuToken,
          transaction_id: tx.id,
        };
      }

      if (selectedRail === "cashu" && parsedTarget.invoice) {
        const result = await this.cashuService.payLightningInvoice(
          agentId,
          parsedTarget.invoice,
          this.requireCashuMintUrl(context),
          tx.id,
        );
        await this.completeTransaction(tx.id, {
          status: "completed",
          amount_sats: result.amountSats,
          fee_sats: result.feeSats,
          reference: parsedTarget.reference,
        });
        await this.bumpCreditEnvelope(
          request.credit_envelope_id,
          result.amountSats + result.feeSats,
        );
        return {
          success: true,
          rail: "cashu",
          amount_sats: result.amountSats,
          fee_sats: result.feeSats,
          transaction_id: tx.id,
          settled_invoice: hashSafePreview(parsedTarget.invoice),
        };
      }

      if (!parsedTarget.invoice) {
        throw new Error(
          "A Lightning invoice or payment_uri is required for this send request",
        );
      }

      const lightningResult = await this.payLightningInvoice(
        context,
        parsedTarget.invoice,
      );
      await this.completeTransaction(tx.id, {
        status: "completed",
        amount_sats: Number(lightningResult.amount ?? amountSats),
        fee_sats: Number(lightningResult.fee ?? 0),
        reference: parsedTarget.reference,
      });
      await this.bumpCreditEnvelope(
        request.credit_envelope_id,
        Number(lightningResult.amount ?? amountSats) +
          Number(lightningResult.fee ?? 0),
      );
      return {
        success: true,
        rail: "lightning",
        amount_sats: Number(lightningResult.amount ?? amountSats),
        fee_sats: Number(lightningResult.fee ?? 0),
        payment_hash: lightningResult.payment_hash,
        transaction_id: tx.id,
      };
    } catch (error) {
      await this.failTransaction(tx.id, error);
      throw error;
    }
  }

  private async getAgentContext(agentId: string): Promise<AgentContext> {
    const { data: agent, error: agentError } = await this.supabase
      .from("agent_profiles")
      .select(
        "user_identity_id, is_agent, agent_username, unified_address, max_single_spend_sats, daily_limit_sats, requires_approval_above_sats, preferred_spend_rail, sweep_threshold_sats",
      )
      .eq("user_identity_id", agentId)
      .single();

    if (agentError || !agent)
      throw new Error("Authenticated wallet owner is not an agent");
    if (!agent.is_agent)
      throw new Error("Authenticated wallet owner is not an agent");

    let autoProvisioned = false;
    let paymentConfig = await this.loadPaymentConfig(agentId);
    if (!paymentConfig) {
      paymentConfig = await this.provisionPaymentConfig(
        agent as AgentProfileRow,
      );
      autoProvisioned = true;
    }

    let nwcConnection = await this.loadNwcConnection(agentId);
    if (!nwcConnection && paymentConfig.lightning_enabled) {
      nwcConnection = await this.provisionNwcConnection(agentId);
      autoProvisioned = autoProvisioned || Boolean(nwcConnection);
    }

    return {
      agent: agent as AgentProfileRow,
      paymentConfig,
      nwcConnection,
      autoProvisioned,
    };
  }

  private async loadPaymentConfig(
    agentId: string,
  ): Promise<AgentPaymentConfigRow | null> {
    const { data, error } = await this.supabase
      .from("agent_payment_config")
      .select(
        "agent_id, unified_address, lightning_enabled, cashu_enabled, cashu_mint_url, cashu_pubkey, preferred_protocol",
      )
      .eq("agent_id", agentId)
      .maybeSingle();
    if (error)
      throw new Error(`Failed to load payment config: ${error.message}`);
    return (data as AgentPaymentConfigRow | null) ?? null;
  }

  private async provisionPaymentConfig(
    agent: AgentProfileRow,
  ): Promise<AgentPaymentConfigRow> {
    const row = {
      agent_id: agent.user_identity_id,
      unified_address: agent.unified_address,
      lightning_enabled: true,
      cashu_enabled: true,
      cashu_mint_url: process.env.CASHU_MINT_URL ?? null,
      cashu_pubkey: await this.generateCashuPubkey(agent.user_identity_id),
      preferred_protocol: normalizeRail(agent.preferred_spend_rail),
    };
    const { data, error } = await this.supabase
      .from("agent_payment_config")
      .upsert(row, { onConflict: "agent_id" })
      .select(
        "agent_id, unified_address, lightning_enabled, cashu_enabled, cashu_mint_url, cashu_pubkey, preferred_protocol",
      )
      .single();

    if (error)
      throw new Error(
        `Failed to auto-provision payment config: ${error.message}`,
      );
    return data as AgentPaymentConfigRow;
  }

  private async loadNwcConnection(
    agentId: string,
  ): Promise<AgentNwcConnectionRow | null> {
    const { data, error } = await this.supabase
      .from("agent_nwc_connections")
      .select("id, nwc_connection_string_encrypted, wallet_endpoint, is_active")
      .eq("agent_id", agentId)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw new Error(`Failed to load NWC config: ${error.message}`);
    return (data as AgentNwcConnectionRow | null) ?? null;
  }

  private async provisionNwcConnection(
    agentId: string,
  ): Promise<AgentNwcConnectionRow | null> {
    const lnbitsUrl = process.env.LNBITS_URL;
    const lnbitsAdminKey = process.env.LNBITS_ADMIN_KEY;
    if (!lnbitsUrl || !lnbitsAdminKey) return null;

    const response = await fetch(`${lnbitsUrl}/api/v1/nwc/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": lnbitsAdminKey,
      },
      body: JSON.stringify({
        user_id: agentId,
        max_amount_sats: 50_000,
        allowed_methods: [
          "pay_invoice",
          "make_invoice",
          "get_balance",
          "list_transactions",
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(
        `NWC auto-provision failed: ${response.status} ${response.statusText}`,
      );
    }

    const payload = (await response.json()) as { connection_string?: string };
    if (!payload.connection_string) {
      throw new Error("NWC auto-provision failed: missing connection_string");
    }

    const encrypted = await this.encryptString(payload.connection_string);
    const { data, error } = await this.supabase
      .from("agent_nwc_connections")
      .upsert(
        {
          agent_id: agentId,
          nwc_connection_string_encrypted: encrypted,
          max_spend_per_hour_sats: 10_000,
          max_spend_per_day_sats: 100_000,
          allowed_operations: [
            "pay_invoice",
            "make_invoice",
            "get_balance",
            "list_transactions",
          ],
          wallet_type: "lnbits",
          wallet_endpoint: lnbitsUrl,
          is_active: true,
        },
        { onConflict: "agent_id" },
      )
      .select("id, nwc_connection_string_encrypted, wallet_endpoint, is_active")
      .single();

    if (error)
      throw new Error(`Failed to store NWC connection: ${error.message}`);
    return data as AgentNwcConnectionRow;
  }

  private async getLightningBalance(context: AgentContext): Promise<number> {
    if (!context.paymentConfig.lightning_enabled || !context.nwcConnection)
      return 0;
    const connection = await this.parseNwcConnectionString(
      context.nwcConnection.nwc_connection_string_encrypted,
    );
    const result = (await performNwcOperationOverNostr({
      method: "get_balance",
      params: {},
      connection,
      timeoutMs: 20_000,
    })) as { balance?: number };
    return Number(result.balance ?? 0);
  }

  private async makeLightningInvoice(
    context: AgentContext,
    amountSats: number,
    description: string,
  ) {
    if (!context.nwcConnection) {
      throw new Error("Lightning is not provisioned for this agent wallet");
    }
    const connection = await this.parseNwcConnectionString(
      context.nwcConnection.nwc_connection_string_encrypted,
    );
    return (await performNwcOperationOverNostr({
      method: "make_invoice",
      params: { amount: amountSats, description },
      connection,
      timeoutMs: 30_000,
    })) as {
      payment_request: string;
      payment_hash: string;
      expires_at: string | null;
    };
  }

  private async payLightningInvoice(context: AgentContext, invoice: string) {
    if (!context.nwcConnection) {
      throw new Error("Lightning is not provisioned for this agent wallet");
    }
    const connection = await this.parseNwcConnectionString(
      context.nwcConnection.nwc_connection_string_encrypted,
    );
    return (await performNwcOperationOverNostr({
      method: "pay_invoice",
      params: { invoice },
      connection,
      timeoutMs: 45_000,
    })) as {
      amount?: number;
      fee?: number;
      payment_hash?: string;
    };
  }

  private buildBalanceResponse(
    context: AgentContext,
    lightningBalance: number,
    cashuBalance: number,
  ): BalanceResponse {
    return {
      agent_id: context.agent.user_identity_id,
      unified_address: context.agent.unified_address,
      auto_provisioned: context.autoProvisioned,
      balance_sats: {
        total: lightningBalance + cashuBalance,
        lightning: lightningBalance,
        cashu: cashuBalance,
      },
      wallet_policy: {
        max_single_spend_sats: context.agent.max_single_spend_sats ?? 1_000,
        daily_limit_sats: context.agent.daily_limit_sats ?? 100_000,
        requires_approval_above_sats:
          context.agent.requires_approval_above_sats ?? 10_000,
        preferred_spend_rail:
          context.agent.preferred_spend_rail ??
          context.paymentConfig.preferred_protocol ??
          "auto",
      },
      rails: {
        lightning_enabled: Boolean(context.paymentConfig.lightning_enabled),
        cashu_enabled: Boolean(context.paymentConfig.cashu_enabled),
        preferred_protocol: context.paymentConfig.preferred_protocol ?? "auto",
        cashu_mint_url: context.paymentConfig.cashu_mint_url,
        nwc_available: Boolean(context.nwcConnection),
      },
    };
  }

  private parsePaymentTarget(request: SendRequest): {
    invoice?: string;
    amountSats?: number;
    reference?: string;
    counterparty?: string;
  } {
    if (request.invoice && looksLikeBolt11(request.invoice)) {
      return {
        invoice: request.invoice,
        amountSats: request.amount_sats,
        reference: `invoice:${hashSafePreview(request.invoice)}`,
      };
    }

    if (request.payment_uri) {
      const parsed = parseBIP321URI(request.payment_uri);
      if (parsed.lightning_invoice) {
        return {
          invoice: parsed.lightning_invoice,
          amountSats: parsed.amount_sats ?? request.amount_sats,
          reference: `bip321:${hashSafePreview(request.payment_uri)}`,
          counterparty: parsed.label,
        };
      }
    }

    return {
      amountSats: request.amount_sats,
      reference: request.payment_uri
        ? `uri:${hashSafePreview(request.payment_uri)}`
        : undefined,
    };
  }

  private async enforceSpendPolicy(
    context: AgentContext,
    amountSats: number,
    creditEnvelopeId?: string,
    outcomeScope?: string,
  ): Promise<void> {
    const maxSingleSpend = context.agent.max_single_spend_sats ?? 1_000;
    const dailyLimit = context.agent.daily_limit_sats ?? 100_000;
    const approvalThreshold =
      context.agent.requires_approval_above_sats ?? 10_000;

    if (amountSats > maxSingleSpend) {
      throw new Error(
        `Amount exceeds max_single_spend_sats (${maxSingleSpend})`,
      );
    }

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { data, error } = await this.supabase
      .from("agent_wallet_transactions")
      .select("amount_sats, fee_sats")
      .eq("status", "completed")
      .eq("direction", "out")
      .eq("agent_id", context.agent.user_identity_id)
      .gte("created_at", todayStart.toISOString());

    if (error)
      throw new Error(
        `Failed to evaluate daily wallet limit: ${error.message}`,
      );

    const spentToday = (data ?? []).reduce(
      (sum, row) =>
        sum + Number(row.amount_sats ?? 0) + Number(row.fee_sats ?? 0),
      0,
    );

    if (spentToday + amountSats > dailyLimit) {
      throw new Error(`Amount exceeds daily_limit_sats (${dailyLimit})`);
    }

    if (amountSats > approvalThreshold && !creditEnvelopeId) {
      throw new Error(
        `Amount exceeds requires_approval_above_sats (${approvalThreshold}); provide credit_envelope_id`,
      );
    }

    if (!creditEnvelopeId) return;

    const { data: envelope, error: envelopeError } = await this.supabase
      .from("credit_envelopes")
      .select(
        "id, scope, status, expires_at, max_amount_sats, actual_spent_sats",
      )
      .eq("id", creditEnvelopeId)
      .eq("agent_id", context.agent.user_identity_id)
      .single();

    if (envelopeError || !envelope) {
      throw new Error("credit_envelope_id not found for this agent");
    }

    if (
      !["pending", "approved", "active"].includes(String(envelope.status ?? ""))
    ) {
      throw new Error("credit_envelope_id is not in a spendable state");
    }

    if (envelope.expires_at && new Date(envelope.expires_at) < new Date()) {
      throw new Error("credit_envelope_id is expired");
    }

    if (outcomeScope && envelope.scope !== outcomeScope) {
      throw new Error("credit_envelope scope does not match outcome_scope");
    }

    const nextSpend = Number(envelope.actual_spent_sats ?? 0) + amountSats;
    if (nextSpend > Number(envelope.max_amount_sats ?? 0)) {
      throw new Error(
        "credit_envelope remaining balance is insufficient for this spend",
      );
    }
  }

  private async bumpCreditEnvelope(
    creditEnvelopeId: string | undefined,
    spendSats: number,
  ): Promise<void> {
    if (!creditEnvelopeId) return;
    const { data, error } = await this.supabase
      .from("credit_envelopes")
      .select("actual_spent_sats")
      .eq("id", creditEnvelopeId)
      .single();

    if (error || !data) return;
    await this.supabase
      .from("credit_envelopes")
      .update({
        actual_spent_sats: Number(data.actual_spent_sats ?? 0) + spendSats,
      })
      .eq("id", creditEnvelopeId);
  }

  private requireCashuMintUrl(context: AgentContext): string {
    const mintUrl =
      context.paymentConfig.cashu_mint_url ?? process.env.CASHU_MINT_URL;
    if (!mintUrl)
      throw new Error("Cashu mint URL is not configured for this agent wallet");
    return mintUrl;
  }

  private async recordTransaction(
    agentId: string,
    row: Record<string, unknown>,
  ): Promise<{ id: string }> {
    const { data, error } = await this.supabase
      .from("agent_wallet_transactions")
      .insert({ agent_id: agentId, ...row })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(
        `Failed to record wallet transaction: ${error?.message ?? "unknown error"}`,
      );
    }
    return data as { id: string };
  }

  private async completeTransaction(
    transactionId: string,
    fields: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await this.supabase
      .from("agent_wallet_transactions")
      .update(fields)
      .eq("id", transactionId);
    if (error)
      throw new Error(
        `Failed to finalize wallet transaction: ${error.message}`,
      );
  }

  private async failTransaction(
    transactionId: string,
    error: unknown,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : "Unknown error";
    await this.supabase
      .from("agent_wallet_transactions")
      .update({ status: "failed", failure_reason: message })
      .eq("id", transactionId);
  }

  private async parseNwcConnectionString(value: string) {
    const decrypted = await this.decryptStringIfNeeded(value);
    if (decrypted === "FAILED_TO_CREATE") {
      throw new Error("NWC provisioning previously failed for this wallet");
    }
    const normalized = decrypted.replace("nostr+walletconnect://", "https://");
    const parsed = new URL(normalized);
    return {
      pubkey: parsed.username,
      relay: parsed.searchParams.get("relay") ?? "",
      secret: parsed.searchParams.get("secret") ?? "",
    };
  }

  private async decryptStringIfNeeded(value: string): Promise<string> {
    try {
      const parsed = JSON.parse(value) as {
        v?: number;
        iv?: string;
        data?: string;
      };
      if (!parsed.iv || !parsed.data) return value;
      const key = await this.getEncryptionKey();
      if (!key) return value;
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        key,
        { name: "AES-GCM" },
        false,
        ["decrypt"],
      );
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: Buffer.from(parsed.iv, "base64") },
        cryptoKey,
        Buffer.from(parsed.data, "base64"),
      );
      return Buffer.from(decrypted).toString("utf8");
    } catch {
      return value;
    }
  }

  private async encryptString(value: string): Promise<string> {
    const key = await this.getEncryptionKey();
    if (!key) return value;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      key,
      { name: "AES-GCM" },
      false,
      ["encrypt"],
    );
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      new TextEncoder().encode(value),
    );
    return JSON.stringify({
      v: 1,
      iv: Buffer.from(iv).toString("base64"),
      data: Buffer.from(encrypted).toString("base64"),
    });
  }

  private async getEncryptionKey(): Promise<ArrayBuffer | null> {
    const secret =
      process.env.AGENT_WALLET_SECRET ??
      process.env.JWT_SECRET ??
      process.env.DUID_SERVER_SECRET ??
      null;
    if (!secret) return null;
    return await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(secret),
    );
  }

  private async generateCashuPubkey(agentId: string): Promise<string> {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`cashu:${agentId}`),
    );
    return Buffer.from(digest).toString("hex");
  }
}
