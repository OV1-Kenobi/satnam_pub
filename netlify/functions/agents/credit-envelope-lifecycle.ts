// ARCHITECTURE: Netlify Function (ESM) — credit envelope lifecycle with Sig4Sats
import { CashuWallet } from "@cashu/cashu-ts";
import { verifyEvent, validateEvent } from "nostr-tools";
import type { UnsignedEvent, Event as NostrEvent } from "nostr-tools";
import { getRequestClient } from "../../functions_active/supabase";
import { createErrorResponse, generateRequestId } from "../utils/error-handler";
import type { HandlerEvent } from "@netlify/functions";
import { generateBIP321URI } from "../utils/bip321-uri-generator.js";

type ValidationTier = "self_report" | "peer_verified" | "oracle_attested";

interface CreditIntentRequest {
  agent_id: string;
  scope: string; // "l402:lunanode:compute:5min"
  requested_amount_sats: number;
  expires_in_seconds: number;

  // Bond details
  bond_amount_sats?: number;
  bond_payment_proof?: string;
  bond_payment_protocol?: "lightning" | "cashu" | "fedimint";

  // Validation preference
  preferred_validation_tier?: ValidationTier;

  // Sig4Sats: Cashu token locked to Nostr event signature
  sig4sats_token?: string;
  sig4sats_event_template?: UnsignedEvent; // Typed Nostr event template (replaces `any`)

  // Payment method for credit envelope request fee
  fee_payment_method?: "blind_token" | "direct_payment";
  fee_payment_proof?: string;
}

interface SettlementRequest {
  envelope_id: string;
  nostr_event: NostrEvent;
  success: boolean;
  validator_npub?: string;
  oracle_attestation_id?: string;
}

interface CreditIntentResponse {
  envelope_id?: string;
  status?: string;
  event_id?: string;
  bond_id?: string | null;
  sig4sats_lock_id?: string | null;
  fee_paid_anonymously?: boolean;
  error?: string;
  fee_sats?: number;
  payment_invoice?: string;
  max_allowed?: number;
  bond_required?: number;

  // BIP-321 unified payment URI fields
  payment_uri?: string; // BIP-321 formatted URI with all payment methods
  payment_methods_available?: string[]; // Array of available methods
  qr_code_url?: string | null; // QR code data URL (generated client-side)
}

interface SettlementResponse {
  status?: string;
  validation_tier?: ValidationTier;
  reputation_delta?: number;
  new_credit_limit?: number;
  bond_released?: boolean;
  bond_slashed_sats?: number;
  sig4sats_redeemed?: boolean;
  sig4sats_bonus_sats?: number;
  error?: string;
}

export const handler = async (event: HandlerEvent) => {
  const requestId = generateRequestId();
  const supabase = getRequestClient();

  try {
    const request = JSON.parse(event.body || "{}");

    // Route based on action type
    if (request.action === "credit_intent") {
      if (
        !request.agent_id ||
        !request.scope ||
        !request.requested_amount_sats
      ) {
        return {
          statusCode: 400,
          body: JSON.stringify(
            createErrorResponse(
              "Missing required fields: agent_id, scope, requested_amount_sats",
            ),
          ),
        };
      }
      const response = await handleCreditIntent(
        request as CreditIntentRequest,
        supabase,
      );
      return {
        statusCode: 200,
        body: JSON.stringify(response),
      };
    } else if (request.action === "settlement") {
      if (!request.envelope_id || !request.nostr_event) {
        return {
          statusCode: 400,
          body: JSON.stringify(
            createErrorResponse(
              "Missing required fields: envelope_id, nostr_event",
            ),
          ),
        };
      }
      const response = await handleSettlement(
        request as SettlementRequest,
        supabase,
      );
      return {
        statusCode: 200,
        body: JSON.stringify(response),
      };
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify(createErrorResponse("Invalid action type")),
      };
    }
  } catch (error) {
    console.error("Credit envelope lifecycle error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify(
        createErrorResponse("Internal server error", undefined, requestId),
      ),
    };
  }
};

// Credit intent processing with Sig4Sats integration
async function handleCreditIntent(
  request: CreditIntentRequest,
  supabase: any,
): Promise<CreditIntentResponse> {
  // 1. MONETIZATION: Charge credit envelope request fee (200 sats)
  let feeCharged = false;

  if (request.fee_payment_method === "blind_token") {
    // Agent using blind token for privacy
    const tokenRedemption = await fetch(
      `${process.env.VITE_API_BASE_URL}/agents/redeem-blind-token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unblinded_token: request.fee_payment_proof,
          action_type: "credit_envelope_request",
          action_payload: { scope: request.scope },
        }),
        signal: AbortSignal.timeout(10000),
      },
    );

    if (tokenRedemption.ok) {
      feeCharged = true;
    } else {
      const errorBody = await tokenRedemption.text().catch(() => "unknown");
      console.error(
        "Blind token redemption failed:",
        tokenRedemption.status,
        errorBody,
      );
      return { error: "Invalid blind token for credit envelope request" };
    }
  } else {
    // Direct payment
    const feeResponse = await fetch(
      `${process.env.VITE_API_BASE_URL}/platform/charge-fee`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: request.agent_id,
          action_type: "credit_envelope_request",
          payment_proof: request.fee_payment_proof,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );

    const feeResult = await feeResponse.json();

    if (!feeResult.fee_paid) {
      return {
        error: "Credit envelope request fee required",
        fee_sats: 200,
        payment_invoice: feeResult.payment_invoice,
      };
    }

    feeCharged = true;
  }

  if (!feeCharged) {
    return { error: "Fee payment required" };
  }

  // 2. Calculate agent's credit limit
  const agent = await getAgentWithReputation(request.agent_id, supabase);
  if (!agent) {
    return { error: "Agent not found" };
  }
  const creditLimit = calculateCreditLimit(agent);

  if (request.requested_amount_sats > creditLimit) {
    return {
      error: "Requested amount exceeds credit limit",
      max_allowed: creditLimit,
    };
  }

  // 3. Check bond requirement
  const { data: bondRequirement, error: bondError } = await supabase
    .from("bond_requirements")
    .select("required_amount_sats")
    .eq("account_type", agent.agent_role) // 'adult' | 'offspring' (Master Context compliant)
    .eq("operation", "credit_request")
    .single();

  if (bondError && bondError.code !== "PGRST116") {
    console.error("Bond requirement lookup failed:", bondError);
    return { error: "Failed to check bond requirements" };
  }

  let bondId: string | null = null;

  if (bondRequirement && bondRequirement.required_amount_sats > 0) {
    if (
      !request.bond_amount_sats ||
      request.bond_amount_sats < bondRequirement.required_amount_sats
    ) {
      return {
        error: `Bond required: ${bondRequirement.required_amount_sats} sats`,
        bond_required: bondRequirement.required_amount_sats,
      };
    }

    const bondValid = await verifyBondPayment(
      request.bond_payment_proof || "",
      request.bond_amount_sats,
      request.bond_payment_protocol || "lightning",
    );

    if (!bondValid) {
      return { error: "Invalid bond payment proof" };
    }

    const { data: bond, error: bondInsertError } = await supabase
      .from("performance_bonds")
      .insert({
        agent_id: request.agent_id,
        amount_sats: request.bond_amount_sats,
        bond_type: "credit_envelope",
        payment_type: request.bond_payment_protocol || "lightning",
        lightning_payment_hash:
          request.bond_payment_protocol === "lightning"
            ? request.bond_payment_proof
            : null,
        cashu_token:
          request.bond_payment_protocol === "cashu"
            ? request.bond_payment_proof
            : null,
        fedimint_txid:
          request.bond_payment_protocol === "fedimint"
            ? request.bond_payment_proof
            : null,
        escrow_holder: "satnam-platform",
        status: "active",
        release_conditions: { scope: request.scope, success_required: true },
      })
      .select()
      .single();

    if (bondInsertError || !bond) {
      console.error("Bond insert failed:", bondInsertError);
      return { error: "Failed to create performance bond" };
    }

    bondId = bond.id;
  }

  // 4. SIG4SATS: Validate Cashu token locked to Nostr signature
  let sig4satsTokenId: string | null = null;

  if (request.sig4sats_token) {
    // Parse and verify Cashu token
    let cashuToken;
    try {
      cashuToken = JSON.parse(request.sig4sats_token);
    } catch {
      return { error: "Invalid Sig4Sats token format (malformed JSON)" };
    }

    // Verify token is properly locked to event signature
    const wallet = new CashuWallet(cashuToken.mint);
    const proofValid = await wallet.receiveTokenEntry({
      proofs: cashuToken.proofs,
      mint: cashuToken.mint,
    });

    if (!proofValid) {
      return { error: "Invalid Sig4Sats Cashu token" };
    }

    // Store Sig4Sats lock details
    const { data: sig4satsLock } = await supabase
      .from("sig4sats_locks")
      .insert({
        cashu_token: request.sig4sats_token,
        cashu_mint_url: cashuToken.mint,
        locked_amount_sats: cashuToken.amount,
        event_template: request.sig4sats_event_template,
        agent_id: request.agent_id,
        status: "locked",
      })
      .select()
      .single();

    sig4satsTokenId = sig4satsLock.id;
  }

  // 5. Create pending envelope
  const envelope = await supabase
    .from("credit_envelopes")
    .insert({
      agent_id: request.agent_id,
      scope: request.scope,
      max_amount_sats: request.requested_amount_sats,
      expires_at: new Date(Date.now() + request.expires_in_seconds * 1000),
      status: "pending",
      bond_id: bondId,
      bond_required_sats: bondRequirement?.required_amount_sats || 0,
      sig4sats_lock_id: sig4satsTokenId,
    })
    .select()
    .single();

  // 6. Generate BIP-321 unified payment URI
  const paymentMethodsAvailable: string[] = [];

  // Generate Lightning invoice (placeholder - replace with actual invoice generation)
  const lightningInvoice = await generateLightningInvoice(
    request.requested_amount_sats,
    `Credit envelope ${envelope.data.id} for ${request.scope}`,
  );
  if (lightningInvoice) {
    paymentMethodsAvailable.push("lightning");
  }

  // Include Cashu token if provided via Sig4Sats
  const cashuToken = request.sig4sats_token || null;
  if (cashuToken) {
    paymentMethodsAvailable.push("cashu");
  }

  // Generate Fedimint address (placeholder - replace with actual address generation)
  const fedimintAddress = await generateFedimintAddress(
    request.requested_amount_sats,
    `Credit envelope ${envelope.data.id}`,
  );
  if (fedimintAddress) {
    paymentMethodsAvailable.push("fedimint");
  }

  // Generate BIP-321 URI with all available payment methods
  const bip321URI = generateBIP321URI({
    amount_sats: request.requested_amount_sats,
    label:
      agent.unified_address || `agent-${agent.npub?.slice(0, 8)}@ai.satnam.pub`,
    message: `Credit envelope for ${request.scope} - Agent ${agent.agent_username || agent.npub?.slice(0, 8)}`,
    lightning_invoice: lightningInvoice || undefined,
    cashu_token: cashuToken || undefined,
    fedimint_address: fedimintAddress || undefined,
    pop_callback_uri: `satnam://payment-proof?envelope_id=${envelope.data.id}`,
  });

  // Generate QR code for the BIP-321 URI (using browser-compatible QR generation)
  // Note: In Netlify Functions, we'll store the URI and generate QR on client-side
  // For now, we'll just store the URI and mark QR as pending client generation
  const qrCodeDataURL = null; // Client will generate using src/utils/qr-code-browser.ts

  // Update envelope with BIP-321 payment URI and metadata
  await supabase
    .from("credit_envelopes")
    .update({
      payment_uri: bip321URI,
      payment_qr_code: qrCodeDataURL,
      payment_methods_available: JSON.stringify(paymentMethodsAvailable),
    })
    .eq("id", envelope.data.id);

  // 7. Publish NIP-AC intent event
  const intentEvent = await publishNostrEvent({
    kind: 39240,
    content: JSON.stringify({
      scope: request.scope,
      amount: request.requested_amount_sats,
      expiry: envelope.data.expires_at,
      bond_staked: request.bond_amount_sats || 0,
      preferred_validation:
        request.preferred_validation_tier || "peer_verified",
      sig4sats_enabled: !!request.sig4sats_token,
    }),
    tags: [
      ["d", envelope.data.id],
      ["agent", agent.npub], // user_identities column (NOT deprecated nostr_pubkey)
      ["unified_address", agent.unified_address],
      ["scope", request.scope],
      ["validation_tier", request.preferred_validation_tier || "peer_verified"],
      ["ln_address", agent.unified_address], // Same address for all protocols
      request.sig4sats_token
        ? ["sig4sats", "enabled"]
        : ["sig4sats", "disabled"],
    ],
  });

  await supabase
    .from("credit_envelopes")
    .update({ intent_event_id: intentEvent.id })
    .eq("id", envelope.data.id);

  // 8. Queue OTS proof generation for credit envelope (kind 39240 intent event)
  // Non-blocking: proof generation failures do not block envelope creation
  try {
    await fetch(
      `${process.env.URL || "http://localhost:8888"}/.netlify/functions/ots-proof-generator`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attested_event_kind: 39240,
          attested_event_id: intentEvent.id,
          agent_pubkey: agent.npub,
          data: JSON.stringify(intentEvent),
          storage_backend: "supabase",
        }),
      },
    );
  } catch (error) {
    // Non-fatal: log error but don't block envelope creation
    console.warn(
      "OTS proof generation failed (non-fatal):",
      error instanceof Error ? error.message : "Unknown error",
    );
  }

  return {
    envelope_id: envelope.data.id,
    status: "pending",
    event_id: intentEvent.id,
    bond_id: bondId,
    sig4sats_lock_id: sig4satsTokenId,
    fee_paid_anonymously: request.fee_payment_method === "blind_token",

    // BIP-321 unified payment URI
    payment_uri: bip321URI,
    payment_methods_available: paymentMethodsAvailable,
    qr_code_url: qrCodeDataURL, // null - client will generate
  };
}

// Settlement with Sig4Sats redemption
async function handleSettlement(
  request: SettlementRequest,
  supabase: any,
): Promise<SettlementResponse> {
  const envelopeId =
    request.nostr_event.tags.find((t) => t[0] === "d")?.[1] || "";
  const success = request.success;

  // Extract validation tier
  const validationTierTag = request.nostr_event.tags.find(
    (t) => t[0] === "validation_tier",
  )?.[1];
  const validatorNpub =
    request.nostr_event.tags.find((t) => t[0] === "validator")?.[1] || "";
  const oracleAttestationId = request.nostr_event.tags.find(
    (t) => t[0] === "oracle_attestation",
  )?.[1];

  let validationTier: "self_report" | "peer_verified" | "oracle_attested" =
    "self_report";
  let validationWeight = 0.5;

  if (oracleAttestationId) {
    validationTier = "oracle_attested";
    validationWeight = 1.5;

    const oracleValid = await verifyTrustedOracle(validatorNpub);
    if (!oracleValid) {
      return { error: "Oracle not in trusted list" };
    }
  } else if (validatorNpub && validatorNpub !== request.nostr_event.pubkey) {
    validationTier = "peer_verified";
    validationWeight = 1.0;

    // Query agent_profiles via user_identities join (NOT deprecated profiles)
    const { data: validatorData } = await supabase
      .from("user_identities")
      .select("id, agent_profiles(reputation_score)")
      .eq("npub", validatorNpub)
      .single();

    const validatorReputation =
      validatorData?.agent_profiles?.reputation_score ?? 0;
    if (!validatorData || validatorReputation < 100) {
      return { error: "Validator reputation too low (min 100 required)" };
    }
  }

  // Join agent via user_identities + agent_profiles (NOT deprecated profiles)
  const envelope = await supabase
    .from("credit_envelopes")
    .select(
      "*, agent:user_identities(*, agent_profiles(*)), bond:performance_bonds(*), sig4sats_lock:sig4sats_locks(*)",
    )
    .eq("id", envelopeId)
    .single();

  if (!envelope) {
    return { error: "Envelope not found" };
  }

  // SIG4SATS: If settlement event includes valid signature, redeem Cashu token
  let sig4satsRedeemed = false;
  let sig4satsAmountSats = 0;

  if (envelope.data.sig4sats_lock) {
    const settlementEventSignature = request.nostr_event.sig;

    // Verify event signature matches template
    const eventValid =
      validateEvent(request.nostr_event) && verifyEvent(request.nostr_event);

    if (eventValid && success) {
      // Redeem locked Cashu token
      const cashuToken = JSON.parse(envelope.data.sig4sats_lock.cashu_token);

      try {
        const wallet = new CashuWallet(cashuToken.mint);
        const redemption = await wallet.receiveTokenEntry({
          proofs: cashuToken.proofs,
          mint: cashuToken.mint,
        });

        if (redemption && redemption.length > 0) {
          sig4satsRedeemed = true;
          sig4satsAmountSats = cashuToken.amount;

          // Update Sig4Sats lock status
          await supabase
            .from("sig4sats_locks")
            .update({
              status: "redeemed",
              redeemed_at: new Date(),
              settlement_event_id: request.nostr_event.id,
            })
            .eq("id", envelope.data.sig4sats_lock.id);

          // Credit agent with Sig4Sats redemption
          await supabase.from("agent_payment_receipts").insert({
            agent_id: envelope.data.agent_id,
            amount_sats: sig4satsAmountSats,
            payment_protocol: "cashu",
            cashu_token: envelope.data.sig4sats_lock.cashu_token,
            purpose: "sig4sats_settlement_bonus",
            related_envelope_id: envelopeId,
            verified: true,
            received_at: new Date(),
          });
        }
      } catch (error) {
        console.error("Sig4Sats redemption error:", error);
      }
    }
  }

  // Calculate weighted reputation delta
  const baseRepDelta = success
    ? Math.floor(envelope.data.actual_spent_sats / 1000)
    : -Math.floor(envelope.data.max_amount_sats / 500);

  // Sig4Sats bonus: +10% reputation if redeemed
  const sig4satsBonus = sig4satsRedeemed ? Math.floor(baseRepDelta * 0.1) : 0;

  const weightedRepDelta =
    Math.floor(baseRepDelta * validationWeight) + sig4satsBonus;

  // Handle performance bond
  if (envelope.data.bond) {
    if (success) {
      await supabase
        .from("performance_bonds")
        .update({ status: "released", released_at: new Date() })
        .eq("id", envelope.data.bond.id);
    } else {
      const slashPercentage = 0.5;
      const slashAmount = Math.floor(
        envelope.data.bond.amount_sats * slashPercentage,
      );

      await supabase
        .from("performance_bonds")
        .update({
          status: "slashed",
          slashed_at: new Date(),
          slashed_amount_sats: slashAmount,
          slashed_reason: request.nostr_event.content || "Settlement default",
        })
        .eq("id", envelope.data.bond.id);
    }
  }

  // Record settlement
  await supabase.from("agent_settlements").insert({
    envelope_id: envelopeId,
    agent_id: envelope.data.agent_id,
    provider_npub: envelope.data.provider_npub,
    amount_sats: envelope.data.actual_spent_sats,
    success,
    validation_tier: validationTier,
    validator_npub: validatorNpub,
    validation_weight: validationWeight,
    bond_released: success && envelope.data.bond != null,
    bond_slashed_sats: success
      ? 0
      : envelope.data.bond?.slashed_amount_sats || 0,
    reputation_delta: weightedRepDelta,
    default_reason: success ? null : request.nostr_event.content,
    sig4sats_redeemed: sig4satsRedeemed,
    sig4sats_amount_sats: sig4satsAmountSats,
  });

  // Update agent reputation in agent_profiles (NOT deprecated profiles)
  // envelope.data.agent is a user_identities row with nested agent_profiles
  const agentProfile = envelope.data.agent?.agent_profiles;
  const updates: any = success
    ? {
        reputation_score:
          (agentProfile?.reputation_score ?? 0) + weightedRepDelta,
        total_settled_sats:
          (agentProfile?.total_settled_sats ?? 0) +
          envelope.data.actual_spent_sats +
          sig4satsAmountSats,
        settlement_success_count:
          (agentProfile?.settlement_success_count ?? 0) + 1,
        total_tasks_completed: (agentProfile?.total_tasks_completed ?? 0) + 1,
      }
    : {
        reputation_score:
          (agentProfile?.reputation_score ?? 0) + weightedRepDelta,
        settlement_default_count:
          (agentProfile?.settlement_default_count ?? 0) + 1,
        total_tasks_failed: (agentProfile?.total_tasks_failed ?? 0) + 1,
      };

  // Increment validation tier counter
  if (validationTier === "self_report") {
    updates.tier1_validations = (agentProfile?.tier1_validations ?? 0) + 1;
  } else if (validationTier === "peer_verified") {
    updates.tier2_validations = (agentProfile?.tier2_validations ?? 0) + 1;
  } else if (validationTier === "oracle_attested") {
    updates.tier3_validations = (agentProfile?.tier3_validations ?? 0) + 1;
  }

  await supabase
    .from("agent_profiles")
    .update(updates)
    .eq("user_identity_id", envelope.data.agent_id);

  // Update envelope
  await supabase
    .from("credit_envelopes")
    .update({
      status: success ? "settled" : "defaulted",
      settlement_event_id: request.nostr_event.id,
      settled_at: new Date(),
      settlement_proof: request.nostr_event.content,
      validation_tier: validationTier,
      validator_npub: validatorNpub,
      oracle_attestation_id: oracleAttestationId,
      reputation_delta: weightedRepDelta,
      bond_released: success && envelope.data.bond != null,
      sig4sats_redeemed: sig4satsRedeemed,
      sig4sats_bonus_sats: sig4satsAmountSats,
    })
    .eq("id", envelopeId);

  // Recalculate credit limit
  const newCreditLimit = await recalculateCreditLimit(
    envelope.data.agent_id,
    supabase,
  );
  await supabase
    .from("agent_profiles")
    .update({ credit_limit_sats: newCreditLimit })
    .eq("user_identity_id", envelope.data.agent_id);

  // Publish attestation if peer/oracle validated
  if (validationTier !== "self_report") {
    await publishValidationAttestation({
      agentNpub: envelope.data.agent.npub, // user_identities column (NOT deprecated nostr_pubkey)
      envelopeId: envelopeId,
      validatorNpub: validatorNpub,
      validationTier: validationTier,
      success: success,
      sig4satsRedeemed: sig4satsRedeemed,
    });
  }

  return {
    status: success ? "settled" : "defaulted",
    validation_tier: validationTier,
    reputation_delta: weightedRepDelta,
    new_credit_limit: newCreditLimit,
    bond_released: success && envelope.data.bond != null,
    bond_slashed_sats: success
      ? 0
      : envelope.data.bond?.slashed_amount_sats || 0,
    sig4sats_redeemed: sig4satsRedeemed,
    sig4sats_bonus_sats: sig4satsAmountSats,
  };
}

// Helper functions
async function getAgentWithReputation(agentId: string, supabase: any) {
  const { data } = await supabase
    .from("user_identities")
    .select(
      `
      *,
      agent_profiles (
        reputation_score,
        credit_limit_sats,
        total_settled_sats,
        settlement_success_count,
        settlement_default_count,
        total_tasks_completed,
        total_tasks_failed,
        tier1_validations,
        tier2_validations,
        tier3_validations
      )
    `,
    )
    .eq("id", agentId)
    .single();

  return data;
}

function calculateCreditLimit(agent: any): number {
  const baseLimit = 10000; // 10k sats base
  const reputationBonus = (agent.agent_profiles?.reputation_score ?? 0) * 10;
  const successRateBonus =
    agent.agent_profiles?.settlement_success_count &&
    agent.agent_profiles?.settlement_default_count
      ? Math.floor(
          (agent.agent_profiles.settlement_success_count /
            (agent.agent_profiles.settlement_success_count +
              agent.agent_profiles.settlement_default_count)) *
            5000,
        )
      : 0;

  return baseLimit + reputationBonus + successRateBonus;
}

async function verifyBondPayment(
  paymentProof: string,
  amount: number,
  protocol: string,
): Promise<boolean> {
  // TODO: Implement actual bond verification based on protocol
  // For now, return true as placeholder
  return true;
}

async function verifyTrustedOracle(validatorNpub: string): Promise<boolean> {
  // TODO: Implement trusted oracle verification
  // For now, return true as placeholder
  return true;
}

async function recalculateCreditLimit(
  agentId: string,
  supabase: any,
): Promise<number> {
  const agent = await getAgentWithReputation(agentId, supabase);
  return calculateCreditLimit(agent);
}

async function publishNostrEvent(event: any): Promise<{ id: string }> {
  // TODO: Implement actual Nostr event publishing
  // For now, return a mock ID
  return { id: `mock-event-${Date.now()}` };
}

async function publishValidationAttestation(params: {
  agentNpub: string;
  envelopeId: string;
  validatorNpub: string;
  validationTier: "self_report" | "peer_verified" | "oracle_attested";
  success: boolean;
  sig4satsRedeemed: boolean;
}): Promise<void> {
  // TODO: Implement actual attestation publishing
  // For now, this is a placeholder
  console.log("Publishing validation attestation:", params);
}

async function generateLightningInvoice(
  amountSats: number,
  description: string,
): Promise<string | null> {
  // Production Lightning invoice generation using PhoenixD or LNbits
  try {
    // Get environment variables for Lightning node configuration
    const phoenixdUrl = process.env.PHOENIXD_NODE_URL;
    const phoenixdPassword = process.env.PHOENIXD_API_PASSWORD;
    const lnbitsUrl =
      process.env.VITE_VOLTAGE_LNBITS_URL || process.env.VOLTAGE_LNBITS_URL;
    const lnbitsAdminKey =
      process.env.VITE_VOLTAGE_LNBITS_ADMIN_KEY ||
      process.env.VOLTAGE_LNBITS_ADMIN_KEY;

    // Try PhoenixD first (preferred for self-custodial)
    if (phoenixdUrl && phoenixdPassword) {
      const amountMsat = amountSats * 1000;
      const authHeader =
        "Basic " + Buffer.from(":" + phoenixdPassword).toString("base64");

      const response = await fetch(`${phoenixdUrl}/createinvoice`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amountMsat,
          description:
            description || `Credit envelope payment - ${amountSats} sats`,
        }),
      });

      if (!response.ok) {
        console.error(`PhoenixD invoice generation failed: ${response.status}`);
        throw new Error(`PhoenixD API error: ${response.status}`);
      }

      const data = await response.json();
      console.log(
        `✅ Generated PhoenixD Lightning invoice for ${amountSats} sats`,
      );
      return data.serialized || data.invoice || data.bolt11;
    }

    // Fallback to LNbits (Voltage)
    if (lnbitsUrl && lnbitsAdminKey) {
      const response = await fetch(`${lnbitsUrl}/api/v1/payments`, {
        method: "POST",
        headers: {
          "X-Api-Key": lnbitsAdminKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          out: false, // incoming payment
          amount: amountSats,
          memo: description || `Credit envelope payment - ${amountSats} sats`,
        }),
      });

      if (!response.ok) {
        console.error(`LNbits invoice generation failed: ${response.status}`);
        throw new Error(`LNbits API error: ${response.status}`);
      }

      const data = await response.json();
      console.log(
        `✅ Generated LNbits Lightning invoice for ${amountSats} sats`,
      );
      return data.payment_request || data.bolt11;
    }

    // No Lightning node configured
    console.warn(
      "⚠️ No Lightning node configured (PHOENIXD_NODE_URL or VITE_VOLTAGE_LNBITS_URL required)",
    );
    return null;
  } catch (error) {
    console.error("Failed to generate Lightning invoice:", error);
    return null;
  }
}

async function generateFedimintAddress(
  amountSats: number,
  description: string,
): Promise<string | null> {
  // Production Fedimint address generation using Fedimint gateway API
  try {
    // Get environment variables for Fedimint gateway configuration
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
      return null;
    }

    // Fedimint gateway API call to generate receive address
    // Note: Fedimint uses Lightning gateway for receiving, so we generate a Lightning invoice
    // that the gateway will convert to eCash notes
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (apiToken) {
      headers["Authorization"] = `Bearer ${apiToken}`;
    }

    const response = await fetch(`${gatewayUrl}/gateway/receive`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        federation_id: federationId,
        amount_sats: amountSats,
        description:
          description || `Credit envelope payment - ${amountSats} sats`,
      }),
    });

    if (!response.ok) {
      console.error(`Fedimint address generation failed: ${response.status}`);
      const errorText = await response.text().catch(() => "Unknown error");
      console.error(`Fedimint error response: ${errorText}`);
      throw new Error(`Fedimint gateway API error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`✅ Generated Fedimint receive address for ${amountSats} sats`);

    // Return the Lightning invoice that the gateway will use to receive funds
    // The gateway will automatically convert to eCash notes
    return data.invoice || data.lightning_invoice || data.receive_address;
  } catch (error) {
    console.error("Failed to generate Fedimint address:", error);
    return null;
  }
}
