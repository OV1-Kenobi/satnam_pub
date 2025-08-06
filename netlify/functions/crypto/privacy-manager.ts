// lib/crypto/privacy-manager.ts
// Browser-compatible crypto using Web Crypto API
// Browser-compatible constant time comparison
function constantTimeEquals(a: string, b: string): boolean {
  const minLength = Math.min(a.length, b.length);
  const maxLength = Math.max(a.length, b.length);
  let result = 0;

  // Compare up to minLength
  for (let i = 0; i < minLength; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  // Include length difference in result
  result |= a.length ^ b.length;

  return result === 0;
}

export class PrivacyManager {
  /**
   * Create a non-reversible hash for authentication
   * Uses the pubkey but doesn't store it - only the hash
   * Browser-compatible using Web Crypto API
   */
  static async createAuthHash(pubkey: string, salt?: string): Promise<string> {
    // Generate random salt using Web Crypto API
    const authSalt =
      salt ||
      Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    // Use PBKDF2 with Web Crypto API
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(pubkey),
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );

    const saltBuffer = new Uint8Array(
      authSalt.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))
    );
    const hashBuffer = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: saltBuffer,
        iterations: 100000,
        hash: "SHA-512",
      },
      keyMaterial,
      512 // 64 bytes * 8 bits
    );

    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return `${authSalt}:${hashHex}`;
  }

  /**
   * Verify a pubkey against stored auth hash
   * Allows authentication without storing the actual pubkey
   * Uses constant-time comparison to prevent timing attacks
   * Browser-compatible using Web Crypto API
   */
  static async verifyAuthHash(
    pubkey: string,
    storedHash: string
  ): Promise<boolean> {
    try {
      const [salt, originalHash] = storedHash.split(":");

      // Use PBKDF2 with Web Crypto API
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(pubkey),
        { name: "PBKDF2" },
        false,
        ["deriveBits"]
      );

      const saltBuffer = new Uint8Array(
        salt.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))
      );
      const hashBuffer = await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: saltBuffer,
          iterations: 100000,
          hash: "SHA-512",
        },
        keyMaterial,
        512 // 64 bytes * 8 bits
      );

      const hashHex = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      return constantTimeEquals(hashHex, originalHash);
    } catch {
      return false;
    }
  }

  /**
   * Encrypt user data with their own password/key
   * Platform cannot decrypt this - only the user can
   * Browser-compatible using Web Crypto API
   */
  static async encryptUserData(data: any, userKey: string): Promise<string> {
    // Derive key using PBKDF2 (Web Crypto API equivalent of scrypt)
    const encoder = new TextEncoder();

    // Generate random salt
    const salt = crypto.getRandomValues(new Uint8Array(16));

    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(userKey),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );

    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"]
    );

    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(12)); // AES-GCM uses 12-byte IV

    // Encrypt data
    const dataBuffer = encoder.encode(JSON.stringify(data));
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      dataBuffer
    );

    // Convert to hex strings
    const saltHex = Array.from(salt)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const ivHex = Array.from(iv)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const encryptedHex = Array.from(new Uint8Array(encryptedBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return `${saltHex}:${ivHex}:${encryptedHex}`;
  }

  /**
   * Decrypt user data with their password/key
   * Only the user can decrypt their own data
   * Browser-compatible using Web Crypto API
   */
  static async decryptUserData(
    encryptedData: string,
    userKey: string
  ): Promise<any> {
    try {
      const parts = encryptedData.split(":");

      // Check if we're dealing with the new format (with salt) or legacy format
      let saltHex, ivHex, encryptedHex;

      if (parts.length === 3) {
        // New format with salt included
        [saltHex, ivHex, encryptedHex] = parts;
      } else if (parts.length === 2) {
        // Legacy format with static salt - this will fail as we no longer support it
        throw new Error(
          "Legacy user data format not supported - please re-encrypt with the latest version"
        );
      } else {
        throw new Error("Invalid encrypted user data format");
      }

      // Derive key using PBKDF2 with Web Crypto API
      const encoder = new TextEncoder();

      // Convert salt from hex
      const salt = new Uint8Array(
        saltHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))
      );

      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(userKey),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
      );

      const key = await crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: salt,
          iterations: 100000,
          hash: "SHA-256",
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
      );

      // Convert hex strings to Uint8Array
      const iv = new Uint8Array(
        ivHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))
      );
      const encryptedBytes = new Uint8Array(
        encryptedHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))
      );

      // Decrypt using AES-GCM
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encryptedBytes
      );

      const decoder = new TextDecoder();
      const decryptedText = decoder.decode(decryptedBuffer);
      return JSON.parse(decryptedText);
    } catch {
      throw new Error("Failed to decrypt user data - invalid key");
    }
  }

  /**
   * Create a privacy-safe identifier for platform use
   * Derived from pubkey but not reversible
   * Browser-compatible using Web Crypto API
   */
  static async createPlatformId(pubkey: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(pubkey + "platform_salt");
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
   * Browser-compatible using Web Crypto API
   */
  static async encryptPrivateKey(
    privateKey: string,
    userPassphrase: string
  ): Promise<string> {
    // Derive key using PBKDF2 with Web Crypto API
    const encoder = new TextEncoder();

    // Generate random salt
    const salt = crypto.getRandomValues(new Uint8Array(16));

    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(userPassphrase),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );

    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"]
    );

    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(12)); // AES-GCM uses 12-byte IV

    // Encrypt private key
    const dataBuffer = encoder.encode(privateKey);
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      dataBuffer
    );

    // Convert to hex strings
    const saltHex = Array.from(salt)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const ivHex = Array.from(iv)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const encryptedHex = Array.from(new Uint8Array(encryptedBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return `${saltHex}:${ivHex}:${encryptedHex}`;
  }

  /**
   * Decrypt private key with user's passphrase
   * SECURITY: Only user with correct passphrase can decrypt
   * Browser-compatible using Web Crypto API
   */
  static async decryptPrivateKey(
    encryptedPrivateKey: string,
    userPassphrase: string
  ): Promise<string> {
    try {
      const parts = encryptedPrivateKey.split(":");

      // Check if we're dealing with the new format (with salt) or legacy format
      let saltHex, ivHex, encryptedHex;

      if (parts.length === 3) {
        // New format with salt included
        [saltHex, ivHex, encryptedHex] = parts;
      } else if (parts.length === 2) {
        // Legacy format with static salt - this will fail as we no longer support it
        throw new Error(
          "Legacy private key format not supported - please re-encrypt with the latest version"
        );
      } else {
        throw new Error("Invalid encrypted private key format");
      }

      // Derive key using PBKDF2 with Web Crypto API
      const encoder = new TextEncoder();

      // Convert salt from hex
      const salt = new Uint8Array(
        saltHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))
      );

      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(userPassphrase),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
      );

      const key = await crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: salt,
          iterations: 100000,
          hash: "SHA-256",
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
      );

      // Convert hex strings to Uint8Array
      const iv = new Uint8Array(
        ivHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))
      );
      const encryptedBytes = new Uint8Array(
        encryptedHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))
      );

      // Decrypt using AES-GCM
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encryptedBytes
      );

      const decoder = new TextDecoder();
      return decoder.decode(decryptedBuffer);
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
   * Browser-compatible using Web Crypto API
   */
  static async encryptServiceConfig(
    config: any,
    serviceKey: string
  ): Promise<string> {
    try {
      // Derive key using PBKDF2 with Web Crypto API
      const encoder = new TextEncoder();

      // Generate random salt
      const salt = crypto.getRandomValues(new Uint8Array(16));

      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(serviceKey),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
      );

      const key = await crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: salt,
          iterations: 100000,
          hash: "SHA-256",
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt"]
      );

      // Generate random IV
      const iv = crypto.getRandomValues(new Uint8Array(12)); // AES-GCM uses 12-byte IV

      // Encrypt config data
      const dataBuffer = encoder.encode(JSON.stringify(config));
      const encryptedBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        dataBuffer
      );

      // Convert to hex strings
      const saltHex = Array.from(salt)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const ivHex = Array.from(iv)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const encryptedHex = Array.from(new Uint8Array(encryptedBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // Include version for future migration compatibility
      return `v1:${saltHex}:${ivHex}:${encryptedHex}`;
    } catch (error) {
      throw new Error(
        `Service config encryption failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Decrypt service configuration data
   * SECURITY: Decrypts external service credentials and configs
   * Only accessible with the correct service encryption key
   * Browser-compatible using Web Crypto API
   */
  static async decryptServiceConfig(
    encryptedConfig: string,
    serviceKey: string
  ): Promise<any> {
    try {
      // Handle versioned format
      const [version, saltHex, ivHex, encryptedHex] =
        encryptedConfig.split(":");

      if (version !== "v1") {
        throw new Error("Unsupported service config version");
      }

      // Validate format
      if (!saltHex || !ivHex || !encryptedHex) {
        throw new Error(
          "Invalid encrypted config format - missing required components"
        );
      }

      // Derive key using PBKDF2 with Web Crypto API
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(serviceKey),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
      );

      // Convert salt from hex
      const salt = new Uint8Array(
        saltHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))
      );

      const key = await crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: salt,
          iterations: 100000,
          hash: "SHA-256",
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
      );

      // Convert hex strings to Uint8Array
      const iv = new Uint8Array(
        ivHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))
      );
      const encryptedBytes = new Uint8Array(
        encryptedHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))
      );

      // Decrypt using AES-GCM
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encryptedBytes
      );

      const decoder = new TextDecoder();
      const decryptedText = decoder.decode(decryptedBuffer);
      return JSON.parse(decryptedText);
    } catch (error) {
      throw new Error(
        `Service config decryption failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
