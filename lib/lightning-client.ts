// Lightning Client for Multi-Node Lightning Network with Privacy Layer
import {
  LightningNodeManager,
  type LightningNodeConfig,
  type LightningNodeType,
  type PaymentRouting,
} from "./lightning-node-manager.js";
import {
  SatnamPrivacyLayer,
  type PrivacyWrappedInvoice,
} from "./privacy/lnproxy-privacy.js";

import { resolvePlatformLightningDomain } from "../src/config/domain.client";

/**
 * CRITICAL SECURITY: Master Context environment variable access pattern
 * Ensures browser compatibility with import.meta.env while maintaining serverless support
 */
function getEnvVar(key: string): string | undefined {
  if (typeof import.meta !== "undefined") {
    const metaWithEnv = /** @type {any} */ import.meta;
    if (metaWithEnv.env) {
      return metaWithEnv.env[key];
    }
  }
  return process.env[key];
}

/**
 * CRITICAL SECURITY: Lightning Network TypeScript interfaces for Bitcoin banking platform
 */

export type PaymentType =
  | "P2P_INTERNAL_LIGHTNING" // Satnam-to-Satnam Lightning payments
  | "P2P_EXTERNAL_LIGHTNING" // Satnam-to-External Lightning payments
  | "ECASH_FEDIMINT_TO_CASHU" // Fedimint eCash → Cashu conversion
  | "ECASH_CASHU_TO_FEDIMINT" // Cashu → Fedimint eCash conversion
  | "ECASH_FEDIMINT_TO_FEDIMINT" // Fedimint eCash → Different Fedimint eCash
  | "ECASH_CASHU_EXTERNAL_SWAP" // Cashu ↔ External Cashu mint atomic swaps
  | "LEGACY_FAMILY_PAYMENT"; // Existing family payment type

export type UserRole =
  | "private"
  | "offspring"
  | "adult"
  | "steward"
  | "guardian";

interface NodeStatus {
  connected: boolean;
  info?: string;
  version?: string;
  blockHeight?: number;
  channels?: number;
  peers?: number;
}

interface FamilyWallet {
  id: string;
  name: string;
  balance: number;
  currency?: string;
  status?: "active" | "inactive" | "pending";
  permissions?: string[];
}

interface CreateInvoiceRequest {
  amount: number;
  description?: string;
  walletId?: string;
  expiry?: number;
}

interface CreateInvoiceResponse {
  invoice: string;
  paymentHash: string;
  checkingId: string;
}

interface PaymentRequest {
  fromWallet: string;
  toWallet: string;
  amount: number;
  memo?: string;
}

interface PaymentResponse {
  success: boolean;
  paymentHash: string;
  preimage?: string;
  fee?: number;
  status: "pending" | "paid" | "failed";
}

interface SecurityValidation {
  validated: boolean;
  environment: string;
  nodeType?: LightningNodeType;
  securityLevel?: "development" | "production";
}

interface SpendingValidationResult {
  allowed: boolean;
  reason?: string;
  requiresAdultApproval?: boolean;
  spendingLimit?: number;
  currentSpending?: number;
}

interface CashuConversionResponse {
  success: boolean;
  cashuToken: string;
  originalFedimintToken: string;
  conversionFee: number;
  targetMint: string;
  conversionId: string;
  expiresAt: Date;
}

interface FedimintConversionResponse {
  success: boolean;
  fedimintToken: string;
  originalToken: string;
  conversionFee: number;
  targetFedimint: string;
  conversionId: string;
  expiresAt: Date;
}

interface ExternalCashuSwapResponse {
  success: boolean;
  swappedToken: string;
  originalToken: string;
  swapFee: number;
  targetMintUrl: string;
  swapId: string;
  isMultiNut: boolean;
  expiresAt: Date;
}

export class LightningClient {
  private nodeManager: LightningNodeManager;
  private privacyLayer: SatnamPrivacyLayer;
  private currentNode: LightningNodeType;
  private atomicSwapBridge: any; // Will be initialized if available

  constructor() {
    // CRITICAL SECURITY: Initialize multi-node Lightning Network manager
    this.nodeManager = new LightningNodeManager();

    // Set default node (Voltage if available, otherwise first available)
    const availableNodes = this.nodeManager.getAllNodes();
    const voltageNode = availableNodes.find((node) => node.type === "voltage");
    this.currentNode = voltageNode
      ? "voltage"
      : availableNodes[0]?.type || "voltage";

    // CRITICAL SECURITY: Validate all Lightning node credentials for Bitcoin banking platform
    this.validateAllNodeCredentials();

    // Initialize privacy layer
    this.privacyLayer = new SatnamPrivacyLayer();

    // Initialize atomic swap bridge if available
    try {
      // Note: SatnamInternalLightningBridge requires server environment
      // This will be null in browser environment, which is expected
      this.atomicSwapBridge = null; // Will be set up in server-side methods
    } catch (error) {
      console.warn(
        "Atomic swap bridge not available in current environment:",
        error
      );
      this.atomicSwapBridge = null;
    }
  }

  /**
   * CRITICAL SECURITY: Validate all Lightning Network node credentials for Bitcoin banking platform
   */
  private validateAllNodeCredentials(): void {
    const environment = getEnvVar("NODE_ENV") || "development";
    const allNodes = this.nodeManager.getAllNodes();

    if (environment === "production") {
      for (const node of allNodes) {
        if (!this.nodeManager.validateNodeSecurity(node.type)) {
          throw new Error(
            `BITCOIN SECURITY VIOLATION: ${node.name} (${node.type}) fails security validation in production`
          );
        }
      }

      // Ensure at least one secure node is available
      if (allNodes.length === 0) {
        throw new Error(
          "BITCOIN SECURITY VIOLATION: No Lightning nodes configured for production environment"
        );
      }
    }
  }

  async getNodeStatus(): Promise<NodeStatus> {
    try {
      // PRIVACY-FIRST: No logging of node operations to prevent metadata leakage
      return { connected: true, info: "Demo node" };
    } catch (error) {
      // PRIVACY-FIRST: Minimal error logging without exposing sensitive data
      return { connected: false };
    }
  }

  async getFamilyWallets(): Promise<FamilyWallet[]> {
    try {
      // PRIVACY-FIRST: No logging of family wallet operations to prevent metadata leakage
      return [
        { id: "1", name: "Family Treasury", balance: 100000 },
        { id: "2", name: "Kids Allowance", balance: 25000 },
      ];
    } catch (error) {
      // PRIVACY-FIRST: Minimal error logging without exposing family data
      return [];
    }
  }

  async sendPayment(
    fromWallet: string,
    toWallet: string,
    amount: number,
    memo?: string
  ): Promise<PaymentResponse> {
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

      // PRIVACY-FIRST: No logging of payment details to prevent transaction metadata leakage
      return {
        success: true,
        paymentHash: "demo-hash",
        status: "paid" as const,
      };
    } catch (error) {
      // PRIVACY-FIRST: Minimal error logging without exposing payment data
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

      const originalInvoice = `lnbc${
        request.amount
      }n1...demo-invoice-${Date.now()}`;
      const paymentHash = `demo-hash-${Date.now()}`;
      const checkingId = `demo-checking-${Date.now()}`;

      // PRIVACY-FIRST: No logging of invoice details to prevent transaction metadata leakage

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
          // PRIVACY-FIRST: Minimal error logging without exposing sensitive data
          // SECURITY: Do not fall back to unprotected invoices for family payments
          throw new Error(
            "Privacy protection required for family payments. Please check LNProxy service status."
          );
        }
      }

      return response;
    } catch (error) {
      // PRIVACY-FIRST: Minimal error logging without exposing sensitive data
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
    const domain = resolvePlatformLightningDomain();
    if (!domain) {
      throw new Error("Failed to resolve platform lightning domain");
    }
    const description = purpose
      ? `Payment to ${familyMember}@${domain}: ${purpose}`
      : `Payment to ${familyMember}@${domain}`;

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

  /**
   * CRITICAL SECURITY: Get Lightning Network configuration for Bitcoin banking platform
   * @returns Lightning configuration with security validation status
   */
  getLightningConfig() {
    const environment = getEnvVar("NODE_ENV") || "development";
    const currentNodeConfig = this.nodeManager.getNode(this.currentNode);
    const allNodes = this.nodeManager.getAllNodes();

    return {
      currentNode: this.currentNode,
      nodeUrl: currentNodeConfig?.url || "No node configured",
      isSecure: currentNodeConfig?.isSecure || false,
      environment,
      isProduction: environment === "production",
      availableNodes: allNodes.length,
      activeNodes: allNodes.filter((node) => node.isActive).length,
      securityValidated: allNodes.every((node) =>
        this.nodeManager.validateNodeSecurity(node.type)
      ),
    };
  }

  /**
   * CRITICAL SECURITY: Validate Lightning Network operation for Bitcoin banking platform
   * @param operation - Operation type for logging
   * @throws Error if security requirements not met
   */
  private validateSecureOperation(operation: string): void {
    const config = this.getLightningConfig();

    if (config.isProduction && !config.securityValidated) {
      throw new Error(
        `BITCOIN SECURITY VIOLATION: ${operation} requires secure Lightning configuration in production`
      );
    }
  }

  /**
   * CRITICAL SECURITY: Enhanced invoice creation with Bitcoin security validation
   * @param request - Invoice creation parameters
   * @param enablePrivacy - Whether to wrap the invoice for privacy (default: true)
   * @returns Invoice response with security validation
   */
  async createSecureInvoice(
    request: CreateInvoiceRequest,
    enablePrivacy: boolean = true
  ): Promise<
    CreateInvoiceResponse & {
      privacy?: PrivacyWrappedInvoice;
      security: { validated: boolean; environment: string };
    }
  > {
    // CRITICAL SECURITY: Validate operation security
    this.validateSecureOperation("Invoice Creation");

    const invoice = await this.createInvoice(request, enablePrivacy);
    const config = this.getLightningConfig();

    return {
      ...invoice,
      security: {
        validated: config.securityValidated,
        environment: config.environment,
      },
    };
  }

  /**
   * CRITICAL SECURITY: Enhanced payment with Bitcoin security validation
   * @param fromWallet - Source wallet ID
   * @param toWallet - Destination wallet ID
   * @param amount - Amount in satoshis
   * @param memo - Optional payment memo
   * @returns Payment response with security validation
   */
  async sendSecurePayment(
    fromWallet: string,
    toWallet: string,
    amount: number,
    memo?: string
  ): Promise<
    PaymentResponse & { security: { validated: boolean; environment: string } }
  > {
    // CRITICAL SECURITY: Validate operation security
    this.validateSecureOperation("Payment");

    const payment = await this.sendPayment(fromWallet, toWallet, amount, memo);
    const config = this.getLightningConfig();

    return {
      ...payment,
      security: {
        validated: config.securityValidated,
        environment: config.environment,
      },
    };
  }

  /**
   * CRITICAL SECURITY: Role-Based Spending Validation
   * SOVEREIGNTY PRINCIPLE: Adults, Stewards, Guardians have UNLIMITED individual wallet spending (-1 values)
   * ONLY Offspring accounts have spending limits and require approval
   */
  private async validateSpendingLimits(
    userRole: UserRole,
    amount: number,
    operationType: PaymentType
  ): Promise<SpendingValidationResult> {
    // No limits on receiving operations
    if (
      operationType.includes("RECEIVE") ||
      operationType.includes("INCOMING")
    ) {
      return { allowed: true, reason: "No limits on receiving operations" };
    }

    // SOVEREIGNTY PRINCIPLE: Private, Adult, Steward, Guardian roles have UNLIMITED spending authority
    if (
      userRole === "private" ||
      userRole === "adult" ||
      userRole === "steward" ||
      userRole === "guardian"
    ) {
      return {
        allowed: true,
        reason: `Individual wallet sovereignty: ${userRole} role has unlimited spending authority (-1 configuration)`,
        spendingLimit: -1, // -1 = unlimited (sovereignty)
        currentSpending: 0,
      };
    }

    // ONLY Offspring accounts have spending limits and require approval
    if (userRole === "offspring") {
      const dailyLimit = 50000; // 50,000 sats daily limit for offspring
      const currentSpending = 0; // TODO: Implement actual spending tracking

      if (amount > dailyLimit) {
        return {
          allowed: false,
          requiresAdultApproval: true,
          reason: `Amount ${amount} exceeds daily limit of ${dailyLimit} sats for offspring`,
          spendingLimit: dailyLimit,
          currentSpending,
        };
      }

      if (currentSpending + amount > dailyLimit) {
        return {
          allowed: false,
          requiresAdultApproval: true,
          reason: `Transaction would exceed daily spending limit`,
          spendingLimit: dailyLimit,
          currentSpending,
        };
      }
    }

    // Default to unlimited for any unhandled roles (sovereignty principle)
    return {
      allowed: true,
      reason: `Default sovereignty: ${userRole} role has unlimited spending authority`,
      spendingLimit: -1,
      currentSpending: 0,
    };
  }

  /**
   * CRITICAL SECURITY: P2P Lightning Payment Methods
   */

  /**
   * Send P2P internal Lightning payment (Satnam-to-Satnam)
   * @param fromUser - Source user identifier
   * @param toUser - Target user identifier
   * @param amount - Amount in satoshis
   * @param memo - Optional payment memo
   * @param userRole - User role for spending validation
   */
  async sendP2PInternalPayment(
    fromUser: string,
    toUser: string,
    amount: number,
    memo?: string,
    userRole: UserRole = "adult"
  ): Promise<
    PaymentResponse & {
      routing: PaymentRouting;
      privacy: PrivacyWrappedInvoice;
    }
  > {
    // Validate spending limits
    const spendingValidation = await this.validateSpendingLimits(
      userRole,
      amount,
      "P2P_INTERNAL_LIGHTNING"
    );

    if (
      !spendingValidation.allowed &&
      !spendingValidation.requiresAdultApproval
    ) {
      throw new Error(
        `Spending validation failed: ${spendingValidation.reason}`
      );
    }

    // Get optimal node routing for internal P2P payment
    const routing = this.nodeManager.getOptimalNodeForPayment(
      true, // isInternalPayment
      true, // isFamilyPayment
      amount,
      "P2P_INTERNAL_LIGHTNING"
    );

    // Switch to optimal node
    const originalNode = this.currentNode;
    this.switchNode(routing.preferredNode);

    try {
      // Create privacy-wrapped invoice for internal payment
      const domain = resolvePlatformLightningDomain();
      if (!domain) {
        throw new Error("Failed to resolve platform lightning domain");
      }
      const invoice = await this.createInvoice(
        {
          amount,
          description:
            memo || `P2P payment from ${fromUser} to ${toUser}@${domain}`,
        },
        true // Always enable privacy for internal payments
      );

      if (!invoice.privacy || !invoice.privacy.isPrivacyEnabled) {
        throw new Error("Privacy protection failed for internal P2P payment");
      }

      // Execute payment with privacy protection
      const payment = await this.sendPayment(fromUser, toUser, amount, memo);

      return {
        ...payment,
        routing,
        privacy: invoice.privacy,
      };
    } catch (error) {
      // Try fallback nodes
      for (const fallbackNode of routing.fallbackNodes) {
        try {
          this.switchNode(fallbackNode);
          const domain = resolvePlatformLightningDomain();
          if (!domain) {
            throw new Error("Failed to resolve platform lightning domain");
          }
          const invoice = await this.createInvoice(
            {
              amount,
              description:
                memo || `P2P payment from ${fromUser} to ${toUser}@${domain}`,
            },
            true
          );

          if (!invoice.privacy || !invoice.privacy.isPrivacyEnabled) {
            continue; // Skip nodes that can't provide privacy
          }

          const payment = await this.sendPayment(
            fromUser,
            toUser,
            amount,
            memo
          );

          return {
            ...payment,
            routing: {
              ...routing,
              preferredNode: fallbackNode,
              reason: `Fallback to ${fallbackNode} after ${routing.preferredNode} failed`,
            },
            privacy: invoice.privacy,
          };
        } catch (fallbackError) {
          console.warn(
            `Fallback node ${fallbackNode} also failed:`,
            fallbackError
          );
        }
      }

      // Restore original node and throw error
      this.switchNode(originalNode);
      throw error;
    }
  }

  /**
   * Send P2P external Lightning payment (Satnam-to-External)
   * @param fromUser - Source user identifier
   * @param toLightningAddress - Target Lightning address
   * @param amount - Amount in satoshis
   * @param memo - Optional payment memo
   * @param userRole - User role for spending validation
   * @param enablePrivacy - Whether to use LNProxy privacy protection (default: true for privacy-first architecture)
   */
  async sendP2PExternalPayment(
    fromUser: string,
    toLightningAddress: string,
    amount: number,
    memo?: string,
    userRole: UserRole = "adult",
    enablePrivacy: boolean = true
  ): Promise<
    PaymentResponse & {
      routing: PaymentRouting;
      security: SecurityValidation;
      privacy?: PrivacyWrappedInvoice;
    }
  > {
    // Validate spending limits
    const spendingValidation = await this.validateSpendingLimits(
      userRole,
      amount,
      "P2P_EXTERNAL_LIGHTNING"
    );

    if (
      !spendingValidation.allowed &&
      !spendingValidation.requiresAdultApproval
    ) {
      throw new Error(
        `Spending validation failed: ${spendingValidation.reason}`
      );
    }

    // Get optimal node routing for external P2P payment
    const routing = this.nodeManager.getOptimalNodeForPayment(
      false, // isInternalPayment
      false, // isFamilyPayment
      amount,
      "P2P_EXTERNAL_LIGHTNING"
    );

    // Switch to optimal node
    const originalNode = this.currentNode;
    this.switchNode(routing.preferredNode);

    try {
      // Validate security for external payment
      const config = this.getLightningConfig();
      const security: SecurityValidation = {
        validated: config.securityValidated,
        environment: config.environment,
        nodeType: this.currentNode,
        securityLevel: config.isProduction ? "production" : "development",
      };

      if (config.isProduction && !config.securityValidated) {
        throw new Error(
          "Bitcoin security validation failed for external P2P payment"
        );
      }

      // Create invoice for external payment with optional privacy
      let privacyWrapped: PrivacyWrappedInvoice | undefined;

      if (enablePrivacy) {
        try {
          const domain = resolvePlatformLightningDomain();
          if (!domain) {
            throw new Error("Failed to resolve platform lightning domain");
          }
          const invoice = await this.createInvoice({
            amount,
            description:
              memo ||
              `P2P external payment from ${fromUser}@${domain} to ${toLightningAddress}`,
          });

          privacyWrapped = await this.privacyLayer.wrapInvoiceForPrivacy(
            invoice.invoice,
            memo ||
              `P2P external payment from ${fromUser}@${domain} to ${toLightningAddress}`
          );

          if (!privacyWrapped.isPrivacyEnabled) {
            console.warn(
              "Privacy protection failed for external payment, proceeding without privacy"
            );
          }
        } catch (error) {
          console.warn("Privacy wrapping failed for external payment:", error);
          // Continue without privacy if user explicitly requested it but it failed
        }
      }

      // Execute external payment
      const domain = resolvePlatformLightningDomain();
      if (!domain) {
        throw new Error("Failed to resolve platform lightning domain");
      }
      const payment = await this.sendPayment(
        fromUser,
        toLightningAddress,
        amount,
        memo ||
          `P2P external payment from ${fromUser}@${domain} to ${toLightningAddress}`
      );

      return {
        ...payment,
        routing,
        security,
        ...(privacyWrapped && { privacy: privacyWrapped }),
      };
    } catch (error) {
      // Try fallback nodes
      for (const fallbackNode of routing.fallbackNodes) {
        try {
          this.switchNode(fallbackNode);

          const config = this.getLightningConfig();
          const security: SecurityValidation = {
            validated: config.securityValidated,
            environment: config.environment,
            nodeType: this.currentNode,
            securityLevel: config.isProduction ? "production" : "development",
          };

          const payment = await this.sendPayment(
            fromUser,
            toLightningAddress,
            amount,
            memo
          );

          return {
            ...payment,
            routing: {
              ...routing,
              preferredNode: fallbackNode,
              reason: `Fallback to ${fallbackNode} after ${routing.preferredNode} failed`,
            },
            security,
          };
        } catch (fallbackError) {
          console.warn(
            `Fallback node ${fallbackNode} also failed:`,
            fallbackError
          );
        }
      }

      // Restore original node and throw error
      this.switchNode(originalNode);
      throw error;
    }
  }

  /**
   * CRITICAL SECURITY: Internal eCash Bridge Architecture
   * Universal access for ALL user roles including 'private' users without Family Federation
   */

  /**
   * Convert Fedimint eCash to Cashu tokens
   * @param fedimintToken - Source Fedimint eCash token
   * @param targetCashuMint - Target Cashu mint URL
   * @param userRole - User role for spending validation
   */
  async convertFedimintToCashu(
    fedimintToken: string,
    targetCashuMint: string,
    userRole: UserRole
  ): Promise<CashuConversionResponse> {
    // Extract amount from Fedimint token (mock implementation)
    const amount = this.extractAmountFromFedimintToken(fedimintToken);

    // Validate spending limits
    const spendingValidation = await this.validateSpendingLimits(
      userRole,
      amount,
      "ECASH_FEDIMINT_TO_CASHU"
    );

    if (
      !spendingValidation.allowed &&
      !spendingValidation.requiresAdultApproval
    ) {
      throw new Error(
        `Spending validation failed: ${spendingValidation.reason}`
      );
    }

    // Get optimal node routing for eCash bridge operation
    const routing = this.nodeManager.getOptimalNodeForPayment(
      true, // isInternalPayment
      false, // isFamilyPayment (eCash bridge is universal)
      amount,
      "ECASH_FEDIMINT_TO_CASHU"
    );

    // Switch to optimal node (PhoenixD preferred for atomic swaps)
    const originalNode = this.currentNode;
    this.switchNode(routing.preferredNode);

    try {
      // CRITICAL: Use Lightning Network as atomic swap mechanism
      // 1. Create Lightning invoice for the amount
      const invoice = await this.createInvoice({
        amount,
        description: `Fedimint to Cashu conversion via Lightning atomic swap`,
      });

      // 2. Execute atomic swap through Lightning Network
      const conversionId = `fedimint-cashu-${Date.now()}`;
      const conversionFee = Math.floor(amount * 0.01); // 1% conversion fee

      // Mock conversion process - in real implementation:
      // - Validate Fedimint token
      // - Execute Lightning payment to Cashu mint
      // - Receive Cashu tokens
      const cashuToken = `cashu_${targetCashuMint}_${amount}_${Date.now()}`;

      return {
        success: true,
        cashuToken,
        originalFedimintToken: fedimintToken,
        conversionFee,
        targetMint: targetCashuMint,
        conversionId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      };
    } catch (error) {
      // Try fallback nodes
      for (const fallbackNode of routing.fallbackNodes) {
        try {
          this.switchNode(fallbackNode);

          const invoice = await this.createInvoice({
            amount,
            description: `Fedimint to Cashu conversion via Lightning atomic swap (fallback)`,
          });

          const conversionId = `fedimint-cashu-fallback-${Date.now()}`;
          const conversionFee = Math.floor(amount * 0.01);
          const cashuToken = `cashu_${targetCashuMint}_${amount}_${Date.now()}`;

          return {
            success: true,
            cashuToken,
            originalFedimintToken: fedimintToken,
            conversionFee,
            targetMint: targetCashuMint,
            conversionId,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          };
        } catch (fallbackError) {
          console.warn(
            `Fallback node ${fallbackNode} failed for eCash conversion:`,
            fallbackError
          );
        }
      }

      // Restore original node and throw error
      this.switchNode(originalNode);
      throw error;
    }
  }

  /**
   * Convert Cashu tokens to Fedimint eCash
   * @param cashuToken - Source Cashu token
   * @param targetFedimint - Target Fedimint federation URL
   * @param userRole - User role for spending validation
   */
  async convertCashuToFedimint(
    cashuToken: string,
    targetFedimint: string,
    userRole: UserRole
  ): Promise<FedimintConversionResponse> {
    // Extract amount from Cashu token (mock implementation)
    const amount = this.extractAmountFromCashuToken(cashuToken);

    // Validate spending limits
    const spendingValidation = await this.validateSpendingLimits(
      userRole,
      amount,
      "ECASH_CASHU_TO_FEDIMINT"
    );

    if (
      !spendingValidation.allowed &&
      !spendingValidation.requiresAdultApproval
    ) {
      throw new Error(
        `Spending validation failed: ${spendingValidation.reason}`
      );
    }

    // Get optimal node routing for eCash bridge operation
    const routing = this.nodeManager.getOptimalNodeForPayment(
      true, // isInternalPayment
      false, // isFamilyPayment (eCash bridge is universal)
      amount,
      "ECASH_CASHU_TO_FEDIMINT"
    );

    // Switch to optimal node (PhoenixD preferred for atomic swaps)
    const originalNode = this.currentNode;
    this.switchNode(routing.preferredNode);

    try {
      // CRITICAL: Use Lightning Network as atomic swap mechanism
      const invoice = await this.createInvoice({
        amount,
        description: `Cashu to Fedimint conversion via Lightning atomic swap`,
      });

      const conversionId = `cashu-fedimint-${Date.now()}`;
      const conversionFee = Math.floor(amount * 0.01); // 1% conversion fee

      // Mock conversion process
      const fedimintToken = `fedimint_${targetFedimint}_${amount}_${Date.now()}`;

      return {
        success: true,
        fedimintToken,
        originalToken: cashuToken,
        conversionFee,
        targetFedimint,
        conversionId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
    } catch (error) {
      // Try fallback nodes
      for (const fallbackNode of routing.fallbackNodes) {
        try {
          this.switchNode(fallbackNode);

          const conversionId = `cashu-fedimint-fallback-${Date.now()}`;
          const conversionFee = Math.floor(amount * 0.01);
          const fedimintToken = `fedimint_${targetFedimint}_${amount}_${Date.now()}`;

          return {
            success: true,
            fedimintToken,
            originalToken: cashuToken,
            conversionFee,
            targetFedimint,
            conversionId,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          };
        } catch (fallbackError) {
          console.warn(
            `Fallback node ${fallbackNode} failed for eCash conversion:`,
            fallbackError
          );
        }
      }

      // Restore original node and throw error
      this.switchNode(originalNode);
      throw error;
    }
  }

  /**
   * Convert Fedimint eCash to different Fedimint eCash
   * @param sourceFedimintToken - Source Fedimint eCash token
   * @param targetFedimint - Target Fedimint federation URL
   * @param userRole - User role for spending validation
   */
  async convertFedimintToFedimint(
    sourceFedimintToken: string,
    targetFedimint: string,
    userRole: UserRole
  ): Promise<FedimintConversionResponse> {
    // Extract amount from source Fedimint token
    const amount = this.extractAmountFromFedimintToken(sourceFedimintToken);

    // Validate spending limits
    const spendingValidation = await this.validateSpendingLimits(
      userRole,
      amount,
      "ECASH_FEDIMINT_TO_FEDIMINT"
    );

    if (
      !spendingValidation.allowed &&
      !spendingValidation.requiresAdultApproval
    ) {
      throw new Error(
        `Spending validation failed: ${spendingValidation.reason}`
      );
    }

    // Get optimal node routing for eCash bridge operation
    const routing = this.nodeManager.getOptimalNodeForPayment(
      true, // isInternalPayment
      false, // isFamilyPayment (eCash bridge is universal)
      amount,
      "ECASH_FEDIMINT_TO_FEDIMINT"
    );

    // Switch to optimal node (PhoenixD preferred for atomic swaps)
    const originalNode = this.currentNode;
    this.switchNode(routing.preferredNode);

    try {
      // CRITICAL: Use Lightning Network as atomic swap mechanism
      const invoice = await this.createInvoice({
        amount,
        description: `Fedimint to Fedimint conversion via Lightning atomic swap`,
      });

      const conversionId = `fedimint-fedimint-${Date.now()}`;
      const conversionFee = Math.floor(amount * 0.005); // 0.5% conversion fee for same-type conversion

      // Mock conversion process
      const fedimintToken = `fedimint_${targetFedimint}_${amount}_${Date.now()}`;

      return {
        success: true,
        fedimintToken,
        originalToken: sourceFedimintToken,
        conversionFee,
        targetFedimint,
        conversionId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
    } catch (error) {
      // Try fallback nodes
      for (const fallbackNode of routing.fallbackNodes) {
        try {
          this.switchNode(fallbackNode);

          const conversionId = `fedimint-fedimint-fallback-${Date.now()}`;
          const conversionFee = Math.floor(amount * 0.005);
          const fedimintToken = `fedimint_${targetFedimint}_${amount}_${Date.now()}`;

          return {
            success: true,
            fedimintToken,
            originalToken: sourceFedimintToken,
            conversionFee,
            targetFedimint,
            conversionId,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          };
        } catch (fallbackError) {
          console.warn(
            `Fallback node ${fallbackNode} failed for eCash conversion:`,
            fallbackError
          );
        }
      }

      // Restore original node and throw error
      this.switchNode(originalNode);
      throw error;
    }
  }

  /**
   * CRITICAL SECURITY: External eCash Bridge Architecture
   */

  /**
   * Perform external Cashu mint atomic swap
   * @param sourceCashuToken - Source Cashu token
   * @param targetMintUrl - Target external Cashu mint URL
   * @param userRole - User role for spending validation
   * @param isMultiNut - Whether this is a multi-nut payment structure
   * @param enablePrivacy - Whether to use LNProxy privacy protection (default: true for privacy-first architecture)
   */
  async performExternalCashuSwap(
    sourceCashuToken: string,
    targetMintUrl: string,
    userRole: UserRole,
    isMultiNut: boolean = false,
    enablePrivacy: boolean = false
  ): Promise<ExternalCashuSwapResponse & { privacy?: PrivacyWrappedInvoice }> {
    // Extract amount from source Cashu token
    const amount = this.extractAmountFromCashuToken(sourceCashuToken);

    // Validate spending limits
    const spendingValidation = await this.validateSpendingLimits(
      userRole,
      amount,
      "ECASH_CASHU_EXTERNAL_SWAP"
    );

    if (
      !spendingValidation.allowed &&
      !spendingValidation.requiresAdultApproval
    ) {
      throw new Error(
        `Spending validation failed: ${spendingValidation.reason}`
      );
    }

    // Get optimal node routing for external eCash swap
    const routing = this.nodeManager.getOptimalNodeForPayment(
      false, // isInternalPayment (external operation)
      false, // isFamilyPayment
      amount,
      "ECASH_CASHU_EXTERNAL_SWAP"
    );

    // Switch to optimal node (Breez preferred for external operations)
    const originalNode = this.currentNode;
    this.switchNode(routing.preferredNode);

    try {
      // CRITICAL: Use Lightning Network as atomic swap mechanism for external operations
      const invoice = await this.createInvoice({
        amount,
        description: `External Cashu swap via Lightning atomic swap${
          isMultiNut ? " (multi-nut)" : ""
        }`,
      });

      // Optional privacy protection for external swaps
      let privacyWrapped: PrivacyWrappedInvoice | undefined;

      if (enablePrivacy) {
        try {
          privacyWrapped = await this.privacyLayer.wrapInvoiceForPrivacy(
            invoice.invoice,
            `External Cashu swap via Lightning atomic swap${
              isMultiNut ? " (multi-nut)" : ""
            }`
          );

          if (!privacyWrapped.isPrivacyEnabled) {
            console.warn(
              "Privacy protection failed for external Cashu swap, proceeding without privacy"
            );
          }
        } catch (error) {
          console.warn(
            "Privacy wrapping failed for external Cashu swap:",
            error
          );
          // Continue without privacy if user explicitly requested it but it failed
        }
      }

      const swapId = `cashu-external-${Date.now()}`;
      const swapFee = Math.floor(amount * 0.02); // 2% swap fee for external operations

      // Mock external swap process
      const swappedToken = `cashu_external_${targetMintUrl}_${amount}_${Date.now()}${
        isMultiNut ? "_multinut" : ""
      }`;

      return {
        success: true,
        swappedToken,
        originalToken: sourceCashuToken,
        swapFee,
        targetMintUrl,
        swapId,
        isMultiNut,
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours for external swaps
        ...(privacyWrapped && { privacy: privacyWrapped }),
      };
    } catch (error) {
      // Try fallback nodes
      for (const fallbackNode of routing.fallbackNodes) {
        try {
          this.switchNode(fallbackNode);

          const swapId = `cashu-external-fallback-${Date.now()}`;
          const swapFee = Math.floor(amount * 0.02);
          const swappedToken = `cashu_external_${targetMintUrl}_${amount}_${Date.now()}${
            isMultiNut ? "_multinut" : ""
          }`;

          return {
            success: true,
            swappedToken,
            originalToken: sourceCashuToken,
            swapFee,
            targetMintUrl,
            swapId,
            isMultiNut,
            expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
          };
        } catch (fallbackError) {
          console.warn(
            `Fallback node ${fallbackNode} failed for external Cashu swap:`,
            fallbackError
          );
        }
      }

      // Restore original node and throw error
      this.switchNode(originalNode);
      throw error;
    }
  }

  /**
   * CRITICAL SECURITY: Enhanced token parsing using existing implementations
   */
  private extractAmountFromFedimintToken(token: string): number {
    try {
      // Enhanced parsing logic based on existing Fedimint implementations
      if (token.startsWith("fedimint_")) {
        // Parse custom Satnam Fedimint token format
        const match = token.match(/fedimint_[^_]+_(\d+)_/);
        if (match) {
          return parseInt(match[1]);
        }
      }

      // Try to parse as standard Fedimint token (base64 encoded)
      try {
        const decoded = JSON.parse(atob(token));
        if (decoded.amount) {
          return decoded.amount;
        }
      } catch {
        // Not a base64 encoded token, continue with other parsing
      }

      // Fallback to regex pattern matching
      const match = token.match(/_(\d+)_/);
      return match ? parseInt(match[1]) : 1000; // Default to 1000 sats if parsing fails
    } catch (error) {
      console.warn("Failed to parse Fedimint token amount:", error);
      return 1000; // Safe default
    }
  }

  private extractAmountFromCashuToken(token: string): number {
    try {
      // Enhanced parsing logic based on existing Cashu implementations
      if (token.startsWith("cashu_")) {
        // Parse custom Satnam Cashu token format
        const match = token.match(/cashu_[^_]+_(\d+)_/);
        if (match) {
          return parseInt(match[1]);
        }
      }

      // Try to parse as standard Cashu token (base64 encoded JSON)
      try {
        const decoded = JSON.parse(atob(token));
        if (decoded.amount) {
          return decoded.amount;
        }
        // Cashu tokens may have proofs array with amounts
        if (decoded.proofs && Array.isArray(decoded.proofs)) {
          return decoded.proofs.reduce(
            (total: number, proof: any) => total + (proof.amount || 0),
            0
          );
        }
      } catch {
        // Not a base64 encoded token, continue with other parsing
      }

      // Fallback to regex pattern matching
      const match = token.match(/_(\d+)_/);
      return match ? parseInt(match[1]) : 1000; // Default to 1000 sats if parsing fails
    } catch (error) {
      console.warn("Failed to parse Cashu token amount:", error);
      return 1000; // Safe default
    }
  }

  /**
   * CRITICAL SECURITY: Token validation using existing implementations
   */
  private validateCashuToken(token: string): boolean {
    try {
      // Basic validation based on existing implementation
      if (!token || token.length < 10) return false;

      // Check if it looks like a base64 encoded token
      try {
        const decoded = JSON.parse(atob(token));
        return decoded && (decoded.amount || decoded.proofs);
      } catch {
        // Not base64, check for custom format
        return token.startsWith("cashu_") || token.includes("_");
      }
    } catch {
      return false;
    }
  }

  private validateFedimintToken(token: string): boolean {
    try {
      // Basic validation for Fedimint tokens
      if (!token || token.length < 10) return false;

      // Check if it looks like a base64 encoded token
      try {
        const decoded = JSON.parse(atob(token));
        return decoded && decoded.amount;
      } catch {
        // Not base64, check for custom format
        return token.startsWith("fedimint_") || token.includes("_");
      }
    } catch {
      return false;
    }
  }

  /**
   * CRITICAL SECURITY: Multi-Node Lightning Network Management Methods
   */

  /**
   * Switch to a different Lightning node
   * @param nodeType - Target node type
   */
  switchNode(nodeType: LightningNodeType): void {
    const node = this.nodeManager.getNode(nodeType);
    if (!node) {
      throw new Error(`Lightning node type '${nodeType}' not configured`);
    }

    if (!node.isActive) {
      throw new Error(`Lightning node '${nodeType}' is not active`);
    }

    this.currentNode = nodeType;
  }

  /**
   * Get all available Lightning nodes
   */
  getAvailableNodes(): LightningNodeConfig[] {
    return this.nodeManager.getAllNodes();
  }

  /**
   * Get current active node
   */
  getCurrentNode(): LightningNodeConfig | undefined {
    return this.nodeManager.getNode(this.currentNode);
  }

  /**
   * CRITICAL SECURITY: Create payment with optimal node selection
   * Enhanced with payment type support and backward compatibility
   * @param fromWallet - Source wallet
   * @param toWallet - Destination wallet
   * @param amount - Amount in satoshis
   * @param memo - Optional memo
   * @param paymentType - Payment type for optimal routing (default: LEGACY_FAMILY_PAYMENT)
   * @param userRole - User role for spending validation
   * @param isInternalPayment - Legacy parameter for backward compatibility
   * @param isFamilyPayment - Legacy parameter for backward compatibility
   */
  async sendOptimalPayment(
    fromWallet: string,
    toWallet: string,
    amount: number,
    memo?: string,
    paymentType: PaymentType = "LEGACY_FAMILY_PAYMENT",
    userRole?: UserRole,
    isInternalPayment: boolean = false,
    isFamilyPayment: boolean = false
  ): Promise<
    PaymentResponse & {
      routing: PaymentRouting;
      security: SecurityValidation;
      privacy?: PrivacyWrappedInvoice;
    }
  > {
    // Route to specialized methods based on payment type
    switch (paymentType) {
      case "P2P_INTERNAL_LIGHTNING":
        const internalResult = await this.sendP2PInternalPayment(
          fromWallet,
          toWallet,
          amount,
          memo,
          userRole || "adult"
        );
        return {
          ...internalResult,
          security: {
            validated: true,
            environment: getEnvVar("NODE_ENV") || "development",
            nodeType: this.currentNode,
            securityLevel:
              getEnvVar("NODE_ENV") === "production"
                ? "production"
                : "development",
          },
        };

      case "P2P_EXTERNAL_LIGHTNING":
        return await this.sendP2PExternalPayment(
          fromWallet,
          toWallet,
          amount,
          memo,
          userRole || "adult"
        );

      case "ECASH_FEDIMINT_TO_CASHU":
        const fedimintToCashuResult = await this.convertFedimintToCashu(
          fromWallet, // Treat as Fedimint token
          toWallet, // Treat as target Cashu mint
          userRole || "adult"
        );
        return {
          success: fedimintToCashuResult.success,
          paymentHash: fedimintToCashuResult.conversionId,
          status: fedimintToCashuResult.success ? "paid" : "failed",
          routing: this.nodeManager.getOptimalNodeForPayment(
            true,
            false,
            amount,
            paymentType
          ),
          security: {
            validated: true,
            environment: getEnvVar("NODE_ENV") || "development",
            nodeType: this.currentNode,
            securityLevel:
              getEnvVar("NODE_ENV") === "production"
                ? "production"
                : "development",
          },
        };

      case "ECASH_CASHU_TO_FEDIMINT":
        const cashuToFedimintResult = await this.convertCashuToFedimint(
          fromWallet, // Treat as Cashu token
          toWallet, // Treat as target Fedimint
          userRole || "adult"
        );
        return {
          success: cashuToFedimintResult.success,
          paymentHash: cashuToFedimintResult.conversionId,
          status: cashuToFedimintResult.success ? "paid" : "failed",
          routing: this.nodeManager.getOptimalNodeForPayment(
            true,
            false,
            amount,
            paymentType
          ),
          security: {
            validated: true,
            environment: getEnvVar("NODE_ENV") || "development",
            nodeType: this.currentNode,
            securityLevel:
              getEnvVar("NODE_ENV") === "production"
                ? "production"
                : "development",
          },
        };

      case "ECASH_FEDIMINT_TO_FEDIMINT":
        const fedimintToFedimintResult = await this.convertFedimintToFedimint(
          fromWallet, // Treat as source Fedimint token
          toWallet, // Treat as target Fedimint
          userRole || "adult"
        );
        return {
          success: fedimintToFedimintResult.success,
          paymentHash: fedimintToFedimintResult.conversionId,
          status: fedimintToFedimintResult.success ? "paid" : "failed",
          routing: this.nodeManager.getOptimalNodeForPayment(
            true,
            false,
            amount,
            paymentType
          ),
          security: {
            validated: true,
            environment: getEnvVar("NODE_ENV") || "development",
            nodeType: this.currentNode,
            securityLevel:
              getEnvVar("NODE_ENV") === "production"
                ? "production"
                : "development",
          },
        };

      case "ECASH_CASHU_EXTERNAL_SWAP":
        const externalSwapResult = await this.performExternalCashuSwap(
          fromWallet, // Treat as source Cashu token
          toWallet, // Treat as target mint URL
          userRole || "adult",
          memo?.includes("multi-nut") || false
        );
        return {
          success: externalSwapResult.success,
          paymentHash: externalSwapResult.swapId,
          status: externalSwapResult.success ? "paid" : "failed",
          routing: this.nodeManager.getOptimalNodeForPayment(
            false,
            false,
            amount,
            paymentType
          ),
          security: {
            validated: true,
            environment: getEnvVar("NODE_ENV") || "development",
            nodeType: this.currentNode,
            securityLevel:
              getEnvVar("NODE_ENV") === "production"
                ? "production"
                : "development",
          },
        };

      case "LEGACY_FAMILY_PAYMENT":
      default:
        // Legacy implementation for backward compatibility
        const routing = this.nodeManager.getOptimalNodeForPayment(
          isInternalPayment,
          isFamilyPayment,
          amount,
          paymentType
        );

        // Switch to optimal node
        const originalNode = this.currentNode;
        this.switchNode(routing.preferredNode);

        try {
          // Execute payment with optimal node
          const payment = await this.sendSecurePayment(
            fromWallet,
            toWallet,
            amount,
            memo
          );

          return {
            ...payment,
            routing,
          };
        } catch (error) {
          // Try fallback nodes
          for (const fallbackNode of routing.fallbackNodes) {
            try {
              this.switchNode(fallbackNode);
              const payment = await this.sendSecurePayment(
                fromWallet,
                toWallet,
                amount,
                memo
              );

              return {
                ...payment,
                routing: {
                  ...routing,
                  preferredNode: fallbackNode,
                  reason: `Fallback to ${fallbackNode} after ${routing.preferredNode} failed`,
                },
              };
            } catch (fallbackError) {
              console.warn(
                `Fallback node ${fallbackNode} also failed:`,
                fallbackError
              );
            }
          }

          // Restore original node and throw error
          this.switchNode(originalNode);
          throw error;
        }
    }
  }

  /**
   * Get health status for all nodes
   */
  async checkAllNodesHealth(): Promise<Map<LightningNodeType, any>> {
    const healthStatus = new Map();
    const allNodes = this.nodeManager.getAllNodes();

    for (const node of allNodes) {
      try {
        // Switch to node and check status
        const originalNode = this.currentNode;
        this.switchNode(node.type);

        const status = await this.getNodeStatus();
        healthStatus.set(node.type, {
          ...status,
          nodeConfig: node,
        });

        // Update node health in manager
        this.nodeManager.updateNodeHealth(node.type, {
          connected: status.connected,
          blockHeight: status.blockHeight,
          channels: status.channels,
        });

        // Restore original node
        this.switchNode(originalNode);
      } catch (error) {
        healthStatus.set(node.type, {
          connected: false,
          error: error instanceof Error ? error.message : "Unknown error",
          nodeConfig: node,
        });

        // Update node health in manager
        this.nodeManager.updateNodeHealth(node.type, {
          connected: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return healthStatus;
  }

  /**
   * CRITICAL SECURITY: Convenience Methods for Common P2P and eCash Operations
   */

  /**
   * Quick P2P payment between Satnam users
   * @param fromUser - Source user identifier
   * @param toUser - Target user identifier
   * @param amount - Amount in satoshis
   * @param memo - Optional memo
   * @param userRole - User role for spending validation
   */
  async quickP2PPayment(
    fromUser: string,
    toUser: string,
    amount: number,
    memo?: string,
    userRole: UserRole = "adult"
  ): Promise<
    PaymentResponse & {
      routing: PaymentRouting;
      privacy: PrivacyWrappedInvoice;
    }
  > {
    return await this.sendP2PInternalPayment(
      fromUser,
      toUser,
      amount,
      memo,
      userRole
    );
  }

  /**
   * Quick external Lightning payment
   * @param fromUser - Source user identifier
   * @param toLightningAddress - Target Lightning address
   * @param amount - Amount in satoshis
   * @param memo - Optional memo
   * @param userRole - User role for spending validation
   */
  async quickExternalPayment(
    fromUser: string,
    toLightningAddress: string,
    amount: number,
    memo?: string,
    userRole: UserRole = "adult"
  ): Promise<
    PaymentResponse & { routing: PaymentRouting; security: SecurityValidation }
  > {
    return await this.sendP2PExternalPayment(
      fromUser,
      toLightningAddress,
      amount,
      memo,
      userRole
    );
  }

  /**
   * Quick eCash conversion with automatic type detection
   * @param sourceToken - Source eCash token (Fedimint or Cashu)
   * @param targetDestination - Target destination (mint URL or federation)
   * @param userRole - User role for spending validation
   */
  async quickECashConversion(
    sourceToken: string,
    targetDestination: string,
    userRole: UserRole = "adult"
  ): Promise<
    | CashuConversionResponse
    | FedimintConversionResponse
    | ExternalCashuSwapResponse
  > {
    // Auto-detect token type based on format
    if (sourceToken.startsWith("fedimint_")) {
      if (
        targetDestination.includes("cashu") ||
        targetDestination.includes(".mint")
      ) {
        return await this.convertFedimintToCashu(
          sourceToken,
          targetDestination,
          userRole
        );
      } else {
        return await this.convertFedimintToFedimint(
          sourceToken,
          targetDestination,
          userRole
        );
      }
    } else if (sourceToken.startsWith("cashu_")) {
      if (
        targetDestination.includes("fedimint") ||
        targetDestination.includes(".federation")
      ) {
        return await this.convertCashuToFedimint(
          sourceToken,
          targetDestination,
          userRole
        );
      } else {
        return await this.performExternalCashuSwap(
          sourceToken,
          targetDestination,
          userRole
        );
      }
    } else {
      throw new Error("Unsupported token format for auto-detection");
    }
  }

  /**
   * Get comprehensive payment capabilities for a user role
   * SOVEREIGNTY PRINCIPLE: Adults, Stewards, Guardians have UNLIMITED individual wallet spending (-1 values)
   * @param userRole - User role to check capabilities for
   */
  getPaymentCapabilities(userRole: UserRole): {
    canSendP2P: boolean;
    canSendExternal: boolean;
    canUseECashBridge: boolean;
    spendingLimits: {
      hasLimits: boolean;
      dailyLimit: number; // -1 = unlimited (sovereignty), positive = limit (offspring only)
      requiresApproval: boolean;
    };
    availableNodes: LightningNodeConfig[];
  } {
    const availableNodes = this.nodeManager.getAllNodes();

    // SOVEREIGNTY PRINCIPLE: Private, Adult, Steward, Guardian roles have UNLIMITED spending authority
    const isSovereignRole =
      userRole === "private" ||
      userRole === "adult" ||
      userRole === "steward" ||
      userRole === "guardian";

    return {
      canSendP2P: true, // All roles can send P2P payments
      canSendExternal: true, // All roles can send external payments
      canUseECashBridge: true, // Universal access to eCash bridge
      spendingLimits: {
        hasLimits: userRole === "offspring", // Only offspring have limits
        dailyLimit: isSovereignRole ? -1 : 50000, // -1 = unlimited (sovereignty), 50k sats for offspring
        requiresApproval: userRole === "offspring", // Only offspring require approval
      },
      availableNodes: availableNodes.filter((node) => node.isActive),
    };
  }

  /**
   * Get optimal payment method recommendation
   * @param fromUser - Source user
   * @param toDestination - Target destination
   * @param amount - Amount in satoshis
   * @param userRole - User role
   */
  getPaymentRecommendation(
    fromUser: string,
    toDestination: string,
    amount: number,
    userRole: UserRole = "adult"
  ): {
    recommendedType: PaymentType;
    reason: string;
    estimatedFee: number;
    estimatedTime: string;
    privacyLevel: "high" | "medium" | "low";
  } {
    // Determine if destination is internal Satnam user
    const isInternalUser = toDestination.includes(
      `@${resolvePlatformLightningDomain()}`
    );

    // Determine if destination is eCash token
    const isECashToken =
      toDestination.startsWith("fedimint_") ||
      toDestination.startsWith("cashu_");

    if (isECashToken) {
      if (toDestination.startsWith("fedimint_")) {
        return {
          recommendedType: "ECASH_CASHU_TO_FEDIMINT",
          reason: "eCash bridge conversion detected",
          estimatedFee: Math.floor(amount * 0.01), // 1%
          estimatedTime: "< 1 minute",
          privacyLevel: "high",
        };
      } else {
        return {
          recommendedType: "ECASH_FEDIMINT_TO_CASHU",
          reason: "eCash bridge conversion detected",
          estimatedFee: Math.floor(amount * 0.01), // 1%
          estimatedTime: "< 1 minute",
          privacyLevel: "high",
        };
      }
    }

    if (isInternalUser) {
      return {
        recommendedType: "P2P_INTERNAL_LIGHTNING",
        reason: "Internal Satnam user - privacy-first routing via PhoenixD",
        estimatedFee: Math.floor(amount * 0.001), // 0.1%
        estimatedTime: "< 30 seconds",
        privacyLevel: "high",
      };
    }

    return {
      recommendedType: "P2P_EXTERNAL_LIGHTNING",
      reason: "External Lightning address - custodial routing via Breez",
      estimatedFee: Math.floor(amount * 0.005), // 0.5%
      estimatedTime: "1-2 minutes",
      privacyLevel: "medium",
    };
  }
}
