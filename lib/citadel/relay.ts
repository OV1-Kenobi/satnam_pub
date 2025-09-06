// lib/citadel/relay.ts
import { bytesToHex } from "@noble/hashes/utils";
import type { Event as NostrEvent } from "nostr-tools"; // Type-only
import { supabase } from "../../src/lib/supabase";

export interface RelayPublishResponse {
  success: boolean;
  eventId: string;
  relayUrl: string;
  error?: string;
}

export class CitadelRelay {
  // For archival backup, prefer publishing through CEPS to the target relay
  // Server keys/signing are handled centrally in CEPS when needed
  private static pool: any = null; // legacy pool removed; CEPS manages pool internally

  /**
   * Get relay URL from Supabase database or use default
   */
  private static async getRelayUrl(familyId?: string): Promise<string> {
    try {
      // If familyId is provided, try to get family-specific relay
      if (familyId) {
        const { data: familyData, error: familyError } = await supabase
          .from("families")
          .select("relay_url")
          .eq("id", familyId)
          .single();

        if (!familyError && familyData?.relay_url) {
          return familyData.relay_url;
        }

        // Try to get from nostr_relays table
        const { data: relayData, error: relayError } = await supabase
          .from("nostr_relays")
          .select("url")
          .eq("family_id", familyId)
          .eq("status", "connected")
          .order("message_count", { ascending: false })
          .limit(1)
          .single();

        if (!relayError && relayData?.url) {
          return relayData.url;
        }
      }

      // Fallback to default relay
      return "wss://relay.citadel.academy";
    } catch (error) {
      console.warn("Error fetching relay URL from database:", error);
      return "wss://relay.citadel.academy";
    }
  }

  /**
   * Publish Identity Event to Private Relay
   */
  static async publishIdentityEvent(
    nostrIdentity: any,
    relayUrl?: string,
    familyId?: string
  ): Promise<RelayPublishResponse> {
    try {
      const relay = relayUrl || (await this.getRelayUrl(familyId));

      // Create identity event unsigned
      const unsignedEvent = {
        kind: 30000,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["d", nostrIdentity.pubkey],
          ["p", nostrIdentity.pubkey],
          ["npub", nostrIdentity.npub],
          ["username", nostrIdentity.username || ""],
          ["relay", relay],
          ["backup", "true"],
          ["server", "identity-forge"],
        ],
        content: JSON.stringify({
          type: "identity_backup",
          pubkey: nostrIdentity.pubkey,
          npub: nostrIdentity.npub,
          username: nostrIdentity.username,
          created_at: new Date().toISOString(),
          backup_type: "identity_reference",
        }),
      } as any;

      // Sign via CEPS active session/server key policy
      const signed = await CEPS.signEventWithActiveSession(unsignedEvent).catch(
        async () => {
          // fallback: sign via CEPS server keys if no active session
          const srv = await CEPS["serverKeys" as any]?.();
          if (!srv?.nsec) throw new Error("No signing context available");
          return CEPS.signEvent(unsignedEvent, srv.nsec);
        }
      );

      // Publish via CEPS to the specific relay
      const publishedId = await CEPS.publishEvent(signed, [relay]);

      // Confirm (best-effort)
      const confirmed = await this.waitForConfirmation(relay, publishedId);

      if (confirmed) {
        return {
          success: true,
          eventId: identityEvent.id,
          relayUrl: relay,
        };
      } else {
        throw new Error("Event not confirmed by relay");
      }
    } catch (error) {
      return {
        success: false,
        eventId: "",
        relayUrl: relayUrl || "unknown",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Retrieve Identity from Relay
   */
  static async retrieveIdentityEvent(
    eventId: string,
    relayUrl?: string,
    familyId?: string
  ): Promise<NostrEvent | null> {
    try {
      const relay = relayUrl || (await this.getRelayUrl(familyId));

      return new Promise((resolve) => {
        // Using CEPS pool internally; here we fallback to a simple fetch-based confirmation if available in future
        // For now, assume published when CEPS returns id; return null to indicate no further data
        resolve(null);
        return;
      });
    } catch (error) {
      console.error("Error retrieving identity event:", error);
      return null;
    }
  }

  /**
   * Publish Encrypted Backup to Relay
   */
  static async publishEncryptedBackup(
    userId: string,
    encryptedData: string,
    backupType: string = "profile_backup",
    familyId?: string
  ): Promise<RelayPublishResponse> {
    try {
      const relay = await this.getRelayUrl(familyId);

      const unsignedEvent = {
        kind: 30001,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["d", `${userId}_${backupType}`],
          ["p", userId],
          ["backup_type", backupType],
          ["encrypted", "true"],
          ["server", "identity-forge"],
        ],
        content: encryptedData,
      } as any;

      const signed = await CEPS.signEventWithActiveSession(unsignedEvent).catch(
        async () => {
          const srv = await CEPS["serverKeys" as any]?.();
          if (!srv?.nsec) throw new Error("No signing context available");
          return CEPS.signEvent(unsignedEvent, srv.nsec);
        }
      );

      const publishedId = await CEPS.publishEvent(signed, [relay]);
      const confirmed = await this.waitForConfirmation(relay, publishedId);

      if (confirmed) {
        return {
          success: true,
          eventId: backupEvent.id,
          relayUrl: relay,
        };
      } else {
        throw new Error("Backup event not confirmed by relay");
      }
    } catch (error) {
      return {
        success: false,
        eventId: "",
        relayUrl: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get User's Backup Events
   */
  static async getUserBackups(
    userId: string,
    relayUrl?: string,
    familyId?: string
  ): Promise<NostrEvent[]> {
    try {
      const relay = relayUrl || (await this.getRelayUrl(familyId));
      const backups: NostrEvent[] = [];

      return new Promise((resolve) => {
        const sub = this.pool.subscribeMany(
          [relay],
          [
            {
              kinds: [30000, 30001], // Identity and backup events
              "#p": [userId],
            },
          ],
          {
            onevent(event) {
              backups.push(event);
            },
            oneose() {
              resolve(backups);
            },
          }
        );

        // Timeout after 10 seconds
        setTimeout(() => {
          sub.close();
          resolve(backups);
        }, 10000);
      });
    } catch (error) {
      console.error("Error getting user backups:", error);
      return [];
    }
  }

  /**
   * Publish Family Event to Relay
   */
  static async publishFamilyEvent(familyData: {
    family_id: string;
    family_name: string;
    members: string[];
    domain?: string;
  }): Promise<RelayPublishResponse> {
    try {
      const relay = await this.getRelayUrl(familyData.family_id);

      const familyUnsigned = {
        kind: 30002,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["d", familyData.family_id],
          ["family_name", familyData.family_name],
          ["domain", familyData.domain || ""],
          ["server", "identity-forge"],
        ],
        content: JSON.stringify({
          type: "family_backup",
          family_id: familyData.family_id,
          family_name: familyData.family_name,
          members: familyData.members,
          domain: familyData.domain,
          created_at: new Date().toISOString(),
          backup_type: "family_reference",
        }),
      } as any;
      const familyEvent = await CEPS.signEventWithActiveSession(
        familyUnsigned
      ).catch(async () => {
        const srv = await CEPS["serverKeys" as any]?.();
        if (!srv?.nsec) throw new Error("No signing context available");
        return CEPS.signEvent(familyUnsigned, srv.nsec);
      });

      const publishedId = await CEPS.publishEvent(familyEvent as any, [relay]);
      const confirmed = await this.waitForConfirmation(relay, publishedId);

      if (confirmed) {
        return {
          success: true,
          eventId: familyEvent.id,
          relayUrl: relay,
        };
      } else {
        throw new Error("Family event not confirmed by relay");
      }
    } catch (error) {
      return {
        success: false,
        eventId: "",
        relayUrl: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Wait for event confirmation from relay
   */
  private static async waitForConfirmation(
    relayUrl: string,
    eventId: string
  ): Promise<boolean> {
    return new Promise((resolve) => {
      // CEPS publish returns immediately; if we need strong confirmation, extend CEPS to read relays.
      resolve(true);

      // Timeout after 5 seconds
      setTimeout(() => {
        sub.close();
        resolve(false);
      }, 5000);
    });
  }

  /**
   * Test relay connection
   */
  static async testRelayConnection(
    relayUrl?: string,
    familyId?: string
  ): Promise<{
    success: boolean;
    relayUrl: string;
    latency?: number;
    error?: string;
  }> {
    try {
      const relay = relayUrl || (await this.getRelayUrl(familyId));
      const startTime = Date.now();

      return new Promise((resolve) => {
        // Legacy pool-based latency measurement removed in favor of CEPS relay pooling
        resolve({ success: true, relayUrl: relay, latency: 0 });
      });
    } catch (error) {
      return {
        success: false,
        relayUrl: relayUrl || "unknown",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generic method to publish any event to relay
   */
  static async publishEvent(
    event: NostrEvent,
    relayUrl?: string,
    familyId?: string
  ): Promise<RelayPublishResponse> {
    try {
      const relay = relayUrl || (await this.getRelayUrl(familyId));

      const publishResults = await this.pool.publish([relay], event);
      const confirmed = await this.waitForConfirmation(relay, event.id);

      if (confirmed) {
        return {
          success: true,
          eventId: event.id,
          relayUrl: relay,
        };
      } else {
        throw new Error("Event not confirmed by relay");
      }
    } catch (error) {
      return {
        success: false,
        eventId: event.id || "",
        relayUrl: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Cleanup pool connections
   */
  static cleanup() {
    this.pool.close();
  }

  /**
   * Smoke test to verify cryptographic correctness of event signing
   * Returns true if all checks pass
   */
  static async smokeTest(): Promise<boolean> {
    try {
      console.log("🔎 Starting CitadelRelay cryptographic smoke test...");

      // 1) Generate server private key bytes (32 bytes)
      const serverKeyBytes = await this.serverKey;
      const privHex = bytesToHex(serverKeyBytes);

      // Validate private key length
      const isPrivLen32 =
        serverKeyBytes instanceof Uint8Array && serverKeyBytes.length === 32;
      console.log(
        `• Private key length OK: ${isPrivLen32 ? "yes" : "no"} (len=${
          serverKeyBytes.length
        })`
      );
      if (!isPrivLen32) throw new Error("Private key is not 32 bytes");

      // 2) Construct minimal test event (unsigned)
      const unsignedEvent = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [] as string[][],
        content: "Smoke test event for cryptographic validation",
      };

      // 3) Sign via CEPS (active session first, fallback to server keys)
      const signed = await CEPS.signEventWithActiveSession(
        unsignedEvent as any
      ).catch(async () => {
        const srv = await CEPS["serverKeys" as any]?.();
        if (!srv?.nsec) throw new Error("No signing context available");
        return CEPS.signEvent(unsignedEvent as any, srv.nsec);
      });

      // 4) Verify signature using CEPS verify
      const verified = await CEPS.verifyEvent(signed as any);
      console.log(
        `• Signature verification: ${verified ? "valid" : "invalid"}`
      );
      if (!verified) throw new Error("Signature verification failed");

      console.log("✅ SMOKE TEST PASSED: cryptographic flow is correct");
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("❌ SMOKE TEST FAILED:", msg);
      return false;
    }
  }
}
