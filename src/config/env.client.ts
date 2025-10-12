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
  };
};

const LNBITS_ENABLED =
  ((process.env.VITE_LNBITS_INTEGRATION_ENABLED as string) || "false")
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
  },
} as const;

// Validation (fail fast during app startup)
// VITE_LNBITS_BASE_URL is required only if LNbits integration is enabled
if (clientConfig.flags.lnbitsEnabled && !clientConfig.lnbits.baseUrl) {
  throw new Error(
    "Missing required public environment variable: VITE_LNBITS_BASE_URL (required when VITE_LNBITS_INTEGRATION_ENABLED=true)"
  );
}
