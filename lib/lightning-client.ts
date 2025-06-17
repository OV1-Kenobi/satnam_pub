// Lightning Client for Voltage/LNBits integration with Privacy Layer
import {
  SatnamPrivacyLayer,
  type PrivacyWrappedInvoice,
} from "./privacy/lnproxy-privacy";

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

export class LightningClient {
  private voltageUrl: string;
  private adminKey: string;
  private privacyLayer: SatnamPrivacyLayer;

  constructor() {
    // Environment variable helper that works in both Vite and Node.js
    const getEnvVar = (key: string): string => {
      if (typeof import.meta !== "undefined" && import.meta.env) {
        return import.meta.env[key] || "";
      }
      return process.env[key] || "";
    };

    // For now, using placeholder values - replace with your actual credentials
    this.voltageUrl =
      getEnvVar("VITE_VOLTAGE_LNBITS_URL") ||
      getEnvVar("VOLTAGE_LNBITS_URL") ||
      "https://demo.lnbits.com";
    this.adminKey =
      getEnvVar("VITE_VOLTAGE_LNBITS_ADMIN_KEY") ||
      getEnvVar("VOLTAGE_LNBITS_ADMIN_KEY") ||
      "demo-key";

    // Initialize privacy layer
    this.privacyLayer = new SatnamPrivacyLayer();
  }

  async getNodeStatus(): Promise<NodeStatus> {
    try {
      // Simulate API call for now - replace with actual API when ready
      console.log("Getting node status...");
      return { connected: true, info: "Demo node" };
    } catch (error) {
      console.error("Failed to get node status:", error);
      return { connected: false };
    }
  }

  async getFamilyWallets(): Promise<FamilyWallet[]> {
    try {
      // Simulate API call for now - replace with actual API when ready
      console.log("Getting family wallets...");
      return [
        { id: "1", name: "Family Treasury", balance: 100000 },
        { id: "2", name: "Kids Allowance", balance: 25000 },
      ];
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

      // Simulate payment for now - replace with actual API when ready
      console.log(
        `Sending ${amount} sats from ${fromWallet} to ${toWallet}`,
        memo
      );
      return { success: true, payment_hash: "demo-hash" };
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

      // Simulate invoice creation - replace with actual LNbits API call
      const originalInvoice = `lnbc${request.amount}n1...demo-invoice-${Date.now()}`;
      const paymentHash = `demo-hash-${Date.now()}`;
      const checkingId = `demo-checking-${Date.now()}`;

      console.log(`Created Lightning invoice for ${request.amount} sats`, {
        description: request.description,
        walletId: request.walletId,
      });

      const response: CreateInvoiceResponse = {
        invoice: originalInvoice,
        paymentHash,
        checkingId,
      };

      // SECURITY FIX: ENFORCE LNProxy privacy for ALL family payments
      if (enablePrivacy) {
        try {
          const privacyWrapped = await this.privacyLayer.wrapInvoiceForPrivacy(
            originalInvoice,
            request.description || "Satnam.pub family payment"
          );

          // CRITICAL: Verify privacy was successfully enabled
          if (!privacyWrapped.isPrivacyEnabled) {
            throw new Error(
              "Privacy protection failed - refusing to expose Lightning node identity"
            );
          }

          return {
            ...response,
            invoice: privacyWrapped.wrappedInvoice, // Use privacy-wrapped invoice as default
            privacy: privacyWrapped,
          };
        } catch (error) {
          console.error(
            "🚨 CRITICAL: Privacy wrapping failed for family payment:",
            error
          );
          // SECURITY: Do not fall back to unprotected invoices for family payments
          throw new Error(
            "Privacy protection required for family payments. Please check LNProxy service status."
          );
        }
      }

      return response;
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
      ? `Payment to ${familyMember}@satnam.pub: ${purpose}`
      : `Payment to ${familyMember}@satnam.pub`;

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
    return this.privacyLayer.testPrivacyConnection();
  }

  /**
   * Get privacy layer configuration
   *
   * @returns Privacy layer configuration details
   */
  getPrivacyConfig() {
    return {
      serviceUrl: this.privacyLayer.getServiceUrl(),
      defaultRoutingBudget: this.privacyLayer.getDefaultRoutingBudget(),
    };
  }
}
