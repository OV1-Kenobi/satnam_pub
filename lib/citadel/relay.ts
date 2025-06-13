// lib/citadel/relay.ts
import {
  SimplePool,
  generateSecretKey as generatePrivateKey,
  getPublicKey,
  finalizeEvent as finishEvent,
  nip19,
} from "nostr-tools";
import type { Event as NostrEvent } from "nostr-tools";

export interface RelayPublishResponse {
  success: boolean;
  eventId: string;
  relayUrl: string;
  error?: string;
}

export class CitadelRelay {
  private static pool = new SimplePool();
  private static serverKey: Uint8Array = (() => {
    const envKey = process.env.NOSTR_SERVER_NSEC;
    if (envKey) {
      try {
        return nip19.decode(envKey).data as Uint8Array;
      } catch {
        return generatePrivateKey();
      }
    }
    return generatePrivateKey();
  })();

  /**
   * Publish Identity Event to Private Relay
   */
  static async publishIdentityEvent(
    nostrIdentity: any,
    relayUrl?: string,
  ): Promise<RelayPublishResponse> {
    try {
      const relay =
        relayUrl || process.env.RELAY_URL || "wss://relay.citadel.academy";

      // Create identity event
      const identityEvent = finishEvent(
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
        },
        this.serverKey,
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
  ): Promise<NostrEvent | null> {
    try {
      const relay =
        relayUrl || process.env.RELAY_URL || "wss://relay.citadel.academy";

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
  ): Promise<RelayPublishResponse> {
    try {
      const relay = process.env.RELAY_URL || "wss://relay.citadel.academy";

      const backupEvent = finishEvent(
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
        },
        this.serverKey,
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
  ): Promise<NostrEvent[]> {
    try {
      const relay =
        relayUrl || process.env.RELAY_URL || "wss://relay.citadel.academy";
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
              resolve(backups.sort((a, b) => b.created_at - a.created_at));
            },
          },
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
   * Publish Family Event
   */
  static async publishFamilyEvent(familyData: {
    family_id: string;
    family_name: string;
    members: string[];
    domain?: string;
  }): Promise<RelayPublishResponse> {
    try {
      const relay = process.env.RELAY_URL || "wss://relay.citadel.academy";

      const familyEvent = finishEvent(
        {
          kind: 30002, // Parameterized replaceable event for families
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["d", familyData.family_id], // Unique identifier
            ["family_name", familyData.family_name],
            ["domain", familyData.domain || ""],
            ...familyData.members.map((member) => ["p", member]), // Family members
            ["server", "identity-forge"],
          ],
          content: JSON.stringify({
            type: "family_registry",
            family_id: familyData.family_id,
            family_name: familyData.family_name,
            member_count: familyData.members.length,
            created_at: new Date().toISOString(),
          }),
        },
        this.serverKey,
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
   * Wait for relay confirmation
   */
  private static async waitForConfirmation(
    relayUrl: string,
    eventId: string,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      let confirmed = false;

      const sub = this.pool.subscribeMany([relayUrl], [{ ids: [eventId] }], {
        onevent(event) {
          if (event.id === eventId) {
            confirmed = true;
            resolve(true);
          }
        },
        oneose() {
          if (!confirmed) {
            resolve(false);
          }
        },
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        sub.close();
        resolve(confirmed);
      }, 5000);
    });
  }

  /**
   * Test Relay Connection
   */
  static async testRelayConnection(relayUrl?: string): Promise<{
    success: boolean;
    relayUrl: string;
    latency?: number;
    error?: string;
  }> {
    const relay =
      relayUrl || process.env.RELAY_URL || "wss://relay.citadel.academy";
    const startTime = Date.now();

    try {
      // Test with a simple subscription
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
          },
        );

        // Timeout after 5 seconds
        setTimeout(() => {
          sub.close();
          resolve({
            success: false,
            relayUrl: relay,
            error: "Connection timeout",
          });
        }, 5000);
      });
    } catch (error) {
      return {
        success: false,
        relayUrl: relay,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Close all connections
   */
  static cleanup() {
    this.pool.close([]);
  }
}
