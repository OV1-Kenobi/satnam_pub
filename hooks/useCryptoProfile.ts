/**
 * React hook for crypto profile management
 */

import { useEffect, useState } from "react";
import {
  CryptoProfile,
  installCryptoProfile,
  isCryptoProfileInstalled,
  smartCryptoInstaller,
} from "../lib/crypto-profile-installer.js";

interface UseCryptoProfileOptions {
  autoInstall?: boolean;
  feature?: string;
}

export function useCryptoProfile(
  profile: CryptoProfile,
  options: UseCryptoProfileOptions = {}
) {
  const [isInstalled, setIsInstalled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const { autoInstall = true, feature } = options;

  useEffect(() => {
    const checkAndInstall = async () => {
      if (isCryptoProfileInstalled(profile)) {
        setIsInstalled(true);
        return;
      }

      if (autoInstall) {
        setIsLoading(true);
        setError(null);

        try {
          if (feature) {
            await smartCryptoInstaller.detectAndInstall(feature);
          } else {
            await installCryptoProfile(profile);
          }
          setIsInstalled(true);
        } catch (err) {
          setError(
            err instanceof Error
              ? err
              : new Error("Failed to install crypto profile")
          );
        } finally {
          setIsLoading(false);
        }
      }
    };

    checkAndInstall();
  }, [profile, autoInstall, feature]);

  return {
    isInstalled,
    isLoading,
    error,
    install: async () => {
      if (isInstalled) return;

      setIsLoading(true);
      setError(null);

      try {
        await installCryptoProfile(profile);
        setIsInstalled(true);
      } catch (err) {
        setError(
          err instanceof Error
            ? err
            : new Error("Failed to install crypto profile")
        );
      } finally {
        setIsLoading(false);
      }
    },
  };
}

/**
 * Hook for multiple crypto profiles
 */
export function useCryptoProfiles(profiles: CryptoProfile[]) {
  const [installedProfiles, setInstalledProfiles] = useState<
    Set<CryptoProfile>
  >(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const installProfiles = async () => {
      const missingProfiles = profiles.filter(
        (profile) => !isCryptoProfileInstalled(profile)
      );

      if (missingProfiles.length === 0) {
        setInstalledProfiles(new Set(profiles));
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        await Promise.all(
          missingProfiles.map((profile) => installCryptoProfile(profile))
        );
        setInstalledProfiles(new Set(profiles));
      } catch (err) {
        setError(
          err instanceof Error
            ? err
            : new Error("Failed to install crypto profiles")
        );
      } finally {
        setIsLoading(false);
      }
    };

    installProfiles();
  }, [profiles]);

  return {
    installedProfiles: Array.from(installedProfiles),
    allInstalled: installedProfiles.size === profiles.length,
    isLoading,
    error,
  };
}

/**
 * Hook for OTP/TOTP functionality
 */
export function useOTPCrypto() {
  return useCryptoProfile("auth", { feature: "otp" });
}

/**
 * Hook for Nostr functionality
 */
export function useNostrCrypto() {
  return useCryptoProfile("nostr", { feature: "nostr" });
}

/**
 * Hook for messaging/encryption functionality
 */
export function useMessagingCrypto() {
  return useCryptoProfile("messaging", { feature: "messaging" });
}

/**
 * Hook for wallet recovery functionality
 */
export function useRecoveryCrypto() {
  return useCryptoProfile("recovery", { feature: "recovery" });
}
