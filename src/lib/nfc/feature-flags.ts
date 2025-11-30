import { clientConfig, getEnvVar } from "../../config/env.client";

const ENV_ENABLE_NFC_AUTH =
  (getEnvVar("VITE_ENABLE_NFC_AUTH") || "false").toString().toLowerCase() ===
  "true";

const ENV_ENABLE_NFC_MFA =
  (getEnvVar("VITE_ENABLE_NFC_MFA") || "false").toString().toLowerCase() ===
  "true";

const ENV_NFC_TIMEOUT_MS = (() => {
  const value = parseInt(getEnvVar("VITE_NFC_TIMEOUT_MS") || "10000", 10);
  if (Number.isNaN(value)) return 10000;
  return Math.min(Math.max(value, 3000), 60000);
})();

/**
 * NFC-facing feature flag helpers.
 * Wraps clientConfig when available but falls back to env parsing for SSR.
 */
export const NfcFeatureFlags = {
  isNFCEnabled(): boolean {
    const flagFromConfig = clientConfig?.flags?.nfcAuthEnabled;
    return typeof flagFromConfig === "boolean"
      ? flagFromConfig
      : ENV_ENABLE_NFC_AUTH;
  },

  isNFCMFAEnabled(): boolean {
    const flagFromConfig = clientConfig?.flags?.nfcMfaEnabled;
    return typeof flagFromConfig === "boolean"
      ? flagFromConfig
      : ENV_ENABLE_NFC_MFA;
  },

  getNFCTimeoutMs(): number {
    const timeoutFromConfig = clientConfig?.flags?.nfcTimeoutMs;
    if (typeof timeoutFromConfig === "number" && timeoutFromConfig > 0) {
      return Math.min(Math.max(timeoutFromConfig, 3000), 60000);
    }
    return ENV_NFC_TIMEOUT_MS;
  },
};

export default NfcFeatureFlags;
