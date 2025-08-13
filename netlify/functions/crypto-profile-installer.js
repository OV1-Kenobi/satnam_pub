/**
 * Crypto Profile Installer
 * Manages partial crypto module loading for different app features
 * Reduces bundle size and improves loading performance
 */

// Dynamic import for crypto-factory to avoid static/dynamic import mixing

/**
 * @typedef {'minimal' | 'auth' | 'nostr' | 'messaging' | 'recovery' | 'full'} CryptoProfile
 * - minimal: Basic hashing and random generation
 * - auth: Hashing, token generation, basic encryption for authentication
 * - nostr: Nostr key generation, NIP-07 compatibility
 * - messaging: End-to-end encryption, gift wrapping
 * - recovery: BIP39, HD wallets, key derivation
 * - full: All crypto features
 */

/**
 * @typedef {Object} CryptoModuleSet
 * @property {string[]} modules - Array of module names to load
 * @property {string} description - Description of the profile capabilities
 * @property {'small' | 'medium' | 'large'} size - Relative size of the profile
 * @property {CryptoProfile[]} [dependencies] - Other profiles this depends on
 */

/** @type {Record<CryptoProfile, CryptoModuleSet>} */
const CRYPTO_PROFILES = {
  minimal: {
    modules: ["crypto-unified"],
    description: "Basic crypto utilities (hashing, random generation)",
    size: "small",
  },
  auth: {
    modules: ["crypto-unified", "crypto-lazy"],
    description:
      "Authentication crypto (hashing, token generation, basic encryption)",
    size: "small",
    dependencies: ["minimal"],
  },
  nostr: {
    modules: [
      "crypto-modules/nostr",
      "src/lib/nostr-browser",
      "@noble/secp256k1",
    ],
    description: "Nostr protocol support (key generation, NIP-07)",
    size: "medium",
    dependencies: ["minimal"],
  },
  messaging: {
    modules: [
      "crypto-modules/hash",
      "src/lib/nostr-browser/nip04",
      "src/lib/nostr-browser/nip59",
    ],
    description: "End-to-end messaging encryption",
    size: "medium",
    dependencies: ["nostr"],
  },
  recovery: {
    modules: ["crypto-modules/bip", "bip39", "@scure/bip32"],
    description: "Wallet recovery (BIP39, HD wallets)",
    size: "large",
    dependencies: ["minimal"],
  },
  full: {
    modules: ["crypto-modules", "crypto-lazy", "crypto-factory"],
    description: "Complete crypto functionality",
    size: "large",
    dependencies: ["minimal", "auth", "nostr", "messaging", "recovery"],
  },
};

// Track loaded profiles
const loadedProfiles = new Set();
const loadingProfiles = new Map();

/**
 * Crypto Profile Installer Class
 * Manages dynamic loading of crypto modules based on feature requirements
 */
export class CryptoProfileInstaller {
  constructor() {
    this.loadedProfiles = loadedProfiles;
    this.loadingProfiles = loadingProfiles;
  }

  /**
   * Install a crypto profile with all its dependencies
   * @param {CryptoProfile} profile - The profile to install
   * @returns {Promise<void>}
   */
  async installProfile(profile) {
    if (this.loadedProfiles.has(profile)) {
      return; // Already loaded
    }

    if (this.loadingProfiles.has(profile)) {
      return this.loadingProfiles.get(profile); // Already loading
    }

    const loadingPromise = this._loadProfile(profile);
    this.loadingProfiles.set(profile, loadingPromise);

    try {
      await loadingPromise;
      this.loadedProfiles.add(profile);
    } finally {
      this.loadingProfiles.delete(profile);
    }
  }

  /**
   * Internal method to load a profile and its dependencies
   * @private
   * @param {CryptoProfile} profile - The profile to load
   * @returns {Promise<void>}
   */
  async _loadProfile(profile) {
    const profileConfig = CRYPTO_PROFILES[profile];
    if (!profileConfig) {
      throw new Error(`Unknown crypto profile: ${profile}`);
    }

    // Load dependencies first
    if (profileConfig.dependencies) {
      await Promise.all(
        profileConfig.dependencies.map((dep) => this.installProfile(dep))
      );
    }

    // Load profile-specific modules
    await this._loadModules(profile, profileConfig.modules);
  }

  /**
   * Load specific modules for a profile
   * @private
   * @param {CryptoProfile} profile - The profile being loaded
   * @param {string[]} modules - Array of module names to load
   * @returns {Promise<void>}
   */
  async _loadModules(profile, modules) {
    switch (profile) {
    case "minimal":
      // Already loaded with crypto-unified
      break;

    case "auth":
      // Load crypto functions for authentication with lazy loading
      try {
        const { sha256, generateSecureToken } = await import(
          "../../utils/crypto-lazy.ts"
        );
        // Minimal warm up to reduce memory pressure
        await Promise.all([
          sha256("test").catch(() => {}),
          generateSecureToken(16).catch(() => {}) // Reduced size for warm up
        ]);
      } catch (error) {
        console.warn("Auth crypto modules failed to load:", error.message);
      }
      break;

    case "nostr":
      // Load Nostr crypto modules with error handling
      try {
        const { loadNostrCrypto } = await import("../../utils/crypto-modules");
        await loadNostrCrypto();
      } catch (error) {
        console.warn("Nostr crypto modules failed to load:", error.message);
      }
      break;

    case "messaging":
      // Load messaging encryption modules with error handling
      try {
        const { loadHashCrypto } = await import("../../utils/crypto-modules");
        await loadHashCrypto();
      } catch (error) {
        console.warn("Messaging crypto modules failed to load:", error.message);
      }
      break;

    case "recovery":
      // Load BIP39 and HD wallet modules with error handling
      try {
        const { loadBipCrypto } = await import("../../utils/crypto-modules");
        await loadBipCrypto();
      } catch (error) {
        console.warn("Recovery crypto modules failed to load:", error.message);
      }
      break;

    case "full":
      // Load all crypto modules with minimal warm up
      try {
        const cryptoFactory = await import("../../utils/crypto-factory");
        // Minimal warm up to reduce memory pressure
        if (cryptoFactory.cryptoFactory) {
          cryptoFactory.cryptoFactory.generateSecureToken(8).catch(() => {});
        }
      } catch (error) {
        console.warn("Full crypto modules failed to load:", error.message);
      }
      break;

    default:
      console.warn(`No specific loading logic for profile: ${profile}`);
    }
  }

  /**
   * Get information about a crypto profile
   * @param {CryptoProfile} profile - The profile to get info for
   * @returns {CryptoModuleSet | null} Profile information or null if not found
   */
  getProfileInfo(profile) {
    return CRYPTO_PROFILES[profile] || null;
  }

  /**
   * Check if a profile is loaded
   * @param {CryptoProfile} profile - The profile to check
   * @returns {boolean} True if the profile is loaded
   */
  isProfileLoaded(profile) {
    return this.loadedProfiles.has(profile);
  }

  /**
   * Get all available profiles
   * @returns {CryptoProfile[]} Array of available profile names
   */
  getAvailableProfiles() {
    return Object.keys(CRYPTO_PROFILES);
  }

  /**
   * Get loaded profiles
   * @returns {CryptoProfile[]} Array of loaded profile names
   */
  getLoadedProfiles() {
    return Array.from(this.loadedProfiles);
  }

  /**
   * Install crypto profile based on feature detection
   * @param {string} feature - Feature name to detect profile for
   * @returns {Promise<CryptoProfile | null>} The installed profile or null
   */
  async installForFeature(feature) {
    const profile = this.detectProfileNeeded(feature);
    if (profile) {
      await this.installProfile(profile);
      return profile;
    }
    return null;
  }

  /**
   * Detect which crypto profile is needed for a feature
   * @private
   * @param {string} feature - Feature name
   * @returns {CryptoProfile | null} Required profile or null
   */
  detectProfileNeeded(feature) {
    /** @type {Record<string, CryptoProfile>} */
    const featureMap = {
      // Authentication features
      totp: "full",
      otp: "full",
      login: "auth",
      signin: "auth",
      auth: "auth",

      // Nostr features
      nostr: "nostr",
      nip07: "nostr",
      "nip-07": "nostr",
      nostrsigner: "nostr",
      nsec: "nostr",
      npub: "nostr",

      // Messaging features
      messaging: "messaging",
      dm: "messaging",
      encrypt: "messaging",
      giftwrap: "messaging",
      nip04: "messaging",
      nip59: "messaging",

      // Recovery features
      recovery: "recovery",
      bip39: "recovery",
      mnemonic: "recovery",
      seed: "recovery",
      hdwallet: "recovery",

      // Full features
      full: "full",
      complete: "full",
      all: "full",
    };

    return featureMap[feature.toLowerCase()] || null;
  }

  /**
   * Preload commonly used profiles with memory optimization
   * @returns {Promise<void>}
   */
  async preloadCommon() {
    // Preload minimal and auth profiles sequentially to reduce memory pressure
    try {
      await this.installProfile("minimal");
      // Small delay to allow garbage collection
      await new Promise(resolve => setTimeout(resolve, 100));
      await this.installProfile("auth");
    } catch (error) {
      console.warn("Failed to preload common profiles:", error.message);
    }
  }

  /**
   * Get memory usage estimate for profiles
   * @param {CryptoProfile[]} profiles - Profiles to estimate
   * @returns {Object} Memory usage estimate
   */
  getMemoryEstimate(profiles) {
    const sizeMap = { small: 1, medium: 3, large: 8 };
    let totalSize = 0;
    const details = {};

    for (const profile of profiles) {
      const config = CRYPTO_PROFILES[profile];
      if (config) {
        const size = sizeMap[config.size] || 1;
        totalSize += size;
        details[profile] = {
          size: config.size,
          modules: config.modules.length,
          description: config.description,
        };
      }
    }

    return {
      totalSize,
      details,
      recommendation:
        totalSize > 10
          ? "Consider lazy loading to reduce initial bundle size"
          : "Memory usage is acceptable",
    };
  }
}

// Export singleton instance
export const cryptoProfileInstaller = new CryptoProfileInstaller();

// Export for compatibility
export default cryptoProfileInstaller;


// Netlify Function handler: returns minimal info and allows health checks
export async function handler(event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const profiles = cryptoProfileInstaller.getAvailableProfiles();
    return { statusCode: 200, headers, body: JSON.stringify({ profiles }) };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }) };
  }
}
