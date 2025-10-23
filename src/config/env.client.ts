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
  nip85: {
    primaryRelay: string;
    cacheTTLMs: number;
    defaultExposureLevel: "public" | "contacts" | "whitelist" | "private";
  };
  flags: {
    lnbitsEnabled: boolean;
    amberSigningEnabled: boolean;
    hybridIdentityEnabled: boolean; // Phase 1: Hybrid NIP-05 verification (kind:0 → PKARR → DNS)
    pkarrEnabled: boolean; // Phase 1: BitTorrent DHT PKARR integration
    multiMethodVerificationEnabled: boolean; // Phase 1 Week 4: Parallel multi-method verification with trust scoring
    simpleproofEnabled: boolean; // Phase 1: SimpleProof timestamping with OpenTimestamps and Bitcoin anchoring
    irohEnabled: boolean; // Phase 2: Iroh node discovery via DHT for decentralized verification
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

// Phase 1: SimpleProof timestamping with OpenTimestamps and Bitcoin anchoring; default: false
const SIMPLEPROOF_ENABLED =
  ((process.env.VITE_SIMPLEPROOF_ENABLED as string) || "false")
    .toString()
    .toLowerCase() === "true";

// Phase 2: Iroh node discovery via DHT for decentralized verification; default: false
const IROH_ENABLED =
  ((process.env.VITE_IROH_ENABLED as string) || "false")
    .toString()
    .toLowerCase() === "true";

// TIER 1: Relay privacy layer with per-relay batching; default: true (enabled after testing)
const RELAY_PRIVACY_ENABLED =
  ((process.env.VITE_RELAY_PRIVACY_ENABLED as string) || "true")
    .toString()
    .toLowerCase() === "true";

// TIER 1: Device fingerprint-based token binding; default: true (enabled after testing)
const TOKEN_BINDING_ENABLED =
  ((process.env.VITE_TOKEN_BINDING_ENABLED as string) || "true")
    .toString()
    .toLowerCase() === "true";

// TIER 1: Timing attack prevention audit logging; default: false (opt-in for debugging)
const TIMING_AUDIT_ENABLED =
  ((process.env.VITE_TIMING_AUDIT_ENABLED as string) || "false")
    .toString()
    .toLowerCase() === "true";

// Phase 1 Enterprise: Hierarchical admin dashboards; default: false
const HIERARCHICAL_ADMIN_ENABLED =
  ((process.env.VITE_HIERARCHICAL_ADMIN_ENABLED as string) || "false")
    .toString()
    .toLowerCase() === "true";

// Phase 1 Enterprise: Bypass code management; default: false
const BYPASS_CODE_ENABLED =
  ((process.env.VITE_BYPASS_CODE_ENABLED as string) || "false")
    .toString()
    .toLowerCase() === "true";

// Phase 1 Enterprise: Recovery code management; default: false
const RECOVERY_CODE_ENABLED =
  ((process.env.VITE_RECOVERY_CODE_ENABLED as string) || "false")
    .toString()
    .toLowerCase() === "true";

// Phase 1 Enterprise: Admin audit logging; default: false
const ADMIN_AUDIT_LOG_ENABLED =
  ((process.env.VITE_ADMIN_AUDIT_LOG_ENABLED as string) || "false")
    .toString()
    .toLowerCase() === "true";

// Phase 2 Enterprise: FIDO2/WebAuthn hardware security key support; default: false
const WEBAUTHN_ENABLED =
  ((process.env.VITE_WEBAUTHN_ENABLED as string) || "false")
    .toString()
    .toLowerCase() === "true";

// Phase 2 Enterprise: Platform authenticators (Windows Hello, Touch ID, Face ID); default: false
// WARNING: Platform authenticators are less secure than hardware keys due to biometric risks
const WEBAUTHN_PLATFORM_AUTHENTICATOR_ENABLED =
  (
    (process.env.VITE_WEBAUTHN_PLATFORM_AUTHENTICATOR_ENABLED as string) ||
    "false"
  )
    .toString()
    .toLowerCase() === "true";

// Phase 1: NIP-85 Trust Provider - Master toggle for all NIP-85 functionality; default: false
const NIP85_TRUST_PROVIDER_ENABLED =
  ((process.env.VITE_NIP85_TRUST_PROVIDER_ENABLED as string) || "false")
    .toString()
    .toLowerCase() === "true";

// Phase 1: NIP-85 Publishing - Enable publishing assertions to Nostr; default: false
const NIP85_PUBLISHING_ENABLED =
  ((process.env.VITE_NIP85_PUBLISHING_ENABLED as string) || "false")
    .toString()
    .toLowerCase() === "true";

// Phase 1: NIP-85 Query - Enable querying assertions from relays; default: true
const NIP85_QUERY_ENABLED =
  ((process.env.VITE_NIP85_QUERY_ENABLED as string) || "true")
    .toString()
    .toLowerCase() === "true";

// Phase 1: NIP-85 Caching - Enable in-memory caching for performance; default: true
const NIP85_CACHE_ENABLED =
  ((process.env.VITE_NIP85_CACHE_ENABLED as string) || "true")
    .toString()
    .toLowerCase() === "true";

// Phase 1: NIP-85 Audit Logging - Enable audit logging for all queries; default: true
const NIP85_AUDIT_LOGGING_ENABLED =
  ((process.env.VITE_NIP85_AUDIT_LOGGING_ENABLED as string) || "true")
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
  nip85: {
    primaryRelay:
      (process.env.VITE_NIP85_PRIMARY_RELAY as string) ||
      "wss://relay.satnam.pub",
    cacheTTLMs: parseInt(
      (process.env.VITE_NIP85_CACHE_TTL_MS as string) || "300000",
      10
    ),
    defaultExposureLevel: ((process.env
      .VITE_NIP85_DEFAULT_EXPOSURE_LEVEL as string) || "private") as
      | "public"
      | "contacts"
      | "whitelist"
      | "private",
  },
  flags: {
    lnbitsEnabled: LNBITS_ENABLED,
    amberSigningEnabled: AMBER_SIGNING_ENABLED,
    hybridIdentityEnabled: HYBRID_IDENTITY_ENABLED,
    pkarrEnabled: PKARR_ENABLED,
    multiMethodVerificationEnabled: MULTI_METHOD_VERIFICATION_ENABLED,
    simpleproofEnabled: SIMPLEPROOF_ENABLED,
    irohEnabled: IROH_ENABLED,
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
  },
} as const;

// Validation (fail fast during app startup)
// VITE_LNBITS_BASE_URL is required only if LNbits integration is enabled
if (clientConfig.flags.lnbitsEnabled && !clientConfig.lnbits.baseUrl) {
  throw new Error(
    "Missing required public environment variable: VITE_LNBITS_BASE_URL (required when VITE_LNBITS_INTEGRATION_ENABLED=true)"
  );
}
