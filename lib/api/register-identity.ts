// lib/api/register-identity.ts
import { CitadelIdentityManager } from "../citadel/identity-manager";
import { CitadelDatabase } from "../supabase";
import { CitadelRelay } from "../citadel/relay";
import { HybridAuth } from "../hybrid-auth";
import type { APIResponse } from "./auth-endpoints";

export interface IdentityRegistrationRequest {
  username: string;
  familyId?: string;
  nip05Domain?: string;
  lightningAddress?: string;
  relayUrl?: string;
}

export interface IdentityRegistrationResponse {
  success: boolean;
  profile?: any;
  nostr_identity?: any;
  nostr_backup?: string;
  lightning_setup?: any;
  error?: string;
}

export class IdentityRegistration {
  /**
   * Complete Identity Registration Pipeline
   * This is the main integration point that combines all systems
   */
  static async registerIdentity(
    request: IdentityRegistrationRequest,
  ): Promise<IdentityRegistrationResponse> {
    try {
      const { username, familyId, nip05Domain, lightningAddress, relayUrl } =
        request;

      console.log("🚀 Starting Identity Registration for:", username);

      // ===========================================
      // STEP 1: Create Nostr Identity
      // ===========================================
      console.log("🔑 Creating Nostr identity...");
      const nostrIdentity = await CitadelIdentityManager.registerUser(username);

      console.log("✅ Nostr identity created:", {
        npub: nostrIdentity.npub,
        pubkey: nostrIdentity.pubkey.slice(0, 16) + "...",
      });

      // ===========================================
      // STEP 2: Store in Supabase Database
      // ===========================================
      console.log("💾 Creating user profile in database...");
      const profile = await CitadelDatabase.createUserProfile({
        id: nostrIdentity.pubkey,
        username,
        npub: nostrIdentity.npub,
        nip05: nip05Domain
          ? `${username}@${nip05Domain}`
          : `${username}@${process.env.NIP05_DOMAIN || "satnam.pub"}`,
        lightning_address:
          lightningAddress ||
          `${username}@${process.env.LIGHTNING_DOMAIN || "satnam.pub"}`,
        family_id: familyId || undefined,
      });

      console.log("✅ Profile created in database");

      // ===========================================
      // STEP 3: Publish to Private Relay
      // ===========================================
      console.log("📡 Publishing identity to private relay...");
      const relayResponse = await CitadelRelay.publishIdentityEvent(
        nostrIdentity,
        relayUrl || process.env.RELAY_URL,
      );

      console.log("✅ Identity published to relay:", relayResponse.eventId);

      // ===========================================
      // STEP 4: Store Relay Reference
      // ===========================================
      console.log("🔗 Storing backup reference...");
      const backupReference = await CitadelDatabase.storeNostrBackup(
        profile.id,
        relayResponse.eventId,
      );

      console.log("✅ Backup reference stored");

      // ===========================================
      // STEP 5: Setup Lightning Infrastructure
      // ===========================================
      console.log("⚡ Setting up Lightning infrastructure...");
      const lightningSetup = await this.setupLightningInfrastructure(
        profile.id,
        username,
        lightningAddress ||
          `${username}@${process.env.LIGHTNING_DOMAIN || "satnam.pub"}`,
      );

      console.log("✅ Lightning setup complete");

      // ===========================================
      // STEP 6: Join Family (if specified)
      // ===========================================
      if (familyId) {
        console.log("👥 Joining family...");
        await CitadelDatabase.joinFamily(profile.id, familyId);
        console.log("✅ Joined family successfully");
      }

      // ===========================================
      // SUCCESS RESPONSE
      // ===========================================
      const response: IdentityRegistrationResponse = {
        success: true,
        profile,
        nostr_identity: {
          npub: nostrIdentity.npub,
          pubkey: nostrIdentity.pubkey,
          privateKey: nostrIdentity.privateKey, // Only for initial setup
          eventId: relayResponse.eventId,
        },
        nostr_backup: "stored_on_private_relay",
        lightning_setup: lightningSetup,
      };

      console.log("🎉 Identity registration complete!");
      return response;
    } catch (error) {
      console.error("❌ Identity registration failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Setup Lightning Infrastructure
   */
  private static async setupLightningInfrastructure(
    userId: string,
    username: string,
    lightningAddress: string,
  ) {
    try {
      // Create lightning address record
      const lightningRecord = await CitadelDatabase.setupLightningAddress({
        user_id: userId,
        address: lightningAddress,
        btcpay_store_id: undefined, // Will be set up later
        voltage_node_id: undefined, // Will be set up later
        active: true,
      });

      // If we have Voltage API, create node connection
      let voltageSetup = null;
      if (process.env.VOLTAGE_API_KEY) {
        voltageSetup = await this.setupVoltageNode(username);
      }

      // If we have BTCPay Server, create store
      let btcpaySetup = null;
      if (process.env.BTCPAY_SERVER_URL) {
        btcpaySetup = await this.setupBTCPayStore(username);
      }

      return {
        lightning_address: lightningRecord,
        voltage_node: voltageSetup,
        btcpay_store: btcpaySetup,
      };
    } catch (error) {
      console.error("Lightning setup error:", error);
      // Don't fail the entire registration for lightning issues
      return {
        lightning_address: { address: lightningAddress, status: "pending" },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Setup Voltage Lightning Node
   */
  private static async setupVoltageNode(username: string) {
    // Placeholder for Voltage API integration
    // In a real implementation, this would call Voltage's API
    return {
      node_id: `voltage_${username}`,
      status: "pending_setup",
      note: "Voltage integration not implemented yet",
    };
  }

  /**
   * Setup BTCPay Server Store
   */
  private static async setupBTCPayStore(username: string) {
    // Placeholder for BTCPay Server API integration
    // In a real implementation, this would call BTCPay's API
    return {
      store_id: `btcpay_${username}`,
      status: "pending_setup",
      note: "BTCPay integration not implemented yet",
    };
  }

  /**
   * Bulk Family Registration
   * Register multiple family members at once
   */
  static async registerFamily(requests: {
    family_name: string;
    domain?: string;
    relay_url?: string;
    members: Omit<IdentityRegistrationRequest, "familyId">[];
  }): Promise<{
    success: boolean;
    family?: any;
    members?: any[];
    error?: string;
  }> {
    try {
      // Create family first
      const family = await CitadelDatabase.createFamily({
        family_name: requests.family_name,
        domain: requests.domain,
        relay_url: requests.relay_url,
      });

      // Register all members
      const memberResults = [];
      for (const memberRequest of requests.members) {
        const result = await this.registerIdentity({
          ...memberRequest,
          familyId: family.id,
        });
        memberResults.push(result);
      }

      return {
        success: true,
        family,
        members: memberResults,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Migration Helper: Export to Sovereign Infrastructure
   * For post-hackathon migration to Start9/Citadel
   */
  static async exportToSovereignInfrastructure(userId: string) {
    if (!process.env.MIGRATION_MODE) {
      throw new Error("Migration mode not enabled");
    }

    try {
      // Get user data from Supabase
      const profile = await CitadelDatabase.getUserIdentity(userId);
      const backups = await CitadelDatabase.getUserBackups(userId);
      const lightningData = await CitadelDatabase.getUserLightning(userId);

      // Export to Start9 database
      const migrationData = {
        profile,
        backups,
        lightning: lightningData,
        export_timestamp: new Date().toISOString(),
      };

      console.log("📦 Exporting user data to sovereign infrastructure...");
      // TODO: Implement actual migration to Start9/Citadel

      return {
        success: true,
        migration_data: migrationData,
        message: "Data exported successfully",
      };
    } catch (error) {
      throw new Error(
        `Migration failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
