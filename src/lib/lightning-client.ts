/**
 * Browser-compatible Lightning Client for Satnam.pub
 * Uses fetch API and Web Crypto API instead of Node.js modules
 */

interface NodeStatus {
  connected: boolean;
  [key: string]: any;
}

interface FamilyWallet {
  id: string;
  name: string;
  balance: number;
  [key: string]: any;
}

interface CreateInvoiceRequest {
  amount: number;
  description?: string;
  walletId?: string;
}

interface CreateInvoiceResponse {
  invoice: string;
  paymentHash: string;
  checkingId: string;
}

interface PrivacyWrappedInvoice {
  originalInvoice: string;
  wrappedInvoice: string;
  isPrivacyEnabled: boolean;
  routingBudget: number;
  privacyLevel: "standard" | "enhanced" | "maximum";
}

export class LightningClient {
  private apiBaseUrl: string;

  constructor() {
    this.apiBaseUrl = import.meta.env.VITE_API_URL || "/api";
  }

  async getNodeStatus(): Promise<NodeStatus> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/lightning/status`);
      if (response.ok) {
        return await response.json();
      }
      return { connected: false, error: "Failed to get status" };
    } catch (error) {
      console.error("Failed to get node status:", error);
      return {
        connected: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async getFamilyWallets(): Promise<FamilyWallet[]> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/family/wallets`);
      if (response.ok) {
        return await response.json();
      }
      return [];
    } catch (error) {
      console.error("Failed to get family wallets:", error);
      return [];
    }
  }

  async sendPayment(
    fromWallet: string,
    toWallet: string,
    amount: number,
    memo?: string
  ): Promise<any> {
    try {
      // CRITICAL: Validate payment parameters (ESSENTIAL FOR REAL FUNDS)
      if (!fromWallet || fromWallet.trim() === "") {
        throw new Error("Invalid fromWallet: cannot be empty");
      }

      if (!toWallet || toWallet.trim() === "") {
        throw new Error("Invalid toWallet: cannot be empty");
      }

      if (!amount || amount <= 0) {
        throw new Error("Invalid amount: must be positive number");
      }

      const response = await fetch(`${this.apiBaseUrl}/lightning/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fromWallet,
          toWallet,
          amount,
          memo,
        }),
      });

      if (!response.ok) {
        throw new Error("Payment failed");
      }

      return await response.json();
    } catch (error) {
      console.error("Failed to send payment:", error);
      throw error;
    }
  }

  /**
   * Create a Lightning invoice with optional privacy protection
   *
   * @param request - Invoice creation parameters
   * @param enablePrivacy - Whether to wrap the invoice for privacy (default: true)
   * @returns Invoice response with optional privacy wrapping
   */
  async createInvoice(
    request: CreateInvoiceRequest,
    enablePrivacy: boolean = true
  ): Promise<CreateInvoiceResponse & { privacy?: PrivacyWrappedInvoice }> {
    try {
      // Validate request parameters
      if (!request.amount || request.amount <= 0) {
        throw new Error("Invalid amount: must be positive number");
      }

      const response = await fetch(
        `${this.apiBaseUrl}/lightning/create-invoice`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...request,
            enablePrivacy,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to create invoice");
      }

      return await response.json();
    } catch (error) {
      console.error("Failed to create invoice:", error);
      throw error;
    }
  }

  /**
   * Create a privacy-enhanced invoice specifically for family payments
   *
   * @param familyMember - Name or identifier of family member
   * @param amount - Amount in satoshis
   * @param purpose - Purpose of the payment
   * @returns Privacy-wrapped invoice ready for sharing
   */
  async createFamilyInvoice(
    familyMember: string,
    amount: number,
    purpose?: string
  ): Promise<CreateInvoiceResponse & { privacy: PrivacyWrappedInvoice }> {
    const description = purpose
      ? `Payment to ${familyMember}@my.satnam.pub: ${purpose}`
      : `Payment to ${familyMember}@my.satnam.pub`;

    const invoice = await this.createInvoice(
      { amount, description },
      true // Always enable privacy for family payments
    );

    if (!invoice.privacy || !invoice.privacy.isPrivacyEnabled) {
      throw new Error("Privacy protection failed for family invoice");
    }

    return invoice as CreateInvoiceResponse & {
      privacy: PrivacyWrappedInvoice;
    };
  }

  /**
   * Check the health of the privacy service
   *
   * @returns Privacy service health status
   */
  async checkPrivacyHealth() {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/lightning/privacy-health`
      );
      if (response.ok) {
        return await response.json();
      }
      return { healthy: false, error: "Privacy service unavailable" };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get privacy layer configuration
   *
   * @returns Privacy layer configuration details
   */
  getPrivacyConfig() {
    return {
      serviceUrl: import.meta.env.VITE_LNPROXY_URL || "https://lnproxy.com",
      defaultRoutingBudget: 1000, // Default routing budget in sats
    };
  }
}
