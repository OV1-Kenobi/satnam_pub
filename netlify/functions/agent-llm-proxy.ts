/**
 * Netlify Function: Agent LLM Proxy (Phase 3, Task 3.2)
 * POST /api/agents/llm-proxy
 *
 * Proxies LLM API requests for agents with token/cost tracking
 *
 * Flow:
 * 1. Authenticate via SecureSessionManager
 * 2. Verify caller is authorized for agent_id
 * 3. Look up encrypted LLM credential from agent_llm_credentials
 * 4. Decrypt API key in memory (never log plaintext)
 * 5. Forward request to LLM provider adapter
 * 6. Compute sats-based cost using provider+model pricing (llm_model_pricing)
 * 7. Get BTC/USD price snapshot (once per invocation)
 * 8. Derive cost_usd_cents from sats using FX snapshot
 * 9. Log via log_session_event() RPC with token/cost data
 *
 * Request Body:
 * {
 *   "agent_id": "uuid",
 *   "session_id": "sess_...",
 *   "provider": "openai" | "anthropic",
 *   "model": "gpt-4",
 *   "messages": [{ "role": "user", "content": "..." }],
 *   "temperature"?: number,
 *   "maxTokens"?: number,
 *   // ... other optional params
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "content": "...",
 *   "inputTokens": 10,
 *   "outputTokens": 20,
 *   "totalTokens": 30,
 *   "costSats": 5,
 *   "costUsdCents": 3,
 *   "modelName": "gpt-4",
 *   "finishReason": "stop"
 * }
 *
 * Rate Limiting: centralized RATE_LIMITS.LLM_PROXY (env-overridable via LLM_PROXY_RATE_LIMIT/LLM_PROXY_RATE_WINDOW_MS)
 */

import type { Handler } from "@netlify/functions";
import { logSessionEvent } from "../../utils/session-logger.js";
import {
  checkRateLimitStatus,
  createRateLimitIdentifier,
  getClientIP,
  RATE_LIMITS,
} from "../functions_active/utils/enhanced-rate-limiter.js";
import {
  createRateLimitErrorResponse,
  createValidationErrorResponse,
  generateRequestId,
  logError,
} from "../functions_active/utils/error-handler.js";
import {
  errorResponse,
  jsonResponse,
  preflightResponse,
} from "../functions_active/utils/security-headers.js";
import { SecureSessionManager } from "./security/session-manager.js";
import { getRequestClient } from "./supabase.js";
import { AnthropicProvider } from "./utils/anthropic-provider.js";
import { getBtcUsdSpot } from "./utils/btc-usd-pricing.js";
import type {
  ChatCompletionParams,
  ChatMessage,
  LLMProvider,
} from "./utils/llm-provider-types.js";
import { LLMProviderError } from "./utils/llm-provider-types.js";
import { OpenAIProvider } from "./utils/openai-provider.js";

// ============================================================================
// FEATURE FLAGS (Phase 5)
// ============================================================================

// Fail-closed by default (must be explicitly enabled)
const AGENT_LLM_PROXY_ENABLED =
  (process.env.VITE_AGENT_LLM_PROXY_ENABLED || "").toLowerCase() === "true";

// External BTC/USD pricing calls are disabled by default (privacy + load safety)
const AGENT_BTC_PRICING_ENABLED =
  (process.env.VITE_AGENT_BTC_PRICING_ENABLED || "").toLowerCase() === "true";

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

interface LLMProxyRequest {
  agent_id: string;
  session_id: string;
  provider: "openai" | "anthropic";
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
}

interface LLMProxyResponse {
  success: true;
  content: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costSats: number;
  costUsdCents: number;
  modelName: string;
  finishReason: string;
  functionCall?: { name: string; arguments: string };
  metadata?: Record<string, unknown>;
}

interface LLMModelPricingRow {
  input_msats_per_token: number;
  output_msats_per_token: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Decrypt API key from agent_llm_credentials using Web Crypto API
 * Follows secure-credential-manager.ts pattern (AES-256-GCM + PBKDF2)
 */
async function decryptApiKey(
  encryptedApiKey: string,
  iv: string,
  salt: string,
  userPassword: string,
): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    // Derive key from password and salt using PBKDF2 (100k iterations, SHA-256)
    const passwordBuffer = encoder.encode(userPassword);
    const saltBuffer = encoder.encode(salt);

    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      passwordBuffer,
      { name: "PBKDF2" },
      false,
      ["deriveKey"],
    );

    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: saltBuffer,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );

    // Decode encrypted data and IV from base64
    const encryptedBytes = Uint8Array.from(atob(encryptedApiKey), (c) =>
      c.charCodeAt(0),
    );
    const ivBytes = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));

    // Decrypt using AES-256-GCM
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes },
      derivedKey,
      encryptedBytes,
    );

    return decoder.decode(decryptedBuffer);
  } catch (error) {
    throw new Error(
      `API key decryption failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

function calculateSatsCostFromPricing(
  inputTokens: number,
  outputTokens: number,
  pricing: LLMModelPricingRow,
): { costMsats: bigint; costSats: number } {
  const inputMsatsPerToken = BigInt(pricing.input_msats_per_token);
  const outputMsatsPerToken = BigInt(pricing.output_msats_per_token);
  const costMsats =
    BigInt(inputTokens) * inputMsatsPerToken +
    BigInt(outputTokens) * outputMsatsPerToken;

  // Convert msats -> sats using ceil division
  const costSatsBig = costMsats === 0n ? 0n : (costMsats + 999n) / 1000n;

  // Convert to JS number safely (costs should remain far below Number.MAX_SAFE_INTEGER)
  const costSats = Number(costSatsBig);
  if (!Number.isFinite(costSats) || costSats < 0) {
    throw new Error("Invalid computed sats cost");
  }

  return { costMsats, costSats };
}

/**
 * Convert sats to USD cents using BTC/USD price
 */
function satsToUsdCents(sats: number, btcUsdPrice: number): number {
  // 1 BTC = 100,000,000 sats
  // sats * (btcUsdPrice / 100,000,000) = USD
  // USD * 100 = cents
  const usd = (sats * btcUsdPrice) / 100_000_000;
  return Math.round(usd * 100);
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export const handler: Handler = async (event) => {
  const requestId = generateRequestId();
  const requestOrigin =
    event.headers?.origin || event.headers?.Origin || "https://satnam.pub";

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return preflightResponse(requestOrigin);
  }

  // Only allow POST
  if (event.httpMethod !== "POST") {
    return errorResponse(405, "Method not allowed", requestOrigin);
  }

  // Phase 5: feature-flag gated (fail closed by default)
  if (!AGENT_LLM_PROXY_ENABLED) {
    return errorResponse(403, "Agent LLM proxy is disabled", requestOrigin);
  }

  try {
    // Parse and validate request body (needed for per-agent rate limiting)
    if (!event.body) {
      return errorResponse(400, "Request body required", requestOrigin);
    }

    let request: LLMProxyRequest;
    try {
      request = JSON.parse(event.body) as LLMProxyRequest;
    } catch {
      return jsonResponse(
        400,
        createValidationErrorResponse("Invalid JSON body", requestId),
        requestOrigin,
      );
    }

    // Validate required fields
    if (
      !request.agent_id ||
      !request.session_id ||
      !request.provider ||
      !request.model ||
      !request.messages
    ) {
      return jsonResponse(
        400,
        createValidationErrorResponse(
          "Missing required fields: agent_id, session_id, provider, model, messages",
          requestId,
        ),
        requestOrigin,
      );
    }

    // Rate limiting (configurable; keyed per-agent when agent_id is provided)
    const clientIP = getClientIP(
      event.headers as Record<string, string | string[]>,
    );
    const rateLimitId = createRateLimitIdentifier(request.agent_id, clientIP);
    const rateLimitCheck = await checkRateLimitStatus(
      rateLimitId,
      RATE_LIMITS.LLM_PROXY,
    );

    if (!rateLimitCheck.allowed) {
      return jsonResponse(
        429,
        createRateLimitErrorResponse(requestId, requestOrigin, rateLimitCheck),
        requestOrigin,
      );
    }

    // Authenticate user
    const authHeader =
      event.headers?.authorization || event.headers?.Authorization;
    if (!authHeader) {
      return errorResponse(401, "Authorization header required", requestOrigin);
    }

    const sessionData = await SecureSessionManager.validateSession(
      authHeader.replace("Bearer ", ""),
    );

    if (!sessionData || !sessionData.userId) {
      return errorResponse(401, "Invalid or expired token", requestOrigin);
    }

    const authenticatedUserId = sessionData.userId;

    // Verify caller is authorized for agent_id
    const supabase = getRequestClient();
    const { data: agent, error: agentError } = await supabase
      .from("user_identities")
      .select("id, role")
      .eq("id", request.agent_id)
      .single();

    if (agentError || !agent) {
      return errorResponse(404, "Agent not found", requestOrigin);
    }

    // Authorization check: user must own the agent
    if (agent.id !== authenticatedUserId) {
      return errorResponse(
        403,
        "Unauthorized: You do not own this agent",
        requestOrigin,
      );
    }

    // Look up pricing for provider+model (dynamic, DB-backed)
    const { data: modelPricing, error: modelPricingError } = await supabase
      .from("llm_model_pricing")
      .select("input_msats_per_token, output_msats_per_token")
      .eq("provider", request.provider)
      .eq("model", request.model)
      .eq("is_active", true)
      .single();

    if (modelPricingError || !modelPricing) {
      return jsonResponse(
        400,
        createValidationErrorResponse(
          `Pricing not configured for provider/model: ${request.provider}/${request.model}`,
          requestId,
        ),
        requestOrigin,
      );
    }

    // Look up encrypted LLM credential
    const { data: credential, error: credentialError } = await supabase
      .from("agent_llm_credentials")
      .select("encrypted_api_key, iv, salt, is_active")
      .eq("agent_id", request.agent_id)
      .eq("provider", request.provider)
      .eq("is_active", true)
      .single();

    if (credentialError || !credential) {
      return errorResponse(
        404,
        `No active ${request.provider} credential found for this agent`,
        requestOrigin,
      );
    }

    // Decrypt API key in memory (NEVER log plaintext)
    // TODO: In production, use user's password or session-derived key
    // For now, using hashedId as decryption key (placeholder)
    const decryptionKey = sessionData.hashedId || authenticatedUserId;
    const apiKey = await decryptApiKey(
      credential.encrypted_api_key,
      credential.iv,
      credential.salt,
      decryptionKey,
    );

    // Select provider adapter
    const provider: LLMProvider =
      request.provider === "openai"
        ? new OpenAIProvider()
        : new AnthropicProvider();

    // Build completion params
    const completionParams: ChatCompletionParams = {
      apiKey,
      model: request.model,
      messages: request.messages,
      ...(request.temperature !== undefined && {
        temperature: request.temperature,
      }),
      ...(request.maxTokens !== undefined && { maxTokens: request.maxTokens }),
      ...(request.topP !== undefined && { topP: request.topP }),
      ...(request.frequencyPenalty !== undefined && {
        frequencyPenalty: request.frequencyPenalty,
      }),
      ...(request.presencePenalty !== undefined && {
        presencePenalty: request.presencePenalty,
      }),
      ...(request.stop && { stop: request.stop }),
    };

    // Forward request to LLM provider
    const startTime = Date.now();
    const result = await provider.createChatCompletion(completionParams);
    const latencyMs = Date.now() - startTime;

    // Compute sats-based cost from dynamic provider+model pricing
    const { costMsats, costSats } = calculateSatsCostFromPricing(
      result.inputTokens,
      result.outputTokens,
      modelPricing as LLMModelPricingRow,
    );

    // Get BTC/USD price snapshot (once per invocation)
    // Phase 5: external pricing is feature-flag gated (fail-closed default)
    let costUsdCents = 0;
    let pricingUnavailable = false;
    let pricingDisabled = false;
    if (AGENT_BTC_PRICING_ENABLED) {
      try {
        const priceResult = await getBtcUsdSpot();
        costUsdCents = satsToUsdCents(costSats, priceResult.priceUsd);
      } catch (error) {
        // BTC/USD pricing failed - continue with sats-based logging
        pricingUnavailable = true;
        logError(error as Error, {
          context: "agent-llm-proxy BTC/USD pricing",
          requestId,
          agentId: request.agent_id,
        });
      }
    } else {
      pricingDisabled = true;
    }

    // Log via log_session_event() RPC
    const { error: logSessionEventRpcError } = await supabase.rpc(
      "log_session_event",
      {
        p_session_id: request.session_id,
        p_event_type: "LLM_COMPLETION",
        p_event_data: {
          provider: request.provider,
          model: request.model,
          finish_reason: result.finishReason,
          latency_ms: latencyMs,
          input_msats_per_token: modelPricing.input_msats_per_token,
          output_msats_per_token: modelPricing.output_msats_per_token,
          cost_msats: costMsats.toString(),
          cost_usd_cents: costUsdCents, // Store USD cost with FX snapshot
          ...(pricingDisabled && { pricing_disabled: true }),
          ...(pricingUnavailable && { pricing_unavailable: true }),
        },
        p_tokens_used: result.totalTokens,
        p_sats_cost: costSats,
        p_input_tokens: result.inputTokens,
        p_output_tokens: result.outputTokens,
        p_tool_name: "llm_completion",
        p_tool_parameters: {
          provider: request.provider,
          model: request.model,
          temperature: request.temperature,
          max_tokens: request.maxTokens,
        },
        p_tool_result: {
          finish_reason: result.finishReason,
          latency_ms: latencyMs,
        },
      },
    );

    if (logSessionEventRpcError) {
      // Log error but don't fail the request
      console.error("Failed to log session event:", logSessionEventRpcError);
    }

    // Log successful completion
    logSessionEvent({
      session_id: request.session_id,
      event_type: "LLM_COMPLETION",
      event_data: {
        provider: request.provider,
        model: request.model,
      },
      tokens_used: result.totalTokens,
      sats_cost: costSats,
    });

    // Update credential last_used_at
    await supabase
      .from("agent_llm_credentials")
      .update({ key_last_used_at: new Date().toISOString() })
      .eq("agent_id", request.agent_id)
      .eq("provider", request.provider);

    // Return success response
    const response: LLMProxyResponse = {
      success: true,
      content: result.content,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      totalTokens: result.totalTokens,
      costSats,
      costUsdCents,
      modelName: result.modelName,
      finishReason: result.finishReason,
      ...(result.functionCall && { functionCall: result.functionCall }),
      ...(result.metadata && { metadata: result.metadata }),
    };

    return jsonResponse(200, response, requestOrigin);
  } catch (error) {
    // Handle LLMProviderError specifically
    if (error instanceof LLMProviderError) {
      const statusCode = error.isAuthError
        ? 401
        : error.isRateLimitError
          ? 429
          : error.statusCode || 500;

      return jsonResponse(
        statusCode,
        {
          success: false,
          error: error.message,
          provider: error.providerId,
          isAuthError: error.isAuthError,
          isRateLimitError: error.isRateLimitError,
          ...(error.retryAfterSeconds && {
            retryAfterSeconds: error.retryAfterSeconds,
          }),
        },
        requestOrigin,
      );
    }

    // Generic error handling
    logError(error as Error, {
      context: "agent-llm-proxy",
      requestId,
    });
    return errorResponse(500, "Internal server error", requestOrigin);
  }
};
