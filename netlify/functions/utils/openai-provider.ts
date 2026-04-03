/**
 * OpenAI Provider Adapter (Phase 2/3.1)
 * Implements LLMProvider interface for OpenAI ChatGPT API
 * Server-side only - used by agent-llm-proxy Netlify Function
 *
 * DESIGN:
 * - Uses OpenAI Chat Completions API (v1)
 * - Extracts token usage from response.usage
 * - Maps OpenAI-specific errors to LLMProviderError
 * - No user identifiers in requests (privacy-conscious)
 *
 * API REFERENCE:
 * https://platform.openai.com/docs/api-reference/chat/create
 */

import type {
  ChatCompletionParams,
  ChatCompletionResult,
  LLMProvider,
  LLMProviderId,
} from "./llm-provider-types";
import { LLMProviderError } from "./llm-provider-types";

// ============================================================================
// OPENAI API TYPES
// ============================================================================

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "function";
  content: string;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
}

interface OpenAIChatCompletionRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  user?: string;
}

interface OpenAIChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
      function_call?: {
        name: string;
        arguments: string;
      };
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIErrorResponse {
  error: {
    message: string;
    type: string;
    param?: string;
    code?: string;
  };
}

// ============================================================================
// OPENAI PROVIDER
// ============================================================================

export class OpenAIProvider implements LLMProvider {
  readonly providerId: LLMProviderId = "openai";
  private readonly apiUrl = "https://api.openai.com/v1/chat/completions";
  private readonly timeout = 60000; // 60 seconds

  /**
   * Validate OpenAI API key format
   * OpenAI keys start with 'sk-' and are typically 48-51 characters
   */
  validateApiKeyFormat(apiKey: string): boolean {
    if (typeof apiKey !== "string") return false;
    // OpenAI keys: sk-... (legacy) or sk-proj-... (project keys)
    return (
      /^sk-[a-zA-Z0-9]{32,}$/.test(apiKey) ||
      /^sk-proj-[a-zA-Z0-9-]{32,}$/.test(apiKey)
    );
  }

  /**
   * Create a chat completion using OpenAI API
   */
  async createChatCompletion(
    params: ChatCompletionParams,
  ): Promise<ChatCompletionResult> {
    const startTime = Date.now();

    // Validate API key format
    if (!this.validateApiKeyFormat(params.apiKey)) {
      throw new LLMProviderError(
        "Invalid OpenAI API key format",
        this.providerId,
        undefined,
        false,
        true,
      );
    }

    // Build request payload
    const requestBody: OpenAIChatCompletionRequest = {
      model: params.model,
      messages: params.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        ...(msg.name && { name: msg.name }),
        ...(msg.function_call && { function_call: msg.function_call }),
      })),
      ...(params.temperature !== undefined && {
        temperature: params.temperature,
      }),
      ...(params.maxTokens !== undefined && { max_tokens: params.maxTokens }),
      ...(params.topP !== undefined && { top_p: params.topP }),
      ...(params.frequencyPenalty !== undefined && {
        frequency_penalty: params.frequencyPenalty,
      }),
      ...(params.presencePenalty !== undefined && {
        presence_penalty: params.presencePenalty,
      }),
      ...(params.stop && { stop: params.stop }),
      // Note: params.user is intentionally omitted for privacy
    };

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${params.apiKey}`,
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
      const data = (await response.json()) as OpenAIChatCompletionResponse;

      // Validate response structure
      if (!data.choices || data.choices.length === 0) {
        throw new LLMProviderError(
          "OpenAI API returned empty choices array",
          this.providerId,
          response.status,
        );
      }

      const choice = data.choices[0];
      const message = choice.message;

      // Extract token usage
      const usage = data.usage;
      if (!usage) {
        throw new LLMProviderError(
          "OpenAI API response missing usage data",
          this.providerId,
          response.status,
        );
      }

      return {
        content: message.content || "",
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        modelName: data.model,
        finishReason: choice.finish_reason,
        ...(message.function_call && { functionCall: message.function_call }),
        metadata: {
          id: data.id,
          created: data.created,
          latencyMs: Date.now() - startTime,
        },
      };
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort/timeout
      if (error instanceof Error && error.name === "AbortError") {
        throw new LLMProviderError(
          `OpenAI API request timed out after ${this.timeout}ms`,
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
        `OpenAI API request failed: ${message}`,
        this.providerId,
      );
    }
  }

  /**
   * Handle OpenAI API error responses
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    const statusCode = response.status;
    let errorMessage = `OpenAI API error (HTTP ${statusCode})`;
    let isRateLimitError = false;
    let isAuthError = false;
    let retryAfterSeconds: number | undefined;

    try {
      const errorData = (await response.json()) as OpenAIErrorResponse;
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
        const retryAfter = response.headers.get("Retry-After");
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
