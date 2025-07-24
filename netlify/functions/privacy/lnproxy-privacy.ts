import { getEnvVar } from "../utils/env.js";

/**
 * LNProxy Privacy Layer for Satnam.pub Family Payments
 *
 * This module provides privacy protection for Lightning Network payments
 * by wrapping invoices through LNProxy service, hiding node identity
 * from payers while maintaining full payment functionality.
 *
 * Compatible with Vite, TypeScript, and existing Lightning infrastructure.
 */

/**
 * Response interface for LNProxy API
 */
interface LNProxyResponse {
  proxy_invoice: string;
  routing_fee?: number;
  error?: string;
}

/**
 * Configuration for privacy wrapping
 */
interface PrivacyWrapConfig {
  /** Original Lightning invoice to wrap */
  invoice: string;
  /** Budget for routing fees in parts per million (default: 1000 = 0.1%) */
  routing_budget_ppm?: number;
  /** Description for the wrapped payment */
  description?: string;
}

/**
 * Result of privacy wrapping operation
 */
export interface PrivacyWrappedInvoice {
  /** Privacy-wrapped invoice to share with payer */
  wrappedInvoice: string;
  /** Original invoice for internal tracking */
  originalInvoice: string;
  /** Additional fee for privacy service (in sats) */
  privacyFee: number;
  /** Whether privacy wrapping was successful */
  isPrivacyEnabled: boolean;
}

/**
 * Health status of LNProxy service
 */
export interface PrivacyServiceHealth {
  /** Whether the service is available */
  available: boolean;
  /** Response time in milliseconds */
  responseTime: number;
  /** Any error message */
  error?: string;
}

/**
 * SatnamPrivacyLayer provides Lightning Network privacy protection
 * through LNProxy integration for family payments.
 *
 * Features:
 * - Automatic invoice wrapping for privacy
 * - Graceful fallback to original invoices
 * - Health monitoring for privacy service
 * - Compatible with existing Lightning infrastructure
 */
export class SatnamPrivacyLayer {
  private readonly lnproxyUrl: string;
  private readonly defaultRoutingBudgetPpm: number;
  private readonly requestTimeout: number;

  constructor(options?: {
    lnproxyUrl?: string;
    defaultRoutingBudgetPpm?: number;
    requestTimeout?: number;
  }) {
    // Use centralized environment variable helper

    this.lnproxyUrl =
      options?.lnproxyUrl ||
      getEnvVar("VITE_LNPROXY_URL") ||
      getEnvVar("LNPROXY_URL") ||
      "https://lnproxy.org";

    this.defaultRoutingBudgetPpm = options?.defaultRoutingBudgetPpm || 1000; // 0.1%
    this.requestTimeout = options?.requestTimeout || 30000; // 30 seconds
  }

  /**
   * Wraps a Lightning invoice for privacy protection
   *
   * @param originalInvoice - The original Lightning invoice to wrap
   * @param description - Optional description for the wrapped payment
   * @param routingBudgetPpm - Optional routing budget in PPM (default: 1000)
   * @returns Privacy-wrapped invoice or fallback to original
   */
  async wrapInvoiceForPrivacy(
    originalInvoice: string,
    description: string = "Satnam.pub family payment",
    routingBudgetPpm?: number
  ): Promise<PrivacyWrappedInvoice> {
    // Validate input
    if (!originalInvoice || !originalInvoice.trim()) {
      throw new Error("Original invoice cannot be empty");
    }

    // Basic Lightning invoice validation
    if (!originalInvoice.toLowerCase().startsWith("ln")) {
      throw new Error("Invalid Lightning invoice format");
    }

    const config: PrivacyWrapConfig = {
      invoice: originalInvoice.trim(),
      routing_budget_ppm: routingBudgetPpm || this.defaultRoutingBudgetPpm,
      description: description,
    };

    try {
      console.log("🔒 Attempting to wrap invoice for privacy...");

      const startTime = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.requestTimeout
      );

      const response = await fetch(`${this.lnproxyUrl}/api/spec`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(config),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        console.warn(
          `Privacy wrapping failed (HTTP ${response.status}), using original invoice`,
          { responseTime }
        );
        return this.createFallbackResponse(originalInvoice);
      }

      const result: LNProxyResponse = await response.json();

      if (result.error) {
        console.warn("Privacy wrapping API error:", result.error);
        return this.createFallbackResponse(originalInvoice);
      }

      if (!result.proxy_invoice) {
        console.warn("No proxy invoice returned from API");
        return this.createFallbackResponse(originalInvoice);
      }

      console.log("🟢 Privacy wrapping successful", {
        privacyFee: result.routing_fee || 0,
        responseTime,
      });

      return {
        wrappedInvoice: result.proxy_invoice,
        originalInvoice: originalInvoice,
        privacyFee: result.routing_fee || 0,
        isPrivacyEnabled: true,
      };
    } catch (error) {
      console.error("Privacy wrapping error:", error);

      // Handle different error types
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          console.warn("Privacy request timed out, using original invoice");
        } else if (error.message.includes("network")) {
          console.warn(
            "Network error during privacy wrapping, using original invoice"
          );
        }
      }

      // Always fallback to original invoice to ensure payments can still proceed
      return this.createFallbackResponse(originalInvoice);
    }
  }

  /**
   * Tests the connection to LNProxy service
   *
   * @returns Health status of the privacy service
   */
  async testPrivacyConnection(): Promise<PrivacyServiceHealth> {
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout for health check

      const response = await fetch(`${this.lnproxyUrl}/api/health`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      return {
        available: response.ok,
        responseTime,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      return {
        available: false,
        responseTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Creates a fallback response when privacy wrapping fails
   *
   * @private
   * @param originalInvoice - The original invoice to use as fallback
   * @returns Fallback response structure
   */
  private createFallbackResponse(
    originalInvoice: string
  ): PrivacyWrappedInvoice {
    return {
      wrappedInvoice: originalInvoice,
      originalInvoice: originalInvoice,
      privacyFee: 0,
      isPrivacyEnabled: false,
    };
  }

  /**
   * Gets the current LNProxy service URL
   *
   * @returns The configured LNProxy URL
   */
  public getServiceUrl(): string {
    return this.lnproxyUrl;
  }

  /**
   * Gets the default routing budget in PPM
   *
   * @returns Default routing budget
   */
  public getDefaultRoutingBudget(): number {
    return this.defaultRoutingBudgetPpm;
  }
}

/**
 * Utility function to create a privacy layer instance
 * Convenient for one-off usage
 *
 * @param options - Optional configuration
 * @returns New SatnamPrivacyLayer instance
 */
export function createPrivacyLayer(options?: {
  lnproxyUrl?: string;
  defaultRoutingBudgetPpm?: number;
  requestTimeout?: number;
}): SatnamPrivacyLayer {
  return new SatnamPrivacyLayer(options);
}

/**
 * Quick helper to wrap an invoice with default settings
 *
 * @param originalInvoice - Invoice to wrap
 * @param description - Optional description
 * @returns Privacy-wrapped invoice
 */
export async function wrapInvoiceForPrivacy(
  originalInvoice: string,
  description?: string
): Promise<PrivacyWrappedInvoice> {
  const privacy = createPrivacyLayer();
  return privacy.wrapInvoiceForPrivacy(originalInvoice, description);
}

// Export the main class as default for convenience
export default SatnamPrivacyLayer;
