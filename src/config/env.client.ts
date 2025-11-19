/**
 * Client-safe environment configuration (Vite only)
 * - Public variables MUST use the VITE_* prefix
 * - No secrets here; safe for bundling in browser JS
 */

/**
 * Client-safe environment variable getter
 * Uses process.env, which Vite populates at build time via define in vite.config.js.
 * Safe for TOP-LEVEL module-level access in browser bundles.
 * @param key - Environment variable key
 * @returns Environment variable value or undefined
 */
export function getEnvVar(key: string): string | undefined {
  const env = (process.env || {}) as Record<string, string | undefined>;
  return env[key];
}

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
  blossom: {
    primaryUrl: string; // Primary Blossom server URL (Phase 5A: self-hosted)
    fallbackUrl: string; // Fallback Blossom server URL (Phase 5A: nostr.build)
    timeoutMs: number; // Request timeout before failover (Phase 5A)
    retryAttempts: number; // Number of retry attempts per server (Phase 5A)
    // Legacy support (Phase 4B compatibility)
    serverUrl: string; // Deprecated: use primaryUrl instead
  };
  nip85: {
    primaryRelay: string;
    cacheTTLMs: number;
    defaultExposureLevel: "public" | "contacts" | "whitelist" | "private";
  };
  simpleproof?: {
    dynamicFeeEstimationEnabled?: boolean; // Enable real-time fee estimation from Mempool.space
  };
  flags: {
    lnbitsEnabled: boolean;
    amberSigningEnabled: boolean;
    hybridIdentityEnabled: boolean; // Phase 1: Hybrid NIP-05 verification (kind:0 → PKARR → DNS)
    pkarrEnabled: boolean; // Phase 1: BitTorrent DHT PKARR integration
    multiMethodVerificationEnabled: boolean; // Phase 1 Week 4: Parallel multi-method verification with trust scoring
    simpleproofEnabled: boolean; // Phase 1: Identity Forge timestamp verification UI (OpenTimestamps primary; remote SimpleProof premium only)
    irohEnabled: boolean; // Phase 2: Iroh node discovery via DHT for decentralized verification
    nip03Enabled: boolean; // Phase 2 Week 3: NIP-03 OpenTimestamps attestations (master toggle)
    nip03IdentityCreationEnabled: boolean; // Phase 2 Week 3: NIP-03 attestations for identity creation
    relayPrivacyEnabled: boolean; // TIER 1: Relay privacy layer with per-relay batching
    tokenBindingEnabled: boolean; // TIER 1: Device fingerprint-based token binding
    timingAuditEnabled: boolean; // TIER 1: Timing attack prevention audit logging
    hierarchicalAdminEnabled: boolean; // Phase 1 Enterprise: Hierarchical admin dashboards
    bypassCodeEnabled: boolean; // Phase 1 Enterprise: Bypass code management
    recoveryCodeEnabled: boolean; // Phase 1 Enterprise: Recovery code management
    adminAuditLogEnabled: boolean; // Phase 1 Enterprise: Admin audit logging
    webauthnEnabled: boolean; // Phase 2 Enterprise: FIDO2/WebAuthn hardware security key support
    webauthnPlatformAuthenticatorEnabled: boolean; // Phase 2 Enterprise: Platform authenticators (Windows Hello, Touch ID, Face ID) with biometric risk warning
    nip85TrustProviderEnabled: boolean; // Phase 1: NIP-85 Trust Provider - Master toggle for all NIP-85 functionality
    nip85PublishingEnabled: boolean; // Phase 1: NIP-85 Publishing - Enable publishing assertions to Nostr
    nip85QueryEnabled: boolean; // Phase 1: NIP-85 Query - Enable querying assertions from relays
    nip85CacheEnabled: boolean; // Phase 1: NIP-85 Caching - Enable in-memory caching for performance
    nip85AuditLoggingEnabled: boolean; // Phase 1: NIP-85 Audit Logging - Enable audit logging for all queries
    // Family Federation Decoupling flags
    bifrostEnabled: boolean; // Family Federation: Enable BIFROST integration (preferred, default: false for MVP)
    fedimintIntegrationEnabled: boolean; // Family Federation: Enable Fedimint payment integration (legacy, default: false for MVP)
    familyFederationEnabled: boolean; // Family Federation: Enable core federation functionality (default: true)
    frostSigningEnabled: boolean; // Family Federation: Enable FROST multi-signature signing (default: true)
    paymentAutomationEnabled: boolean; // Family Federation: Enable payment automation (requires bifrostEnabled or fedimintIntegrationEnabled)
    // Phase 3: Public Profile URL System flags
    publicProfilesEnabled: boolean; // Phase 3: Enable Public Profile URL System (master toggle, default: false)
    profileSearchEnabled: boolean; // Phase 3: Enable profile search functionality (default: false)
    profileAnalyticsEnabled: boolean; // Phase 3: Enable privacy-first profile analytics (default: false)
    profileCustomizationEnabled: boolean; // Phase 3: Enable profile customization (themes, banners, social links, default: false)
    blossomUploadEnabled: boolean; // Phase 4B: Enable Blossom image uploads (default: false)
    // Phase 1: Tapsigner NFC Card Integration
    tapsignerEnabled: boolean; // Phase 1: Master toggle for Tapsigner integration
    tapsignerLnbitsEnabled: boolean; // Phase 1: LNbits integration for Tapsigner cards
    tapsignerTapToSpendEnabled: boolean; // Phase 1: Tap-to-spend payment functionality
    tapsignerDebugEnabled: boolean; // Phase 1: Debug logging for Tapsigner operations
  };
};

const LNBITS_ENABLED =
  (getEnvVar("VITE_LNBITS_INTEGRATION_ENABLED") || "false")
    .toString()
    .toLowerCase() === "true";

// Amber Android signer integration (NIP-46/NIP-55) feature flag; default: false (opt-in)
const AMBER_SIGNING_ENABLED =
  (getEnvVar("VITE_ENABLE_AMBER_SIGNING") || "false")
    .toString()
    .toLowerCase() === "true";

// Phase 1: Hybrid identity verification (kind:0 → PKARR → DNS); default: false
const HYBRID_IDENTITY_ENABLED =
  (getEnvVar("VITE_HYBRID_IDENTITY_ENABLED") || "false")
    .toString()
    .toLowerCase() === "true";

// Phase 1: BitTorrent DHT PKARR integration; default: false
const PKARR_ENABLED =
  (getEnvVar("VITE_PKARR_ENABLED") || "false").toString().toLowerCase() ===
  "true";

// Phase 1 Week 4: Parallel multi-method verification with trust scoring; default: false
const MULTI_METHOD_VERIFICATION_ENABLED =
  (getEnvVar("VITE_MULTI_METHOD_VERIFICATION_ENABLED") || "false")
    .toString()
    .toLowerCase() === "true";

// Phase 1: Identity Forge timestamp verification UI (OpenTimestamps-based Bitcoin anchoring); default: false
const SIMPLEPROOF_ENABLED =
  (getEnvVar("VITE_SIMPLEPROOF_ENABLED") || "false")
    .toString()
    .toLowerCase() === "true";

// Phase 2: Iroh node discovery via DHT for decentralized verification; default: false
const IROH_ENABLED =
  (getEnvVar("VITE_IROH_ENABLED") || "false").toString().toLowerCase() ===
  "true";

// Phase 2 Week 3: NIP-03 OpenTimestamps attestations (master toggle); default: false
const NIP03_ENABLED =
  (getEnvVar("VITE_NIP03_ENABLED") || "false").toString().toLowerCase() ===
  "true";

// Phase 2 Week 3: NIP-03 attestations for identity creation; default: false
const NIP03_IDENTITY_CREATION_ENABLED =
  (getEnvVar("VITE_NIP03_IDENTITY_CREATION") || "false")
    .toString()
    .toLowerCase() === "true";

// TIER 1: Relay privacy layer with per-relay batching; default: true (enabled after testing)
const RELAY_PRIVACY_ENABLED =
  (getEnvVar("VITE_RELAY_PRIVACY_ENABLED") || "true")
    .toString()
    .toLowerCase() === "true";

// TIER 1: Device fingerprint-based token binding; default: true (enabled after testing)
const TOKEN_BINDING_ENABLED =
  (getEnvVar("VITE_TOKEN_BINDING_ENABLED") || "true")
    .toString()
    .toLowerCase() === "true";

// TIER 1: Timing attack prevention audit logging; default: false (opt-in for debugging)
const TIMING_AUDIT_ENABLED =
  (getEnvVar("VITE_TIMING_AUDIT_ENABLED") || "false")
    .toString()
    .toLowerCase() === "true";

// Phase 1 Enterprise: Hierarchical admin dashboards; default: false
const HIERARCHICAL_ADMIN_ENABLED =
  (getEnvVar("VITE_HIERARCHICAL_ADMIN_ENABLED") || "false")
    .toString()
    .toLowerCase() === "true";

// Phase 1 Enterprise: Bypass code management; default: false
const BYPASS_CODE_ENABLED =
  (getEnvVar("VITE_BYPASS_CODE_ENABLED") || "false")
    .toString()
    .toLowerCase() === "true";

// Phase 1 Enterprise: Recovery code management; default: false
const RECOVERY_CODE_ENABLED =
  (getEnvVar("VITE_RECOVERY_CODE_ENABLED") || "false")
    .toString()
    .toLowerCase() === "true";

// Phase 1 Enterprise: Admin audit logging; default: false
const ADMIN_AUDIT_LOG_ENABLED =
  (getEnvVar("VITE_ADMIN_AUDIT_LOG_ENABLED") || "false")
    .toString()
    .toLowerCase() === "true";

// Phase 2 Enterprise: FIDO2/WebAuthn hardware security key support; default: false
const WEBAUTHN_ENABLED =
  (getEnvVar("VITE_WEBAUTHN_ENABLED") || "false").toString().toLowerCase() ===
  "true";

// Phase 2 Enterprise: Platform authenticators (Windows Hello, Touch ID, Face ID); default: false
// WARNING: Platform authenticators are less secure than hardware keys due to biometric risks
const WEBAUTHN_PLATFORM_AUTHENTICATOR_ENABLED =
  (getEnvVar("VITE_WEBAUTHN_PLATFORM_AUTHENTICATOR_ENABLED") || "false")
    .toString()
    .toLowerCase() === "true";

// Phase 1: NIP-85 Trust Provider - Master toggle for all NIP-85 functionality; default: false
const NIP85_TRUST_PROVIDER_ENABLED =
  (getEnvVar("VITE_NIP85_TRUST_PROVIDER_ENABLED") || "false")
    .toString()
    .toLowerCase() === "true";

// Phase 1: NIP-85 Publishing - Enable publishing assertions to Nostr; default: false
const NIP85_PUBLISHING_ENABLED =
  (getEnvVar("VITE_NIP85_PUBLISHING_ENABLED") || "false")
    .toString()
    .toLowerCase() === "true";

// Phase 1: NIP-85 Query - Enable querying assertions from relays; default: true
const NIP85_QUERY_ENABLED =
  (getEnvVar("VITE_NIP85_QUERY_ENABLED") || "true").toString().toLowerCase() ===
  "true";

// Phase 1: NIP-85 Caching - Enable in-memory caching for performance; default: true
const NIP85_CACHE_ENABLED =
  (getEnvVar("VITE_NIP85_CACHE_ENABLED") || "true").toString().toLowerCase() ===
  "true";

// Phase 1: NIP-85 Audit Logging - Enable audit logging for all queries; default: true
const NIP85_AUDIT_LOGGING_ENABLED =
  (getEnvVar("VITE_NIP85_AUDIT_LOGGING_ENABLED") || "true")
    .toString()
    .toLowerCase() === "true";

// Family Federation Decoupling: Enable BIFROST integration (preferred); default: false (MVP without payments)
const BIFROST_ENABLED =
  (getEnvVar("VITE_BIFROST_ENABLED") || "false").toString().toLowerCase() ===
  "true";

// Family Federation Decoupling: Enable Fedimint payment integration (legacy); default: false (MVP without payments)
const FEDIMINT_INTEGRATION_ENABLED =
  (getEnvVar("VITE_FEDIMINT_INTEGRATION_ENABLED") || "false")
    .toString()
    .toLowerCase() === "true";

// Family Federation Decoupling: Enable core federation functionality; default: true
const FAMILY_FEDERATION_ENABLED =
  (getEnvVar("VITE_FAMILY_FEDERATION_ENABLED") || "true")
    .toString()
    .toLowerCase() === "true";

// Family Federation Decoupling: Enable FROST multi-signature signing; default: true
const FROST_SIGNING_ENABLED =
  (getEnvVar("VITE_FROST_SIGNING_ENABLED") || "true")
    .toString()
    .toLowerCase() === "true";

// Family Federation Decoupling: Enable payment automation; default: false (requires fedimintIntegrationEnabled)
const PAYMENT_AUTOMATION_ENABLED =
  (getEnvVar("VITE_PAYMENT_AUTOMATION_ENABLED") || "false")
    .toString()
    .toLowerCase() === "true";

// Phase 3: Public Profile URL System - Master toggle; default: false (opt-in)
const PUBLIC_PROFILES_ENABLED =
  (getEnvVar("VITE_PUBLIC_PROFILES_ENABLED") || "false")
    .toString()
    .toLowerCase() === "true";

// Phase 3: Profile search functionality; default: false (opt-in)
const PROFILE_SEARCH_ENABLED =
  (getEnvVar("VITE_PROFILE_SEARCH_ENABLED") || "false")
    .toString()
    .toLowerCase() === "true";

// Phase 3: Privacy-first profile analytics; default: false (opt-in)
const PROFILE_ANALYTICS_ENABLED =
  (getEnvVar("VITE_PROFILE_ANALYTICS_ENABLED") || "false")
    .toString()
    .toLowerCase() === "true";

// Phase 3: Profile customization (themes, banners, social links); default: false (opt-in)
const PROFILE_CUSTOMIZATION_ENABLED =
  (getEnvVar("VITE_PROFILE_CUSTOMIZATION_ENABLED") || "false")
    .toString()
    .toLowerCase() === "true";

// Phase 4B: Blossom image uploads; default: false (opt-in)
const BLOSSOM_UPLOAD_ENABLED =
  (getEnvVar("VITE_BLOSSOM_UPLOAD_ENABLED") || "false")
    .toString()
    .toLowerCase() === "true";

// Phase 1: Tapsigner NFC Card Integration - Master toggle; default: true
const TAPSIGNER_ENABLED =
  (getEnvVar("VITE_TAPSIGNER_ENABLED") || "true").toString().toLowerCase() ===
  "true";

// Phase 1: Tapsigner LNbits integration; default: true
const TAPSIGNER_LNBITS_ENABLED =
  (getEnvVar("VITE_TAPSIGNER_LNBITS_ENABLED") || "true")
    .toString()
    .toLowerCase() === "true";

// Phase 1: Tapsigner tap-to-spend payment functionality; default: true
const TAPSIGNER_TAP_TO_SPEND_ENABLED =
  (getEnvVar("VITE_TAPSIGNER_TAP_TO_SPEND_ENABLED") || "true")
    .toString()
    .toLowerCase() === "true";

// Phase 1: Tapsigner debug logging; default: false (opt-in for development)
const TAPSIGNER_DEBUG_ENABLED =
  (getEnvVar("VITE_TAPSIGNER_DEBUG") || "false").toString().toLowerCase() ===
  "true";

export const clientConfig: ClientConfig = {
  lnbits: {
    // Only required when LNbits integration is enabled
    baseUrl: getEnvVar("VITE_LNBITS_BASE_URL") || "",
  },
  api: {
    baseUrl: getEnvVar("VITE_API_BASE_URL") || "/api",
  },
  domains: {
    main: getEnvVar("VITE_SATNAM_DOMAIN"),
    dashboard: getEnvVar("VITE_DASHBOARD_URL"),
    platformLightning:
      getEnvVar("VITE_PLATFORM_LIGHTNING_DOMAIN") || "my.satnam.pub",
  },
  blossom: {
    // Phase 5A: Multi-server support with automatic failover
    primaryUrl:
      getEnvVar("VITE_BLOSSOM_PRIMARY_URL") ||
      getEnvVar("VITE_BLOSSOM_NOSTR_BUILD_URL") || // Legacy fallback
      "https://blossom.nostr.build",
    fallbackUrl:
      getEnvVar("VITE_BLOSSOM_FALLBACK_URL") || "https://blossom.nostr.build",
    timeoutMs: parseInt(getEnvVar("VITE_BLOSSOM_TIMEOUT_MS") || "30000", 10),
    retryAttempts: parseInt(
      getEnvVar("VITE_BLOSSOM_RETRY_ATTEMPTS") || "2",
      10
    ),
    // Legacy support (Phase 4B compatibility)
    serverUrl:
      getEnvVar("VITE_BLOSSOM_NOSTR_BUILD_URL") ||
      "https://blossom.nostr.build",
  },
  nip85: {
    primaryRelay:
      getEnvVar("VITE_NIP85_PRIMARY_RELAY") || "wss://relay.satnam.pub",
    cacheTTLMs: parseInt(getEnvVar("VITE_NIP85_CACHE_TTL_MS") || "300000", 10),
    defaultExposureLevel: (getEnvVar("VITE_NIP85_DEFAULT_EXPOSURE_LEVEL") ||
      "private") as "public" | "contacts" | "whitelist" | "private",
  },
  simpleproof: {
    dynamicFeeEstimationEnabled: true, // Always enabled - core feature
  },
  flags: {
    lnbitsEnabled: LNBITS_ENABLED,
    amberSigningEnabled: AMBER_SIGNING_ENABLED,
    hybridIdentityEnabled: HYBRID_IDENTITY_ENABLED,
    pkarrEnabled: PKARR_ENABLED,
    multiMethodVerificationEnabled: MULTI_METHOD_VERIFICATION_ENABLED,
    simpleproofEnabled: SIMPLEPROOF_ENABLED,
    irohEnabled: IROH_ENABLED,
    nip03Enabled: NIP03_ENABLED,
    nip03IdentityCreationEnabled: NIP03_IDENTITY_CREATION_ENABLED,
    relayPrivacyEnabled: RELAY_PRIVACY_ENABLED,
    tokenBindingEnabled: TOKEN_BINDING_ENABLED,
    timingAuditEnabled: TIMING_AUDIT_ENABLED,
    hierarchicalAdminEnabled: HIERARCHICAL_ADMIN_ENABLED,
    bypassCodeEnabled: BYPASS_CODE_ENABLED,
    recoveryCodeEnabled: RECOVERY_CODE_ENABLED,
    adminAuditLogEnabled: ADMIN_AUDIT_LOG_ENABLED,
    webauthnEnabled: WEBAUTHN_ENABLED,
    webauthnPlatformAuthenticatorEnabled:
      WEBAUTHN_PLATFORM_AUTHENTICATOR_ENABLED,
    nip85TrustProviderEnabled: NIP85_TRUST_PROVIDER_ENABLED,
    nip85PublishingEnabled: NIP85_PUBLISHING_ENABLED,
    nip85QueryEnabled: NIP85_QUERY_ENABLED,
    nip85CacheEnabled: NIP85_CACHE_ENABLED,
    nip85AuditLoggingEnabled: NIP85_AUDIT_LOGGING_ENABLED,
    // Family Federation Decoupling flags
    bifrostEnabled: BIFROST_ENABLED,
    fedimintIntegrationEnabled: FEDIMINT_INTEGRATION_ENABLED,
    familyFederationEnabled: FAMILY_FEDERATION_ENABLED,
    frostSigningEnabled: FROST_SIGNING_ENABLED,
    paymentAutomationEnabled: PAYMENT_AUTOMATION_ENABLED,
    // Phase 3: Public Profile URL System flags
    publicProfilesEnabled: PUBLIC_PROFILES_ENABLED,
    profileSearchEnabled: PROFILE_SEARCH_ENABLED,
    profileAnalyticsEnabled: PROFILE_ANALYTICS_ENABLED,
    profileCustomizationEnabled: PROFILE_CUSTOMIZATION_ENABLED,
    // Phase 4B: Banner Management flags
    blossomUploadEnabled: BLOSSOM_UPLOAD_ENABLED,
    // Phase 1: Tapsigner NFC Card Integration
    tapsignerEnabled: TAPSIGNER_ENABLED,
    tapsignerLnbitsEnabled: TAPSIGNER_LNBITS_ENABLED,
    tapsignerTapToSpendEnabled: TAPSIGNER_TAP_TO_SPEND_ENABLED,
    tapsignerDebugEnabled: TAPSIGNER_DEBUG_ENABLED,
  },
} as const;

// Validation (fail fast during app startup)
// VITE_LNBITS_BASE_URL is required only if LNbits integration is enabled
if (clientConfig.flags.lnbitsEnabled && !clientConfig.lnbits.baseUrl) {
  throw new Error(
    "Missing required public environment variable: VITE_LNBITS_BASE_URL (required when VITE_LNBITS_INTEGRATION_ENABLED=true)"
  );
}
