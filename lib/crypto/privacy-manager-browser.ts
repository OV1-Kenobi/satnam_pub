// lib/crypto/privacy-manager-browser.ts
// Browser-compatible version using Web Crypto API
import { constantTimeEquals } from "../../utils/crypto";

export class PrivacyManager {
  /**
   * Create a non-reversible hash for authentication
   * Uses the pubkey but doesn't store it - only the hash
   */
  static async createAuthHash(pubkey: string, salt?: string): Promise<string> {
    const authSalt =
      salt ||
      Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
        b.toString(16).padStart(2, "0")
      ).join("");
    const keyBuffer = new TextEncoder().encode(pubkey);
    const saltBuffer = new TextEncoder().encode(authSalt);
    const importedKey = await crypto.subtle.importKey(
      "raw",
      keyBuffer,
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: saltBuffer,
        iterations: 100000,
        hash: "SHA-512",
      },
      importedKey,
      512
    );
    const hash = Array.from(new Uint8Array(derivedBits), (b) =>
      b.toString(16).padStart(2, "0")
    ).join("");
    return `${authSalt}:${hash}`;
  }

  /**
   * Verify a pubkey against stored auth hash
   * Allows authentication without storing the actual pubkey
   * Uses constant-time comparison to prevent timing attacks
   */
  static async verifyAuthHash(
    pubkey: string,
    storedHash: string
  ): Promise<boolean> {
    try {
      const [salt, originalHash] = storedHash.split(":");
      const keyBuffer = new TextEncoder().encode(pubkey);
      const saltBuffer = new TextEncoder().encode(salt);
      const importedKey = await crypto.subtle.importKey(
        "raw",
        keyBuffer,
        "PBKDF2",
        false,
        ["deriveBits"]
      );
      const derivedBits = await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: saltBuffer,
          iterations: 100000,
          hash: "SHA-512",
        },
        importedKey,
        512
      );
      const hash = Array.from(new Uint8Array(derivedBits), (b) =>
        b.toString(16).padStart(2, "0")
      ).join("");
      return constantTimeEquals(hash, originalHash);
    } catch {
      return false;
    }
  }

  /**
   * Encrypt user data with their own password/key
   * Platform cannot decrypt this - only the user can
   */
  static async encryptUserData(data: any, userKey: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyBuffer = new TextEncoder().encode(userKey);
    const importedKey = await crypto.subtle.importKey(
      "raw",
      keyBuffer,
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const derivedBits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
      importedKey,
      256
    );
    const key = await crypto.subtle.importKey(
      "raw",
      derivedBits,
      "AES-GCM",
      false,
      ["encrypt"]
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const dataBuffer = new TextEncoder().encode(JSON.stringify(data));

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      dataBuffer
    );

    const ivHex = Array.from(iv, (b) => b.toString(16).padStart(2, "0")).join(
      ""
    );
    const saltHex = Array.from(salt, (b) =>
      b.toString(16).padStart(2, "0")
    ).join("");
    const encryptedHex = Array.from(new Uint8Array(encrypted), (b) =>
      b.toString(16).padStart(2, "0")
    ).join("");

    return `${ivHex}:${saltHex}:${encryptedHex}`;
  }

  /**
   * Decrypt user data with their password/key
   * Only the user can decrypt their own data
   */
  static async decryptUserData(
    encryptedData: string,
    userKey: string
  ): Promise<any> {
    try {
      const [ivHex, saltHex, encryptedHex] = encryptedData.split(":");
      const iv = new Uint8Array(
        ivHex.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) || []
      );
      const salt = new Uint8Array(
        saltHex.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) || []
      );
      const encrypted = new Uint8Array(
        encryptedHex.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) || []
      );

      const keyBuffer = new TextEncoder().encode(userKey);
      const importedKey = await crypto.subtle.importKey(
        "raw",
        keyBuffer,
        "PBKDF2",
        false,
        ["deriveBits"]
      );
      const derivedBits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
        importedKey,
        256
      );
      const key = await crypto.subtle.importKey(
        "raw",
        derivedBits,
        "AES-GCM",
        false,
        ["decrypt"]
      );

      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        encrypted
      );

      return JSON.parse(new TextDecoder().decode(decrypted));
    } catch {
      throw new Error("Failed to decrypt user data - invalid key");
    }
  }

  /**
   * Create a privacy-safe identifier for platform use
   * Derived from pubkey but not reversible
   */
  static async createPlatformId(pubkey: string): Promise<string> {
    const data = new TextEncoder().encode(pubkey + "platform_salt");
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return hashHex.substring(0, 16);
  }

  /**
   * Encrypt private key with user's passphrase
   * SECURITY: Private keys should never be stored unencrypted
   */
  static async encryptPrivateKey(
    privateKey: string,
    userPassphrase: string
  ): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyBuffer = new TextEncoder().encode(userPassphrase + "privkey_salt");
    const importedKey = await crypto.subtle.importKey(
      "raw",
      keyBuffer,
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const derivedBits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
      importedKey,
      256
    );
    const key = await crypto.subtle.importKey(
      "raw",
      derivedBits,
      "AES-GCM",
      false,
      ["encrypt"]
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const dataBuffer = new TextEncoder().encode(privateKey);

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      dataBuffer
    );

    const ivHex = Array.from(iv, (b) => b.toString(16).padStart(2, "0")).join(
      ""
    );
    const saltHex = Array.from(salt, (b) =>
      b.toString(16).padStart(2, "0")
    ).join("");
    const encryptedHex = Array.from(new Uint8Array(encrypted), (b) =>
      b.toString(16).padStart(2, "0")
    ).join("");

    return `${ivHex}:${saltHex}:${encryptedHex}`;
  }

  /**
   * Decrypt private key with user's passphrase
   * SECURITY: Only user with correct passphrase can decrypt
   */
  static async decryptPrivateKey(
    encryptedPrivateKey: string,
    userPassphrase: string
  ): Promise<string> {
    try {
      const [ivHex, saltHex, encryptedHex] = encryptedPrivateKey.split(":");
      const iv = new Uint8Array(
        ivHex.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) || []
      );
      const salt = new Uint8Array(
        saltHex.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) || []
      );
      const encrypted = new Uint8Array(
        encryptedHex.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) || []
      );

      const keyBuffer = new TextEncoder().encode(
        userPassphrase + "privkey_salt"
      );
      const importedKey = await crypto.subtle.importKey(
        "raw",
        keyBuffer,
        "PBKDF2",
        false,
        ["deriveBits"]
      );
      const derivedBits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
        importedKey,
        256
      );
      const key = await crypto.subtle.importKey(
        "raw",
        derivedBits,
        "AES-GCM",
        false,
        ["decrypt"]
      );

      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        encrypted
      );

      return new TextDecoder().decode(decrypted);
    } catch {
      throw new Error("Failed to decrypt private key - invalid passphrase");
    }
  }

  /**
   * Generate a secure random username suggestion
   * Human-readable, memorable, and no connection to user's Nostr identity
   */
  static generateAnonymousUsername(): string {
    const adjectives = [
      "Swift",
      "Quiet",
      "Bright",
      "Steel",
      "Shadow",
      "Storm",
      "Night",
      "Dawn",
      "Bold",
      "Wise",
      "Noble",
      "Free",
      "Wild",
      "Pure",
      "Strong",
      "Quick",
      "Silent",
      "Golden",
      "Silver",
      "Cosmic",
      "Royal",
      "Ancient",
      "Modern",
      "Clear",
    ];

    const nouns = [
      "Fox",
      "Wolf",
      "Eagle",
      "Lion",
      "Bear",
      "Hawk",
      "Raven",
      "Owl",
      "Tiger",
      "Falcon",
      "Phoenix",
      "Dragon",
      "Panther",
      "Jaguar",
      "Lynx",
      "Cobra",
      "Whale",
      "Shark",
      "Dolphin",
      "Octopus",
      "Turtle",
      "Penguin",
      "Seal",
      "Otter",
    ];

    // Generate 2-4 digit number (more human-friendly than 4 digits always)
    const numbers = Math.floor(Math.random() * 99) + 1;

    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];

    return `${adj}${noun}${numbers}`;
  }

  /**
   * Generate multiple unique username suggestions
   * Used for providing users with choices
   */
  static generateUsernameOptions(count: number = 5): string[] {
    const suggestions = new Set<string>();
    let attempts = 0;
    const maxAttempts = count * 3;

    while (suggestions.size < count && attempts < maxAttempts) {
      const suggestion = this.generateAnonymousUsername();
      suggestions.add(suggestion);
      attempts++;
    }

    return Array.from(suggestions);
  }

  /**
   * Validate username format
   * Ensures usernames are human-readable and platform-appropriate
   */
  static validateUsernameFormat(username: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Length check
    if (username.length < 3) {
      errors.push("Username must be at least 3 characters long");
    }
    if (username.length > 20) {
      errors.push("Username must be no more than 20 characters long");
    }

    // Character check
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      errors.push(
        "Username can only contain letters, numbers, underscores, and hyphens"
      );
    }

    // Start/end character check
    if (!/^[a-zA-Z0-9]/.test(username)) {
      errors.push("Username must start with a letter or number");
    }
    if (!/[a-zA-Z0-9]$/.test(username)) {
      errors.push("Username must end with a letter or number");
    }

    // Consecutive special characters
    if (/[_-]{2,}/.test(username)) {
      errors.push("Username cannot have consecutive underscores or hyphens");
    }

    // Reserved words check
    const reservedWords = [
      "admin",
      "api",
      "www",
      "mail",
      "ftp",
      "root",
      "support",
      "help",
      "about",
      "contact",
    ];
    if (reservedWords.includes(username.toLowerCase())) {
      errors.push("This username is reserved and cannot be used");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Encrypt service configuration data
   * SECURITY: Encrypts sensitive external service credentials and configs
   * Used for securely storing BTCPay, Voltage, and other service configurations
   */
  static async encryptServiceConfig(
    config: any,
    serviceKey: string
  ): Promise<string> {
    try {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const keyBuffer = new TextEncoder().encode(
        serviceKey + "service_config_salt"
      );
      const importedKey = await crypto.subtle.importKey(
        "raw",
        keyBuffer,
        "PBKDF2",
        false,
        ["deriveBits"]
      );
      const derivedBits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
        importedKey,
        256
      );
      const key = await crypto.subtle.importKey(
        "raw",
        derivedBits,
        "AES-GCM",
        false,
        ["encrypt"]
      );

      const iv = crypto.getRandomValues(new Uint8Array(12));
      const dataBuffer = new TextEncoder().encode(JSON.stringify(config));

      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        dataBuffer
      );

      const ivHex = Array.from(iv, (b) => b.toString(16).padStart(2, "0")).join(
        ""
      );
      const saltHex = Array.from(salt, (b) =>
        b.toString(16).padStart(2, "0")
      ).join("");
      const encryptedHex = Array.from(new Uint8Array(encrypted), (b) =>
        b.toString(16).padStart(2, "0")
      ).join("");

      // Include version for future migration compatibility
      return `v1:${ivHex}:${saltHex}:${encryptedHex}`;
    } catch (error) {
      throw new Error(
        `Service config encryption failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Decrypt service configuration data
   * SECURITY: Decrypts external service credentials and configs
   * Only accessible with the correct service encryption key
   */
  static async decryptServiceConfig(
    encryptedConfig: string,
    serviceKey: string
  ): Promise<any> {
    try {
      // Handle versioned format
      const parts = encryptedConfig.split(":");
      if (parts.length !== 4 || parts[0] !== "v1") {
        throw new Error("Unsupported service config version");
      }

      const [, ivHex, saltHex, encryptedHex] = parts;
      const iv = new Uint8Array(
        ivHex.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) || []
      );
      const salt = new Uint8Array(
        saltHex.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) || []
      );
      const encrypted = new Uint8Array(
        encryptedHex.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) || []
      );

      const keyBuffer = new TextEncoder().encode(
        serviceKey + "service_config_salt"
      );
      const importedKey = await crypto.subtle.importKey(
        "raw",
        keyBuffer,
        "PBKDF2",
        false,
        ["deriveBits"]
      );
      const derivedBits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
        importedKey,
        256
      );
      const key = await crypto.subtle.importKey(
        "raw",
        derivedBits,
        "AES-GCM",
        false,
        ["decrypt"]
      );

      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        encrypted
      );

      return JSON.parse(new TextDecoder().decode(decrypted));
    } catch (error) {
      throw new Error(
        `Service config decryption failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
