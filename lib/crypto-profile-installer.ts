/**
 * Browser-friendly wrapper around the crypto profile installer
 * Provides a stable API for hooks/useCryptoProfile.ts
 */

// Re-export type for convenience
export type CryptoProfile =
  | "minimal"
  | "auth"
  | "nostr"
  | "messaging"
  | "recovery"
  | "full";

// Import the singleton installer from the Netlify functions module
// Note: This module is browser-compatible (uses dynamic imports only)
import cryptoProfileInstaller, {
  CryptoProfileInstaller,
} from "../netlify/functions/crypto-profile-installer.js";

/**
 * Check if a crypto profile is already installed (loaded)
 */
export function isCryptoProfileInstalled(profile: CryptoProfile): boolean {
  return cryptoProfileInstaller.isProfileLoaded(profile);
}

/**
 * Install a crypto profile (and dependencies) on demand
 */
export async function installCryptoProfile(
  profile: CryptoProfile
): Promise<void> {
  await cryptoProfileInstaller.installProfile(profile);
}

/**
 * Smart installer namespace for feature-based installation
 */
export const smartCryptoInstaller = {
  /**
   * Detect which profile a feature needs and install it
   * @returns Installed profile name or null if no match
   */
  async detectAndInstall(feature: string): Promise<CryptoProfile | null> {
    // Delegate to the underlying installer
    return cryptoProfileInstaller.installForFeature(feature) as Promise<
      CryptoProfile | null
    >;
  },
};

// Optional: expose the class for advanced scenarios (not used by hooks)
export { CryptoProfileInstaller };

