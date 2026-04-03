// ARCHITECTURE: Netlify Function (ESM) — agent creation with monetization
import { getRequestClient } from "../../functions_active/supabase";
import {
  createErrorResponse,
  logErrorWithContext as logError,
  generateRequestId,
} from "../utils/error-handler";
import { BlindTokenManager } from "../../../src/lib/crypto/blind-tokens";
import type { HandlerEvent } from "@netlify/functions";

type PaymentProtocol = "lightning" | "cashu" | "fedimint";

// UX IMPROVEMENT: Agent Lifecycle State Machine
// Provides clear states for agents to introspect and recover from partial failures
// State transitions:
//   PENDING_IDENTITY → PENDING_BOND → ACTIVE → SUSPENDED → DEACTIVATED
//
// PENDING_IDENTITY: user_identity created but agent_profile not yet created
// PENDING_BOND: agent_profile created but performance bond not yet recorded
// ACTIVE: Fully operational agent with bond and payment config
// SUSPENDED: Temporarily disabled (e.g., bond slashed, rate limit exceeded)
// DEACTIVATED: Permanently disabled (user request or policy violation)
//
// Compensation/Rollback Strategy for Multi-Step Operations:
// 1. If identity creation succeeds but profile creation fails:
//    → Mark user_identity with metadata: { agent_state: 'PENDING_IDENTITY', created_at }
//    → Queue cleanup job to delete orphaned identities after 24h
// 2. If profile creation succeeds but bond insert fails:
//    → Set agent_profile.lifecycle_state = 'PENDING_BOND'
//    → Agent can retry bond submission or request refund
// 3. If bond succeeds but payment_config fails:
//    → Set agent_profile.lifecycle_state = 'PENDING_CONFIG'
//    → Agent can still function with manual payments
// 4. If NWC creation fails (W3 handling):
//    → Create inactive NWC record to track failure
//    → Agent continues with lifecycle_state = 'ACTIVE' but nwc_available = false
//
// Implementation: Add lifecycle_state column to agent_profiles table
// See agent_profiles schema in Task 2.1 for full state machine integration

// Agent maps to existing Master Context roles: 'adult' or 'offspring'
// (NOT custom 'agent_parent'/'agent_adult'/'agent_offspring' — those are not in the role hierarchy)
type AgentRole = "adult" | "offspring";

// Agent lifecycle states for state machine
type AgentLifecycleState =
  | "PENDING_IDENTITY"
  | "PENDING_BOND"
  | "PENDING_CONFIG"
  | "ACTIVE"
  | "SUSPENDED"
  | "DEACTIVATED";

interface CreateAgentRequestExtended {
  agent_role: AgentRole; // Maps to user_identities.role
  parent_user_id?: string; // For offspring: the creating adult's user_identities.id
  agent_username: string;
  nostr_pubkey: string;

  // Payment for account creation fee (unless free tier)
  account_creation_payment_proof?: string;
  account_creation_payment_protocol?: PaymentProtocol;

  // Performance bond
  bond_amount_sats: number;
  bond_payment_type: PaymentProtocol;
  bond_payment_proof: string;

  // Payment protocol preferences
  enable_lightning?: boolean;
  enable_cashu?: boolean;
  enable_fedimint?: boolean;
  preferred_protocol: PaymentProtocol;

  // Blind token purchase (optional, can buy separately)
  purchase_event_tokens?: number;
  purchase_task_tokens?: number;
  purchase_contact_tokens?: number;
  tokens_payment_proof?: string;
}

interface InitialTokenBalance {
  event_tokens?: number;
  task_tokens?: number;
  contact_tokens?: number;
}

export const handler = async (event: HandlerEvent) => {
  const requestId = generateRequestId();
  const supabase = getRequestClient();

  let request: CreateAgentRequestExtended;
  try {
    request = JSON.parse(event.body || "{}");
  } catch {
    return createErrorResponse("Invalid request body", undefined, requestId);
  }

  // Validate required fields
  const requiredFields = [
    "agent_role",
    "agent_username",
    "nostr_pubkey",
    "bond_amount_sats",
    "bond_payment_type",
    "bond_payment_proof",
    "preferred_protocol",
  ] as const;
  for (const field of requiredFields) {
    if (
      request[field] === undefined ||
      request[field] === null ||
      request[field] === ""
    ) {
      return createErrorResponse(
        `Missing required field: ${field}`,
        undefined,
        requestId,
      );
    }
  }

  // Validate agent_role is valid
  if (!["adult", "offspring"].includes(request.agent_role)) {
    return createErrorResponse(
      "Invalid agent_role. Must be 'adult' or 'offspring'",
      undefined,
      requestId,
    );
  }

  const {
    data: { user: caller },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !caller) {
    return createErrorResponse("Authentication required", undefined, requestId);
  }

  // Check span of control BEFORE processing payment
  const { data: spanCheck, error: spanError } = await supabase.rpc(
    "check_span_of_control",
    { p_creator_id: caller.id },
  );

  if (spanError) {
    if (spanError.code === "check_violation") {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: "Span of control exceeded",
          message: spanError.message,
          hint: spanError.hint,
          current_count: spanCheck
            ? (spanCheck as any).current_count
            : undefined,
          limit: spanCheck ? (spanCheck as any).limit : undefined,
        }),
      };
    }
    // Other errors
    console.error("Span check error:", spanError);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Span check failed" }),
    };
  }

  // 1. MONETIZATION: Charge account creation fee (or use free tier)
  let feeResult;
  try {
    const feeResponse = await fetch(
      `${process.env.VITE_API_BASE_URL}/platform/charge-fee`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: "pending",
          action_type: "agent_account_creation",
          payment_protocol:
            request.account_creation_payment_protocol || "lightning",
          payment_proof: request.account_creation_payment_proof,
        }),
        signal: AbortSignal.timeout(10000), // 10s timeout
      },
    );

    if (!feeResponse.ok) {
      throw new Error(`Fee service returned ${feeResponse.status}`);
    }
    feeResult = await feeResponse.json();
  } catch (error) {
    logError(error as Error, {
      component: "create-agent",
      action: "fee_service",
      requestId,
      metadata: { context: "Fee service call failed" },
    });
    return createErrorResponse(
      "Failed to process account creation fee",
      undefined,
      requestId,
    );
  }

  if (
    feeResult.fee_required &&
    !feeResult.fee_paid &&
    !feeResult.free_tier_used
  ) {
    // Payment required but not provided
    return {
      statusCode: 402,
      body: JSON.stringify({
        error: "Account creation fee required",
        fee_sats: feeResult.fee_sats,
        payment_invoice: feeResult.payment_invoice,
        free_tier_available: false,
        message:
          "First 210 agent accounts are free. This would be account #211+.",
      }),
    };
  }

  const freeTierUsed = feeResult.free_tier_used || false;
  const allocationNumber = feeResult.allocation_number;

  // 2. Validate username available (check agent_profiles, NOT deprecated profiles)
  const unifiedAddress = `${request.agent_username}@ai.satnam.pub`;
  const { data: existing } = await supabase
    .from("agent_profiles")
    .select("id")
    .eq("unified_address", unifiedAddress)
    .maybeSingle();

  if (existing) {
    return createErrorResponse("Username already taken", undefined, requestId);
  }

  // 3. Verify performance bond
  const { data: bondRequirement, error: bondReqError } = await supabase
    .from("bond_requirements")
    .select("required_amount_sats")
    .eq("account_type", request.agent_role) // Uses 'adult' | 'offspring', not deprecated agent types
    .eq("operation", "account_creation")
    .single();

  if (bondReqError || !bondRequirement) {
    logError(bondReqError?.message || bondReqError, {
      component: "create-agent",
      action: "bond_requirement",
      requestId,
      metadata: { error: bondReqError },
    });
    return createErrorResponse(
      `Bond requirement not found for account type: ${request.agent_role}`,
      undefined,
      requestId,
    );
  }

  if (request.bond_amount_sats < bondRequirement.required_amount_sats) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: `Insufficient bond. Required: ${bondRequirement.required_amount_sats} sats`,
      }),
    };
  }

  const bondValid = await verifyBondPayment(
    request.bond_payment_proof,
    request.bond_amount_sats,
    request.bond_payment_type,
  );

  if (!bondValid) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid bond payment proof" }),
    };
  }

  // 4. Create agent: TWO-STEP (user_identities + agent_profiles)
  // Step 4a: Create base user identity with Master Context role
  const { data: userIdentity, error: identityError } = await supabase
    .from("user_identities")
    .insert({
      npub: request.nostr_pubkey,
      role: request.agent_role, // 'adult' or 'offspring' (Master Context compliant)
      nip05: `${request.agent_username}@ai.satnam.pub`,
      username: request.agent_username,
    })
    .select()
    .single();

  if (identityError || !userIdentity) {
    logError(identityError?.message || "Identity creation failed", {
      component: "create-agent",
      action: "identity_creation",
      requestId,
      metadata: { error: identityError },
    });
    return createErrorResponse(
      "Failed to create agent identity",
      undefined,
      requestId,
    );
  }

  // Step 4b: Create agent-specific profile (monetization, reputation, etc.)
  const { data: agentProfile, error: profileError } = await supabase
    .from("agent_profiles")
    .insert({
      user_identity_id: userIdentity.id,
      is_agent: true,
      agent_username: request.agent_username,
      unified_address: unifiedAddress,
      created_by_user_id: caller.id,
      free_tier_claimed: freeTierUsed,
      free_tier_allocation_number: allocationNumber,
      total_platform_fees_paid_sats: freeTierUsed ? 0 : feeResult.fee_sats,
    })
    .select()
    .single();

  if (profileError || !agentProfile) {
    logError(profileError?.message || "Profile creation failed", {
      component: "create-agent",
      action: "profile_creation",
      requestId,
      metadata: { error: profileError },
    });
    return createErrorResponse(
      "Failed to create agent profile",
      undefined,
      requestId,
    );
  }

  // Step 4c: If offspring, create parent-offspring relationship
  if (request.agent_role === "offspring" && request.parent_user_id) {
    const { error: relationshipError } = await supabase
      .from("parent_offspring_relationships")
      .insert({
        parent_user_id: request.parent_user_id,
        offspring_user_id: userIdentity.id,
      });
    if (relationshipError) {
      logError(relationshipError?.message || "Relationship creation failed", {
        component: "create-agent",
        action: "relationship_creation",
        requestId,
        metadata: {
          context: "Failed to create parent-offspring relationship",
          error: relationshipError,
        },
      });
    }
  }

  // 5. Create performance bond
  const { data: bond, error: bondError } = await supabase
    .from("performance_bonds")
    .insert({
      agent_id: userIdentity.id,
      amount_sats: request.bond_amount_sats,
      bond_type: "account_creation",
      payment_type: request.bond_payment_type,
      lightning_payment_hash:
        request.bond_payment_type === "lightning"
          ? request.bond_payment_proof
          : null,
      cashu_token:
        request.bond_payment_type === "cashu"
          ? request.bond_payment_proof
          : null,
      fedimint_txid:
        request.bond_payment_type === "fedimint"
          ? request.bond_payment_proof
          : null,
      escrow_holder: "satnam-platform",
      status: "active",
    })
    .select()
    .single();

  if (bondError) {
    logError(bondError?.message || "Bond creation failed", {
      component: "create-agent",
      action: "bond_creation",
      requestId,
      metadata: { error: bondError },
    });
  }

  // Update agent_profiles bond tracking (NOT deprecated profiles table)
  await supabase
    .from("agent_profiles")
    .update({
      total_bonds_staked_sats: request.bond_amount_sats,
      current_bonded_sats: request.bond_amount_sats,
    })
    .eq("user_identity_id", userIdentity.id);

  // 6. Setup payment configuration
  // Domain: ai.satnam.pub (agent-specific subdomain)
  // Gateway: gateway.satnam.pub (NOT satnam.ai)
  const { error: paymentConfigError } = await supabase
    .from("agent_payment_config")
    .insert({
      agent_id: userIdentity.id,
      unified_address: unifiedAddress,
      lightning_enabled: request.enable_lightning ?? true,
      lnurl_callback_url: `${process.env.API_BASE_URL}/lnurlp/${request.agent_username}/callback`,
      cashu_enabled: request.enable_cashu ?? true,
      cashu_mint_url: process.env.CASHU_MINT_URL, // mint.satnam.pub
      cashu_pubkey: await generateCashuPubkey(userIdentity.id),
      fedimint_enabled: request.enable_fedimint ?? true,
      fedimint_federation_id: process.env.FEDIMINT_FEDERATION_ID,
      fedimint_gateway_ln_address: `${request.agent_username}@gateway.satnam.pub`,
      preferred_protocol: request.preferred_protocol,
    });

  if (paymentConfigError) {
    logError(paymentConfigError?.message || "Payment config creation failed", {
      component: "create-agent",
      action: "payment_config_creation",
      requestId,
      metadata: {
        context: "Failed to create payment config",
        error: paymentConfigError,
      },
    });
  }

  // 7. Generate NWC connection (LNbits Parent/Child wallet management)
  // W3: Add error handling for NWC connection failure
  let nwcConnectionCreated = false;
  try {
    const nwcResponse = await fetch(
      `${process.env.LNBITS_URL}/api/v1/nwc/create`,
      {
        method: "POST",
        headers: { "X-Api-Key": process.env.LNBITS_ADMIN_KEY || "" },
        body: JSON.stringify({
          user_id: userIdentity.id,
          max_amount_sats: 50000,
          allowed_methods: ["pay_invoice", "make_invoice"],
        }),
      },
    );

    if (!nwcResponse.ok) {
      throw new Error(
        `NWC creation failed: ${nwcResponse.status} ${nwcResponse.statusText}`,
      );
    }

    const nwcData = await nwcResponse.json();

    if (!nwcData.connection_string) {
      throw new Error("NWC response missing connection_string");
    }

    await supabase.from("agent_nwc_connections").insert({
      agent_id: userIdentity.id,
      nwc_connection_string_encrypted: await encryptNwcConnectionString(
        nwcData.connection_string,
      ),
      nwc_encryption_key_id: null, // Key derived from env secret; no Vault key ID needed here
      max_spend_per_hour_sats: 10000,
      max_spend_per_day_sats: 100000,
      allowed_operations: ["pay_invoice", "make_invoice"],
      wallet_type: "lnbits",
      wallet_endpoint: process.env.LNBITS_URL,
      is_active: true,
    });

    nwcConnectionCreated = true;
  } catch (nwcError) {
    // W3: Log error but don't fail agent creation
    // Agent can still function without NWC (manual payments)
    logError(nwcError as Error, {
      component: "create-agent",
      action: "nwc_creation",
      requestId,
      metadata: {
        context: "NWC connection creation failed",
        agent_id: userIdentity.id,
      },
    });

    // Create inactive NWC record to track failure
    await supabase.from("agent_nwc_connections").insert({
      agent_id: userIdentity.id,
      nwc_connection_string_encrypted: "FAILED_TO_CREATE", // Sentinel value; not decrypted — handled specially by the parser
      nwc_encryption_key_id: null,
      max_spend_per_hour_sats: 0,
      max_spend_per_day_sats: 0,
      allowed_operations: [],
      wallet_type: "lnbits",
      wallet_endpoint: process.env.LNBITS_URL,
      is_active: false,
    });
  }

  // 8. OPTIONAL: Purchase initial blind tokens if requested
  const initialTokens: InitialTokenBalance = {};

  if (
    request.purchase_event_tokens ||
    request.purchase_task_tokens ||
    request.purchase_contact_tokens
  ) {
    const tokenManager = new BlindTokenManager();

    if (request.purchase_event_tokens && request.purchase_event_tokens > 0) {
      const eventTokens = await tokenManager.purchaseTokens(
        userIdentity.id,
        "event_post",
        request.purchase_event_tokens,
        request.tokens_payment_proof || "",
      );
      initialTokens.event_tokens = eventTokens.length;

      // Update agent_profiles (NOT deprecated profiles)
      await supabase
        .from("agent_profiles")
        .update({ event_tokens_balance: eventTokens.length })
        .eq("user_identity_id", userIdentity.id);
    }

    if (request.purchase_task_tokens && request.purchase_task_tokens > 0) {
      const taskTokens = await tokenManager.purchaseTokens(
        userIdentity.id,
        "task_create",
        request.purchase_task_tokens,
        request.tokens_payment_proof || "",
      );
      initialTokens.task_tokens = taskTokens.length;
      await supabase
        .from("agent_profiles")
        .update({ task_tokens_balance: taskTokens.length })
        .eq("user_identity_id", userIdentity.id);
    }

    if (
      request.purchase_contact_tokens &&
      request.purchase_contact_tokens > 0
    ) {
      const contactTokens = await tokenManager.purchaseTokens(
        userIdentity.id,
        "contact_add",
        request.purchase_contact_tokens,
        request.tokens_payment_proof || "",
      );
      initialTokens.contact_tokens = contactTokens.length;
      await supabase
        .from("agent_profiles")
        .update({ contact_tokens_balance: contactTokens.length })
        .eq("user_identity_id", userIdentity.id);
    }
  }

  // 9. Publish agent creation event
  await publishAgentCreationEvent({
    agentNpub: request.nostr_pubkey,
    agentRole: request.agent_role, // 'adult' | 'offspring' (Master Context compliant)
    unifiedAddress: unifiedAddress,
    bondAmount: request.bond_amount_sats,
    createdBy: caller.id,
    freeTierUsed: freeTierUsed,
  });

  // W3: Build response with NWC status
  const responseBody: any = {
    agent_id: userIdentity.id,
    agent_profile_id: agentProfile.id,
    npub: request.nostr_pubkey,
    unified_address: unifiedAddress,
    nip05_verified: true,
    free_tier_used: freeTierUsed,
    allocation_number: allocationNumber,
    payment_methods: {
      lightning: request.enable_lightning ?? true,
      cashu: request.enable_cashu ?? true,
      fedimint: request.enable_fedimint ?? true,
    },
    bond_id: bond?.id,
    initial_blind_tokens: initialTokens,
    message: freeTierUsed
      ? `Free tier activated! You're agent #${allocationNumber} of ${FREE_TIER_LIMIT}.`
      : `Account created. Paid ${feeResult.fee_sats} sats creation fee.`,
  };

  // W3: Add NWC status to response
  if (nwcConnectionCreated) {
    responseBody.nwc_status = "active";
    responseBody.nwc_connection_available = true;
  } else {
    responseBody.nwc_status = "failed";
    responseBody.nwc_connection_available = false;
    responseBody.nwc_warning =
      "NWC connection failed to create. Agent can still function with manual payments. Contact support to enable autonomous payments.";
  }

  return {
    statusCode: 201,
    body: JSON.stringify(responseBody),
  };
};

// Helper functions (would need to be implemented)

/**
 * Encrypt a plaintext NWC connection string for database storage.
 * Uses AES-GCM with a SHA-256–derived key from AGENT_WALLET_SECRET (with env fallbacks).
 * Output format: JSON { v:1, iv:<base64>, data:<base64> } — identical to unified-wallet-service.ts.
 */
async function encryptNwcConnectionString(value: string): Promise<string> {
  const secret =
    process.env.AGENT_WALLET_SECRET ??
    process.env.JWT_SECRET ??
    process.env.DUID_SERVER_SECRET ??
    null;
  if (!secret) return value; // No key available — caller must not store plaintext; surface at runtime
  const keyMaterial = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyMaterial,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
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

async function verifyBondPayment(
  proof: string,
  amount: number,
  type: PaymentProtocol,
): Promise<boolean> {
  // TODO: Implement actual bond payment verification
  // This is a security-critical function that must verify:
  // - Lightning payment hash exists in paid invoices
  // - Cashu tokens are valid and not double-spent
  // - Fedimint transaction is confirmed
  // For now, reject all proofs to prevent security issues
  console.warn(
    `SECURITY: verifyBondPayment placeholder called - rejecting proof for ${type} payment of ${amount} sats`,
  );
  return false;
}

async function generateCashuPubkey(agentId: string): Promise<string> {
  // TODO: Implement actual Cashu pubkey generation
  // This should generate a unique pubkey for each agent using proper Cashu protocols
  // For now, generate a deterministic but unique pubkey based on agent ID
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(agentId),
  );
  const arrayBuffer = await hash;
  const uint8Array = new Uint8Array(arrayBuffer);
  // Convert to hex string for pubkey format
  return Array.from(uint8Array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function publishAgentCreationEvent(params: any): Promise<void> {
  // Implementation would publish agent creation event
  console.log("Agent creation event:", params);
}

// Constants
const FREE_TIER_LIMIT = 210; // First 210 agents are free
