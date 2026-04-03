/**
 * Anthropic Provider Adapter (Phase 2/3.1 - Placeholder)
 * Implements LLMProvider interface for Anthropic Claude API
 * Server-side only - used by agent-llm-proxy Netlify Function
 *
 * DESIGN:
 * - Uses Anthropic Messages API (v1)
 * - Extracts token usage from response.usage
 * - Maps Anthropic-specific errors to LLMProviderError
 * - No user identifiers in requests (privacy-conscious)
 *
 * STATUS: Placeholder implementation with basic structure
 * TODO: Complete implementation when Anthropic integration is prioritized
 *
 * API REFERENCE:
 * https://docs.anthropic.com/claude/reference/messages_post
 */

import type {
  ChatCompletionParams,
  ChatCompletionResult,
  LLMProvider,
  LLMProviderId,
} from "./llm-provider-types";
import { LLMProviderError } from "./llm-provider-types";

// ============================================================================
// ANTHROPIC API TYPES (Placeholder)
// ============================================================================

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicMessagesRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
  system?: string;
}

interface AnthropicMessagesResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicErrorResponse {
  type: string;
  error: {
    type: string;
    message: string;
  };
}

// ============================================================================
// ANTHROPIC PROVIDER (Placeholder)
// ============================================================================

export class AnthropicProvider implements LLMProvider {
  readonly providerId: LLMProviderId = "anthropic";
  private readonly apiUrl = "https://api.anthropic.com/v1/messages";
  private readonly timeout = 60000; // 60 seconds
  private readonly apiVersion = "2023-06-01";

  /**
   * Validate Anthropic API key format
   * Anthropic keys start with 'sk-ant-' and are typically longer
   */
  validateApiKeyFormat(apiKey: string): boolean {
    if (typeof apiKey !== "string") return false;
    // Anthropic keys: sk-ant-api03-...
    return /^sk-ant-[a-zA-Z0-9-_]{32,}$/.test(apiKey);
  }

  /**
   * Create a chat completion using Anthropic API
   * PLACEHOLDER: Basic structure, needs full implementation
   */
  async createChatCompletion(
    params: ChatCompletionParams,
  ): Promise<ChatCompletionResult> {
    const startTime = Date.now();

    // Validate API key format
    if (!this.validateApiKeyFormat(params.apiKey)) {
      throw new LLMProviderError(
        "Invalid Anthropic API key format",
        this.providerId,
        undefined,
        false,
        true,
      );
    }

    // Extract system message if present
    const systemMessage = params.messages.find((m) => m.role === "system");
    const userMessages = params.messages.filter((m) => m.role !== "system");

    // Build request payload
    const requestBody: AnthropicMessagesRequest = {
      model: params.model,
      messages: userMessages.map((msg) => ({
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.content,
      })),
      max_tokens: params.maxTokens || 4096, // Anthropic requires max_tokens
      ...(params.temperature !== undefined && {
        temperature: params.temperature,
      }),
      ...(params.topP !== undefined && { top_p: params.topP }),
      ...(params.stop && { stop_sequences: params.stop }),
      ...(systemMessage && { system: systemMessage.content }),
    };

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": params.apiKey,
          "anthropic-version": this.apiVersion,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle non-200 responses
      if (!response.ok) {
        return await this.handleErrorResponse(response);
      }

      // Parse successful response
      const data = (await response.json()) as AnthropicMessagesResponse;

      // Validate response structure
      if (!data.content || data.content.length === 0) {
        throw new LLMProviderError(
          "Anthropic API returned empty content array",
          this.providerId,
          response.status,
        );
      }

      // Extract text content
      const textContent = data.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("");

      // Extract token usage
      const usage = data.usage;
      if (!usage) {
        throw new LLMProviderError(
          "Anthropic API response missing usage data",
          this.providerId,
          response.status,
        );
      }

      return {
        content: textContent,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        totalTokens: usage.input_tokens + usage.output_tokens,
        modelName: data.model,
        finishReason: data.stop_reason,
        metadata: {
          id: data.id,
          latencyMs: Date.now() - startTime,
        },
      };
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort/timeout
      if (error instanceof Error && error.name === "AbortError") {
        throw new LLMProviderError(
          `Anthropic API request timed out after ${this.timeout}ms`,
          this.providerId,
          undefined,
          false,
          false,
        );
      }

      // Re-throw LLMProviderError
      if (error instanceof LLMProviderError) {
        throw error;
      }

      // Wrap unknown errors
      const message = error instanceof Error ? error.message : String(error);
      throw new LLMProviderError(
        `Anthropic API request failed: ${message}`,
        this.providerId,
      );
    }
  }

  /**
   * Handle Anthropic API error responses
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    const statusCode = response.status;
    let errorMessage = `Anthropic API error (HTTP ${statusCode})`;
    let isRateLimitError = false;
    let isAuthError = false;
    let retryAfterSeconds: number | undefined;

    try {
      const errorData = (await response.json()) as AnthropicErrorResponse;
      if (errorData.error?.message) {
        errorMessage = errorData.error.message;
      }
    } catch {
      // Failed to parse error response, use default message
    }

    // Classify error type
    switch (statusCode) {
      case 401:
      case 403:
        isAuthError = true;
        break;
      case 429:
        isRateLimitError = true;
        // Check for Retry-After header
        const retryAfter = response.headers.get("retry-after");
        if (retryAfter) {
          retryAfterSeconds = parseInt(retryAfter, 10);
        }
        break;
    }

    throw new LLMProviderError(
      errorMessage,
      this.providerId,
      statusCode,
      isRateLimitError,
      isAuthError,
      retryAfterSeconds,
    );
  }
}
