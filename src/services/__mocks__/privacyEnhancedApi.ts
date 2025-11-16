import { vi } from "vitest";
import { PrivacyLevel } from "../../types/privacy";

// Manual Vitest mock for PrivacyEnhancedApiService used in frontend integration tests.
// Provides sensible defaults while allowing individual methods to be overridden
// with vi.mocked(...).mockResolvedValue(...).

export class PrivacyEnhancedApiService {
  private apiBaseUrl: string;

  constructor(apiBaseUrl: string = "/api") {
    this.apiBaseUrl = apiBaseUrl;
  }

  // Default recommendation: use strong privacy (Giftwrapped)
  getPrivacyRecommendation = vi.fn(
    (
      _amount?: number,
      _recipient?: string,
      _context?: string
    ): PrivacyLevel => {
      return PrivacyLevel.GIFTWRAPPED;
    }
  );

  // Return a structured validation result with score and recommendations
  validatePrivacyLevel = vi.fn(
    (privacyLevel: PrivacyLevel, context: string) => {
      const baseScore =
        privacyLevel === PrivacyLevel.GIFTWRAPPED
          ? 95
          : privacyLevel === PrivacyLevel.ENCRYPTED
          ? 80
          : 40;

      const recommendations: string[] = [];

      if (privacyLevel === PrivacyLevel.MINIMAL && context === "payment") {
        recommendations.push(
          "Consider using Giftwrapped privacy for sensitive payments."
        );
      } else {
        recommendations.push(
          "Current privacy level is appropriate for this context."
        );
      }

      return {
        valid: true,
        score: baseScore,
        recommendations,
      };
    }
  );

  // Mocked payment method; individual tests can override this implementation
  makePrivacyEnhancedPayment = vi.fn(
    async (_paymentData: {
      from: string;
      to: string;
      amount: number;
      memo?: string;
      privacyLevel: PrivacyLevel;
      route?: string;
    }): Promise<{
      success: boolean;
      transactionId?: string;
      privacyScore?: number;
      routingMethod?: string;
      error?: string;
    }> => {
      return {
        success: true,
        transactionId: "mock_tx",
        privacyScore: 95,
        routingMethod: "cashu",
      };
    }
  );
}
