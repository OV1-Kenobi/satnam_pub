/**
 * Crypto Profile Installer
 * Manages partial crypto module loading for different app features
 * Reduces bundle size and improves loading performance
 */

import {
  configureCryptoStrategy,
  getCryptoEnvironmentInfo,
  preloadCryptoModules,
} from "../utils/crypto-factory";

// Define crypto profiles for different app features
export type CryptoProfile =
  | "minimal" // Basic hashing and random generation
  | "auth" // OTP, TOTP, basic encryption for authentication
  | "nostr" // Nostr key generation, NIP-07 compatibility
  | "messaging" // End-to-end encryption, gift wrapping
  | "recovery" // BIP39, HD wallets, key derivation
  | "full"; // All crypto features

interface CryptoModuleSet {
  modules: string[];
  description: string;
  size: "small" | "medium" | "large";
  dependencies?: CryptoProfile[];
}

const CRYPTO_PROFILES: Record<CryptoProfile, CryptoModuleSet> = {
  minimal: {
    modules: ["crypto-unified"],
    description: "Basic crypto utilities (hashing, random generation)",
    size: "small",
  },
  auth: {
    modules: ["crypto-unified", "crypto-lazy/totp", "crypto-lazy/hotp"],
    description: "Authentication crypto (OTP, TOTP, basic encryption)",
    size: "small",
    dependencies: ["minimal"],
  },
  nostr: {
    modules: ["crypto-modules/nostr", "nostr-tools", "@noble/secp256k1"],
    description: "Nostr protocol support (key generation, NIP-07)",
    size: "medium",
    dependencies: ["minimal"],
  },
  messaging: {
    modules: ["crypto-modules/hash", "nostr-tools/nip04", "nostr-tools/nip59"],
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
const loadedProfiles = new Set<CryptoProfile>();
const loadingProfiles = new Map<CryptoProfile, Promise<void>>();

/**
 * Install crypto profile with dependency resolution
 */
export async function installCryptoProfile(
  profile: CryptoProfile
): Promise<void> {
  if (loadedProfiles.has(profile)) {
    return; // Already loaded
  }

  if (loadingProfiles.has(profile)) {
    return await loadingProfiles.get(profile)!; // Already loading
  }

  const loadingPromise = loadProfileWithDependencies(profile);
  loadingProfiles.set(profile, loadingPromise);

  try {
    await loadingPromise;
    loadedProfiles.add(profile);
  } catch (error) {
    loadingProfiles.delete(profile);
    throw error;
  }
}

/**
 * Load profile with its dependencies
 */
async function loadProfileWithDependencies(
  profile: CryptoProfile
): Promise<void> {
  const profileConfig = CRYPTO_PROFILES[profile];

  // Load dependencies first
  if (profileConfig.dependencies) {
    await Promise.all(
      profileConfig.dependencies.map((dep) => installCryptoProfile(dep))
    );
  }

  console.log(
    `🔧 Installing crypto profile: ${profile} (${profileConfig.description})`
  );

  // Configure optimal strategy for the profile
  configureCryptoStrategy({
    enableCaching: true,
    preloadModules: true,
    preferBrowserCrypto: true,
  });

  // Load the modules for this profile
  try {
    await loadProfileModules(profile);
    console.log(`✅ Crypto profile installed: ${profile}`);
  } catch (error) {
    console.error(`❌ Failed to install crypto profile ${profile}:`, error);
    throw error;
  }
}

/**
 * Load specific modules for a profile
 */
async function loadProfileModules(profile: CryptoProfile): Promise<void> {
  const profileConfig = CRYPTO_PROFILES[profile];

  switch (profile) {
    case "minimal":
      // Already loaded with crypto-unified
      break;

    case "auth":
      // Load TOTP/HOTP functions
      const { generateTOTP, generateHOTP } = await import(
        "../utils/crypto-lazy"
      );
      // Cache these functions
      await generateTOTP("test", 0).catch(() => {}); // Warm up
      break;

    case "nostr":
      // Load Nostr crypto modules
      const { loadNostrCrypto } = await import("../utils/crypto-modules");
      await loadNostrCrypto();
      break;

    case "messaging":
      // Load messaging crypto
      const { loadHashCrypto } = await import("../utils/crypto-modules");
      await loadHashCrypto();
      break;

    case "recovery":
      // Load BIP crypto modules
      const { loadBipCrypto } = await import("../utils/crypto-modules");
      await loadBipCrypto();
      break;

    case "full":
      // Preload all crypto modules
      await preloadCryptoModules();
      break;
  }
}

/**
 * Check if a crypto profile is installed
 */
export function isCryptoProfileInstalled(profile: CryptoProfile): boolean {
  return loadedProfiles.has(profile);
}

/**
 * Get installed crypto profiles
 */
export function getInstalledCryptoProfiles(): CryptoProfile[] {
  return Array.from(loadedProfiles);
}

/**
 * Get crypto profile information
 */
export function getCryptoProfileInfo(profile: CryptoProfile) {
  return CRYPTO_PROFILES[profile];
}

/**
 * Smart profile installer - detects what profiles are needed based on usage
 */
export class SmartCryptoProfileInstaller {
  private detectedUsage = new Set<CryptoProfile>();
  private autoInstallEnabled = true;

  /**
   * Enable/disable automatic profile installation
   */
  setAutoInstall(enabled: boolean) {
    this.autoInstallEnabled = enabled;
  }

  /**
   * Detect crypto usage and install appropriate profile
   */
  async detectAndInstall(feature: string): Promise<void> {
    const profile = this.detectProfileNeeded(feature);

    if (profile && !isCryptoProfileInstalled(profile)) {
      this.detectedUsage.add(profile);

      if (this.autoInstallEnabled) {
        console.log(
          `🔍 Detected need for crypto profile: ${profile} (feature: ${feature})`
        );
        await installCryptoProfile(profile);
      }
    }
  }

  /**
   * Detect which crypto profile is needed for a feature
   */
  private detectProfileNeeded(feature: string): CryptoProfile | null {
    const featureMap: Record<string, CryptoProfile> = {
      // Authentication features
      totp: "auth",
      otp: "auth",
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
      mnemonic: "recovery",
      bip39: "recovery",
      seed: "recovery",
      hdwallet: "recovery",

      // Minimal features
      hash: "minimal",
      random: "minimal",
      uuid: "minimal",
    };

    return featureMap[feature.toLowerCase()] || null;
  }

  /**
   * Get detected usage patterns
   */
  getDetectedUsage(): CryptoProfile[] {
    return Array.from(this.detectedUsage);
  }

  /**
   * Install all detected profiles
   */
  async installDetectedProfiles(): Promise<void> {
    const profiles = Array.from(this.detectedUsage);
    await Promise.all(profiles.map((profile) => installCryptoProfile(profile)));
  }
}

// Create global instance
export const smartCryptoInstaller = new SmartCryptoProfileInstaller();

/**
 * Initialize crypto profiles based on app configuration
 */
export async function initializeCryptoProfiles(
  profiles: CryptoProfile[] = ["minimal"]
): Promise<void> {
  console.log("🚀 Initializing crypto profiles:", profiles);

  const envInfo = getCryptoEnvironmentInfo();
  console.log("🔍 Crypto environment:", {
    isBrowser: envInfo.isBrowser,
    hasWebCrypto: envInfo.hasWebCrypto,
    hasNodeCrypto: envInfo.hasNodeCrypto,
  });

  // Install requested profiles
  await Promise.all(profiles.map((profile) => installCryptoProfile(profile)));

  console.log("✅ Crypto profiles initialized successfully");
}

/**
 * Crypto profile middleware for detecting usage
 */
export function withCryptoProfile(feature: string) {
  return function <T extends (...args: any[]) => any>(target: T): T {
    return async function (...args: any[]) {
      await smartCryptoInstaller.detectAndInstall(feature);
      return await target.apply(this, args);
    } as T;
  };
}

// Export profile constants for external use
export const CRYPTO_PROFILE_INFO = CRYPTO_PROFILES;
