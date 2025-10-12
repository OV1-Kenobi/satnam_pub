/**
 * Privacy-Enhanced API Service Layer
 * Centralizes all privacy-aware API calls with standardized privacy levels
 */

import { resolvePlatformLightningDomain } from "../config/domain.client";
import { PrivacyLevel, getDefaultPrivacyLevel } from "../types/privacy";

import {
  FamilyMemberWithPrivacy,
  GuardianApprovalRequest,
  GuardianApprovalResponse,
  IndividualWalletWithPrivacy,
  PaymentRequest,
  PaymentResponse,
  PrivacyAPIError,
  TransactionWithPrivacy,
} from "../../types/privacy-api";

export class PrivacyEnhancedApiService {
  private apiBaseUrl: string;

  constructor(apiBaseUrl: string = "/api") {
    this.apiBaseUrl = apiBaseUrl;
  }

  /**
   * Family API Methods with Privacy Support
   */

  /**
   * Make privacy-enhanced payment with flexible routing
   * Unified method that handles both family and individual payments
   */
  async makePrivacyEnhancedPayment(paymentData: {
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
  }> {
    try {
      // Convert the payment data to the standard PaymentRequest format
      const paymentRequest: PaymentRequest = {
        amount: paymentData.amount,
        recipient: paymentData.to,
        memo: paymentData.memo,
        privacyLevel: paymentData.privacyLevel,
        routingPreference: (paymentData.route as any) || "auto",
      };

      // Use individual payment method for now
      const response = await this.sendIndividualPayment(
        paymentData.from,
        paymentRequest
      );

      return {
        success: response.success,
        transactionId: response.paymentId,
        privacyScore: response.privacyMetrics?.anonymityScore,
        routingMethod: response.routingUsed,
        error: response.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Payment failed",
      };
    }
  }

  async sendPrivacyAwarePayment(
    familyId: string,
    paymentRequest: PaymentRequest
  ): Promise<PaymentResponse> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/family/privacy-enhanced-payments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Family-Id": familyId,
          },
          body: JSON.stringify(paymentRequest),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Payment failed");
      }

      return result as PaymentResponse;
    } catch (error) {
      throw this.handleApiError(error, "payment");
    }
  }

  async getFamilyMembersWithPrivacy(
    familyId: string
  ): Promise<FamilyMemberWithPrivacy[]> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/family/members?familyId=${familyId}&includePrivacy=true`
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to fetch family members");
      }

      return result.members as FamilyMemberWithPrivacy[];
    } catch (error) {
      throw this.handleApiError(error, "family_members");
    }
  }

  async createGuardianApprovalRequest(
    familyId: string,
    approvalRequest: GuardianApprovalRequest
  ): Promise<GuardianApprovalResponse> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/family/guardian-approvals`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Family-Id": familyId,
          },
          body: JSON.stringify(approvalRequest),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to create guardian approval");
      }

      return result as GuardianApprovalResponse;
    } catch (error) {
      throw this.handleApiError(error, "guardian_approval");
    }
  }

  /**
   * Individual API Methods with Privacy Support
   */

  async getIndividualWalletWithPrivacy(
    memberId: string
  ): Promise<IndividualWalletWithPrivacy> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/individual/wallet?memberId=${memberId}`
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to fetch wallet");
      }

      return result as IndividualWalletWithPrivacy;
    } catch (error) {
      throw this.handleApiError(error, "wallet_fetch");
    }
  }

  async updateIndividualPrivacySettings(
    memberId: string,
    privacySettings: any
  ): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/individual/wallet?memberId=${memberId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ privacySettings }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to update privacy settings");
      }

      return result;
    } catch (error) {
      throw this.handleApiError(error, "privacy_settings_update");
    }
  }

  async sendIndividualPayment(
    memberId: string,
    paymentRequest: PaymentRequest
  ): Promise<PaymentResponse> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/individual/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Member-Id": memberId,
        },
        body: JSON.stringify(paymentRequest),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Payment failed");
      }

      return result as PaymentResponse;
    } catch (error) {
      throw this.handleApiError(error, "individual_payment");
    }
  }

  /**
   * Communication API Methods with Privacy Support
   */

  async sendPrivacyMessage(
    recipient: string,
    content: string,
    privacyLevel: PrivacyLevel,
    communicationType: "family" | "individual" = "individual"
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Convert new privacy level to legacy format for compatibility
      const encryptionLevel = this.convertPrivacyLevelToLegacy(privacyLevel);

      const response = await fetch(
        `${this.apiBaseUrl}/communications/giftwrapped`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content,
            recipient,
            sender: "current_user", // TODO: Get from auth context
            encryptionLevel,
            communicationType,
            timestamp: new Date().toISOString(),
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Message failed");
      }

      return result;
    } catch (error) {
      throw this.handleApiError(error, "messaging");
    }
  }

  /**
   * Transaction History with Privacy Information
   */

  async getTransactionHistoryWithPrivacy(
    memberId: string,
    limit: number = 50
  ): Promise<TransactionWithPrivacy[]> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/individual/transactions?memberId=${memberId}&limit=${limit}&includePrivacy=true`
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to fetch transactions");
      }

      return result.transactions as TransactionWithPrivacy[];
    } catch (error) {
      throw this.handleApiError(error, "transaction_history");
    }
  }

  /**
   * Privacy Metrics and Analysis
   */

  async getPrivacyMetrics(
    memberId: string,
    timeRange: "day" | "week" | "month" = "week"
  ): Promise<{
    averagePrivacyLevel: PrivacyLevel;
    privacyLevelDistribution: Record<PrivacyLevel, number>;
    metadataProtectionScore: number;
    recommendedPrivacyLevel: PrivacyLevel;
  }> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/individual/privacy-metrics?memberId=${memberId}&timeRange=${timeRange}`
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to fetch privacy metrics");
      }

      return result;
    } catch (error) {
      throw this.handleApiError(error, "privacy_metrics");
    }
  }

  /**
   * Privacy Utility Methods
   */

  private convertPrivacyLevelToLegacy(
    privacyLevel: PrivacyLevel
  ): "standard" | "enhanced" | "maximum" {
    switch (privacyLevel) {
      case PrivacyLevel.MINIMAL:
        return "standard";
      case PrivacyLevel.ENCRYPTED:
        return "enhanced";
      case PrivacyLevel.GIFTWRAPPED:
        return "maximum";
      default:
        return "maximum";
    }
  }

  public handleApiError(error: any, context: string): PrivacyAPIError {
    console.error(`Privacy API Error (${context}):`, error);

    if (error instanceof Error) {
      return {
        error: error.message,
        code: `${context.toUpperCase()}_ERROR`,
        privacyImpact: this.assessPrivacyImpact(context),
      };
    }

    return {
      error: "Unknown error occurred",
      code: `${context.toUpperCase()}_UNKNOWN_ERROR`,
      privacyImpact: "none",
    };
  }

  private assessPrivacyImpact(
    context: string
  ): "none" | "metadata_leak" | "identity_exposure" {
    const highRiskContexts = ["messaging", "payment", "transaction_history"];
    const mediumRiskContexts = ["wallet_fetch", "family_members"];

    if (highRiskContexts.includes(context)) {
      return "metadata_leak";
    }

    if (mediumRiskContexts.includes(context)) {
      return "metadata_leak";
    }

    return "none";
  }

  /**
   * Privacy Level Validation and Recommendations
   */

  validatePrivacyLevel(
    privacyLevel: PrivacyLevel,
    context: string
  ): {
    valid: boolean;
    warning?: string;
    suggestedLevel?: PrivacyLevel;
  } {
    const validLevels = [
      PrivacyLevel.GIFTWRAPPED,
      PrivacyLevel.ENCRYPTED,
      PrivacyLevel.MINIMAL,
    ];

    if (!validLevels.includes(privacyLevel)) {
      return {
        valid: false,
        warning: "Invalid privacy level",
        suggestedLevel: getDefaultPrivacyLevel(),
      };
    }

    // Context-specific validation
    if (context === "large_payment" && privacyLevel === PrivacyLevel.MINIMAL) {
      return {
        valid: true,
        warning:
          "Minimal privacy for large payments may expose financial information",
        suggestedLevel: PrivacyLevel.GIFTWRAPPED,
      };
    }

    if (
      context === "family_communication" &&
      privacyLevel === PrivacyLevel.MINIMAL
    ) {
      return {
        valid: true,
        warning:
          "Minimal privacy for family communications may expose personal information",
        suggestedLevel: PrivacyLevel.ENCRYPTED,
      };
    }

    return { valid: true };
  }

  getPrivacyRecommendation(
    amount?: number,
    recipient?: string,
    context?: string
  ): PrivacyLevel {
    // Large amounts should use GIFTWRAPPED
    if (amount && amount > 1000000) {
      return PrivacyLevel.GIFTWRAPPED;
    }

    // Family context should use at least ENCRYPTED
    if (context === "family") {
      return PrivacyLevel.ENCRYPTED;
    }

    // External recipients should use GIFTWRAPPED
    if (
      recipient &&
      !recipient.includes(`@${resolvePlatformLightningDomain()}`)
    ) {
      return PrivacyLevel.GIFTWRAPPED;
    }

    return getDefaultPrivacyLevel();
  }
}

// Export singleton instance
export const privacyEnhancedApi = new PrivacyEnhancedApiService();

// Export error handler for global use
export function handlePrivacyApiError(
  error: any,
  context: string = "unknown"
): PrivacyAPIError {
  return privacyEnhancedApi.handleApiError(error, context);
}
