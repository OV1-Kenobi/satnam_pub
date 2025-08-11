// lib/citadel/relay.ts
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import type { Event as NostrEvent } from "../../src/lib/nostr-browser";
import {
  SimplePool,
  finalizeEvent as finishEvent,
  generateSecretKey,
  getPublicKey,
  verifyEvent,
} from "../../src/lib/nostr-browser";
import { supabase } from "../../src/lib/supabase";

export interface RelayPublishResponse {
  success: boolean;
  eventId: string;
  relayUrl: string;
  error?: string;
}

export class CitadelRelay {
  private static pool = new SimplePool();
  private static serverKey: Promise<Uint8Array> = (async () => {
    // Generate a new server key for each session - no persistent storage
    // This follows privacy-first principles and avoids env variable dependencies
    const privateKeyHex = await generateSecretKey.generate();
    return hexToBytes(privateKeyHex);
  })();

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

      // Create identity event
      const serverKeyBytes = await this.serverKey;
      const identityEvent = await finishEvent.sign(
        {
          kind: 30000, // Parameterized replaceable event for identity
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["d", nostrIdentity.pubkey], // Unique identifier
            ["p", nostrIdentity.pubkey], // User's pubkey
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
            // Don't store private key in relay - only reference
            backup_type: "identity_reference",
          }),
          pubkey: await getPublicKey.fromPrivateKey(bytesToHex(serverKeyBytes)),
          id: "",
        },
        bytesToHex(serverKeyBytes)
      );

      // Publish to relay
      const publishResults = await this.pool.publish([relay], identityEvent);

      // Wait for confirmation
      const confirmed = await this.waitForConfirmation(relay, identityEvent.id);

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
        const sub = this.pool.subscribeMany([relay], [{ ids: [eventId] }], {
          onevent(event) {
            resolve(event);
          },
          oneose() {
            resolve(null);
          },
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          sub.close();
          resolve(null);
        }, 10000);
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

      const serverKeyBytes = await this.serverKey;
      const backupEvent = await finishEvent.sign(
        {
          kind: 30001, // Parameterized replaceable event for backups
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["d", `${userId}_${backupType}`], // Unique identifier
            ["p", userId], // User's pubkey
            ["backup_type", backupType],
            ["encrypted", "true"],
            ["server", "identity-forge"],
          ],
          content: encryptedData,
          pubkey: await getPublicKey.fromPrivateKey(bytesToHex(serverKeyBytes)),
          id: "",
        },
        bytesToHex(serverKeyBytes)
      );

      const publishResults = await this.pool.publish([relay], backupEvent);
      const confirmed = await this.waitForConfirmation(relay, backupEvent.id);

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

      const serverKeyBytes = await this.serverKey;
      const familyEvent = await finishEvent.sign(
        {
          kind: 30002, // Parameterized replaceable event for family data
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["d", familyData.family_id], // Unique identifier
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
          pubkey: await getPublicKey.fromPrivateKey(bytesToHex(serverKeyBytes)),
          id: "",
        },
        bytesToHex(serverKeyBytes)
      );

      const publishResults = await this.pool.publish([relay], familyEvent);
      const confirmed = await this.waitForConfirmation(relay, familyEvent.id);

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
      const sub = this.pool.subscribeMany([relayUrl], [{ ids: [eventId] }], {
        onevent(event) {
          if (event.id === eventId) {
            sub.close();
            resolve(true);
          }
        },
        oneose() {
          resolve(false);
        },
      });

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
        const sub = this.pool.subscribeMany(
          [relay],
          [{ kinds: [1], limit: 1 }],
          {
            onevent() {
              const latency = Date.now() - startTime;
              sub.close();
              resolve({
                success: true,
                relayUrl: relay,
                latency,
              });
            },
            oneose() {
              const latency = Date.now() - startTime;
              sub.close();
              resolve({
                success: true,
                relayUrl: relay,
                latency,
              });
            },
          }
        );

        // Timeout after 10 seconds
        setTimeout(() => {
          sub.close();
          resolve({
            success: false,
            relayUrl: relay,
            error: "Connection timeout",
          });
        }, 10000);
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

      // 2) Derive public key (64 hex chars)
      const derivedPubHex = await getPublicKey.fromPrivateKey(privHex);
      const isPubLen64 =
        typeof derivedPubHex === "string" && derivedPubHex.length === 64;
      console.log(
        `• Public key hex length OK: ${isPubLen64 ? "yes" : "no"} (len=${
          derivedPubHex.length
        })`
      );
      if (!isPubLen64)
        throw new Error("Derived public key is not 64 hex characters");

      // Confirm pubkey differs from private key
      const differsFromPriv = derivedPubHex !== privHex;
      console.log(
        `• Public key differs from private key: ${
          differsFromPriv ? "yes" : "no"
        }`
      );
      if (!differsFromPriv)
        throw new Error("Derived public key unexpectedly equals private key");

      // 3) Construct minimal test event (unsigned)
      const unsignedEvent = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [] as string[][],
        content: "Smoke test event for cryptographic validation",
        pubkey: derivedPubHex, // derived public key must be used here
        id: "",
      };

      // 4) Sign and finalize event with the private key
      const signed = await finishEvent.sign(unsignedEvent as any, privHex);

      // 5) Verify signature using existing verifyEvent utility
      const verified = await verifyEvent.verify(signed as any);
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
