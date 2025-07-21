/**
 * Control Board Service - Bitcoin-Only Family Banking Operations
 *
 * MASTER CONTEXT COMPLIANCE:
 * ✅ Bitcoin-only Lightning Network stack (Voltage, PhoenixD, Breez, LNBits, NWC)
 * ✅ Privacy-first architecture with user-controlled payment history
 * ✅ Role hierarchy: "private"|"offspring"|"adult"|"steward"|"guardian"
 * ✅ No external logging, user data sovereignty maintained
 * ✅ Integration with unified messaging service and session management
 */

import { getFamilyMembers } from "../lib/family-api";
import { LightningAddressService } from "../lib/lightning-address";
import { LightningClient } from "../lib/lightning-client";
// MASTER CONTEXT COMPLIANCE: Use user-controlled local logging instead of external privacy service
// import { logPrivacyOperation } from "../lib/privacy"; // Replaced with local payment history
// import { SatnamPrivacyLayer } from "../lib/privacy/lnproxy-privacy"; // Replaced with unified service
import { supabase } from "../lib/supabase";

// MASTER CONTEXT COMPLIANCE: NIP-05 Domain Whitelist for Platform Access
// CRITICAL: Only these two domains are approved for platform access
// Additional domains require Satnam Admin approval and will be a paid feature
const WHITELISTED_NIP05_DOMAINS = ["satnam.pub", "citadel.academy"] as const;

// Types
export interface ControlBoardStats {
  lightning: {
    totalBalance: number;
    totalCapacity: number;
    nodeCount: number;
    channelCount: number;
    recentTransactions: Transaction[];
  };
  nostr: {
    connectedRelays: number;
    totalRelays: number;
    recentEvents: NostrEventSummary[];
    encryptedEvents: number;
  };
  family: {
    totalMembers: number;
    activeMembers: number;
    verifiedMembers: number;
    privacyEnabledMembers: number;
  };
  privacy: {
    privacyRate: number;
    averagePrivacyFee: number;
    totalPrivacyTransactions: number;
    relayDistribution: Record<string, number>;
  };
}

export interface Transaction {
  id: string;
  type: "sent" | "received" | "internal";
  amount: number;
  from: string;
  to: string;
  description?: string;
  timestamp: Date;
  status: "pending" | "confirmed" | "failed";
  privacyEnabled: boolean;
  nostrEvent?: string;
  hash?: string;
}

export interface NostrEventSummary {
  id: string;
  kind: number;
  pubkey: string;
  content: string;
  created_at: Date;
  tags: string[][];
  relays: string[];
  status: "draft" | "signed" | "published" | "failed";
}

export interface NostrRelay {
  url: string;
  status: "connected" | "connecting" | "disconnected" | "error";
  lastConnected?: Date;
  messageCount: number;
  readAccess: boolean;
  writeAccess: boolean;
}

export interface LightningNode {
  id: string;
  name: string;
  pubkey: string;
  status: "online" | "offline" | "syncing";
  balance: number;
  channelCount: number;
  capacity: number;
  // MASTER CONTEXT COMPLIANCE: Bitcoin-only Lightning Network stack with custody progression
  provider: "voltage" | "lnbits" | "phoenixd" | "breez" | "own";
  nwcConnection?: string; // For 'own' provider - NWC connection string (preferred self-custody)
  custodyLevel: "custodial" | "internal" | "self-custodial"; // Custody progression tracking
  migrationRecommendation?: string; // Next step in self-custody journey
}

export interface ControlBoardTransaction {
  id: string;
  type: "payment" | "invoice" | "channel_open" | "channel_close";
  amount: number;
  from: string;
  to: string;
  description?: string;
  timestamp: Date;
  status: "pending" | "completed" | "failed" | "cancelled";
  privacyEnabled: boolean;
  nostrEvent?: string;
  hash: string;
}

export interface LightningAddressConfig {
  address: string;
  isDefault: boolean; // true if using username@satnam.pub
  isCustom: boolean; // true if user configured custom address
  isSelfCustodial: boolean; // true if connected to user's own node
  nwcConnection?: string; // NWC connection for self-custodial addresses
  lastVerified: Date;
  status: "active" | "pending" | "failed" | "disabled";
}

export interface NIP05Config {
  identifier: string;
  domain: string;
  isWhitelisted: boolean; // true if domain is approved for platform access
  platformAccessEnabled: boolean; // false if using non-whitelisted domain
  lastVerified: Date;
  status: "active" | "pending" | "failed" | "disabled";
}

export interface IdentityConfiguration {
  userId: string;
  username: string;
  lightningAddress: LightningAddressConfig;
  nip05: NIP05Config;
  sovereigntyLevel: "default" | "intermediate" | "advanced" | "sovereign";
  migrationRecommendations: string[];
  platformWarnings: string[];
}

export interface FamilyMemberExtended {
  id: string;
  username: string;
  displayName: string;
  // MASTER CONTEXT COMPLIANCE: Standardized role hierarchy
  role: "private" | "offspring" | "adult" | "steward" | "guardian";
  nostrPubkey: string;
  lightningAddress: string;
  balance: number;
  dailyLimit: number;
  nostrEnabled: boolean;
  lightningEnabled: boolean;
  privacyLevel: "standard" | "enhanced" | "maximum";
  lastActivity?: Date;
  status: "active" | "inactive" | "suspended";
  // Role-Based Access Controls (RBACs)
  permissions: {
    canSendPayments: boolean;
    canReceivePayments: boolean;
    canManageFamily: boolean;
    canApproveTransactions: boolean;
    maxDailySpend: number;
    requiresApproval: boolean;
    // Parental Control Permissions
    canSetOffspringLimits: boolean;
    canViewOffspringHistory: boolean;
    canApproveOffspringTransactions: boolean;
  };
}

export interface PrivacySettings {
  mode: "standard" | "enhanced" | "stealth";
  enableLnproxy: boolean;
  enableTorRouting: boolean;
  enableEventEncryption: boolean;
  relayRotation: boolean;
  autoPrivacyFees: boolean;
  maxPrivacyFeePercent: number;
}

export class ControlBoardService {
  private lightningClient: LightningClient;
  private lightningAddressService: LightningAddressService;
  private familyId: string;

  constructor(familyId: string) {
    this.familyId = familyId;
    this.lightningClient = new LightningClient();
    this.lightningAddressService = new LightningAddressService();
  }

  /**
   * MASTER CONTEXT COMPLIANCE: User-controlled local payment history logging
   * Stores payment history in user's local encrypted storage (localStorage)
   * NEVER stored in external databases - user maintains full control
   */
  private async logPaymentToUserHistory(paymentData: {
    operation: string;
    familyId: string;
    details: any;
    timestamp: Date;
  }): Promise<void> {
    try {
      const existingHistory = localStorage.getItem(
        "satnam_control_board_history"
      );
      const paymentHistory = existingHistory ? JSON.parse(existingHistory) : [];

      const paymentRecord = {
        id: crypto.randomUUID(),
        type: "control_board_operation",
        ...paymentData,
        timestamp: paymentData.timestamp.toISOString(),
      };

      paymentHistory.push(paymentRecord);

      // Keep only last 1000 operations to prevent localStorage bloat
      if (paymentHistory.length > 1000) {
        paymentHistory.splice(0, paymentHistory.length - 1000);
      }

      localStorage.setItem(
        "satnam_control_board_history",
        JSON.stringify(paymentHistory)
      );
      console.log(
        `⚡ Control board operation logged to user's local history: ${paymentData.operation}`
      );
    } catch (error) {
      console.error("Failed to log operation to user history:", error);
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Get user's local payment history
   */
  async getUserPaymentHistory(limit: number = 100): Promise<any[]> {
    try {
      const existingHistory = localStorage.getItem(
        "satnam_control_board_history"
      );
      if (!existingHistory) return [];

      const paymentHistory = JSON.parse(existingHistory);
      return paymentHistory
        .sort(
          (a: any, b: any) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
        .slice(0, limit);
    } catch (error) {
      console.error("Failed to retrieve user payment history:", error);
      return [];
    }
  }

  /**
   * Get comprehensive control board statistics
   */
  async getControlBoardStats(): Promise<ControlBoardStats> {
    try {
      const [lightningStats, nostrStats, familyStats, privacyStats] =
        await Promise.all([
          this.getLightningStats(),
          this.getNostrStats(),
          this.getFamilyStats(),
          this.getPrivacyStats(),
        ]);

      return {
        lightning: lightningStats,
        nostr: nostrStats,
        family: familyStats,
        privacy: privacyStats,
      };
    } catch (error) {
      console.error("Error fetching control board stats:", error);
      throw new Error("Failed to fetch control board statistics");
    }
  }

  /**
   * Get Lightning Network statistics
   */
  private async getLightningStats() {
    try {
      // Get family members with Lightning addresses
      const familyMembers = await getFamilyMembers();
      const lightningMembers = familyMembers.filter(
        (member) => member.lightningAddress && member.familyId === this.familyId
      );

      // Calculate totals
      const totalBalance = lightningMembers.reduce(
        (sum, member) => sum + (member.balance || 0),
        0
      );

      // Get recent transactions
      const recentTransactions = await this.getRecentTransactions(10);

      // Mock node data (replace with actual node API calls)
      const nodeCount = 1;
      const channelCount = 8;
      const totalCapacity = 5000000;

      return {
        totalBalance,
        totalCapacity,
        nodeCount,
        channelCount,
        recentTransactions,
      };
    } catch (error) {
      console.error("Error fetching Lightning stats:", error);
      throw error;
    }
  }

  /**
   * Get Nostr statistics
   */
  private async getNostrStats() {
    try {
      // Get relay information from database
      const { data: relayData, error } = await supabase
        .from("nostr_relays")
        .select("*")
        .eq("family_id", this.familyId);

      if (error) throw error;

      const connectedRelays =
        relayData?.filter((relay) => relay.status === "connected").length || 0;
      const totalRelays = relayData?.length || 0;

      // Get recent events
      const recentEvents = await this.getRecentNostrEvents(10);

      // Mock encrypted events count
      const encryptedEvents = 156;

      return {
        connectedRelays,
        totalRelays,
        recentEvents,
        encryptedEvents,
      };
    } catch (error) {
      console.error("Error fetching Nostr stats:", error);
      // Return mock data if database isn't available
      return {
        connectedRelays: 2,
        totalRelays: 3,
        recentEvents: [],
        encryptedEvents: 156,
      };
    }
  }

  /**
   * Get family statistics
   */
  private async getFamilyStats() {
    try {
      const allMembers = await getFamilyMembers();
      const familyMembers = allMembers.filter(
        (member) => member.familyId === this.familyId
      );

      const totalMembers = familyMembers.length;
      const activeMembers = familyMembers.filter(
        (member) =>
          member.lastActivity &&
          Date.now() - new Date(member.lastActivity).getTime() <
            24 * 60 * 60 * 1000
      ).length;
      const verifiedMembers = familyMembers.filter(
        (member) => member.nostrPubkey
      ).length;
      const privacyEnabledMembers = familyMembers.filter(
        (member) => member.privacyLevel && member.privacyLevel !== "standard"
      ).length;

      return {
        totalMembers,
        activeMembers,
        verifiedMembers,
        privacyEnabledMembers,
      };
    } catch (error) {
      console.error("Error fetching family stats:", error);
      throw error;
    }
  }

  /**
   * Get privacy statistics
   */
  private async getPrivacyStats() {
    try {
      // Get privacy-enabled transactions from the last 30 days
      const { data: transactionData, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("family_id", this.familyId)
        .gte(
          "created_at",
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        );

      if (error) throw error;

      const totalTransactions = transactionData?.length || 0;
      const privacyTransactions =
        transactionData?.filter((tx) => tx.privacy_enabled).length || 0;
      const privacyRate =
        totalTransactions > 0
          ? (privacyTransactions / totalTransactions) * 100
          : 0;

      // Calculate average privacy fee
      const privacyTxs =
        transactionData?.filter((tx) => tx.privacy_enabled && tx.privacy_fee) ||
        [];
      const averagePrivacyFee =
        privacyTxs.length > 0
          ? privacyTxs.reduce((sum, tx) => sum + tx.privacy_fee, 0) /
            privacyTxs.length
          : 0;

      // Mock relay distribution
      const relayDistribution = {
        "relay.damus.io": 45,
        "nos.lol": 32,
        "relay.satnam.pub": 23,
      };

      return {
        privacyRate: Math.round(privacyRate),
        averagePrivacyFee: Math.round(averagePrivacyFee * 100) / 100,
        totalPrivacyTransactions: privacyTransactions,
        relayDistribution,
      };
    } catch (error) {
      console.error("Error fetching privacy stats:", error);
      // Return mock data if database isn't available
      return {
        privacyRate: 70,
        averagePrivacyFee: 2.3,
        totalPrivacyTransactions: 89,
        relayDistribution: {
          "relay.damus.io": 45,
          "nos.lol": 32,
          "relay.satnam.pub": 23,
        },
      };
    }
  }

  /**
   * Get recent transactions
   */
  async getRecentTransactions(limit: number = 20): Promise<Transaction[]> {
    try {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("family_id", this.familyId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      return (
        data?.map((tx) => ({
          id: tx.id,
          type: tx.type,
          amount: tx.amount,
          from: tx.from_address,
          to: tx.to_address,
          description: tx.description,
          timestamp: new Date(tx.created_at),
          status: tx.status,
          privacyEnabled: tx.privacy_enabled,
          nostrEvent: tx.nostr_event_id,
          hash: tx.payment_hash,
        })) || []
      );
    } catch (error) {
      console.error("Error fetching recent transactions:", error);
      // Return mock data if database isn't available
      return [
        {
          id: "tx1",
          type: "received",
          amount: 50000,
          from: "alice@getalby.com",
          to: "dad@satnam.pub",
          description: "Payment for services",
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
          status: "confirmed",
          privacyEnabled: true,
        },
        {
          id: "tx2",
          type: "sent",
          amount: 25000,
          from: "dad@satnam.pub",
          to: "daughter@satnam.pub",
          description: "Weekly payment",
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4),
          status: "confirmed",
          privacyEnabled: false,
        },
      ];
    }
  }

  /**
   * Get recent Nostr events
   */
  async getRecentNostrEvents(limit: number = 20): Promise<NostrEventSummary[]> {
    try {
      const { data, error } = await supabase
        .from("nostr_events")
        .select("*")
        .eq("family_id", this.familyId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      return (
        data?.map((event) => ({
          id: event.id,
          kind: event.kind,
          pubkey: event.pubkey,
          content: event.content,
          created_at: new Date(event.created_at),
          tags: event.tags || [],
          relays: event.relays || [],
          status: event.status,
        })) || []
      );
    } catch (error) {
      console.error("Error fetching recent Nostr events:", error);
      return [];
    }
  }

  /**
   * Get Nostr relays
   */
  async getNostrRelays(): Promise<NostrRelay[]> {
    try {
      const { data, error } = await supabase
        .from("nostr_relays")
        .select("*")
        .eq("family_id", this.familyId);

      if (error) throw error;

      return (
        data?.map((relay) => ({
          url: relay.url,
          status: relay.status,
          lastConnected: relay.last_connected
            ? new Date(relay.last_connected)
            : undefined,
          messageCount: relay.message_count || 0,
          readAccess: relay.read_access || false,
          writeAccess: relay.write_access || false,
        })) || []
      );
    } catch (error) {
      console.error("Error fetching Nostr relays:", error);
      // Return mock data if database isn't available
      return [
        {
          url: "wss://relay.damus.io",
          status: "connected",
          lastConnected: new Date(Date.now() - 1000 * 60 * 5),
          messageCount: 1247,
          readAccess: true,
          writeAccess: true,
        },
        {
          url: "wss://nos.lol",
          status: "connected",
          lastConnected: new Date(Date.now() - 1000 * 60 * 3),
          messageCount: 892,
          readAccess: true,
          writeAccess: true,
        },
        {
          url: "wss://relay.satnam.pub",
          status: "connecting",
          messageCount: 0,
          readAccess: true,
          writeAccess: true,
        },
      ];
    }
  }

  /**
   * Get Lightning nodes
   */
  async getLightningNodes(): Promise<LightningNode[]> {
    try {
      const { data, error } = await supabase
        .from("lightning_nodes")
        .select("*")
        .eq("family_id", this.familyId);

      if (error) throw error;

      return (
        data?.map((node) => ({
          id: node.id,
          name: node.name,
          pubkey: node.pubkey,
          status: node.status,
          balance: node.balance || 0,
          channelCount: node.channel_count || 0,
          capacity: node.capacity || 0,
          provider: node.provider,
          custodyLevel: this.getCustodyLevelForProvider(node.provider),
          migrationRecommendation: this.getMigrationRecommendationForProvider(
            node.provider
          ),
        })) || []
      );
    } catch (error) {
      console.error("Error fetching Lightning nodes:", error);
      // MASTER CONTEXT COMPLIANCE: Bitcoin-only Lightning Network stack with custody progression
      return [
        {
          id: "voltage_node_1",
          name: "Voltage Hosted Node (Custodial)",
          pubkey: "03a1b2c3d4e5f6...truncated",
          status: "online",
          balance: 2500000,
          channelCount: 8,
          capacity: 5000000,
          provider: "voltage",
          custodyLevel: "custodial",
          migrationRecommendation:
            "Consider migrating to PhoenixD for internal Satnam payments",
        },
        {
          id: "phoenixd_node_1",
          name: "PhoenixD Internal Wallet (Family-to-Family Payments)",
          pubkey: "03b2c3d4e5f6a7...truncated",
          status: "online",
          balance: 150000,
          channelCount: 1,
          capacity: 200000,
          provider: "phoenixd",
          custodyLevel: "internal",
          migrationRecommendation: "Optimal for Satnam ecosystem payments",
        },
        {
          id: "breez_node_1",
          name: "Breez Custodial Wallet (External Payments)",
          pubkey: "03c3d4e5f6a7b8...truncated",
          status: "online",
          balance: 75000,
          channelCount: 1,
          capacity: 100000,
          provider: "breez",
          custodyLevel: "custodial",
          migrationRecommendation:
            "Temporary solution - migrate to self-custody when ready",
        },
      ];
    }
  }

  /**
   * Get extended family members data
   */
  /**
   * MASTER CONTEXT COMPLIANCE: Role-based access control mapping
   */
  private getRolePermissions(role: string): {
    canSendPayments: boolean;
    canReceivePayments: boolean;
    canManageFamily: boolean;
    canApproveTransactions: boolean;
    maxDailySpend: number;
    requiresApproval: boolean;
    canSetOffspringLimits: boolean;
    canViewOffspringHistory: boolean;
    canApproveOffspringTransactions: boolean;
  } {
    switch (role) {
      case "guardian":
        return {
          canSendPayments: true,
          canReceivePayments: true,
          canManageFamily: true,
          canApproveTransactions: true,
          maxDailySpend: Number.MAX_SAFE_INTEGER, // Unlimited for authority roles
          requiresApproval: false,
          canSetOffspringLimits: true,
          canViewOffspringHistory: true,
          canApproveOffspringTransactions: true,
        };
      case "steward":
        return {
          canSendPayments: true,
          canReceivePayments: true,
          canManageFamily: true,
          canApproveTransactions: true,
          maxDailySpend: Number.MAX_SAFE_INTEGER, // Unlimited for authority roles
          requiresApproval: false,
          canSetOffspringLimits: true,
          canViewOffspringHistory: true,
          canApproveOffspringTransactions: true,
        };
      case "adult":
        return {
          canSendPayments: true,
          canReceivePayments: true,
          canManageFamily: false,
          canApproveTransactions: false,
          maxDailySpend: Number.MAX_SAFE_INTEGER, // Unlimited for authority roles
          requiresApproval: false,
          canSetOffspringLimits: true,
          canViewOffspringHistory: true,
          canApproveOffspringTransactions: true,
        };
      case "offspring":
        return {
          canSendPayments: true,
          canReceivePayments: true,
          canManageFamily: false,
          canApproveTransactions: false,
          maxDailySpend: 10000, // 10K sats - maintained for offspring
          requiresApproval: true,
          canSetOffspringLimits: false,
          canViewOffspringHistory: false,
          canApproveOffspringTransactions: false,
        };
      case "private":
      default:
        return {
          canSendPayments: true,
          canReceivePayments: true,
          canManageFamily: false,
          canApproveTransactions: false,
          maxDailySpend: Number.MAX_SAFE_INTEGER, // Unlimited for individuals not in a family federation
          requiresApproval: false,
          canSetOffspringLimits: false,
          canViewOffspringHistory: false,
          canApproveOffspringTransactions: false,
        };
    }
  }

  async getFamilyMembersExtended(): Promise<FamilyMemberExtended[]> {
    try {
      const allMembers = await getFamilyMembers();
      const familyMembers = allMembers.filter(
        (member) => member.familyId === this.familyId
      );

      return familyMembers.map((member) => ({
        id: member.id,
        username: member.username,
        displayName: member.name || member.username,
        // MASTER CONTEXT COMPLIANCE: Validate standardized role hierarchy
        role: this.validateStandardRole(member.role),
        nostrPubkey: member.nostrPubkey || "",
        lightningAddress:
          member.lightningAddress || `${member.username}@satnam.pub`,
        balance: member.balance || 0,
        dailyLimit: member.dailyLimit || 0,
        nostrEnabled: !!member.nostrPubkey,
        lightningEnabled: !!member.lightningAddress,
        privacyLevel:
          (member.privacyLevel as "standard" | "enhanced" | "maximum") ||
          "standard",
        lastActivity: member.lastActivity
          ? new Date(member.lastActivity)
          : undefined,
        status: member.status || "active",
        permissions: this.getRolePermissions(
          this.validateStandardRole(member.role)
        ),
      }));
    } catch (error) {
      console.error("Error fetching extended family members:", error);
      throw error;
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Get custody level for Lightning provider
   */
  private getCustodyLevelForProvider(
    provider: string
  ): "custodial" | "internal" | "self-custodial" {
    switch (provider) {
      case "voltage":
      case "lnbits":
      case "breez":
        return "custodial";
      case "phoenixd":
        return "internal";
      case "own":
        return "self-custodial";
      default:
        return "custodial";
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Get migration recommendation for Lightning provider
   */
  private getMigrationRecommendationForProvider(provider: string): string {
    switch (provider) {
      case "voltage":
      case "lnbits":
        return "Consider migrating to PhoenixD for internal Satnam payments";
      case "phoenixd":
        return "Optimal for Satnam ecosystem payments";
      case "breez":
        return "Temporary solution - migrate to self-custody when ready";
      case "own":
        return "Congratulations! You've achieved Lightning self-custody";
      default:
        return "Continue your self-custody journey";
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Map transaction types for compatibility
   */
  private mapTransactionType(
    type: string
  ): "payment" | "invoice" | "channel_open" | "channel_close" {
    switch (type) {
      case "sent":
      case "received":
      case "internal":
        return "payment";
      case "invoice":
        return "invoice";
      case "channel_open":
        return "channel_open";
      case "channel_close":
        return "channel_close";
      default:
        return "payment";
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Map transaction status for compatibility
   */
  private mapTransactionStatus(
    status: string
  ): "pending" | "completed" | "failed" | "cancelled" {
    switch (status) {
      case "pending":
        return "pending";
      case "confirmed":
      case "completed":
        return "completed";
      case "failed":
        return "failed";
      case "cancelled":
        return "cancelled";
      default:
        return "pending";
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Validate standardized role hierarchy
   */
  private validateStandardRole(
    role: string
  ): "private" | "offspring" | "adult" | "steward" | "guardian" {
    const validRoles: (
      | "private"
      | "offspring"
      | "adult"
      | "steward"
      | "guardian"
    )[] = ["private", "offspring", "adult", "steward", "guardian"];

    if (validRoles.includes(role as any)) {
      return role as "private" | "offspring" | "adult" | "steward" | "guardian";
    }

    // Default to most restrictive for invalid roles
    return "private";
  }

  /**
   * Send Lightning payment
   */
  async sendLightningPayment(params: {
    from: string;
    to: string;
    amount: number;
    description?: string;
    enablePrivacy?: boolean;
  }) {
    try {
      const { from, to, amount, description, enablePrivacy = false } = params;

      // MASTER CONTEXT COMPLIANCE: Log to user's local payment history
      await this.logPaymentToUserHistory({
        operation: "lightning_payment",
        familyId: this.familyId,
        details: {
          from,
          to,
          amount,
          privacyEnabled: enablePrivacy,
        },
        timestamp: new Date(),
      });

      // Use Lightning Address Service for payment
      const result = await this.lightningAddressService.generatePaymentInvoice(
        to.replace("@satnam.pub", ""),
        amount,
        description
      );

      // Store transaction in database
      const { error } = await supabase.from("transactions").insert({
        family_id: this.familyId,
        type: "sent",
        amount,
        from_address: from,
        to_address: to,
        description,
        status: "pending",
        privacy_enabled: enablePrivacy,
        payment_hash: result.paymentHash,
        created_at: new Date().toISOString(),
      });

      if (error) {
        console.error("Error storing transaction:", error);
      }

      return result;
    } catch (error) {
      console.error("Error sending Lightning payment:", error);
      throw error;
    }
  }

  /**
   * Add Nostr relay
   */
  async addNostrRelay(
    relayUrl: string,
    options: {
      readAccess?: boolean;
      writeAccess?: boolean;
    } = {}
  ) {
    try {
      const { readAccess = true, writeAccess = true } = options;

      const { error } = await supabase.from("nostr_relays").insert({
        family_id: this.familyId,
        url: relayUrl,
        status: "disconnected",
        read_access: readAccess,
        write_access: writeAccess,
        created_at: new Date().toISOString(),
      });

      if (error) throw error;

      // TODO: Actually connect to the relay
      console.log(`Added Nostr relay: ${relayUrl}`);
    } catch (error) {
      console.error("Error adding Nostr relay:", error);
      throw error;
    }
  }

  /**
   * Update privacy settings
   */
  async updatePrivacySettings(settings: Partial<PrivacySettings>) {
    try {
      const { error } = await supabase.from("family_privacy_settings").upsert({
        family_id: this.familyId,
        ...settings,
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;

      // MASTER CONTEXT COMPLIANCE: Log to user's local history
      await this.logPaymentToUserHistory({
        operation: "privacy_settings_update",
        familyId: this.familyId,
        details: settings,
        timestamp: new Date(),
      });

      console.log("Privacy settings updated:", settings);
    } catch (error) {
      console.error("Error updating privacy settings:", error);
      throw error;
    }
  }

  /**
   * Get privacy settings
   */
  async getPrivacySettings(): Promise<PrivacySettings> {
    try {
      const { data, error } = await supabase
        .from("family_privacy_settings")
        .select("*")
        .eq("family_id", this.familyId)
        .single();

      if (error && error.code !== "PGRST116") throw error;

      return (
        data || {
          mode: "standard",
          enableLnproxy: false,
          enableTorRouting: false,
          enableEventEncryption: false,
          relayRotation: false,
          autoPrivacyFees: false,
          maxPrivacyFeePercent: 5,
        }
      );
    } catch (error) {
      console.error("Error fetching privacy settings:", error);
      throw error;
    }
  }

  /**
   * Health check for all systems
   */
  async healthCheck() {
    try {
      const [lightningHealth, nostrHealth, databaseHealth] = await Promise.all([
        this.checkLightningHealth(),
        this.checkNostrHealth(),
        this.checkDatabaseHealth(),
      ]);

      return {
        lightning: lightningHealth,
        nostr: nostrHealth,
        database: databaseHealth,
        overall:
          lightningHealth && nostrHealth && databaseHealth
            ? "healthy"
            : "degraded",
      };
    } catch (error) {
      console.error("Error in health check:", error);
      return {
        lightning: false,
        nostr: false,
        database: false,
        overall: "error",
      };
    }
  }

  private async checkLightningHealth(): Promise<boolean> {
    try {
      // TODO: Implement actual Lightning node health check
      return true;
    } catch {
      return false;
    }
  }

  private async checkNostrHealth(): Promise<boolean> {
    try {
      const relays = await this.getNostrRelays();
      return relays.some((relay) => relay.status === "connected");
    } catch {
      return false;
    }
  }

  private async checkDatabaseHealth(): Promise<boolean> {
    try {
      const { error } = await supabase.from("profiles").select("id").limit(1);

      return !error;
    } catch {
      return false;
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Add NWC (Nostr Wallet Connect) connection
   * PREFERRED SELF-CUSTODY SOLUTION: Connects to user's own Lightning wallet
   * This is the ultimate goal for user sovereignty and self-custody
   */
  async addNWCConnection(
    connectionString: string,
    name: string = "My Self-Custody Lightning Wallet"
  ) {
    try {
      const { error } = await supabase.from("lightning_nodes").insert({
        family_id: this.familyId,
        name,
        provider: "own",
        nwc_connection: connectionString,
        status: "connecting",
        created_at: new Date().toISOString(),
      });

      if (error) throw error;

      await this.logPaymentToUserHistory({
        operation: "nwc_connection_added",
        familyId: this.familyId,
        details: { name, provider: "own" },
        timestamp: new Date(),
      });

      console.log(`Added NWC connection: ${name}`);
    } catch (error) {
      console.error("Error adding NWC connection:", error);
      throw error;
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Add PhoenixD Internal Wallet
   * INTERNAL SATNAM LIGHTNING WALLET: For family-to-family and P2P payments within Satnam ecosystem
   * Optimized for internal payment processing, not a mobile wallet
   */
  async addPhoenixDWallet(walletConfig: {
    name: string;
    apiEndpoint: string;
    apiKey: string;
  }) {
    try {
      const { name, apiEndpoint, apiKey } = walletConfig;

      const { error } = await supabase.from("lightning_nodes").insert({
        family_id: this.familyId,
        name,
        provider: "phoenixd",
        api_endpoint: apiEndpoint,
        api_key: apiKey,
        status: "connecting",
        created_at: new Date().toISOString(),
      });

      if (error) throw error;

      await this.logPaymentToUserHistory({
        operation: "phoenixd_wallet_added",
        familyId: this.familyId,
        details: { name, provider: "phoenixd" },
        timestamp: new Date(),
      });

      console.log(`Added PhoenixD wallet: ${name}`);
    } catch (error) {
      console.error("Error adding PhoenixD wallet:", error);
      throw error;
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Add Breez Custodial Wallet
   * CUSTODIAL EXTERNAL PAYMENTS: For payments outside the Satnam ecosystem
   * TEMPORARY SOLUTION: Before users establish self-custody with their own node
   */
  async addBreezWallet(walletConfig: {
    name: string;
    seedPhrase?: string;
    inviteCode?: string;
  }) {
    try {
      const { name, seedPhrase, inviteCode } = walletConfig;

      const { error } = await supabase.from("lightning_nodes").insert({
        family_id: this.familyId,
        name,
        provider: "breez",
        seed_phrase: seedPhrase,
        invite_code: inviteCode,
        status: "connecting",
        created_at: new Date().toISOString(),
      });

      if (error) throw error;

      await this.logPaymentToUserHistory({
        operation: "breez_wallet_added",
        familyId: this.familyId,
        details: { name, provider: "breez" },
        timestamp: new Date(),
      });

      console.log(`Added Breez wallet: ${name}`);
    } catch (error) {
      console.error("Error adding Breez wallet:", error);
      throw error;
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Check Lightning node health for all providers
   */
  async checkLightningNodeHealth(nodeId: string): Promise<{
    status: "online" | "offline" | "syncing";
    balance: number;
    channelCount: number;
    lastSeen: Date;
  }> {
    try {
      const { data: node, error } = await supabase
        .from("lightning_nodes")
        .select("*")
        .eq("id", nodeId)
        .eq("family_id", this.familyId)
        .single();

      if (error) throw error;

      // TODO: Implement actual health checks for each provider
      // This would call the appropriate API for voltage, phoenixd, breez, etc.

      return {
        status: node.status || "offline",
        balance: node.balance || 0,
        channelCount: node.channel_count || 0,
        lastSeen: new Date(node.updated_at || node.created_at),
      };
    } catch (error) {
      console.error("Error checking Lightning node health:", error);
      return {
        status: "offline",
        balance: 0,
        channelCount: 0,
        lastSeen: new Date(),
      };
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Validate role-based access for operations
   */
  async validateRoleAccess(
    userId: string,
    operation:
      | "send_payment"
      | "manage_family"
      | "approve_transaction"
      | "add_node",
    amount?: number
  ): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const allMembers = await getFamilyMembers();
      const member = allMembers.find(
        (m) => m.id === userId && m.familyId === this.familyId
      );

      if (!member) {
        return { allowed: false, reason: "User not found in family" };
      }

      const role = this.validateStandardRole(member.role);
      const permissions = this.getRolePermissions(role);

      switch (operation) {
        case "send_payment":
          if (!permissions.canSendPayments) {
            return {
              allowed: false,
              reason: "Role does not allow sending payments",
            };
          }
          if (amount && amount > permissions.maxDailySpend) {
            return {
              allowed: false,
              reason: `Amount exceeds daily limit of ${permissions.maxDailySpend} sats`,
            };
          }
          if (permissions.requiresApproval && amount && amount > 1000) {
            return {
              allowed: false,
              reason: "Payment requires guardian approval",
            };
          }
          break;

        case "manage_family":
          if (!permissions.canManageFamily) {
            return {
              allowed: false,
              reason: "Role does not allow family management",
            };
          }
          break;

        case "approve_transaction":
          if (!permissions.canApproveTransactions) {
            return {
              allowed: false,
              reason: "Role does not allow transaction approval",
            };
          }
          break;

        case "add_node":
          if (!permissions.canManageFamily) {
            return {
              allowed: false,
              reason: "Role does not allow adding Lightning nodes",
            };
          }
          break;

        default:
          return { allowed: false, reason: "Unknown operation" };
      }

      return { allowed: true };
    } catch (error) {
      console.error("Error validating role access:", error);
      return { allowed: false, reason: "Access validation failed" };
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Parental Control - Set offspring spending limits
   */
  async setOffspringSpendingLimit(
    parentUserId: string,
    offspringUserId: string,
    dailyLimit: number,
    maxTransactionLimit: number
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Validate parent has permission
      const parentAccess = await this.validateRoleAccess(
        parentUserId,
        "manage_family"
      );
      if (!parentAccess.allowed) {
        return {
          success: false,
          message: parentAccess.reason || "Access denied",
        };
      }

      // Verify offspring role
      const allMembers = await getFamilyMembers();
      const offspring = allMembers.find(
        (m) => m.id === offspringUserId && m.familyId === this.familyId
      );
      if (
        !offspring ||
        this.validateStandardRole(offspring.role) !== "offspring"
      ) {
        return {
          success: false,
          message: "Target user is not an offspring in this family",
        };
      }

      // Update limits in database
      const { error } = await supabase
        .from("family_members")
        .update({
          daily_limit: dailyLimit,
          max_transaction_limit: maxTransactionLimit,
          updated_at: new Date().toISOString(),
        })
        .eq("id", offspringUserId)
        .eq("family_id", this.familyId);

      if (error) throw error;

      // Log to user's local history
      await this.logPaymentToUserHistory({
        operation: "set_offspring_spending_limit",
        familyId: this.familyId,
        details: {
          parentUserId,
          offspringUserId,
          dailyLimit,
          maxTransactionLimit,
        },
        timestamp: new Date(),
      });

      return {
        success: true,
        message: `Spending limits updated for offspring: ${dailyLimit} sats daily, ${maxTransactionLimit} sats per transaction`,
      };
    } catch (error) {
      console.error("Error setting offspring spending limit:", error);
      return { success: false, message: "Failed to update spending limits" };
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Parental Control - Get offspring transaction history
   */
  async getOffspringTransactionHistory(
    parentUserId: string,
    offspringUserId: string,
    limit: number = 50
  ): Promise<{
    success: boolean;
    transactions?: ControlBoardTransaction[];
    message?: string;
  }> {
    try {
      // Validate parent has permission
      const parentAccess = await this.validateRoleAccess(
        parentUserId,
        "manage_family"
      );
      if (!parentAccess.allowed) {
        return {
          success: false,
          message: parentAccess.reason || "Access denied",
        };
      }

      // Verify offspring relationship
      const allMembers = await getFamilyMembers();
      const offspring = allMembers.find(
        (m) => m.id === offspringUserId && m.familyId === this.familyId
      );
      if (
        !offspring ||
        this.validateStandardRole(offspring.role) !== "offspring"
      ) {
        return {
          success: false,
          message: "Target user is not an offspring in this family",
        };
      }

      // Get transactions for offspring
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("family_id", this.familyId)
        .or(
          `from_address.eq.${offspring.lightningAddress},to_address.eq.${offspring.lightningAddress}`
        )
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      const transactions: ControlBoardTransaction[] =
        data?.map((tx) => ({
          id: tx.id,
          type: this.mapTransactionType(tx.type),
          amount: tx.amount,
          from: tx.from_address,
          to: tx.to_address,
          description: tx.description,
          timestamp: new Date(tx.created_at),
          status: this.mapTransactionStatus(tx.status),
          privacyEnabled: tx.privacy_enabled,
          nostrEvent: tx.nostr_event_id,
          hash: tx.payment_hash,
        })) || [];

      // Log access to user's local history
      await this.logPaymentToUserHistory({
        operation: "view_offspring_transaction_history",
        familyId: this.familyId,
        details: {
          parentUserId,
          offspringUserId,
          transactionCount: transactions.length,
        },
        timestamp: new Date(),
      });

      return { success: true, transactions };
    } catch (error) {
      console.error("Error getting offspring transaction history:", error);
      return {
        success: false,
        message: "Failed to retrieve transaction history",
      };
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Parental Control - Approve offspring transaction
   */
  async approveOffspringTransaction(
    parentUserId: string,
    transactionId: string,
    approved: boolean
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Validate parent has permission
      const parentAccess = await this.validateRoleAccess(
        parentUserId,
        "approve_transaction"
      );
      if (!parentAccess.allowed) {
        return {
          success: false,
          message: parentAccess.reason || "Access denied",
        };
      }

      // Get transaction details
      const { data: transaction, error: fetchError } = await supabase
        .from("transactions")
        .select("*")
        .eq("id", transactionId)
        .eq("family_id", this.familyId)
        .single();

      if (fetchError) throw fetchError;
      if (!transaction) {
        return { success: false, message: "Transaction not found" };
      }

      // Update transaction approval status
      const { error: updateError } = await supabase
        .from("transactions")
        .update({
          approval_status: approved ? "approved" : "rejected",
          approved_by: parentUserId,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", transactionId);

      if (updateError) throw updateError;

      // Log approval decision to user's local history
      await this.logPaymentToUserHistory({
        operation: "approve_offspring_transaction",
        familyId: this.familyId,
        details: {
          parentUserId,
          transactionId,
          approved,
          amount: transaction.amount,
          from: transaction.from_address,
          to: transaction.to_address,
        },
        timestamp: new Date(),
      });

      return {
        success: true,
        message: `Transaction ${
          approved ? "approved" : "rejected"
        } successfully`,
      };
    } catch (error) {
      console.error("Error approving offspring transaction:", error);
      return {
        success: false,
        message: "Failed to process transaction approval",
      };
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Track user's custody progression
   * Custody progression: Voltage/LNBits (custodial) → PhoenixD (internal) → Breez (custodial external) → Own Node (self-custodial)
   */
  async getUserMigrationStatus(userId: string): Promise<{
    currentProvider: string;
    custodyLevel: "custodial" | "internal" | "self-custodial";
    nextRecommendedStep: string;
    progressPercentage: number;
  }> {
    try {
      const allMembers = await getFamilyMembers();
      const user = allMembers.find(
        (m) => m.id === userId && m.familyId === this.familyId
      );

      if (!user) {
        return {
          currentProvider: "none",
          custodyLevel: "custodial",
          nextRecommendedStep:
            "Set up your first Lightning wallet with Voltage",
          progressPercentage: 0,
        };
      }

      // Get user's current Lightning nodes
      const { data: userNodes, error } = await supabase
        .from("lightning_nodes")
        .select("*")
        .eq("family_id", this.familyId)
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (!userNodes || userNodes.length === 0) {
        return {
          currentProvider: "none",
          custodyLevel: "custodial",
          nextRecommendedStep:
            "Set up your first Lightning wallet with Voltage or LNBits",
          progressPercentage: 0,
        };
      }

      const latestNode = userNodes[0];
      const provider = latestNode.provider;

      // Determine custody progression
      let custodyLevel: "custodial" | "internal" | "self-custodial";
      let nextStep: string;
      let progress: number;

      switch (provider) {
        case "voltage":
        case "lnbits":
          custodyLevel = "custodial";
          nextStep = "Upgrade to PhoenixD for internal Satnam payments";
          progress = 25;
          break;
        case "phoenixd":
          custodyLevel = "internal";
          nextStep =
            "Add Breez wallet for external payments, then consider self-custody";
          progress = 50;
          break;
        case "breez":
          custodyLevel = "custodial";
          nextStep =
            "Establish self-custody with your own Lightning node (NWC)";
          progress = 75;
          break;
        case "own":
          custodyLevel = "self-custodial";
          nextStep = "Congratulations! You've achieved Lightning self-custody";
          progress = 100;
          break;
        default:
          custodyLevel = "custodial";
          nextStep = "Continue your self-custody journey";
          progress = 25;
      }

      return {
        currentProvider: provider,
        custodyLevel,
        nextRecommendedStep: nextStep,
        progressPercentage: progress,
      };
    } catch (error) {
      console.error("Error getting user migration status:", error);
      return {
        currentProvider: "error",
        custodyLevel: "custodial",
        nextRecommendedStep: "Unable to determine migration status",
        progressPercentage: 0,
      };
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Suggest next migration step with educational guidance
   */
  async suggestNextMigrationStep(userId: string): Promise<{
    suggestion: string;
    educationalContent: string;
    actionRequired: string;
    benefits: string[];
    risks: string[];
  }> {
    try {
      const migrationStatus = await this.getUserMigrationStatus(userId);

      switch (migrationStatus.currentProvider) {
        case "none":
        case "voltage":
        case "lnbits":
          return {
            suggestion: "Upgrade to PhoenixD Internal Wallet",
            educationalContent:
              "PhoenixD provides optimized routing for family-to-family payments within the Satnam ecosystem, reducing fees and improving privacy for internal transactions.",
            actionRequired:
              "Configure PhoenixD wallet in your Lightning settings",
            benefits: [
              "Lower fees for family payments",
              "Faster settlement within Satnam ecosystem",
              "Better privacy for internal transactions",
              "Optimized for family banking operations",
            ],
            risks: [
              "Still not fully self-custodial",
              "Requires trust in Satnam infrastructure",
            ],
          };

        case "phoenixd":
          return {
            suggestion: "Add Breez Wallet for External Payments",
            educationalContent:
              "While PhoenixD handles internal Satnam payments optimally, Breez provides access to the broader Lightning Network for external payments and services.",
            actionRequired:
              "Set up Breez wallet for external Lightning payments",
            benefits: [
              "Access to full Lightning Network",
              "Ability to pay external Lightning addresses",
              "Backup payment method",
              "Broader ecosystem compatibility",
            ],
            risks: [
              "Custodial solution (temporary)",
              "External dependency",
              "Higher fees for some operations",
            ],
          };

        case "breez":
          return {
            suggestion: "Establish Self-Custody with Your Own Lightning Node",
            educationalContent:
              "The ultimate goal of Bitcoin sovereignty is running your own Lightning node. Connect your existing node via NWC (Nostr Wallet Connect) for true self-custody.",
            actionRequired:
              "Set up your own Lightning node and connect via NWC",
            benefits: [
              "True self-custody and sovereignty",
              "Full control over your Lightning channels",
              "No counterparty risk",
              "Maximum privacy and security",
              "Support the Lightning Network decentralization",
            ],
            risks: [
              "Requires technical knowledge",
              "Responsibility for node maintenance",
              "Channel management complexity",
              "Potential for user error",
            ],
          };

        case "own":
          return {
            suggestion: "Congratulations on Achieving Self-Custody!",
            educationalContent:
              "You've reached the pinnacle of Bitcoin sovereignty. Continue learning about advanced Lightning Network features and consider helping others on their self-custody journey.",
            actionRequired: "Maintain your node and continue learning",
            benefits: [
              "Complete financial sovereignty",
              "Maximum privacy and security",
              "Supporting Bitcoin decentralization",
              "Advanced Lightning Network features",
            ],
            risks: [
              "Ongoing maintenance responsibility",
              "Need to stay updated with Lightning developments",
            ],
          };

        default:
          return {
            suggestion: "Start Your Self-Custody Journey",
            educationalContent:
              "Begin with a custodial solution to learn Lightning basics, then progressively move toward self-custody.",
            actionRequired: "Choose your first Lightning wallet",
            benefits: ["Learning opportunity", "Progressive sovereignty"],
            risks: ["Initial learning curve"],
          };
      }
    } catch (error) {
      console.error("Error suggesting migration step:", error);
      return {
        suggestion: "Unable to provide migration guidance",
        educationalContent: "Please try again or contact support",
        actionRequired: "Retry migration status check",
        benefits: [],
        risks: [],
      };
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Generate detailed migration guide
   */
  async generateMigrationGuide(
    currentProvider: string,
    targetProvider: string
  ): Promise<{
    title: string;
    steps: string[];
    estimatedTime: string;
    difficulty: "beginner" | "intermediate" | "advanced";
    prerequisites: string[];
    warnings: string[];
  }> {
    const migrationPath = `${currentProvider}_to_${targetProvider}`;

    switch (migrationPath) {
      case "voltage_to_phoenixd":
      case "lnbits_to_phoenixd":
        return {
          title: "Migrate from Custodial to PhoenixD Internal Wallet",
          steps: [
            "Navigate to Lightning Settings in your Satnam dashboard",
            "Select 'Add PhoenixD Wallet' option",
            "Configure API endpoint and authentication",
            "Test connection with small transaction",
            "Gradually migrate funds from custodial wallet",
            "Update family payment preferences to use PhoenixD",
          ],
          estimatedTime: "15-30 minutes",
          difficulty: "beginner",
          prerequisites: [
            "Active Satnam family account",
            "Basic understanding of Lightning payments",
          ],
          warnings: [
            "Keep some funds in custodial wallet during transition",
            "Test thoroughly before migrating large amounts",
          ],
        };

      case "phoenixd_to_breez":
        return {
          title: "Add Breez Wallet for External Lightning Payments",
          steps: [
            "Download and install Breez wallet app",
            "Create new wallet or restore from seed",
            "Connect Breez wallet to Satnam via API",
            "Configure external payment routing",
            "Test external Lightning address payments",
            "Set spending limits and preferences",
          ],
          estimatedTime: "20-45 minutes",
          difficulty: "intermediate",
          prerequisites: [
            "Existing PhoenixD wallet setup",
            "Mobile device for Breez app",
            "Understanding of Lightning addresses",
          ],
          warnings: [
            "Breez is custodial - not for large amounts",
            "Use primarily for external payments",
            "Keep majority of funds in PhoenixD for family payments",
          ],
        };

      case "breez_to_own":
        return {
          title: "Establish Self-Custody with Your Own Lightning Node",
          steps: [
            "Set up your Lightning node (LND, CLN, or Eclair)",
            "Configure Nostr Wallet Connect (NWC) on your node",
            "Generate NWC connection string",
            "Add NWC connection in Satnam Lightning settings",
            "Test connection with small transactions",
            "Gradually migrate funds to your node",
            "Configure channel management and routing",
            "Set up monitoring and backup procedures",
          ],
          estimatedTime: "2-8 hours (depending on experience)",
          difficulty: "advanced",
          prerequisites: [
            "Technical knowledge of Lightning Network",
            "Dedicated hardware or VPS for node",
            "Understanding of channel management",
            "Bitcoin node (full or pruned)",
            "Basic command line skills",
          ],
          warnings: [
            "Significant technical responsibility",
            "Risk of fund loss if misconfigured",
            "Requires ongoing maintenance",
            "Start with small amounts",
            "Have recovery procedures in place",
          ],
        };

      default:
        return {
          title: "Migration Guide Not Available",
          steps: ["Contact support for guidance on this migration path"],
          estimatedTime: "Unknown",
          difficulty: "intermediate",
          prerequisites: [],
          warnings: ["Unsupported migration path"],
        };
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Get user's current identity configuration
   */
  async getUserIdentityConfiguration(
    userId: string
  ): Promise<IdentityConfiguration | null> {
    try {
      const allMembers = await getFamilyMembers();
      const user = allMembers.find(
        (m) => m.id === userId && m.familyId === this.familyId
      );

      if (!user) {
        return null;
      }

      // Get current Lightning address configuration
      const lightningAddress =
        user.lightningAddress || `${user.username}@satnam.pub`;
      const isDefaultLightning =
        lightningAddress === `${user.username}@satnam.pub`;

      // Get current NIP-05 configuration
      const nip05Identifier = user.nip05 || `${user.username}@satnam.pub`;
      const nip05Domain = nip05Identifier.split("@")[1] || "satnam.pub";
      const isWhitelisted = WHITELISTED_NIP05_DOMAINS.includes(
        nip05Domain as any
      );

      // Determine sovereignty level
      let sovereigntyLevel:
        | "default"
        | "intermediate"
        | "advanced"
        | "sovereign";
      if (!isDefaultLightning && user.nwcConnection) {
        sovereigntyLevel = "sovereign";
      } else if (!isDefaultLightning || !isWhitelisted) {
        sovereigntyLevel = "advanced";
      } else if (lightningAddress !== nip05Identifier) {
        sovereigntyLevel = "intermediate";
      } else {
        sovereigntyLevel = "default";
      }

      // Generate migration recommendations
      const migrationRecommendations =
        this.generateIdentityMigrationRecommendations(
          isDefaultLightning,
          isWhitelisted,
          !!user.nwcConnection
        );

      // Generate platform warnings
      const platformWarnings = this.generatePlatformWarnings(
        isWhitelisted,
        nip05Domain
      );

      return {
        userId,
        username: user.username,
        lightningAddress: {
          address: lightningAddress,
          isDefault: isDefaultLightning,
          isCustom: !isDefaultLightning,
          isSelfCustodial: !!user.nwcConnection,
          nwcConnection: user.nwcConnection,
          lastVerified: new Date(user.updated_at || user.created_at),
          status: "active",
        },
        nip05: {
          identifier: nip05Identifier,
          domain: nip05Domain,
          isWhitelisted,
          platformAccessEnabled: isWhitelisted,
          lastVerified: new Date(user.updated_at || user.created_at),
          status: "active",
        },
        sovereigntyLevel,
        migrationRecommendations,
        platformWarnings,
      };
    } catch (error) {
      console.error("Error getting user identity configuration:", error);
      return null;
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Generate identity migration recommendations
   */
  private generateIdentityMigrationRecommendations(
    isDefaultLightning: boolean,
    isWhitelistedNIP05: boolean,
    hasSelfCustody: boolean
  ): string[] {
    const recommendations: string[] = [];

    if (isDefaultLightning && isWhitelistedNIP05 && !hasSelfCustody) {
      recommendations.push(
        "Consider setting up your own Lightning node for maximum sovereignty"
      );
      recommendations.push(
        "Explore custom Lightning addresses once you have self-custody"
      );
    }

    if (!isDefaultLightning && !hasSelfCustody) {
      recommendations.push(
        "Connect your custom Lightning address to your own node via NWC"
      );
      recommendations.push(
        "Ensure your Lightning address is backed by self-custodial infrastructure"
      );
    }

    if (isWhitelistedNIP05 && hasSelfCustody) {
      recommendations.push(
        "You're on the path to sovereignty! Consider a custom domain for NIP-05"
      );
      recommendations.push(
        "Maintain platform access by keeping a whitelisted NIP-05 backup"
      );
    }

    if (!isWhitelistedNIP05) {
      recommendations.push(
        "Consider maintaining a whitelisted NIP-05 for platform access"
      );
      recommendations.push(
        "Your custom domain provides maximum privacy but limits platform features"
      );
    }

    return recommendations;
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Generate platform access warnings
   */
  private generatePlatformWarnings(
    isWhitelisted: boolean,
    domain: string
  ): string[] {
    const warnings: string[] = [];

    if (!isWhitelisted) {
      warnings.push(
        `⚠️ Using ${domain} for NIP-05 may restrict access to Satnam.pub and Citadel Academy`
      );
      warnings.push(
        "Consider maintaining a backup NIP-05 with a whitelisted domain"
      );
      warnings.push(
        "Some platform features may be unavailable with non-whitelisted domains"
      );
    }

    return warnings;
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Update user's Lightning address configuration
   */
  async updateLightningAddress(
    userId: string,
    newAddress: string,
    nwcConnection?: string
  ): Promise<{ success: boolean; message: string; warnings?: string[] }> {
    try {
      // Validate user permissions
      const roleAccess = await this.validateRoleAccess(userId, "manage_family");
      if (!roleAccess.allowed) {
        return {
          success: false,
          message: "Insufficient permissions to update Lightning address",
        };
      }

      // Validate Lightning address format
      if (!this.isValidLightningAddress(newAddress)) {
        return { success: false, message: "Invalid Lightning address format" };
      }

      // Update in database
      const { error } = await supabase
        .from("family_members")
        .update({
          lightning_address: newAddress,
          nwc_connection: nwcConnection,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .eq("family_id", this.familyId);

      if (error) throw error;

      // Log to user's local history
      await this.logPaymentToUserHistory({
        operation: "lightning_address_updated",
        familyId: this.familyId,
        details: {
          userId,
          newAddress,
          hasSelfCustody: !!nwcConnection,
        },
        timestamp: new Date(),
      });

      const warnings: string[] = [];
      const isDefault = newAddress.endsWith("@satnam.pub");

      if (!isDefault && !nwcConnection) {
        warnings.push(
          "Consider connecting this address to your own Lightning node for true self-custody"
        );
      }

      if (!isDefault) {
        warnings.push(
          "Ensure your custom Lightning address is properly configured and accessible"
        );
      }

      return {
        success: true,
        message: `Lightning address updated to ${newAddress}`,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      console.error("Error updating Lightning address:", error);
      return { success: false, message: "Failed to update Lightning address" };
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Update user's NIP-05 identifier
   */
  async updateNIP05Identifier(
    userId: string,
    newIdentifier: string
  ): Promise<{ success: boolean; message: string; warnings?: string[] }> {
    try {
      // Validate user permissions
      const roleAccess = await this.validateRoleAccess(userId, "manage_family");
      if (!roleAccess.allowed) {
        return {
          success: false,
          message: "Insufficient permissions to update NIP-05 identifier",
        };
      }

      // Validate NIP-05 format
      if (!this.isValidNIP05Identifier(newIdentifier)) {
        return { success: false, message: "Invalid NIP-05 identifier format" };
      }

      const domain = newIdentifier.split("@")[1];
      const isWhitelisted = WHITELISTED_NIP05_DOMAINS.includes(domain as any);

      // Update in database
      const { error } = await supabase
        .from("family_members")
        .update({
          nip05: newIdentifier,
          platform_access_enabled: isWhitelisted,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .eq("family_id", this.familyId);

      if (error) throw error;

      // Log to user's local history
      await this.logPaymentToUserHistory({
        operation: "nip05_updated",
        familyId: this.familyId,
        details: {
          userId,
          newIdentifier,
          domain,
          isWhitelisted,
          platformAccessEnabled: isWhitelisted,
        },
        timestamp: new Date(),
      });

      const warnings: string[] = [];

      if (!isWhitelisted) {
        warnings.push(
          `⚠️ Domain ${domain} is not whitelisted - platform access may be restricted`
        );
        warnings.push(
          "Consider maintaining a backup NIP-05 with satnam.pub for full platform access"
        );
        warnings.push(
          "Some Satnam.pub and Citadel Academy features may be unavailable"
        );
      }

      return {
        success: true,
        message: `NIP-05 identifier updated to ${newIdentifier}`,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      console.error("Error updating NIP-05 identifier:", error);
      return { success: false, message: "Failed to update NIP-05 identifier" };
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Validate Lightning address format
   */
  private isValidLightningAddress(address: string): boolean {
    // Basic Lightning address validation: user@domain.tld
    const lightningAddressRegex =
      /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return lightningAddressRegex.test(address);
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Validate NIP-05 identifier format
   */
  private isValidNIP05Identifier(identifier: string): boolean {
    // NIP-05 validation: name@domain.tld (similar to Lightning address)
    const nip05Regex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return nip05Regex.test(identifier);
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Get sovereignty progression guidance
   */
  async getSovereigntyProgressionGuide(userId: string): Promise<{
    currentLevel: string;
    nextSteps: string[];
    educationalContent: string;
    benefits: string[];
    risks: string[];
  }> {
    try {
      const identityConfig = await this.getUserIdentityConfiguration(userId);

      if (!identityConfig) {
        return {
          currentLevel: "unknown",
          nextSteps: ["Set up your Satnam account first"],
          educationalContent: "Unable to determine current configuration",
          benefits: [],
          risks: [],
        };
      }

      switch (identityConfig.sovereigntyLevel) {
        case "default":
          return {
            currentLevel: "Default Configuration",
            nextSteps: [
              "Learn about Lightning Network self-custody",
              "Consider setting up your own Lightning node",
              "Explore custom Lightning addresses for advanced privacy",
            ],
            educationalContent:
              "You're using the default Satnam configuration with username@satnam.pub for both Lightning and NIP-05. This provides excellent security and platform integration while you learn about Bitcoin sovereignty.",
            benefits: [
              "Full platform access and features",
              "Simplified onboarding experience",
              "Integrated with all Satnam services",
              "Professional Lightning address",
            ],
            risks: [
              "Custodial Lightning infrastructure",
              "Dependent on Satnam services",
              "Limited privacy customization",
            ],
          };

        case "intermediate":
          return {
            currentLevel: "Intermediate Sovereignty",
            nextSteps: [
              "Set up your own Lightning node",
              "Connect custom Lightning address to self-custodial infrastructure",
              "Consider requesting custom NIP-05 domain approval (paid feature)",
            ],
            educationalContent:
              "You've begun customizing your identity configuration. This shows growing understanding of Bitcoin sovereignty principles. Note: Custom NIP-05 domains require Satnam Admin approval and payment.",
            benefits: [
              "Increased privacy and customization",
              "Learning advanced Bitcoin concepts",
              "Maintaining platform compatibility with approved domains",
              "Progressive sovereignty journey",
            ],
            risks: [
              "Configuration complexity increases",
              "Need to manage multiple identifiers",
              "Custom domains may restrict platform access",
              "Potential for misconfiguration",
            ],
          };

        case "advanced":
          return {
            currentLevel: "Advanced Configuration",
            nextSteps: [
              "Complete self-custody setup with NWC",
              "Verify all custom configurations are working",
              "Ensure custom domains have admin approval for platform access",
              "Consider helping others on their sovereignty journey",
            ],
            educationalContent:
              "You're using advanced identity configurations with custom addresses or domains. This demonstrates strong understanding of Bitcoin sovereignty. Remember: Custom NIP-05 domains require admin approval for full platform access.",
            benefits: [
              "High level of privacy and control",
              "Custom branding and identity",
              "Advanced Bitcoin knowledge",
              "Reduced platform dependencies",
            ],
            risks: [
              "Platform access limitations with non-approved domains",
              "Higher technical responsibility",
              "Need for ongoing maintenance",
              "Risk of losing access if misconfigured",
              "Custom domains require payment and admin approval",
            ],
          };

        case "sovereign":
          return {
            currentLevel: "Bitcoin Sovereignty Achieved",
            nextSteps: [
              "Maintain and monitor your self-custodial setup",
              "Stay updated with Lightning Network developments",
              "Help others achieve sovereignty",
              "Explore advanced Lightning features",
              "Ensure custom domains maintain admin approval for platform access",
            ],
            educationalContent:
              "Congratulations! You've achieved true Bitcoin sovereignty with self-custodial Lightning infrastructure and custom identity configuration. If using custom NIP-05 domains, ensure they have proper admin approval for continued platform access.",
            benefits: [
              "Complete financial sovereignty",
              "Maximum privacy and security",
              "Full control over your Bitcoin stack",
              "Supporting Bitcoin decentralization",
              "Advanced Lightning Network features",
              "Custom identity with approved domains",
            ],
            risks: [
              "Full responsibility for security",
              "Need for ongoing technical maintenance",
              "Potential for user error",
              "Limited platform integration with non-approved domains",
              "Custom domains require ongoing admin approval",
            ],
          };

        default:
          return {
            currentLevel: "Unknown",
            nextSteps: ["Review your current configuration"],
            educationalContent: "Unable to determine sovereignty level",
            benefits: [],
            risks: [],
          };
      }
    } catch (error) {
      console.error("Error getting sovereignty progression guide:", error);
      return {
        currentLevel: "error",
        nextSteps: ["Try again or contact support"],
        educationalContent: "Error retrieving progression guide",
        benefits: [],
        risks: [],
      };
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Reset to default configuration
   */
  async resetToDefaultConfiguration(
    userId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Validate user permissions
      const roleAccess = await this.validateRoleAccess(userId, "manage_family");
      if (!roleAccess.allowed) {
        return {
          success: false,
          message: "Insufficient permissions to reset configuration",
        };
      }

      const allMembers = await getFamilyMembers();
      const user = allMembers.find(
        (m) => m.id === userId && m.familyId === this.familyId
      );

      if (!user) {
        return { success: false, message: "User not found" };
      }

      const defaultAddress = `${user.username}@satnam.pub`;

      // Reset to default configuration
      const { error } = await supabase
        .from("family_members")
        .update({
          lightning_address: defaultAddress,
          nip05: defaultAddress,
          nwc_connection: null,
          platform_access_enabled: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .eq("family_id", this.familyId);

      if (error) throw error;

      // Log to user's local history
      await this.logPaymentToUserHistory({
        operation: "reset_to_default_configuration",
        familyId: this.familyId,
        details: {
          userId,
          defaultAddress,
        },
        timestamp: new Date(),
      });

      return {
        success: true,
        message: `Configuration reset to default: ${defaultAddress}`,
      };
    } catch (error) {
      console.error("Error resetting to default configuration:", error);
      return { success: false, message: "Failed to reset configuration" };
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Get whitelisted NIP-05 domains for platform access
   */
  getWhitelistedNIP05Domains(): readonly string[] {
    return WHITELISTED_NIP05_DOMAINS;
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Check if domain is whitelisted for platform access
   */
  isDomainWhitelisted(domain: string): boolean {
    return WHITELISTED_NIP05_DOMAINS.includes(domain as any);
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Get domain recommendations for sovereignty progression
   * CRITICAL: Only approved domains shown, custom domains require admin approval
   */
  getDomainRecommendations(currentSovereigntyLevel: string): {
    approved: string[];
    customDomainInfo: string[];
    adminApprovalRequired: string[];
  } {
    return {
      approved: [
        "satnam.pub - Full platform integration and features",
        "citadel.academy - Educational platform access",
      ],
      customDomainInfo: [
        "Custom domains require Satnam Admin approval",
        "This will be a paid feature for verified users",
        "Contact admin@satnam.pub for custom domain requests",
      ],
      adminApprovalRequired: [
        "Your own domain - Requires admin approval and payment",
        "Custom domain - Must be verified by Satnam Admin",
        "Self-hosted domain - Premium feature with admin review",
      ],
    };
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Check if user has admin privileges
   */
  private async isUserAdmin(userId: string): Promise<boolean> {
    try {
      const allMembers = await getFamilyMembers();
      const user = allMembers.find((m) => m.id === userId);

      if (!user) return false;

      // Check if user has admin role or is Satnam staff
      return (
        user.role === "admin" || user.email?.endsWith("@satnam.pub") || false
      );
    } catch (error) {
      console.error("Error checking admin status:", error);
      return false;
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Admin-only method to add domain to whitelist
   * PAID FEATURE: This will require payment verification in production
   */
  async addDomainToWhitelist(
    adminUserId: string,
    domain: string,
    requestingUserId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Validate admin permissions
      const isAdmin = await this.isUserAdmin(adminUserId);
      if (!isAdmin) {
        return {
          success: false,
          message: "Only Satnam Admins can add domains to the whitelist",
        };
      }

      // Validate domain format
      const domainValidation = await this.validateDomainForNIP05(domain);
      if (!domainValidation.isValid) {
        return {
          success: false,
          message: "Invalid domain format",
        };
      }

      // TODO: Implement payment verification for custom domains
      // This will be a paid feature requiring payment processing

      // For now, log the request for manual processing
      await this.logPaymentToUserHistory({
        operation: "admin_domain_whitelist_request",
        familyId: this.familyId,
        details: {
          adminUserId,
          requestingUserId,
          domain,
          status: "pending_payment_verification",
        },
        timestamp: new Date(),
      });

      return {
        success: false,
        message:
          "Domain whitelist requests are currently processed manually. This will be a paid feature. Contact admin@satnam.pub for processing.",
      };
    } catch (error) {
      console.error("Error adding domain to whitelist:", error);
      return {
        success: false,
        message: "Failed to process domain whitelist request",
      };
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Request custom domain approval (user-facing)
   */
  async requestCustomDomainApproval(
    userId: string,
    domain: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Validate user permissions
      const roleAccess = await this.validateRoleAccess(userId, "manage_family");
      if (!roleAccess.allowed) {
        return {
          success: false,
          message: "Insufficient permissions to request custom domain",
        };
      }

      // Validate domain format
      const domainValidation = await this.validateDomainForNIP05(domain);
      if (!domainValidation.isValid) {
        return {
          success: false,
          message: "Invalid domain format",
        };
      }

      // Check if domain is already whitelisted
      if (this.isDomainWhitelisted(domain)) {
        return {
          success: false,
          message: "Domain is already approved for platform access",
        };
      }

      // Log the request for admin review
      await this.logPaymentToUserHistory({
        operation: "custom_domain_approval_request",
        familyId: this.familyId,
        details: {
          userId,
          domain,
          status: "pending_admin_review",
          requestedAt: new Date().toISOString(),
        },
        timestamp: new Date(),
      });

      return {
        success: true,
        message: `Custom domain request submitted for ${domain}. This is a paid feature. You will be contacted by Satnam Admin for payment and verification. Contact admin@satnam.pub for status updates.`,
      };
    } catch (error) {
      console.error("Error requesting custom domain approval:", error);
      return {
        success: false,
        message: "Failed to submit custom domain request",
      };
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Validate domain for NIP-05 usage
   */
  async validateDomainForNIP05(domain: string): Promise<{
    isValid: boolean;
    isWhitelisted: boolean;
    platformAccess: boolean;
    recommendations: string[];
    warnings: string[];
  }> {
    const isWhitelisted = this.isDomainWhitelisted(domain);
    const recommendations: string[] = [];
    const warnings: string[] = [];

    // Basic domain validation
    const domainRegex = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const isValid = domainRegex.test(domain);

    if (!isValid) {
      warnings.push("Invalid domain format");
      return {
        isValid: false,
        isWhitelisted: false,
        platformAccess: false,
        recommendations: ["Use a valid domain format (e.g., example.com)"],
        warnings,
      };
    }

    if (!isWhitelisted) {
      warnings.push(`${domain} is not whitelisted for platform access`);
      warnings.push(
        "Only satnam.pub and citadel.academy are approved for platform access"
      );
      warnings.push("Custom domains require Satnam Admin approval and payment");
      recommendations.push(
        "Use satnam.pub or citadel.academy for full platform access"
      );
      recommendations.push(
        "Contact admin@satnam.pub to request custom domain approval (paid feature)"
      );
      recommendations.push(
        "Consider using requestCustomDomainApproval() method for formal request"
      );
    } else {
      recommendations.push(
        `${domain} provides full platform access and features`
      );
      recommendations.push(
        "This domain is approved and requires no additional verification"
      );
    }

    return {
      isValid,
      isWhitelisted,
      platformAccess: isWhitelisted,
      recommendations,
      warnings,
    };
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Get custom domain approval process information
   */
  getCustomDomainApprovalInfo(): {
    approvedDomains: string[];
    approvalProcess: string[];
    paidFeatureInfo: string[];
    contactInfo: string[];
  } {
    return {
      approvedDomains: [
        "satnam.pub - Default domain with full platform access",
        "citadel.academy - Educational platform with full access",
      ],
      approvalProcess: [
        "1. Submit request using requestCustomDomainApproval() method",
        "2. Satnam Admin reviews domain for compliance and security",
        "3. Payment processing for custom domain feature",
        "4. Domain verification and NIP-05 setup assistance",
        "5. Domain added to whitelist upon successful completion",
      ],
      paidFeatureInfo: [
        "Custom NIP-05 domains are a premium paid feature",
        "Pricing varies based on domain verification complexity",
        "Payment required before domain approval process begins",
        "Ongoing annual fee may apply for domain maintenance",
      ],
      contactInfo: [
        "Email: admin@satnam.pub for custom domain requests",
        "Include: Desired domain, use case, and user account details",
        "Response time: 1-3 business days for initial review",
        "Payment instructions will be provided after approval",
      ],
    };
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Check user's custom domain request status
   */
  async getCustomDomainRequestStatus(userId: string): Promise<{
    hasActiveRequests: boolean;
    requests: Array<{
      domain: string;
      status: string;
      requestedAt: string;
      message: string;
    }>;
  }> {
    try {
      // Get user's payment history to find domain requests
      const paymentHistory = await this.getUserPaymentHistory(100);

      const domainRequests = paymentHistory
        .filter((entry) => entry.operation === "custom_domain_approval_request")
        .map((entry) => ({
          domain: entry.details.domain,
          status: entry.details.status || "pending_admin_review",
          requestedAt: entry.details.requestedAt || entry.timestamp,
          message: this.getDomainRequestStatusMessage(
            entry.details.status || "pending_admin_review"
          ),
        }));

      return {
        hasActiveRequests: domainRequests.length > 0,
        requests: domainRequests,
      };
    } catch (error) {
      console.error("Error getting custom domain request status:", error);
      return {
        hasActiveRequests: false,
        requests: [],
      };
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Get status message for domain request
   */
  private getDomainRequestStatusMessage(status: string): string {
    switch (status) {
      case "pending_admin_review":
        return "Request submitted and awaiting admin review. You will be contacted within 1-3 business days.";
      case "approved_pending_payment":
        return "Domain approved! Payment instructions have been sent. Complete payment to proceed.";
      case "payment_received":
        return "Payment received. Domain verification in progress.";
      case "completed":
        return "Domain successfully added to whitelist and ready for use.";
      case "rejected":
        return "Domain request rejected. Contact admin@satnam.pub for details.";
      default:
        return "Status unknown. Contact admin@satnam.pub for updates.";
    }
  }
}

export default ControlBoardService;
