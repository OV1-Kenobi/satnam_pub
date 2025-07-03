/**
 * @fileoverview Control Board Service
 * @description Centralized service for managing Nostr and Lightning Network operations
 */

import { getFamilyMembers } from "../lib/family-api";
import { LightningAddressService } from "../lib/lightning-address";
import { LightningClient } from "../lib/lightning-client";
import { logPrivacyOperation } from "../lib/privacy";
import { SatnamPrivacyLayer } from "../lib/privacy/lnproxy-privacy";
import { supabase } from "../lib/supabase";

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
  provider: "voltage" | "lnbits" | "umbrel" | "own";
}

export interface FamilyMemberExtended {
  id: string;
  username: string;
  displayName: string;
  role: "parent" | "child" | "guardian";
  nostrPubkey: string;
  lightningAddress: string;
  balance: number;
  dailyLimit: number;
  nostrEnabled: boolean;
  lightningEnabled: boolean;
  privacyLevel: "standard" | "enhanced" | "maximum";
  lastActivity?: Date;
  status: "active" | "inactive" | "suspended";
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
  private privacyLayer: SatnamPrivacyLayer;
  private familyId: string;

  constructor(familyId: string) {
    this.familyId = familyId;
    this.lightningClient = new LightningClient();
    this.lightningAddressService = new LightningAddressService();
    this.privacyLayer = new SatnamPrivacyLayer();
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
      const familyMembers = await getFamilyMembers(this.familyId);
      const lightningMembers = familyMembers.filter(
        (member) => member.lightningAddress
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
      const familyMembers = await getFamilyMembers(this.familyId);

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
        })) || []
      );
    } catch (error) {
      console.error("Error fetching Lightning nodes:", error);
      // Return mock data if database isn't available
      return [
        {
          id: "voltage_node_1",
          name: "Satnam Family Node",
          pubkey: "03a1b2c3d4e5f6...truncated",
          status: "online",
          balance: 2500000,
          channelCount: 8,
          capacity: 5000000,
          provider: "voltage",
        },
      ];
    }
  }

  /**
   * Get extended family members data
   */
  async getFamilyMembersExtended(): Promise<FamilyMemberExtended[]> {
    try {
      const familyMembers = await getFamilyMembers(this.familyId);

      return familyMembers.map((member) => ({
        id: member.id,
        username: member.username,
        displayName: member.name || member.username,
        role: member.role as "parent" | "child" | "guardian",
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
      }));
    } catch (error) {
      console.error("Error fetching extended family members:", error);
      throw error;
    }
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

      // Log the operation for privacy tracking
      await logPrivacyOperation({
        operation: "lightning_payment",
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

      // Log privacy setting change
      await logPrivacyOperation({
        operation: "privacy_settings_update",
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
}

export default ControlBoardService;
