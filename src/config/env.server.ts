/**
 * Server-only environment configuration (Netlify Functions, scripts, tests)
 * - DO NOT import this from browser code
 * - Uses process.env exclusively
 */

export type ServerConfig = {
  lnbits: {
    baseUrl: string;
    adminKey?: string; // Prefer LNBITS_ADMIN_KEY; fallback to LNBITS_BOOTSTRAP_ADMIN_KEY
  };
  phoenixd: {
    apiUrl: string;
    apiPassword: string;
  };
  security: {
    keyEncSecret?: string; // Optional extra secret used for app-level crypto helpers
  };
};

if (typeof window !== "undefined") {
  throw new Error(
    "env.server.ts was imported in a browser environment. This file is server-only."
  );
}

const must = (v: string | undefined, name: string): string => {
  if (!v) throw new Error(`Missing required server env var: ${name}`);
  return v;
};

export const serverConfig: ServerConfig = {
  lnbits: {
    baseUrl: must(process.env.LNBITS_BASE_URL, "LNBITS_BASE_URL"),
    adminKey:
      process.env.LNBITS_ADMIN_KEY || process.env.LNBITS_BOOTSTRAP_ADMIN_KEY,
  },
  phoenixd: {
    apiUrl: must(process.env.PHOENIXD_API_URL, "PHOENIXD_API_URL"),
    apiPassword: must(process.env.PHOENIXD_API_PASSWORD, "PHOENIXD_API_PASSWORD"),
  },
  security: {
    keyEncSecret: process.env.LNBITS_KEY_ENC_SECRET || process.env.DUID_SERVER_SECRET,
  },
};

