/**
 * Netlify Functions Configuration
 * MASTER CONTEXT COMPLIANCE: Environment-based configuration for Netlify
 */

function getEnvVar(key: string, defaultValue?: string): string {
  if (typeof process !== "undefined" && process.env) {
    return process.env[key] || defaultValue || "";
  }
  return defaultValue || "";
}

export const config = {
  supabase: {
    url: getEnvVar("VITE_SUPABASE_URL", "https://default.supabase.co"),
    anonKey: getEnvVar("VITE_SUPABASE_ANON_KEY", "default-key"),
  },
  database: {
    connectionString: getEnvVar("DATABASE_URL", ""),
    maxConnections: parseInt(getEnvVar("DATABASE_MAX_CONNECTIONS", "10")),
    host: getEnvVar("DATABASE_HOST", "localhost"),
    port: parseInt(getEnvVar("DATABASE_PORT", "5432")),
    name: getEnvVar("DATABASE_NAME", "satnam"),
    user: getEnvVar("DATABASE_USER", "postgres"),
    password: getEnvVar("DATABASE_PASSWORD", ""),
    ssl: getEnvVar("DATABASE_SSL", "false") === "true",
  },
  security: {
    jwtSecret: getEnvVar("JWT_SECRET", "default-secret"),
    encryptionKey: getEnvVar("ENCRYPTION_KEY", "default-key"),
  },
  nostr: {
    relays: getEnvVar(
      "NOSTR_RELAYS",
      "wss://relay.damus.io,wss://nos.lol"
    ).split(","),
    privateKey: getEnvVar("NOSTR_PRIVATE_KEY", ""),
  },
  api: {
    baseUrl: getEnvVar("API_BASE_URL", "https://api.satnam.pub"),
    timeout: parseInt(getEnvVar("API_TIMEOUT", "30000")),
  },
};
