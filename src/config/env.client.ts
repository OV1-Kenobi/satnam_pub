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
  };
  flags: {
    lnbitsEnabled: boolean;
  };
};

export const clientConfig: ClientConfig = {
  lnbits: {
    baseUrl: import.meta.env.VITE_LNBITS_BASE_URL as string,
  },
  api: {
    baseUrl: (import.meta.env.VITE_API_BASE_URL as string) || "/api",
  },
  domains: {
    main: import.meta.env.VITE_SATNAM_DOMAIN as string,
    dashboard: import.meta.env.VITE_DASHBOARD_URL as string,
  },
  flags: {
    lnbitsEnabled:
      ((import.meta.env.VITE_LNBITS_INTEGRATION_ENABLED as string) ||
        "false")
        .toString()
        .toLowerCase() === "true",
  },
} as const;

// Validation (fail fast during app startup)
if (!clientConfig.lnbits.baseUrl) {
  throw new Error(
    "Missing required public environment variable: VITE_LNBITS_BASE_URL"
  );
}

