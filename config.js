/**
 * Configuration module - JavaScript version for API endpoints
 * MASTER CONTEXT COMPLIANCE: Environment-based configuration
 */

function getEnvVar(key, defaultValue) {
  if (typeof import.meta !== "undefined" && import.meta.env) {
    return import.meta.env[key] || defaultValue || "";
  }
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
  pubky: {
    homeserverUrl: getEnvVar("VITE_PUBKY_HOMESERVER_URL", "https://pubky.app"),
    pkarrRelays: getEnvVar("VITE_PKARR_RELAYS", "relay1,relay2").split(","),
    enableMigration: getEnvVar("VITE_PUBKY_ENABLE_MIGRATION", "true"),
    sovereigntyTracking: getEnvVar("VITE_PUBKY_SOVEREIGNTY_TRACKING", "true"),
  },
  pkarr: {
    relayTimeout: getEnvVar("VITE_PKARR_RELAY_TIMEOUT", "5000"),
    recordTtl: getEnvVar("VITE_PKARR_RECORD_TTL", "3600"),
    backupRelays: getEnvVar("VITE_PKARR_BACKUP_RELAYS", "3"),
    publishRetries: getEnvVar("VITE_PKARR_PUBLISH_RETRIES", "3"),
  },
  nostr: {
    relays: getEnvVar(
      "VITE_NOSTR_RELAYS",
      "wss://relay.damus.io,wss://nos.lol"
    ).split(","),
    defaultKind: parseInt(getEnvVar("VITE_NOSTR_DEFAULT_KIND", "1")),
    privateKey: getEnvVar("VITE_NOSTR_PRIVATE_KEY", ""),
    nostrAuthChallenge: getEnvVar(
      "VITE_NOSTR_AUTH_CHALLENGE",
      "satnam-auth-challenge"
    ),
    nostrAuthKind: parseInt(getEnvVar("VITE_NOSTR_AUTH_KIND", "22242")),
  },
  lightning: {
    defaultNode: getEnvVar("VITE_LIGHTNING_DEFAULT_NODE", "voltage"),
    networkTimeout: parseInt(
      getEnvVar("VITE_LIGHTNING_NETWORK_TIMEOUT", "30000")
    ),
  },
  privacy: {
    encryptionAlgorithm: getEnvVar(
      "VITE_PRIVACY_ENCRYPTION_ALGORITHM",
      "AES-GCM"
    ),
    keyDerivationIterations: parseInt(
      getEnvVar("VITE_PRIVACY_KEY_DERIVATION_ITERATIONS", "100000")
    ),
  },
  federation: {
    defaultRole: getEnvVar("VITE_FEDERATION_DEFAULT_ROLE", "offspring"),
    approvalThreshold: parseInt(
      getEnvVar("VITE_FEDERATION_APPROVAL_THRESHOLD", "25000")
    ),
  },
  development: {
    enableDebugLogs: getEnvVar("VITE_ENABLE_DEBUG_LOGS", "false") === "true",
    mockServices: getEnvVar("VITE_MOCK_SERVICES", "false") === "true",
  },
  api: {
    baseUrl: getEnvVar("VITE_API_BASE_URL", "https://api.satnam.pub"),
    timeout: parseInt(getEnvVar("VITE_API_TIMEOUT", "30000")),
  },
  nip05: {
    verificationEndpoint: getEnvVar(
      "VITE_NIP05_VERIFICATION_ENDPOINT",
      "https://api.satnam.pub/.well-known/nostr.json"
    ),
    allowedDomains: getEnvVar(
      "VITE_NIP05_ALLOWED_DOMAINS",
      "satnam.pub,citadel.academy"
    ).split(","),
  },
};

// Legacy export for compatibility
export const authConfig = {
  relayUrl: config.nostr.relays[0] || "wss://relay.damus.io",
  nostrAuthChallenge: config.nostr.nostrAuthChallenge,
  nostrAuthKind: config.nostr.nostrAuthKind,
  ...config,
};
