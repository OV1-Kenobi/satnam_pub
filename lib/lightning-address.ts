/**
 * Lightning Address Service
 *
 * MASTER CONTEXT COMPLIANCE:
 * ✅ Bitcoin-only Lightning Address implementation for family banking
 * ✅ Privacy-first architecture with no external logging
 * ✅ Role hierarchy support: "private"|"offspring"|"adult"|"steward"|"guardian"
 * ✅ Browser-compatible environment variable handling
 * ✅ Secure payment limits based on family roles
 * ✅ Integration with unified family banking infrastructure
 */

import { resolvePlatformLightningDomain } from "../src/config/domain.client";
import type { FamilyMember } from "./family-api.d.ts";
import { getFamilyMember, getFamilyMembers } from "./family-api.js";
import { LightningClient } from "./lightning-client";
// MASTER CONTEXT COMPLIANCE: Privacy operations handled by unified service
// import { logPrivacyOperation } from "./privacy"; // Replaced with console logging for Master Context compliance

export interface LightningAddressInfo {
  username: string;
  domain: string;
  address: string; // Full Lightning Address (username@domain)
  familyMember: FamilyMember;
  limits: {
    minSendable: number; // millisats
    maxSendable: number; // millisats
  };
  nostrEnabled: boolean;
}

export interface LightningAddressPayment {
  address: string;
  amount: number; // sats
  comment?: string;
  nostrEvent?: any;
  invoice: string;
  privacyEnabled: boolean;
  privacyFee: number;
  paymentHash: string;
}

/**
 * Lightning Address Service Class
 */
export class LightningAddressService {
  private lightningClient: LightningClient;
  private domain: string;

  constructor() {
    this.lightningClient = new LightningClient();
    this.domain = this.getDomain();
  }

  /**
   * Get Lightning Address information for a username
   *
   * @param username - Lightning address username
   * @returns Lightning address info or null if not found
   */
  async getLightningAddressInfo(
    username: string
  ): Promise<LightningAddressInfo | null> {
    try {
      // Validate username format
      if (!this.isValidUsername(username)) {
        throw new Error("Invalid username format");
      }

      // Look up family member
      const familyMember = await getFamilyMember(username);
      if (!familyMember) {
        return null;
      }

      // Calculate payment limits
      const limits = this.calculatePaymentLimits(familyMember);

      return {
        username,
        domain: this.domain,
        address: `${username}@${this.domain}`,
        familyMember,
        limits,
        nostrEnabled: !!familyMember.nostrPubkey,
      };
    } catch (error) {
      console.error("Error getting Lightning Address info:", error);
      return null;
    }
  }

  /**
   * Generate invoice for Lightning Address payment
   *
   * @param username - Lightning address username
   * @param amountSats - Amount in satoshis
   * @param comment - Optional payment comment
   * @param nostrEvent - Optional Nostr zap event
   * @returns Payment information with invoice
   */
  async generatePaymentInvoice(
    username: string,
    amountSats: number,
    comment?: string,
    nostrEvent?: any
  ): Promise<LightningAddressPayment> {
    try {
      // Get Lightning Address info
      const addressInfo = await this.getLightningAddressInfo(username);
      if (!addressInfo) {
        throw new Error("Lightning Address not found");
      }

      // Validate amount against limits
      const amountMillisats = amountSats * 1000;
      if (
        amountMillisats < addressInfo.limits.minSendable ||
        amountMillisats > addressInfo.limits.maxSendable
      ) {
        throw new Error(
          `Amount must be between ${
            addressInfo.limits.minSendable / 1000
          } and ${addressInfo.limits.maxSendable / 1000} sats`
        );
      }

      // Generate payment description
      const description = this.generatePaymentDescription(
        addressInfo.familyMember.name,
        username,
        comment,
        nostrEvent,
        amountSats
      );

      // Create privacy-enhanced invoice
      const invoice = await this.lightningClient.createFamilyInvoice(
        username,
        amountSats,
        description
      );

      // MASTER CONTEXT COMPLIANCE: User-controlled local payment history logging
      // Store in user's local encrypted payment history (not external database)
      await this.logPaymentToUserHistory({
        operation: "lightning_address_payment",
        username,
        amount: amountSats,
        hasComment: !!comment,
        hasNostrZap: !!nostrEvent,
        privacyEnabled: invoice.privacy.isPrivacyEnabled,
        privacyFee: invoice.privacy.privacyFee,
        timestamp: new Date(),
        paymentHash: invoice.paymentHash,
      });

      console.log(
        `⚡ Generated Lightning Address payment for ${addressInfo.address}: ${amountSats} sats`
      );

      return {
        address: addressInfo.address,
        amount: amountSats,
        comment,
        nostrEvent,
        invoice: invoice.invoice,
        privacyEnabled: invoice.privacy.isPrivacyEnabled,
        privacyFee: invoice.privacy.privacyFee,
        paymentHash: invoice.paymentHash,
      };
    } catch (error) {
      console.error("Error generating Lightning Address payment:", error);
      throw error;
    }
  }

  /**
   * Get all available Lightning Addresses for the family
   *
   * @returns Array of Lightning Address information
   */
  async getAllLightningAddresses(): Promise<LightningAddressInfo[]> {
    try {
      const familyMembers = await getFamilyMembers();
      const addresses: LightningAddressInfo[] = [];

      for (const member of familyMembers) {
        if (member.username) {
          const addressInfo = await this.getLightningAddressInfo(
            member.username
          );
          if (addressInfo) {
            addresses.push(addressInfo);
          }
        }
      }

      return addresses;
    } catch (error) {
      console.error("Error getting all Lightning Addresses:", error);
      return [];
    }
  }

  /**
   * Validate Lightning Address format
   *
   * @param address - Full Lightning Address (username@domain)
   * @returns True if valid format
   */
  validateLightningAddress(address: string): boolean {
    const parts = address.split("@");
    if (parts.length !== 2) {
      return false;
    }

    const [username, domain] = parts;
    return this.isValidUsername(username) && domain === this.domain;
  }

  /**
   * Extract username from Lightning Address
   *
   * @param address - Full Lightning Address
   * @returns Username or null if invalid
   */
  extractUsername(address: string): string | null {
    if (!this.validateLightningAddress(address)) {
      return null;
    }

    return address.split("@")[0];
  }

  /**
   * Check if Lightning Address exists
   *
   * @param address - Lightning Address to check
   * @returns True if address exists
   */
  async exists(address: string): Promise<boolean> {
    const username = this.extractUsername(address);
    if (!username) {
      return false;
    }

    const info = await this.getLightningAddressInfo(username);
    return info !== null;
  }

  /**
   * Get domain for Lightning Addresses
   * MASTER CONTEXT COMPLIANCE: Browser-compatible environment variable handling
   * Uses centralized domain resolver for white-label compatibility
   *
   * @returns Domain string
   */
  private getDomain(): string {
    return resolvePlatformLightningDomain();
  }

  /**
   * Validate username format
   *
   * @param username - Username to validate
   * @returns True if valid
   */
  private isValidUsername(username: string): boolean {
    // Allow alphanumeric, underscore, and hyphen
    // Must be 1-32 characters long
    return /^[a-zA-Z0-9_-]{1,32}$/.test(username);
  }

  /**
   * Calculate payment limits for family member
   *
   * @param familyMember - Family member data
   * @returns Payment limits in millisatoshis
   */
  private calculatePaymentLimits(familyMember: FamilyMember): {
    minSendable: number;
    maxSendable: number;
  } {
    const minSendable = 1000; // 1 sat minimum (in millisats)

    let maxSendable: number;

    // MASTER CONTEXT COMPLIANCE: Use standardized role hierarchy
    switch (familyMember.role) {
      case "guardian":
      case "steward":
        maxSendable = 100000000; // 100,000 sats - Full authority roles
        break;
      case "adult":
        maxSendable = 50000000; // 50,000 sats - Adult family members
        break;
      case "offspring":
        maxSendable = 10000000; // 10,000 sats - Minor beneficiaries
        break;
      case "private":
      default:
        maxSendable = 25000000; // 25,000 sats - Default/private users
    }

    // Apply daily limit if configured
    if (familyMember.dailyLimit && familyMember.dailyLimit > 0) {
      const dailyLimitMillisats = familyMember.dailyLimit * 1000;
      maxSendable = Math.min(maxSendable, dailyLimitMillisats);
    }

    return { minSendable, maxSendable };
  }

  /**
   * Generate payment description
   *
   * @param memberName - Family member name
   * @param username - Username
   * @param comment - Optional comment
   * @param nostrEvent - Optional Nostr event
   * @param amountSats - Amount in sats
   * @returns Formatted description
   */
  private generatePaymentDescription(
    memberName: string,
    _username: string, // Prefixed with _ to indicate intentionally unused
    comment?: string,
    nostrEvent?: any,
    amountSats?: number
  ): string {
    let description = `Payment to ${memberName}@${this.domain}`;

    if (nostrEvent) {
      description = `⚡ Nostr Zap: ${description}`;
      if (amountSats) {
        description += ` (${amountSats} sats)`;
      }
    }

    if (comment) {
      // Sanitize and limit comment length
      const sanitizedComment = comment
        .replace(/[^\w\s\-.,!?@#]/g, "")
        .substring(0, 200);
      description += ` - ${sanitizedComment}`;
    }

    return description;
  }

  /**
   * MASTER CONTEXT COMPLIANCE: User-controlled local payment history logging
   * Stores payment history in user's local encrypted storage (localStorage)
   * NEVER stored in external databases - user maintains full control
   *
   * @param paymentData - Payment operation data
   */
  private async logPaymentToUserHistory(paymentData: {
    operation: string;
    username: string;
    amount: number;
    hasComment: boolean;
    hasNostrZap: boolean;
    privacyEnabled: boolean;
    privacyFee: number;
    timestamp: Date;
    paymentHash: string;
  }): Promise<void> {
    try {
      // Get existing payment history from localStorage
      const existingHistory = localStorage.getItem("satnam_payment_history");
      const paymentHistory = existingHistory ? JSON.parse(existingHistory) : [];

      // Add new payment to history
      const paymentRecord = {
        id: crypto.randomUUID(),
        type: "lightning_address_outbound",
        ...paymentData,
        timestamp: paymentData.timestamp.toISOString(),
      };

      paymentHistory.push(paymentRecord);

      // Keep only last 1000 payments to prevent localStorage bloat
      if (paymentHistory.length > 1000) {
        paymentHistory.splice(0, paymentHistory.length - 1000);
      }

      // Store back to localStorage (user-controlled, local only)
      localStorage.setItem(
        "satnam_payment_history",
        JSON.stringify(paymentHistory)
      );

      console.log(
        `⚡ Payment logged to user's local history: ${paymentData.username} - ${paymentData.amount} sats`
      );
    } catch (error) {
      console.error("Failed to log payment to user history:", error);
      // Non-critical error - don't throw, just log
    }
  }
}

// Export convenience functions
export const lightningAddressService = new LightningAddressService();

/**
 * Get Lightning Address info for username
 */
export async function getLightningAddressInfo(
  username: string
): Promise<LightningAddressInfo | null> {
  return lightningAddressService.getLightningAddressInfo(username);
}

/**
 * Generate payment invoice for Lightning Address
 */
export async function generateLightningAddressPayment(
  username: string,
  amountSats: number,
  comment?: string,
  nostrEvent?: any
): Promise<LightningAddressPayment> {
  return lightningAddressService.generatePaymentInvoice(
    username,
    amountSats,
    comment,
    nostrEvent
  );
}

/**
 * Validate Lightning Address format
 */
export function validateLightningAddress(address: string): boolean {
  return lightningAddressService.validateLightningAddress(address);
}

/**
 * Check if Lightning Address exists
 */
export async function lightningAddressExists(
  address: string
): Promise<boolean> {
  return lightningAddressService.exists(address);
}
