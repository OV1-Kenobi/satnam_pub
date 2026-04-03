/**
 * LLM Provider Adapter Types (Phase 2/3.1)
 * Shared TypeScript interfaces for pluggable LLM provider adapters
 * Server-side only - used by agent-llm-proxy Netlify Function
 *
 * DESIGN:
 * - Provider-agnostic interface for OpenAI, Anthropic, and future LLMs
 * - Normalized error handling with provider-specific error mapping
 * - Token accounting extraction from provider responses
 * - No user identifiers in outbound requests (privacy-conscious)
 */

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * Supported LLM providers
 */
export type LLMProviderId = "openai" | "anthropic" | "custom";

/**
 * Chat message role
 */
export type MessageRole = "system" | "user" | "assistant" | "function";

/**
 * Individual chat message
 */
export interface ChatMessage {
  role: MessageRole;
  content: string;
  /** Optional function call metadata (for function-calling models) */
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
}

/**
 * Parameters for chat completion request
 */
export interface ChatCompletionParams {
  /** API key for the provider (decrypted server-side) */
  apiKey: string;
  /** Model identifier (e.g., 'gpt-4', 'claude-3-opus-20240229') */
  model: string;
  /** Array of chat messages */
  messages: ChatMessage[];
  /** Optional temperature (0.0-2.0, provider-specific) */
  temperature?: number;
  /** Optional max tokens to generate */
  maxTokens?: number;
  /** Optional top-p sampling */
  topP?: number;
  /** Optional frequency penalty */
  frequencyPenalty?: number;
  /** Optional presence penalty */
  presencePenalty?: number;
  /** Optional stop sequences */
  stop?: string[];
  /** Optional user identifier (for abuse monitoring, not logged by Satnam) */
  user?: string;
}

/**
 * Result from chat completion
 */
export interface ChatCompletionResult {
  /** Generated content */
  content: string;
  /** Input tokens consumed */
  inputTokens: number;
  /** Output tokens generated */
  outputTokens: number;
  /** Total tokens (input + output) */
  totalTokens: number;
  /** Model name used (may differ from requested if aliased) */
  modelName: string;
  /** Finish reason (e.g., 'stop', 'length', 'content_filter') */
  finishReason: string;
  /** Optional function call result (for function-calling models) */
  functionCall?: {
    name: string;
    arguments: string;
  };
  /** Optional provider-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Custom error for LLM provider failures
 */
export class LLMProviderError extends Error {
  constructor(
    message: string,
    public readonly providerId: LLMProviderId,
    public readonly statusCode?: number,
    public readonly isRateLimitError: boolean = false,
    public readonly isAuthError: boolean = false,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "LLMProviderError";
  }
}

// ============================================================================
// PROVIDER INTERFACE
// ============================================================================

/**
 * LLM Provider Adapter Interface
 * Pluggable adapter pattern for OpenAI, Anthropic, and future LLM providers
 */
export interface LLMProvider {
  /**
   * Provider identifier (e.g., 'openai', 'anthropic')
   */
  readonly providerId: LLMProviderId;

  /**
   * Create a chat completion using the provider's API
   * @param params - Chat completion parameters
   * @returns Completion result with token usage
   * @throws LLMProviderError on failure
   */
  createChatCompletion(
    params: ChatCompletionParams,
  ): Promise<ChatCompletionResult>;

  /**
   * Validate API key format (without making API call)
   * @param apiKey - API key to validate
   * @returns true if format is valid, false otherwise
   */
  validateApiKeyFormat(apiKey: string): boolean;
}

