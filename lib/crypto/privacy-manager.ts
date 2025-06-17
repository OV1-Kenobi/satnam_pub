// lib/crypto/privacy-manager.ts
import crypto from "crypto";
import { constantTimeEquals } from "../../utils/crypto";

export class PrivacyManager {
  /**
   * Create a non-reversible hash for authentication
   * Uses the pubkey but doesn't store it - only the hash
   */
  static createAuthHash(pubkey: string, salt?: string): string {
    const authSalt = salt || crypto.randomBytes(32).toString("hex");
    const hash = crypto.pbkdf2Sync(pubkey, authSalt, 100000, 64, "sha512");
    return `${authSalt}:${hash.toString("hex")}`;
  }

  /**
   * Verify a pubkey against stored auth hash
   * Allows authentication without storing the actual pubkey
   * Uses constant-time comparison to prevent timing attacks
   */
  static verifyAuthHash(pubkey: string, storedHash: string): boolean {
    try {
      const [salt, originalHash] = storedHash.split(":");
      const hash = crypto.pbkdf2Sync(pubkey, salt, 100000, 64, "sha512");
      return constantTimeEquals(hash.toString("hex"), originalHash);
    } catch {
      return false;
    }
  }

  /**
   * Encrypt user data with their own password/key
   * Platform cannot decrypt this - only the user can
   */
  static encryptUserData(data: any, userKey: string): string {
    const key = crypto.scryptSync(userKey, "salt", 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

    let encrypted = cipher.update(JSON.stringify(data), "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  }

  /**
   * Decrypt user data with their password/key
   * Only the user can decrypt their own data
   */
  static decryptUserData(encryptedData: string, userKey: string): any {
    try {
      const [ivHex, authTagHex, encrypted] = encryptedData.split(":");
      const key = crypto.scryptSync(userKey, "salt", 32);
      const iv = Buffer.from(ivHex, "hex");
      const authTag = Buffer.from(authTagHex, "hex");

      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return JSON.parse(decrypted);
    } catch {
      throw new Error("Failed to decrypt user data - invalid key");
    }
  }

  /**
   * Create a privacy-safe identifier for platform use
   * Derived from pubkey but not reversible
   */
  static createPlatformId(pubkey: string): string {
    return crypto
      .createHash("sha256")
      .update(pubkey + "platform_salt")
      .digest("hex")
      .substring(0, 16);
  }

  /**
   * Encrypt private key with user's passphrase
   * SECURITY: Private keys should never be stored unencrypted
   */
  static encryptPrivateKey(privateKey: string, userPassphrase: string): string {
    const key = crypto.scryptSync(userPassphrase, "privkey_salt", 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

    let encrypted = cipher.update(privateKey, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  }

  /**
   * Decrypt private key with user's passphrase
   * SECURITY: Only user with correct passphrase can decrypt
   */
  static decryptPrivateKey(
    encryptedPrivateKey: string,
    userPassphrase: string,
  ): string {
    try {
      const [ivHex, authTagHex, encrypted] = encryptedPrivateKey.split(":");
      const key = crypto.scryptSync(userPassphrase, "privkey_salt", 32);
      const iv = Buffer.from(ivHex, "hex");
      const authTag = Buffer.from(authTagHex, "hex");

      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
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
        "Username can only contain letters, numbers, underscores, and hyphens",
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
  static encryptServiceConfig(config: any, serviceKey: string): string {
    try {
      // Use stronger key derivation for service configs
      const key = crypto.scryptSync(serviceKey, "service_config_salt", 32);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

      let encrypted = cipher.update(JSON.stringify(config), "utf8", "hex");
      encrypted += cipher.final("hex");

      const authTag = cipher.getAuthTag();

      // Include version for future migration compatibility
      return `v1:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
    } catch (error) {
      throw new Error(
        `Service config encryption failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Decrypt service configuration data
   * SECURITY: Decrypts external service credentials and configs
   * Only accessible with the correct service encryption key
   */
  static decryptServiceConfig(
    encryptedConfig: string,
    serviceKey: string,
  ): any {
    try {
      // Handle versioned format
      const [version, ivHex, authTagHex, encrypted] =
        encryptedConfig.split(":");

      if (version !== "v1") {
        throw new Error("Unsupported service config version");
      }

      const key = crypto.scryptSync(serviceKey, "service_config_salt", 32);
      const iv = Buffer.from(ivHex, "hex");
      const authTag = Buffer.from(authTagHex, "hex");

      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return JSON.parse(decrypted);
    } catch (error) {
      throw new Error(
        `Service config decryption failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
