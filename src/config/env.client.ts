/**
 * Client-safe environment configuration (Vite only)
 * - Public variables MUST use the VITE_* prefix
 * - No secrets here; safe for bundling in browser JS
 */

export type ClientConfig = {
  lnbits: {
    baseUrl: string;
  };
  api: {
    baseUrl: string; // Proxy base for browser API calls
  };
  domains: {
    main?: string;
    dashboard?: string;
    platformLightning?: string; // Lightning Address domain (e.g., my.satnam.pub)
  };
  flags: {
    lnbitsEnabled: boolean;
    amberSigningEnabled: boolean;
    hybridIdentityEnabled: boolean; // Phase 1: Hybrid NIP-05 verification (kind:0 → PKARR → DNS)
    pkarrEnabled: boolean; // Phase 1: BitTorrent DHT PKARR integration
    multiMethodVerificationEnabled: boolean; // Phase 1 Week 4: Parallel multi-method verification with trust scoring
  };
};

const LNBITS_ENABLED =
  ((process.env.VITE_LNBITS_INTEGRATION_ENABLED as string) || "false")
    .toString()
    .toLowerCase() === "true";

// Amber Android signer integration (NIP-46/NIP-55) feature flag; default: false (opt-in)
const AMBER_SIGNING_ENABLED =
  ((process.env.VITE_ENABLE_AMBER_SIGNING as string) || "false")
    .toString()
    .toLowerCase() === "true";

// Phase 1: Hybrid identity verification (kind:0 → PKARR → DNS); default: false
const HYBRID_IDENTITY_ENABLED =
  ((process.env.VITE_HYBRID_IDENTITY_ENABLED as string) || "false")
    .toString()
    .toLowerCase() === "true";

// Phase 1: BitTorrent DHT PKARR integration; default: false
const PKARR_ENABLED =
  ((process.env.VITE_PKARR_ENABLED as string) || "false")
    .toString()
    .toLowerCase() === "true";

// Phase 1 Week 4: Parallel multi-method verification with trust scoring; default: false
const MULTI_METHOD_VERIFICATION_ENABLED =
  ((process.env.VITE_MULTI_METHOD_VERIFICATION_ENABLED as string) || "false")
    .toString()
    .toLowerCase() === "true";

export const clientConfig: ClientConfig = {
  lnbits: {
    // Only required when LNbits integration is enabled
    baseUrl: (process.env.VITE_LNBITS_BASE_URL as string) || "",
  },
  api: {
    baseUrl: (process.env.VITE_API_BASE_URL as string) || "/api",
  },
  domains: {
    main: process.env.VITE_SATNAM_DOMAIN as string,
    dashboard: process.env.VITE_DASHBOARD_URL as string,
    platformLightning:
      (process.env.VITE_PLATFORM_LIGHTNING_DOMAIN as string) || "my.satnam.pub",
  },
  flags: {
    lnbitsEnabled: LNBITS_ENABLED,
    amberSigningEnabled: AMBER_SIGNING_ENABLED,
    hybridIdentityEnabled: HYBRID_IDENTITY_ENABLED,
    pkarrEnabled: PKARR_ENABLED,
    multiMethodVerificationEnabled: MULTI_METHOD_VERIFICATION_ENABLED,
  },
} as const;

// Validation (fail fast during app startup)
// VITE_LNBITS_BASE_URL is required only if LNbits integration is enabled
if (clientConfig.flags.lnbitsEnabled && !clientConfig.lnbits.baseUrl) {
  throw new Error(
    "Missing required public environment variable: VITE_LNBITS_BASE_URL (required when VITE_LNBITS_INTEGRATION_ENABLED=true)"
  );
}
