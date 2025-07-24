// lib/examples/privacy-client-example.ts
// Example of how clients should interact with the privacy-first API

import { PrivacyManager } from '../crypto/privacy-manager.js';

export class PrivacyClientExample {
  /**
   * Example: Register a new user with maximum privacy
   */
  static async registerPrivateUser(jwtToken: string) {
    // 1. User generates or provides their own encryption key
    const userEncryptionKey = "user-provided-password-or-key";

    // 2. User provides optional data to be encrypted
    const optionalData = {
      displayName: "Alice",
      bio: "Bitcoin educator",
      lightningAddress: "alice@example.com",
      customFields: {
        website: "https://alice.com",
        telegram: "@alice",
      },
    };

    // 3. Registration request (no pubkey sent to server)
    const registrationRequest = {
      username: "ChosenUsername", // or omit for anonymous
      userEncryptionKey,
      optionalData,
      makeDiscoverable: false, // Private by default
      relayUrl: "wss://relay.example.com",
    };

    // 4. Send to server (after authentication)
    const response = await fetch("/api/register", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(registrationRequest),
    });

    return response.json();
  }

  /**
   * Example: Retrieve and decrypt user data
   */
  static async getUserData(jwtToken: string, userEncryptionKey: string) {
    // 1. Fetch encrypted data from server
    const response = await fetch("/api/privacy/encrypted-data", {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
      },
    });

    const { encryptedData } = await response.json();

    // 2. Decrypt on client-side (server never sees decrypted data)
    if (encryptedData) {
      const userData = PrivacyManager.decryptUserData(
        encryptedData,
        userEncryptionKey,
      );
      return userData;
    }

    return null;
  }

  /**
   * Example: Update discoverability settings
   */
  static async updateDiscoverability(
    jwtToken: string,
    isDiscoverable: boolean,
    userEncryptionKey: string,
    displayData?: any,
  ) {
    let encryptedDisplayData;

    if (isDiscoverable && displayData) {
      // Encrypt display data on client-side
      encryptedDisplayData = PrivacyManager.encryptUserData(
        displayData,
        userEncryptionKey,
      );
    }

    const response = await fetch("/api/privacy/discoverability", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        isDiscoverable,
        encryptedDisplayData,
      }),
    });

    return response.json();
  }

  /**
   * Example: Check username availability
   */
  static async checkUsernameAvailability(username: string) {
    const response = await fetch("/api/privacy/check-username", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username }),
    });

    const { available, suggestion } = await response.json();

    if (!available) {
      console.log(`Username "${username}" is taken. Suggestion: ${suggestion}`);
    }

    return { available, suggestion };
  }

  /**
   * Example: Generate anonymous username
   */
  static generateAnonymousUsername(): string {
    return PrivacyManager.generateAnonymousUsername();
  }

  /**
   * Example: Nostr authentication flow (NIP-98 style)
   */
  static async authenticateWithNostr(privateKey: string) {
    // 1. Generate authentication event
    const authEvent = {
      kind: 27235, // NIP-98 HTTP Auth
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["u", "https://yourplatform.com/api/auth"],
        ["method", "POST"],
      ],
      content: "",
    };

    // 2. Sign event with user's private key
    // (use your preferred Nostr library)
    const signedEvent = signEvent(authEvent, privateKey);

    // 3. Send to server for verification
    const response = await fetch("/api/auth/nostr", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ signedEvent }),
    });

    const { token } = await response.json();
    return token; // JWT token for future requests
  }
}

// Mock signing function (use actual nostr library)
function signEvent(event: any, privateKey: string): any {
  // Implementation would use actual Nostr signing
  return { ...event, sig: "mock-signature" };
}

// Usage Examples:
export const clientUsageExamples = {
  // Register with maximum privacy
  async registerPrivately() {
    const userKey = "my-secure-password";
    const token = "jwt-token";
    return await PrivacyClientExample.registerPrivateUser(token);
  },

  // Access encrypted data
  async accessMyData() {
    const token = "jwt-token";
    const key = "my-secure-password";
    return await PrivacyClientExample.getUserData(token, key);
  },

  // Make profile discoverable
  async makeDiscoverable() {
    const token = "jwt-token";
    const key = "my-secure-password";
    const displayData = {
      displayName: "Alice",
      bio: "Bitcoin educator",
    };

    return await PrivacyClientExample.updateDiscoverability(
      token,
      true,
      key,
      displayData,
    );
  },
};
