// lib/citadel/identity-manager.ts
import {
  generateSecretKey as generatePrivateKey,
  getPublicKey,
  nip19,
} from "nostr-tools";
import { webcrypto } from "crypto";

export interface NostrIdentity {
  privateKey: string;
  pubkey: string;
  npub: string;
  username?: string;
  created_at: Date;
}

export class CitadelIdentityManager {
  /**
   * Register a new user with Nostr identity
   */
  static async registerUser(username: string): Promise<NostrIdentity> {
    try {
      // Generate new Nostr key pair
      const privateKeyBytes = generatePrivateKey();
      const privateKey = Array.from(privateKeyBytes, (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const pubkey = getPublicKey(privateKeyBytes);
      const npub = nip19.npubEncode(pubkey);

      const identity: NostrIdentity = {
        privateKey,
        pubkey,
        npub,
        username,
        created_at: new Date(),
      };

      console.log(`🔑 Generated Nostr identity for ${username}:`);
      console.log(`   npub: ${npub}`);
      console.log(`   pubkey: ${pubkey.slice(0, 16)}...`);

      return identity;
    } catch (error) {
      throw new Error(
        `Failed to create Nostr identity: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Generate recovery phrase (BIP39 compatible)
   */
  static generateRecoveryPhrase(): string {
    // For now, return a simple recovery phrase
    // In production, use proper BIP39 generation
    const words = [
      "abandon",
      "ability",
      "able",
      "about",
      "above",
      "absent",
      "absorb",
      "abstract",
      "absurd",
      "abuse",
      "access",
      "accident",
      "account",
      "accuse",
      "achieve",
      "acid",
    ];

    const phrase = [];
    for (let i = 0; i < 12; i++) {
      phrase.push(words[Math.floor(Math.random() * words.length)]);
    }

    return phrase.join(" ");
  }

  /**
   * Derive private key from recovery phrase
   */
  static deriveFromRecoveryPhrase(phrase: string): NostrIdentity {
    // For now, use a simple hash of the phrase
    // In production, use proper BIP39 derivation
    const hash = webcrypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(phrase),
    );

    // This is simplified - use proper derivation in production
    const privateKeyBytes = generatePrivateKey();
    const privateKey = Array.from(privateKeyBytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const pubkey = getPublicKey(privateKeyBytes);
    const npub = nip19.npubEncode(pubkey);

    return {
      privateKey,
      pubkey,
      npub,
      created_at: new Date(),
    };
  }

  /**
   * Validate Nostr public key
   */
  static validatePubkey(pubkey: string): boolean {
    try {
      // Check if it's a valid hex string of correct length
      if (!/^[a-fA-F0-9]{64}$/.test(pubkey)) {
        return false;
      }

      // Try to encode as npub
      nip19.npubEncode(pubkey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate npub format
   */
  static validateNpub(npub: string): boolean {
    try {
      const decoded = nip19.decode(npub);
      return decoded.type === "npub" && typeof decoded.data === "string";
    } catch {
      return false;
    }
  }

  /**
   * Convert between npub and pubkey
   */
  static npubToPubkey(npub: string): string {
    try {
      const decoded = nip19.decode(npub);
      if (decoded.type === "npub") {
        return decoded.data as string;
      }
      throw new Error("Invalid npub");
    } catch (error) {
      throw new Error(
        `Failed to convert npub: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Convert pubkey to npub
   */
  static pubkeyToNpub(pubkey: string): string {
    try {
      return nip19.npubEncode(pubkey);
    } catch (error) {
      throw new Error(
        `Failed to convert pubkey: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Generate NIP-05 identifier
   */
  static generateNIP05(username: string, domain: string): string {
    // Basic validation
    if (!username || !domain) {
      throw new Error("Username and domain are required");
    }

    // Remove any existing @ symbols
    username = username.replace("@", "");
    domain = domain.replace("http://", "").replace("https://", "");

    return `${username}@${domain}`;
  }

  /**
   * Generate Lightning Address
   */
  static generateLightningAddress(username: string, domain: string): string {
    // Lightning addresses follow the same format as email
    return this.generateNIP05(username, domain);
  }

  /**
   * Create identity backup data (encrypted)
   */
  static createBackupData(identity: NostrIdentity, password: string): string {
    // In production, use proper encryption
    // For now, return JSON string (NOT SECURE)
    const backupData = {
      npub: identity.npub,
      pubkey: identity.pubkey,
      // Never backup private key in plain text
      username: identity.username,
      created_at: identity.created_at,
      backup_type: "identity_reference",
      encrypted: false, // TODO: Implement proper encryption
    };

    return JSON.stringify(backupData);
  }

  /**
   * Restore from backup data
   */
  static restoreFromBackup(
    backupData: string,
    password: string,
  ): Partial<NostrIdentity> {
    try {
      const data = JSON.parse(backupData);

      return {
        npub: data.npub,
        pubkey: data.pubkey,
        username: data.username,
        created_at: new Date(data.created_at),
        // Private key must be recovered separately
      };
    } catch (error) {
      throw new Error(
        `Failed to restore from backup: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
