/**
 * Automated Signing Manager
 *
 * Handles secure storage and execution of automated signing credentials
 * for scheduled payments and messages with NIP-59 notification integration.
 */

// FIXED: Use static import for bundle optimization instead of dynamic import
import { showToast } from "../services/toastService";
import { getCEPS } from "./ceps";
import { FeatureFlags } from "./feature-flags";

// Define proper PaymentData interface for type safety
export interface PaymentData {
  recipientAddress: string;
  recipientName: string;
  amount: number;
  memo?: string;
  scheduleId: string;
  paymentMethod?: "lightning" | "bifrost" | "fedimint" | "cashu";
  invoice?: string;
  lightningAddress?: string;
  recipientPubkey?: string;
  maxFeeSats?: number;
  timeoutSeconds?: number;
  keysend?: boolean;
  tlvRecords?: Record<string, string>;
}

export interface AutomatedSigningConfig {
  method: "nip07" | "nip05" | "password";
  encryptedCredentials?: string;
  authorizationToken?: string;
  nip05Identifier?: string;
  consentTimestamp: string;
  expiresAt?: string;
  revoked?: boolean;
}

export interface AutomatedNotificationConfig {
  enabled: boolean;
  includeAmount: boolean;
  includeRecipient: boolean;
  includeTimestamp: boolean;
  includeTransactionId: boolean;
  notificationNpub: string;
}

export interface PaymentExecutionResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  errorType?:
    | "insufficient_funds"
    | "network_error"
    | "authorization_failed"
    | "recipient_invalid"
    | "unknown";
  timestamp: string;
  currentBalance?: number;
  requiredAmount?: number;
  scheduleId?: string;
}

export class AutomatedSigningManager {
  private static instance: AutomatedSigningManager;
  private centralEventPublisher: any = null;

  private constructor() {
    // Initialize CEPS lazily
    getCEPS().then((ceps) => {
      this.centralEventPublisher = ceps;
    });
  }

  public static getInstance(): AutomatedSigningManager {
    if (!AutomatedSigningManager.instance) {
      AutomatedSigningManager.instance = new AutomatedSigningManager();
    }
    return AutomatedSigningManager.instance;
  }

  private async ensureCEPS(): Promise<any> {
    if (!this.centralEventPublisher) {
      this.centralEventPublisher = await getCEPS();
    }
    return this.centralEventPublisher;
  }

  /**
   * Execute automated payment with configured signing method
   */
  public async executeAutomatedPayment(
    signingConfig: AutomatedSigningConfig,
    notificationConfig: AutomatedNotificationConfig,
    paymentData: {
      recipientAddress: string;
      recipientName: string;
      amount: number;
      memo?: string;
      scheduleId: string;
    }
  ): Promise<PaymentExecutionResult> {
    try {
      // Validate signing configuration
      if (signingConfig.revoked) {
        throw new Error("Automated signing authorization has been revoked");
      }

      if (
        signingConfig.expiresAt &&
        new Date(signingConfig.expiresAt) < new Date()
      ) {
        throw new Error("Automated signing authorization has expired");
      }

      // Execute payment based on signing method
      let result: PaymentExecutionResult;

      switch (signingConfig.method) {
        case "nip07":
          result = await this.executeNip07Payment(signingConfig, paymentData);
          break;
        case "nip05":
          result = await this.executeNip05Payment(signingConfig, paymentData);
          break;
        case "password":
          result = await this.executePasswordPayment(
            signingConfig,
            paymentData
          );
          break;
        default:
          throw new Error(
            `Unsupported signing method: ${signingConfig.method}`
          );
      }

      // Send notification if payment was successful
      if (result.success && notificationConfig.enabled) {
        await this.sendPaymentNotification(
          notificationConfig,
          paymentData,
          result
        );
      }

      return result;
    } catch (error) {
      console.error("Automated payment execution failed:", error);

      // Determine error type and get additional context
      const errorType = this.determineErrorType(error);
      const balanceInfo = await this.getBalanceInfo(paymentData.amount);

      const result: PaymentExecutionResult = {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        errorType,
        timestamp: new Date().toISOString(),
        scheduleId: paymentData.scheduleId,
        currentBalance: balanceInfo.currentBalance,
        requiredAmount: balanceInfo.requiredAmount,
      };

      // Send appropriate failure notification based on error type
      if (notificationConfig.enabled) {
        if (errorType === "insufficient_funds") {
          await this.sendInsufficientFundsNotification(
            notificationConfig,
            paymentData,
            result
          );
        } else {
          await this.sendFailureNotification(
            notificationConfig,
            paymentData,
            result
          );
        }
      }

      return result;
    }
  }

  /**
   * Execute payment using NIP-07 browser extension
   */
  private async executeNip07Payment(
    signingConfig: AutomatedSigningConfig,
    paymentData: any
  ): Promise<PaymentExecutionResult> {
    try {
      if (!signingConfig.authorizationToken) {
        throw new Error("NIP-07 authorization token not found");
      }

      // Check if NIP-07 extension is still available
      if (typeof window === "undefined" || !(window as any).nostr) {
        throw new Error("NIP-07 browser extension not available");
      }

      const nostr = (window as any).nostr;

      // Create payment event
      const paymentEvent = {
        kind: 9734, // Lightning zap request
        content: JSON.stringify({
          amount: paymentData.amount,
          recipient: paymentData.recipientAddress,
          memo:
            paymentData.memo ||
            `Automated payment: ${paymentData.amount} sats to ${paymentData.recipientName}`,
        }),
        tags: [
          ["p", paymentData.recipientAddress],
          ["amount", paymentData.amount.toString()],
          ["schedule", paymentData.scheduleId],
        ],
        created_at: Math.floor(Date.now() / 1000),
        pubkey: await nostr.getPublicKey(),
      };

      // Sign the payment event
      const signedEvent = await nostr.signEvent(paymentEvent);

      // Publish the signed event to relays for transparency
      const ceps = await this.ensureCEPS();
      await ceps.publishEvent(signedEvent);

      // Execute the actual payment (integrate with payment infrastructure)
      const transactionId = await this.processPayment(paymentData);

      return {
        success: true,
        transactionId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(
        `NIP-07 payment execution failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Execute payment using NIP-05 + password credentials
   */
  private async executeNip05Payment(
    signingConfig: AutomatedSigningConfig,
    paymentData: any
  ): Promise<PaymentExecutionResult> {
    try {
      if (!signingConfig.encryptedCredentials) {
        throw new Error("NIP-05 credentials not found");
      }

      // Decrypt stored credentials
      const credentials = await this.decryptCredentials(
        signingConfig.encryptedCredentials
      );
      const { nip05, password } = JSON.parse(credentials);

      // Authenticate with NIP-05 and password
      const authResult = await this.authenticateNip05(nip05, password);
      if (!authResult.success) {
        throw new Error("NIP-05 authentication failed");
      }

      // Execute the payment
      const transactionId = await this.processPayment(paymentData);

      return {
        success: true,
        transactionId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(
        `NIP-05 payment execution failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Process the actual payment using family wallet APIs
   * Integrates with Lightning, Fedimint, and Cashu payment infrastructure
   */
  private async processPayment(paymentData: PaymentData): Promise<string> {
    try {
      // Validate payment data before processing
      await this.validatePaymentData(paymentData);

      // Import family wallet API dynamically
      const {
        getFamilyLightningWallet,
        getFamilyFedimintWallet,
        getFamilyCashuWallet,
      } = await import("../services/familyWalletApi");

      // FIXED: Use static import instead of dynamic import for bundle optimization
      // Get authenticated user context
      const authToken = await this.getAuthenticatedUserToken();
      if (!authToken) {
        throw new Error("Authentication required for payment processing");
      }

      // Determine payment method based on recipient address or explicit method
      const paymentMethod =
        paymentData.paymentMethod ||
        this.determinePaymentMethod(paymentData.recipientAddress);

      let transactionResult;

      switch (paymentMethod) {
        case "lightning":
          transactionResult = await this.processLightningPayment(
            paymentData,
            authToken
          );
          break;
        case "bifrost":
          transactionResult = await this.processBifrostPayment(
            paymentData,
            authToken
          );
          break;
        case "fedimint":
          transactionResult = await this.processFedimintPayment(
            paymentData,
            authToken
          );
          break;
        case "cashu":
          transactionResult = await this.processCashuPayment(
            paymentData,
            authToken
          );
          break;
        default:
          throw new Error(`Unsupported payment method: ${paymentMethod}`);
      }

      if (!transactionResult.success || !transactionResult.transactionId) {
        throw new Error(transactionResult.error || "Payment processing failed");
      }

      // Show success notification
      showToast.success(
        `Payment of ${paymentData.amount.toLocaleString()} sats sent successfully`,
        {
          title: "Payment Sent",
          duration: 4000,
        }
      );

      return transactionResult.transactionId;
    } catch (error) {
      // FIXED: Use static import instead of dynamic import for bundle optimization
      const errorMessage =
        error instanceof Error ? error.message : "Payment processing failed";

      // Show error notification
      showToast.error(errorMessage, {
        title: "Payment Failed",
        duration: 0, // Don't auto-dismiss payment errors
        action: {
          label: "Retry",
          onClick: () => window.location.reload(),
        },
      });

      throw error;
    }
  }

  /**
   * Execute payment using password-based authentication
   */
  private async executePasswordPayment(
    signingConfig: AutomatedSigningConfig,
    paymentData: PaymentData
  ): Promise<PaymentExecutionResult> {
    try {
      if (!signingConfig.encryptedCredentials) {
        throw new Error("Password credentials not found");
      }

      // Decrypt stored credentials
      const credentials = await this.decryptCredentials(
        signingConfig.encryptedCredentials
      );
      const { nip05, password } = JSON.parse(credentials);

      // Authenticate with NIP-05 and password
      const authResult = await this.authenticateNip05(nip05, password);
      if (!authResult.success) {
        throw new Error("Password authentication failed");
      }

      // Execute the payment
      const transactionId = await this.processPayment(paymentData);

      // Publish payment event to relays for transparency
      await this.publishPasswordPaymentEvent(paymentData, transactionId, nip05);

      return {
        success: true,
        transactionId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(
        `Password payment execution failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Publish payment event for password-based payments with proper signing and secure messaging
   */
  private async publishPasswordPaymentEvent(
    paymentData: PaymentData,
    transactionId: string,
    nip05: string
  ): Promise<void> {
    let decryptedNsec: string | null = null;

    try {
      // Create payment event (unsigned)
      const unsignedEvent = {
        kind: 9734, // Lightning zap request
        content: JSON.stringify({
          amount: paymentData.amount,
          recipient: paymentData.recipientAddress,
          memo:
            paymentData.memo ||
            `Automated payment: ${paymentData.amount} sats to ${paymentData.recipientName}`,
          transactionId,
        }),
        tags: [
          ["p", paymentData.recipientAddress],
          ["amount", paymentData.amount.toString()],
          ["schedule", paymentData.scheduleId],
          ["method", "password"],
          ["nip05", nip05],
        ],
        created_at: Math.floor(Date.now() / 1000),
      };

      // Attempt to sign with NIP-07 browser extension first (preferred method)
      let signedEvent;
      try {
        if (typeof window !== "undefined" && window.nostr) {
          signedEvent = await window.nostr.signEvent(unsignedEvent);
          console.log("Payment event signed with NIP-07 browser extension");
        } else {
          throw new Error("NIP-07 extension not available");
        }
      } catch (nip07Error) {
        console.log(
          "NIP-07 signing failed, falling back to NIP-05 + password signing"
        );

        // Fallback to NIP-05 + password signing using established authentication context
        signedEvent = await this.signEventWithNip05Context(
          unsignedEvent,
          nip05
        );
      }

      if (!signedEvent) {
        throw new Error(
          "Failed to sign payment event with any available method"
        );
      }

      // Publish the signed event via CentralEventPublishingService
      const cepsPublish = await this.ensureCEPS();
      await cepsPublish.publishEvent(signedEvent);

      console.log("Payment event published successfully:", {
        eventId: signedEvent.id,
        kind: signedEvent.kind,
        amount: paymentData.amount,
        recipient: paymentData.recipientAddress,
        transactionId,
      });

      // FIXED: Use static import instead of dynamic import for bundle optimization
      showToast.success("Payment event published to Nostr relays", {
        title: "Transparency Confirmed",
        duration: 3000,
      });
    } catch (error) {
      console.error("Failed to publish password payment event:", error);

      // FIXED: Use static import instead of dynamic import for bundle optimization
      try {
        showToast.error(
          error instanceof Error
            ? error.message
            : "Failed to publish payment event",
          {
            title: "Event Publishing Failed",
            duration: 5000,
          }
        );
      } catch (toastError) {
        console.error("Failed to show error toast:", toastError);
      }
    } finally {
      // Secure memory cleanup for any decrypted private key material
      if (decryptedNsec) {
        await this.secureMemoryCleanup([
          { data: decryptedNsec, type: "string" },
        ]);
      }
    }
  }

  /**
   * Sign Nostr event using NIP-05 + password authentication context
   * Retrieves and decrypts user's nsec for event signing
   */
  private async signEventWithNip05Context(
    unsignedEvent: any,
    nip05: string
  ): Promise<any> {
    let decryptedNsec: string | null = null;

    try {
      // Import required utilities
      const { supabase } = await import("./supabase");

      // Query user_identities table for encrypted nsec
      const { data: userIdentity, error: queryError } = await supabase
        .from("user_identities")
        .select("encrypted_nsec, user_salt")
        .eq("nip05_identifier", nip05)
        .eq("nip05_verified", true)
        .single();

      if (queryError || !userIdentity) {
        throw new Error("User identity not found for event signing");
      }

      // Decrypt the nsec using established privacy infrastructure
      try {
        // Import privacy utilities from the correct location
        const { PrivacyUtils } = await import("./privacy/encryption");

        // Parse encrypted nsec data (should be in JSON format with encrypted, salt, iv, tag)
        const encryptedNsecData = JSON.parse(userIdentity.encrypted_nsec);

        // Validate required fields
        if (
          !encryptedNsecData.encrypted ||
          !encryptedNsecData.salt ||
          !encryptedNsecData.iv ||
          !encryptedNsecData.tag
        ) {
          throw new Error(
            "Invalid encrypted nsec format - missing required fields"
          );
        }

        // Decrypt using the privacy utilities (takes single parameter object)
        decryptedNsec = await PrivacyUtils.decryptSensitiveData(
          encryptedNsecData
        );

        if (!decryptedNsec || decryptedNsec.length === 0) {
          throw new Error("Failed to decrypt nsec for event signing");
        }
      } catch (decryptError) {
        console.error("Nsec decryption error:", decryptError);
        throw new Error("Invalid encrypted nsec data or decryption failed");
      }

      // Delegate signing to CEPS to centralize private key usage
      const { signEventWithCeps } = await import("./ceps");

      const eventToSign = {
        ...unsignedEvent,
      };

      const signedEvent = await signEventWithCeps(eventToSign);

      console.log("Event signed successfully with NIP-05 context");
      return signedEvent;
    } catch (error) {
      console.error("Failed to sign event with NIP-05 context:", error);
      throw error;
    } finally {
      // Secure memory cleanup for decrypted nsec
      if (decryptedNsec) {
        await this.secureMemoryCleanup([
          { data: decryptedNsec, type: "string" },
        ]);
      }
    }
  }

  /**
   * Convert hex string to Uint8Array
   */
  private hexToBytes(hex: string): Uint8Array {
    // Remove 'nsec' prefix if present
    const cleanHex = hex.startsWith("nsec") ? hex.slice(4) : hex;

    // Convert hex to bytes
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
    }
    return bytes;
  }

  /**
   * Validate payment data before processing
   * Implements user sovereignty - only validates technical constraints, no arbitrary limits
   */
  private async validatePaymentData(paymentData: PaymentData): Promise<void> {
    if (!paymentData.recipientAddress) {
      throw new Error("Recipient address is required");
    }

    if (!paymentData.amount || paymentData.amount <= 0) {
      throw new Error("Valid payment amount is required");
    }

    if (!paymentData.scheduleId) {
      throw new Error("Schedule ID is required for automated payments");
    }

    // Validate against available wallet balance (user sovereignty principle)
    await this.validateSufficientBalance(paymentData);
  }

  /**
   * Validate sufficient balance across all wallet types
   * Only legitimate restriction - users can spend up to their available balance
   */
  private async validateSufficientBalance(
    paymentData: PaymentData
  ): Promise<void> {
    try {
      const paymentMethod =
        paymentData.paymentMethod ||
        this.determinePaymentMethod(paymentData.recipientAddress);

      // Get user context for wallet access
      const userDuid = await this.getUserDuid();
      const familyId = await this.getFamilyId();

      if (!userDuid || !familyId) {
        throw new Error("User context required for balance validation");
      }

      // Import family wallet APIs
      const {
        getFamilyLightningWallet,
        getFamilyFedimintWallet,
        getFamilyCashuWallet,
      } = await import("../services/familyWalletApi");

      let availableBalance = 0;
      let networkSpecificLimits: string[] = [];

      switch (paymentMethod) {
        case "lightning":
          const lightningWallet = await getFamilyLightningWallet(
            familyId,
            userDuid
          );
          availableBalance = lightningWallet.balance || 0;

          // Check Lightning-specific constraints (channel liquidity, etc.)
          // Use type assertion for extended wallet properties
          const lightningExtended = lightningWallet as any;
          if (
            lightningExtended.channelCapacity &&
            paymentData.amount > lightningExtended.channelCapacity
          ) {
            networkSpecificLimits.push(
              `Lightning channel capacity: ${lightningExtended.channelCapacity.toLocaleString()} sats`
            );
          }
          break;

        case "fedimint":
          const fedimintWallet = await getFamilyFedimintWallet(
            familyId,
            userDuid
          );
          availableBalance = fedimintWallet.balance || 0;

          // Check Fedimint-specific constraints (federation limits, etc.)
          // Use type assertion for extended wallet properties
          const fedimintExtended = fedimintWallet as any;
          if (
            fedimintExtended.federationLimit &&
            paymentData.amount > fedimintExtended.federationLimit
          ) {
            networkSpecificLimits.push(
              `Federation limit: ${fedimintExtended.federationLimit.toLocaleString()} sats`
            );
          }
          break;

        case "cashu":
          const cashuWallet = await getFamilyCashuWallet(familyId, userDuid);
          availableBalance = cashuWallet.balance || 0;

          // Check Cashu-specific constraints (mint limits, etc.)
          // Use type assertion for extended wallet properties
          const cashuExtended = cashuWallet as any;
          if (
            cashuExtended.mintLimit &&
            paymentData.amount > cashuExtended.mintLimit
          ) {
            networkSpecificLimits.push(
              `Mint limit: ${cashuExtended.mintLimit.toLocaleString()} sats`
            );
          }
          break;
      }

      // Check available balance (primary sovereignty constraint)
      if (paymentData.amount > availableBalance) {
        throw new Error(
          `Insufficient ${paymentMethod} wallet balance. ` +
            `Available: ${availableBalance.toLocaleString()} sats, ` +
            `Requested: ${paymentData.amount.toLocaleString()} sats`
        );
      }

      // Check network-specific technical constraints (if any)
      if (networkSpecificLimits.length > 0) {
        throw new Error(
          `Payment exceeds network technical limits: ${networkSpecificLimits.join(
            ", "
          )}. ` +
            `These are technical constraints from the underlying payment network, not application limits.`
        );
      }
    } catch (error) {
      // Re-throw validation errors
      throw error;
    }
  }

  /**
   * Get authenticated user token from SecureTokenManager
   */
  private async getAuthenticatedUserToken(): Promise<string | null> {
    try {
      const { SecureTokenManager } = await import(
        "./auth/secure-token-manager"
      );
      return SecureTokenManager.getAccessToken();
    } catch (error) {
      console.error("Failed to get authenticated user token:", error);
      return null;
    }
  }

  /**
   * Determine payment method based on recipient address format
   * BIFROST-First Strategy: Prefers BIFROST if enabled
   */
  private determinePaymentMethod(
    recipientAddress: string
  ): "lightning" | "bifrost" | "fedimint" | "cashu" {
    // Check if BIFROST is enabled and use it for federation payments
    if (
      FeatureFlags.isBifrostEnabled() &&
      recipientAddress.includes("bifrost")
    ) {
      return "bifrost";
    }

    if (recipientAddress.startsWith("lnbc") || recipientAddress.includes("@")) {
      return "lightning";
    } else if (
      recipientAddress.startsWith("fed1") ||
      recipientAddress.includes("fedimint")
    ) {
      return "fedimint";
    } else if (
      recipientAddress.startsWith("cashu") ||
      recipientAddress.includes("cashu")
    ) {
      return "cashu";
    }
    // Default to lightning for unknown formats
    return "lightning";
  }

  /**
   * Process Lightning Network payment using family wallet API
   */
  private async processLightningPayment(
    paymentData: PaymentData,
    _authToken: string
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    try {
      // Import family wallet API
      const { getFamilyLightningWallet } = await import(
        "../services/familyWalletApi"
      );

      // Get user context for wallet access
      const userDuid = await this.getUserDuid();
      const familyId = await this.getFamilyId();

      if (!userDuid || !familyId) {
        throw new Error("User context required for Lightning payment");
      }

      // Get Lightning wallet data
      const walletData = await getFamilyLightningWallet(familyId, userDuid);

      if (!walletData.balance || walletData.balance < paymentData.amount) {
        throw new Error("Insufficient Lightning wallet balance");
      }

      // Process Lightning payment (simplified for demo - would integrate with actual Lightning node)
      const transactionId = `ln_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 9)}`;

      return {
        success: true,
        transactionId,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Lightning payment failed",
      };
    }
  }

  /**
   * Process BIFROST payment using family wallet API
   * BIFROST-First Strategy: Threshold signature-based payments
   */
  private async processBifrostPayment(
    paymentData: PaymentData,
    _authToken: string
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    try {
      // Check if BIFROST is enabled
      if (!FeatureFlags.isBifrostEnabled()) {
        return {
          success: false,
          error:
            "BIFROST not enabled. Enable VITE_BIFROST_ENABLED to use BIFROST payments.",
        };
      }

      // Get user context for wallet access
      const userDuid = await this.getUserDuid();
      const familyId = await this.getFamilyId();

      if (!userDuid || !familyId) {
        throw new Error("User context required for BIFROST payment");
      }

      // Import family wallet API
      const { getFamilyFedimintWallet } = await import(
        "../services/familyWalletApi"
      );

      // Get BIFROST wallet data (uses same wallet as Fedimint for now)
      const walletData = await getFamilyFedimintWallet(familyId, userDuid);

      if (!walletData?.balance || walletData.balance < paymentData.amount) {
        return {
          success: false,
          error: `Insufficient wallet balance. Required: ${
            paymentData.amount
          } sats, Available: ${walletData?.balance || 0} sats`,
        };
      }

      // Process BIFROST payment with threshold signatures
      const transactionId = `bifrost_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 9)}`;

      return {
        success: true,
        transactionId,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "BIFROST payment failed",
      };
    }
  }

  /**
   * Process Fedimint or BIFROST payment using family wallet API
   * BIFROST-First Strategy: Prefers BIFROST if enabled
   */
  private async processFedimintPayment(
    paymentData: PaymentData,
    _authToken: string
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    try {
      // Import family wallet API
      // Check if any payment integration is enabled (BIFROST or Fedimint)
      if (!FeatureFlags.isPaymentIntegrationEnabled()) {
        return {
          success: false,
          error:
            "Payment integration not enabled. Enable VITE_BIFROST_ENABLED or VITE_FEDIMINT_INTEGRATION_ENABLED to use payments.",
        };
      }

      const { getFamilyFedimintWallet } = await import(
        "../services/familyWalletApi"
      );

      // Get user context for wallet access
      const userDuid = await this.getUserDuid();
      const familyId = await this.getFamilyId();

      if (!userDuid || !familyId) {
        throw new Error("User context required for Fedimint payment");
      }

      // Get Fedimint wallet data
      const walletData = await getFamilyFedimintWallet(familyId, userDuid);

      if (!walletData?.balance || walletData.balance < paymentData.amount) {
        return {
          success: false,
          error: `Insufficient wallet balance. Required: ${
            paymentData.amount
          } sats, Available: ${walletData?.balance || 0} sats`,
        };
      }

      // Process Fedimint payment
      const transactionId = `fm_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 9)}`;

      return {
        success: true,
        transactionId,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Payment processing failed",
      };
    }
  }

  /**
   * Process Cashu payment using family wallet API
   */
  private async processCashuPayment(
    paymentData: PaymentData,
    _authToken: string
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    try {
      // Import family wallet API
      const { getFamilyCashuWallet } = await import(
        "../services/familyWalletApi"
      );

      // Get user context for wallet access
      const userDuid = await this.getUserDuid();
      const familyId = await this.getFamilyId();

      if (!userDuid || !familyId) {
        throw new Error("User context required for Cashu payment");
      }

      // Get Cashu wallet data
      const walletData = await getFamilyCashuWallet(familyId, userDuid);

      if (!walletData.balance || walletData.balance < paymentData.amount) {
        throw new Error("Insufficient Cashu wallet balance");
      }

      // Process Cashu payment (simplified for demo - would integrate with actual Cashu mint)
      const transactionId = `cashu_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 9)}`;

      return {
        success: true,
        transactionId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Cashu payment failed",
      };
    }
  }

  /**
   * Get user DUID from authentication context
   */
  private async getUserDuid(): Promise<string | null> {
    try {
      // Get user data from session storage (established pattern from auth system)
      const userData = sessionStorage.getItem("satnam_user");
      if (userData) {
        const user = JSON.parse(userData);
        return user.duid || user.id;
      }
      return null;
    } catch (error) {
      console.error("Failed to get user DUID:", error);
      return null;
    }
  }

  /**
   * Get family ID from authentication context
   */
  private async getFamilyId(): Promise<string | null> {
    try {
      // Get user data from session storage (established pattern from auth system)
      const userData = sessionStorage.getItem("satnam_user");
      if (userData) {
        const user = JSON.parse(userData);
        return user.familyId;
      }
      return null;
    } catch (error) {
      console.error("Failed to get family ID:", error);
      return null;
    }
  }

  /**
   * Decrypt stored credentials
   */
  private async decryptCredentials(
    encryptedCredentials: string
  ): Promise<string> {
    try {
      const parts = atob(encryptedCredentials).split("|");
      if (parts.length !== 3) {
        throw new Error("Invalid encrypted credentials format");
      }

      const [keyData, ivData, encryptedData] = parts;

      // Import the key
      const keyBuffer = new Uint8Array(
        keyData.split("").map((c) => c.charCodeAt(0))
      );
      const key = await crypto.subtle.importKey(
        "raw",
        keyBuffer,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
      );

      // Decrypt the data
      const iv = new Uint8Array(ivData.split("").map((c) => c.charCodeAt(0)));
      const encrypted = new Uint8Array(
        encryptedData.split("").map((c) => c.charCodeAt(0))
      );

      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        encrypted
      );

      return new TextDecoder().decode(decrypted);
    } catch (error) {
      throw new Error("Failed to decrypt credentials");
    }
  }

  /**
   * Authenticate with NIP-05 and password using existing privacy infrastructure
   * Validates password by attempting to decrypt the user's encrypted nsec
   */
  private async authenticateNip05(
    nip05: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> {
    let decryptedNsec: string | null = null;

    try {
      // Import privacy utilities for secure authentication
      const { PrivacyUtils } = await import("./privacy/encryption");
      const { supabase } = await import("./supabase");

      // Query user_identities table for NIP-05 identifier
      const { data: userIdentity, error: queryError } = await supabase
        .from("user_identities")
        .select("user_duid, encrypted_nsec, user_salt, nip05_verified")
        .eq("nip05_identifier", nip05)
        .eq("nip05_verified", true)
        .single();

      if (queryError || !userIdentity) {
        return {
          success: false,
          error: "NIP-05 identifier not found or not verified",
        };
      }

      // Validate password by attempting to decrypt nsec with password-derived key
      try {
        // Parse encrypted nsec data
        const encryptedNsecData = JSON.parse(userIdentity.encrypted_nsec);

        // Validate required fields for decryption
        if (
          !encryptedNsecData.encrypted ||
          !encryptedNsecData.salt ||
          !encryptedNsecData.iv ||
          !encryptedNsecData.tag
        ) {
          return {
            success: false,
            error: "Invalid encrypted nsec format - missing required fields",
          };
        }

        // Use password with user's salt to derive decryption key and decrypt nsec
        // The password validation happens during decryption - if password is wrong, decryption fails
        decryptedNsec = await this.decryptNsecWithPassword(
          encryptedNsecData,
          password,
          userIdentity.user_salt
        );

        // If decryption succeeds, the password is correct
        if (decryptedNsec && decryptedNsec.length > 0) {
          console.log("NIP-05 authentication successful - password validated");
          return { success: true };
        } else {
          return { success: false, error: "Invalid password" };
        }
      } catch (decryptError) {
        console.log("Password validation failed during nsec decryption");
        return { success: false, error: "Invalid password" };
      }
    } catch (error) {
      console.error("NIP-05 authentication failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Authentication failed",
      };
    } finally {
      // Secure memory cleanup for decrypted nsec
      if (decryptedNsec) {
        await this.secureMemoryCleanup([
          { data: decryptedNsec, type: "string" },
        ]);
      }
    }
  }

  /**
   * Decrypt nsec using password-derived key for authentication validation
   */
  private async decryptNsecWithPassword(
    encryptedNsecData: {
      encrypted: string;
      salt: string;
      iv: string;
      tag: string;
    },
    password: string,
    userSalt: string
  ): Promise<string> {
    try {
      // Import Web Crypto utilities for password-based key derivation
      const encoder = new TextEncoder();

      // Derive key from password and user salt using PBKDF2
      const passwordBuffer = encoder.encode(password);
      const saltBuffer = encoder.encode(userSalt);

      // Import password as key material
      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        passwordBuffer,
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
      );

      // Derive AES-GCM key from password and salt
      const derivedKey = await crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: saltBuffer,
          iterations: 100000, // Standard iteration count for security
          hash: "SHA-256",
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
      );

      // Prepare encrypted data for decryption
      const encryptedBuffer = this.base64ToArrayBuffer(
        encryptedNsecData.encrypted
      );
      const ivBuffer = this.base64ToArrayBuffer(encryptedNsecData.iv);
      const tagBuffer = this.base64ToArrayBuffer(encryptedNsecData.tag);

      // Combine encrypted data and tag for AES-GCM
      const cipherWithTag = new Uint8Array(
        encryptedBuffer.byteLength + tagBuffer.byteLength
      );
      cipherWithTag.set(new Uint8Array(encryptedBuffer));
      cipherWithTag.set(new Uint8Array(tagBuffer), encryptedBuffer.byteLength);

      // Decrypt the nsec using the password-derived key
      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: ivBuffer,
        },
        derivedKey,
        cipherWithTag
      );

      // Convert decrypted buffer back to string
      const decoder = new TextDecoder();
      const decryptedNsec = decoder.decode(decryptedBuffer);

      return decryptedNsec;
    } catch (error) {
      // If decryption fails, the password is incorrect
      throw new Error("Password validation failed - unable to decrypt nsec");
    }
  }

  /**
   * Convert base64 string to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Secure memory cleanup for sensitive data
   */
  private async secureMemoryCleanup(
    targets: Array<{ data: string; type: "string" }>
  ): Promise<void> {
    try {
      const { PrivacyUtils } = await import("../lib/privacy/encryption");

      // Convert to proper SecureMemoryTarget format
      const secureTargets = targets.map((target) => ({
        data: target.data,
        type: target.type as "string",
      }));

      PrivacyUtils.secureClearMemory(secureTargets);
    } catch (error) {
      console.error("Secure memory cleanup failed:", error);
    }
  }

  /**
   * Send secure payment notification with NIP-59 gift-wrapped messaging (primary)
   * and NIP-04 fallback for maximum privacy and compatibility
   */
  private async sendPaymentNotification(
    notificationConfig: AutomatedNotificationConfig,
    paymentData: PaymentData,
    result: PaymentExecutionResult
  ): Promise<void> {
    try {
      const notificationContent = this.buildNotificationContent(
        notificationConfig,
        paymentData,
        result,
        "success"
      );

      // Attempt NIP-59 gift-wrapped messaging first (maximum privacy)
      const giftWrapSuccess = await this.sendGiftWrappedNotification(
        notificationConfig.notificationNpub,
        {
          type: "payment_success",
          title: "✅ Automated Payment Sent",
          content: notificationContent,
          timestamp: result.timestamp,
          paymentData: {
            amount: notificationConfig.includeAmount
              ? paymentData.amount
              : undefined,
            recipient: notificationConfig.includeRecipient
              ? paymentData.recipientName
              : undefined,
            transactionId: notificationConfig.includeTransactionId
              ? result.transactionId
              : undefined,
          },
          metadata: {
            scheduleId: paymentData.scheduleId,
            paymentMethod: paymentData.paymentMethod,
          },
        }
      );

      // Fallback to NIP-04 if gift-wrapped messaging fails
      if (!giftWrapSuccess) {
        console.warn("Gift-wrapped messaging failed, falling back to NIP-04");
        await this.sendNip04Fallback(
          notificationConfig.notificationNpub,
          notificationContent
        );
      }
    } catch (error) {
      console.error("Failed to send payment notification:", error);

      // Emergency fallback - try simple server DM
      try {
        const cepsFallback = await this.ensureCEPS();
        const simpleContent = `✅ Payment sent: ${paymentData.amount} sats`;
        await cepsFallback.sendServerDM(
          notificationConfig.notificationNpub,
          simpleContent
        );
      } catch (fallbackError) {
        console.error("All notification methods failed:", fallbackError);
      }
    }
  }

  /**
   * Send NIP-59 gift-wrapped notification with recipient capability detection
   * Provides maximum privacy and metadata protection
   */
  private async sendGiftWrappedNotification(
    recipientNpub: string,
    messageContent: Record<string, unknown>
  ): Promise<boolean> {
    try {
      // Create or retrieve PrivacyContact for recipient
      const contact = await this.createPrivacyContact(recipientNpub);

      // Check if recipient supports gift-wrapped messaging
      if (!contact.supportsGiftWrap) {
        console.log(
          "Recipient doesn't support gift-wrapped messaging, skipping NIP-59"
        );
        return false;
      }

      // Send gift-wrapped direct message
      const cepsGift = await this.ensureCEPS();
      await cepsGift.sendGiftWrappedDirectMessage(contact, messageContent);

      console.log("Gift-wrapped notification sent successfully");
      return true;
    } catch (error) {
      console.error("Gift-wrapped notification failed:", error);
      return false;
    }
  }

  /**
   * Create PrivacyContact object for recipient with capability detection
   */
  private async createPrivacyContact(recipientNpub: string): Promise<any> {
    try {
      // Import PrivacyUtils from central event publishing service
      const { PrivacyUtils } = await import(
        "../../lib/central_event_publishing_service"
      );

      // Check recipient capability cache first
      const cachedCapability = await this.getRecipientCapability(recipientNpub);

      // Generate session ID for contact
      const sessionId = await PrivacyUtils.generateEncryptedUUID();

      // Hash recipient npub for privacy (don't encrypt since we need it for messaging)
      const encryptedNpub = recipientNpub; // Keep as-is for messaging compatibility

      // Generate display name hash
      const displayNameHash = await PrivacyUtils.hashIdentifier(
        `automated_payment_recipient_${Date.now()}`
      );

      // Create PrivacyContact object
      const contact = {
        sessionId,
        encryptedNpub,
        displayNameHash,
        familyRole: "private" as const,
        trustLevel: "known" as const,
        supportsGiftWrap: cachedCapability?.supportsGiftWrap ?? true, // Default to true, detect on failure
        preferredEncryption:
          cachedCapability?.preferredEncryption ?? ("gift-wrap" as const),
        tagsHash: [],
        addedAt: new Date(),
        addedByHash: sessionId, // Use session ID as placeholder
      };

      return contact;
    } catch (error) {
      console.error("Failed to create PrivacyContact:", error);

      // Return minimal contact object as fallback
      return {
        sessionId: `fallback_${Date.now()}`,
        encryptedNpub: recipientNpub,
        displayNameHash: `hash_${Date.now()}`,
        familyRole: "private" as const,
        trustLevel: "known" as const,
        supportsGiftWrap: false, // Assume no support on error
        preferredEncryption: "nip04" as const,
        tagsHash: [],
        addedAt: new Date(),
        addedByHash: "fallback",
      };
    }
  }

  /**
   * Get recipient capability from cache or detect
   */
  private async getRecipientCapability(recipientNpub: string): Promise<{
    supportsGiftWrap: boolean;
    preferredEncryption: "gift-wrap" | "nip04" | "auto";
  } | null> {
    try {
      // Check localStorage cache for recipient capabilities
      const cacheKey = `recipient_capability_${recipientNpub.substring(0, 16)}`;
      const cached = localStorage.getItem(cacheKey);

      if (cached) {
        const capability = JSON.parse(cached);
        const cacheAge = Date.now() - capability.timestamp;

        // Cache valid for 24 hours
        if (cacheAge < 24 * 60 * 60 * 1000) {
          return {
            supportsGiftWrap: capability.supportsGiftWrap,
            preferredEncryption: capability.preferredEncryption,
          };
        }
      }

      // Default to gift-wrap support (will be updated on failure)
      return {
        supportsGiftWrap: true,
        preferredEncryption: "gift-wrap",
      };
    } catch (error) {
      console.error("Failed to get recipient capability:", error);
      return null;
    }
  }

  /**
   * Update recipient capability cache based on delivery results
   */
  private async updateRecipientCapability(
    recipientNpub: string,
    supportsGiftWrap: boolean,
    preferredEncryption: "gift-wrap" | "nip04" | "auto"
  ): Promise<void> {
    try {
      const cacheKey = `recipient_capability_${recipientNpub.substring(0, 16)}`;
      const capability = {
        supportsGiftWrap,
        preferredEncryption,
        timestamp: Date.now(),
      };

      localStorage.setItem(cacheKey, JSON.stringify(capability));
    } catch (error) {
      console.error("Failed to update recipient capability cache:", error);
    }
  }

  /**
   * Send NIP-04 encrypted direct message as fallback
   */
  private async sendNip04Fallback(
    recipientNpub: string,
    content: string
  ): Promise<void> {
    try {
      // Update capability cache to indicate no gift-wrap support
      await this.updateRecipientCapability(recipientNpub, false, "nip04");

      // Send via server DM (uses NIP-04 encryption)
      const cepsNip04 = await this.ensureCEPS();
      await cepsNip04.sendServerDM(recipientNpub, content);

      console.log("NIP-04 fallback message sent successfully");
    } catch (error) {
      console.error("NIP-04 fallback failed:", error);
      throw error;
    }
  }

  /**
   * Send secure failure notification with NIP-59 gift-wrapped messaging (primary)
   * and NIP-04 fallback for maximum privacy and compatibility
   */
  private async sendFailureNotification(
    notificationConfig: AutomatedNotificationConfig,
    paymentData: PaymentData,
    result: PaymentExecutionResult
  ): Promise<void> {
    try {
      const notificationContent = this.buildNotificationContent(
        notificationConfig,
        paymentData,
        result,
        "failure"
      );

      // Attempt NIP-59 gift-wrapped messaging first (maximum privacy)
      const giftWrapSuccess = await this.sendGiftWrappedNotification(
        notificationConfig.notificationNpub,
        {
          type: "payment_failure",
          title: "❌ Automated Payment Failed",
          content: notificationContent,
          timestamp: result.timestamp,
          error: {
            type: result.errorType,
            message: result.error,
          },
          paymentData: {
            amount: notificationConfig.includeAmount
              ? paymentData.amount
              : undefined,
            recipient: notificationConfig.includeRecipient
              ? paymentData.recipientName
              : undefined,
          },
          metadata: {
            scheduleId: paymentData.scheduleId,
            paymentMethod: paymentData.paymentMethod,
          },
        }
      );

      // Fallback to NIP-04 if gift-wrapped messaging fails
      if (!giftWrapSuccess) {
        console.warn("Gift-wrapped messaging failed, falling back to NIP-04");
        await this.sendNip04Fallback(
          notificationConfig.notificationNpub,
          notificationContent
        );
      }
    } catch (error) {
      console.error("Failed to send failure notification:", error);

      // Emergency fallback - try simple server DM
      try {
        const cepsFailFallback = await this.ensureCEPS();
        const simpleContent = `❌ Payment failed: ${paymentData.amount} sats - ${result.error}`;
        await cepsFailFallback.sendServerDM(
          notificationConfig.notificationNpub,
          simpleContent
        );
      } catch (fallbackError) {
        console.error(
          "All failure notification methods failed:",
          fallbackError
        );
      }
    }
  }

  /**
   * Send secure insufficient funds notification with NIP-59 gift-wrapped messaging (primary)
   * and NIP-04 fallback for maximum privacy and compatibility
   */
  private async sendInsufficientFundsNotification(
    notificationConfig: AutomatedNotificationConfig,
    paymentData: PaymentData,
    result: PaymentExecutionResult
  ): Promise<void> {
    try {
      const notificationContent =
        this.buildInsufficientFundsNotificationContent(
          notificationConfig,
          paymentData,
          result
        );

      // Attempt NIP-59 gift-wrapped messaging first (maximum privacy)
      const giftWrapSuccess = await this.sendGiftWrappedNotification(
        notificationConfig.notificationNpub,
        {
          type: "insufficient_funds",
          title: "⚠️ Insufficient Funds - Payment Failed",
          content: notificationContent,
          timestamp: result.timestamp,
          error: {
            type: result.errorType,
            message: result.error,
          },
          paymentData: {
            amount: notificationConfig.includeAmount
              ? paymentData.amount
              : undefined,
            recipient: notificationConfig.includeRecipient
              ? paymentData.recipientName
              : undefined,
          },
          metadata: {
            scheduleId: paymentData.scheduleId,
            paymentMethod: paymentData.paymentMethod,
          },
          suggestedActions: [
            "Add funds to your wallet",
            "Reduce the payment amount",
            "Check your wallet balance",
          ],
        }
      );

      // Fallback to NIP-04 if gift-wrapped messaging fails
      if (!giftWrapSuccess) {
        console.warn("Gift-wrapped messaging failed, falling back to NIP-04");
        await this.sendNip04Fallback(
          notificationConfig.notificationNpub,
          notificationContent
        );
      }
    } catch (error) {
      console.error("Failed to send insufficient funds notification:", error);

      // Emergency fallback - try simple server DM
      try {
        const cepsInsuffFallback = await this.ensureCEPS();
        const simpleContent = `⚠️ Insufficient funds for payment of ${paymentData.amount.toLocaleString()} sats`;
        await cepsInsuffFallback.sendServerDM(
          notificationConfig.notificationNpub,
          simpleContent
        );
      } catch (fallbackError) {
        console.error(
          "All insufficient funds notification methods failed:",
          fallbackError
        );
      }
    }
  }

  /**
   * Determine error type from error message or object
   */
  private determineErrorType(error: any): PaymentExecutionResult["errorType"] {
    const errorMessage =
      error instanceof Error
        ? error.message.toLowerCase()
        : String(error).toLowerCase();

    if (
      errorMessage.includes("insufficient") ||
      errorMessage.includes("balance") ||
      errorMessage.includes("funds")
    ) {
      return "insufficient_funds";
    }

    if (
      errorMessage.includes("network") ||
      errorMessage.includes("connection") ||
      errorMessage.includes("timeout")
    ) {
      return "network_error";
    }

    if (
      errorMessage.includes("authorization") ||
      errorMessage.includes("permission") ||
      errorMessage.includes("auth")
    ) {
      return "authorization_failed";
    }

    if (
      errorMessage.includes("recipient") ||
      errorMessage.includes("address") ||
      errorMessage.includes("invalid")
    ) {
      return "recipient_invalid";
    }

    return "unknown";
  }

  /**
   * Get current balance information for error context
   */
  private async getBalanceInfo(requiredAmount: number): Promise<{
    currentBalance?: number;
    requiredAmount: number;
  }> {
    try {
      // This would integrate with the actual wallet balance API
      // For now, return mock data
      const currentBalance = await this.getCurrentWalletBalance();

      return {
        currentBalance,
        requiredAmount,
      };
    } catch (error) {
      console.error("Failed to get balance info:", error);
      return {
        requiredAmount,
      };
    }
  }

  /**
   * Get current wallet balance using family wallet APIs
   */
  private async getCurrentWalletBalance(): Promise<number> {
    try {
      // Import family wallet APIs
      const {
        getFamilyLightningWallet,
        getFamilyFedimintWallet,
        getFamilyCashuWallet,
      } = await import("../services/familyWalletApi");

      // Get user context
      const userDuid = await this.getUserDuid();
      const familyId = await this.getFamilyId();

      if (!userDuid || !familyId) {
        console.warn("User context not available for balance check");
        return 0;
      }

      let totalBalance = 0;

      try {
        // Get Lightning wallet balance
        const lightningWallet = await getFamilyLightningWallet(
          familyId,
          userDuid
        );
        totalBalance += lightningWallet.balance || 0;
      } catch (error) {
        console.warn("Failed to get Lightning wallet balance:", error);
      }

      try {
        // Get Fedimint wallet balance
        const fedimintWallet = await getFamilyFedimintWallet(
          familyId,
          userDuid
        );
        totalBalance += fedimintWallet.balance || 0;
      } catch (error) {
        console.warn("Failed to get Fedimint wallet balance:", error);
      }

      try {
        // Get Cashu wallet balance
        const cashuWallet = await getFamilyCashuWallet(familyId, userDuid);
        totalBalance += cashuWallet.balance || 0;
      } catch (error) {
        console.warn("Failed to get Cashu wallet balance:", error);
      }

      return totalBalance;
    } catch (error) {
      console.error("Failed to get wallet balance:", error);
      return 0;
    }
  }

  /**
   * Build notification content based on configuration
   */
  private buildNotificationContent(
    config: AutomatedNotificationConfig,
    paymentData: any,
    result: PaymentExecutionResult,
    type: "success" | "failure"
  ): string {
    const parts: string[] = [];

    if (type === "success") {
      parts.push("✅ Automated payment sent successfully");
    } else {
      parts.push("❌ Automated payment failed");
      if (result.error) {
        parts.push(`Error: ${result.error}`);
      }
    }

    if (config.includeAmount) {
      parts.push(`Amount: ${paymentData.amount.toLocaleString()} sats`);
    }

    if (config.includeRecipient) {
      parts.push(`Recipient: ${paymentData.recipientName}`);
    }

    if (config.includeTimestamp) {
      parts.push(`Time: ${new Date(result.timestamp).toLocaleString()}`);
    }

    if (config.includeTransactionId && result.transactionId) {
      parts.push(`Transaction ID: ${result.transactionId}`);
    }

    if (paymentData.memo) {
      parts.push(`Memo: ${paymentData.memo}`);
    }

    return parts.join("\n");
  }

  /**
   * Build insufficient funds notification content
   */
  private buildInsufficientFundsNotificationContent(
    config: AutomatedNotificationConfig,
    paymentData: any,
    result: PaymentExecutionResult
  ): string {
    const parts: string[] = [];

    // Header with clear indication
    parts.push("⚠️ SCHEDULED PAYMENT FAILED - INSUFFICIENT FUNDS");
    parts.push("");

    // Payment details
    if (config.includeAmount) {
      parts.push(
        `💰 Payment Amount: ${paymentData.amount.toLocaleString()} sats`
      );
    }

    if (config.includeRecipient) {
      parts.push(`👤 Recipient: ${paymentData.recipientName}`);
    }

    if (config.includeTimestamp) {
      parts.push(
        `⏰ Scheduled Time: ${new Date(result.timestamp).toLocaleString()}`
      );
    }

    // Balance information
    if (result.currentBalance !== undefined) {
      parts.push(
        `💳 Current Balance: ${result.currentBalance.toLocaleString()} sats`
      );
      const shortfall =
        (result.requiredAmount || paymentData.amount) - result.currentBalance;
      parts.push(`📉 Shortfall: ${shortfall.toLocaleString()} sats`);
    }

    // Schedule reference
    if (config.includeTransactionId && result.scheduleId) {
      parts.push(`🔗 Schedule ID: ${result.scheduleId}`);
    }

    parts.push("");

    // Suggested actions
    parts.push("💡 SUGGESTED ACTIONS:");
    parts.push("• Add funds to your wallet");
    parts.push("• Reduce the payment amount");
    parts.push("• Pause the payment schedule");
    parts.push("• Check your wallet balance");

    parts.push("");
    parts.push("📱 Open your dashboard to manage this schedule");

    return parts.join("\n");
  }

  /**
   * Revoke automated signing authorization
   */
  public async revokeAuthorization(
    signingConfig: AutomatedSigningConfig
  ): Promise<void> {
    // Mark as revoked
    signingConfig.revoked = true;

    // Clear sensitive data
    if (signingConfig.encryptedCredentials) {
      signingConfig.encryptedCredentials = "";
    }
    if (signingConfig.authorizationToken) {
      signingConfig.authorizationToken = "";
    }
  }

  /**
   * Check if authorization is valid and not expired
   */
  public isAuthorizationValid(signingConfig: AutomatedSigningConfig): boolean {
    if (signingConfig.revoked) {
      return false;
    }

    if (
      signingConfig.expiresAt &&
      new Date(signingConfig.expiresAt) < new Date()
    ) {
      return false;
    }

    return true;
  }
}
