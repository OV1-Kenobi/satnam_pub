import { sentryVitePlugin } from "@sentry/vite-plugin";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { defineConfig } from "vite";

// Bitcoin-secure environment variable helper with proper typing
function getEnvVar(key) {
  // Handle Vite's import.meta.env (browser/build context)
  if (typeof import.meta !== "undefined" && import.meta.env) {
    return import.meta.env[key];
  }

  // Fallback to process.env (Node.js context)
  if (typeof process !== "undefined" && process.env) {
    return process.env[key];
  }

  return undefined;
}

const isDevelopment = getEnvVar('NODE_ENV') === 'development';
const isProduction = getEnvVar('NODE_ENV') === 'production';

// Helper to collect all VITE_* environment variables
// Returns a plain object that will be injected into the browser via Vite's define
function getAllViteEnvVars() {
  const viteEnv = {};
  if (typeof process !== 'undefined' && process.env) {
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('VITE_') || key === 'NODE_ENV' || key === 'NOSTR_RELAYS') {
        viteEnv[key] = process.env[key] || '';
      }
    });
  }
  return viteEnv;
}

export default defineConfig({
  plugins: [
    react(),
    // Sentry source map upload (only in production builds with auth token)
    isProduction && process.env.SENTRY_AUTH_TOKEN && sentryVitePlugin({
      org: process.env.VITE_SENTRY_ORG || "satnam-pub",
      project: process.env.VITE_SENTRY_PROJECT || "satnam-pub",
      authToken: process.env.SENTRY_AUTH_TOKEN,
      sourcemaps: {
        assets: "./dist/**",
        filesToDeleteAfterUpload: "./dist/**/*.map", // Delete source maps after upload for security
      },
      telemetry: false, // Disable Sentry telemetry for privacy
    }),
  ].filter(Boolean), // Remove falsy values (when Sentry plugin is disabled)

  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
    target: 'esnext'
  },

  resolve: {
    alias: [
      // Ensure more specific alias is evaluated before '@'
      { find: "@/api", replacement: resolve("api") },
      { find: "@/components", replacement: resolve("src/components") },
      { find: "@/lib", replacement: resolve("src/lib") },
      { find: "@/hooks", replacement: resolve("src/hooks") },
      { find: "@/services", replacement: resolve("src/services") },
      { find: "@/types", replacement: resolve("src/types") },
      { find: "@/utils", replacement: resolve("src/utils") },
      // Axios TDZ fix: force browser platform and prebundled browser build
      { find: /axios\/lib\/platform\/node\/index\.js$/, replacement: "axios/lib/platform/browser/index.js" },
      { find: /^axios$/, replacement: "axios/dist/browser/axios.cjs" },
      { find: "@", replacement: resolve("src") },
    ],
  },

  server: {
    port: 5173,
    host: "127.0.0.1",
    // Ensure HMR WS works when proxied through Netlify Dev (:8888)
    hmr:
      process && (process.env.NETLIFY === "true" || process.env.NETLIFY_DEV === "true" || process.env.NETLIFY_LOCAL === "true")
        ? { clientPort: 8888, protocol: "ws", host: "127.0.0.1" }
        : undefined,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
    // Configure MIME types for ES modules
    middlewareMode: false,
    fs: {
      strict: false,
    },
    // Add custom middleware to handle MIME types properly
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Handle .mjs files specifically
        if (req.url && req.url.includes(".mjs")) {
          res.setHeader("Content-Type", "application/javascript");
          res.setHeader("X-Content-Type-Options", "nosniff");
          res.setHeader("Cache-Control", "no-cache");
        }
        // Handle @vite internal modules
        if (req.url && req.url.startsWith("/@vite/")) {
          res.setHeader("Content-Type", "application/javascript");
          res.setHeader("X-Content-Type-Options", "nosniff");
        }
        next();
      });
    },
  },

  build: {
    outDir: "dist",
    // Enable source maps in production to debug white-screen errors
    sourcemap: true,
    minify: isProduction ? "terser" : false,
    target: "es2020", // Use more conservative target for better compatibility
    chunkSizeWarningLimit: 500, // Increased to accommodate admin/permissions features

    // CRITICAL FIX: Ensure proper ES module output for dynamic imports
    format: "es",

    rollupOptions: {
      external: [
        // Server-side only modules that should not be bundled in browser
        'crypto',
        'shamirs-secret-sharing',
        'z32',
        'db'
      ],
      output: {
        manualChunks: (id) => {

          // Node modules - split by size and usage
          if (id.includes('node_modules')) {
            // React ecosystem
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react-vendor';
            }

            // Crypto libraries - be more specific to ensure they're captured
            if (id.includes('nostr-tools') ||
                id.includes('@noble/secp256k1') ||
                id.includes('@noble/hashes') ||
                id.includes('@scure/bip32') ||
                id.includes('@scure/bip39') ||
                id.includes('@scure/base') ||
                id.includes('crypto-js')) {
              return 'crypto-vendor';
            }

            // PHASE 1: Heavy third-party dependencies
            // Image editing library (react-easy-crop is ~100 kB)
            if (id.includes('react-easy-crop')) {
              return 'image-editor';
            }

            // QR code libraries
            if (id.includes('qrcode') || id.includes('qr-code')) {
              return 'qr-code';
            }

            // Alby Lightning Tools (large library)
            if (id.includes('@getalby/lightning-tools') || id.includes('@getalby/sdk')) {
              return 'alby-vendor';
            }

            // JWT and payment libraries
            if (id.includes('bolt11') || id.includes('jose') || id.includes('jsonwebtoken')) {
              return 'jwt-vendor';
            }

            // Date utilities
            if (id.includes('date-fns')) {
              return 'date-vendor';
            }

            // Router and SEO
            if (id.includes('react-router-dom') || id.includes('react-router')) {
              return 'router-vendor';
            }

            // SEO and meta tags
            if (id.includes('react-helmet-async') || id.includes('react-helmet')) {
              return 'seo-vendor';
            }

            // Supabase: bundle all @supabase/* packages into one vendor chunk
            if (id.includes('node_modules/@supabase/')) {
              return 'supabase-vendor';
            }

            // Capacitor (mobile)
            if (id.includes('@capacitor/')) {
              return 'capacitor-vendor';
            }

            // PHASE 3: Additional vendor splitting for better caching
            // Chart libraries (if used)
            if (id.includes('recharts')) {
              return 'charts-vendor';
            }

            // FROST and cryptographic signing
            if (id.includes('@cmdcode/frost') || id.includes('@frostr/bifrost')) {
              return 'frost-vendor';
            }

            // Axios: isolate to its own chunk to avoid TDZ from platform aggregator
            if (id.includes('node_modules/axios/')) {
              return 'axios-vendor';
            }

            // Phoenix and Lightning server libraries
            if (id.includes('phoenix-server-js')) {
              return 'phoenix-vendor';
            }

            // Database libraries
            if (id.includes('node_modules/pg') || id.includes('node_modules/redis')) {
              return 'database-vendor';
            }

            // Shamirs secret sharing
            if (id.includes('shamirs-secret-sharing') || id.includes('z32')) {
              return 'shamir-vendor';
            }

            // UI libraries - only create chunks for libraries that are actually used
            if (id.includes('lucide-react')) return 'icons-vendor';

            // Skeleton loaders and UI utilities
            if (id.includes('react-loading-skeleton') || id.includes('react-easy-crop')) {
              return 'ui-utils-vendor';
            }

            // Zod validation library (can be large)
            if (id.includes('zod')) {
              return 'validation-vendor';
            }

            // Sentry error tracking - Let Vite handle automatically to prevent empty chunks
            // Sentry modules are small and conditionally loaded, so manual chunking creates
            // empty chunks in development builds. Vite will bundle them efficiently.
            // REMOVED: Manual sentry-vendor chunk to fix "Generated an empty chunk" warning

            // WebSocket and real-time libraries
            if (id.includes('websocket') || id.includes('ws')) {
              return 'websocket-vendor';
            }

            // Polyfills and compatibility libraries
            if (id.includes('core-js') || id.includes('regenerator-runtime')) {
              return 'polyfills-vendor';
            }

            // Utility libraries (lodash, ramda, etc.)
            if (id.includes('lodash') || id.includes('ramda') || id.includes('underscore')) {
              return 'utils-vendor';
            }

            // Form libraries
            if (id.includes('formik') || id.includes('react-hook-form') || id.includes('yup')) {
              return 'forms-vendor';
            }

            // Animation libraries
            if (id.includes('framer-motion') || id.includes('react-spring')) {
              return 'animation-vendor';
            }

            // Everything else
            return 'vendor';
          }

          // Source code chunking - be more specific to avoid mixed imports
          // Priority order: most specific first to avoid conflicts

          // Vault configuration - must be checked BEFORE general config to go to security chunk
          // This breaks the security → vault-config → security cycle
          // Note: vault-config.ts exists in both src/lib/ and lib/ (root)
          if (id.includes('lib/vault-config')) {
            return 'security';
          }

          // Pubky enhanced client - merge with admin-components (which now includes auth)
          if (id.includes('lib/pubky-enhanced-client') || id.includes('lib/pubky/')) {
            return 'admin-components';
          }

          // Configuration - keep separate to avoid circular dependencies
          // This must be loaded early and independently (excludes vault which goes to security)
          if (id.includes('src/config/')) {
            return 'config';
          }

          // Core API client (base)
          if (id.includes('src/lib/api.ts') || id.includes('src/lib/api.js')) {
            return 'api-core';
          }

          // Specific API modules
          if (id.includes('src/lib/api/')) {
            return 'api-modules';
          }

          // Supabase wrapper: force into supabase-vendor to avoid split wrapper chunk
          if (id.includes('src/lib/supabase')) {
            return 'supabase-vendor';
          }

          // Netlify Functions supabase server client: unify with supabase-vendor to avoid extra wrapper chunk
          if (id.includes('netlify/functions/supabase')) {
            return 'supabase-vendor';
          }

          // ========================================================================
          // PHASE 2 OPTIMIZATION: Split admin-components into focused chunks
          // Previous 680KB admin-components chunk is now split into:
          // - auth-core: Essential auth modules for critical path (~100KB target)
          // - admin-components: Admin dashboard components (lazy-loaded)
          // - dashboard-features: User dashboard components (lazy-loaded)
          // - services-utilities: Services, hooks, and utilities
          // ========================================================================

          // AUTH-CORE: Essential authentication modules (critical path)
          // These are needed immediately for session validation and must stay lean
          // Includes toastService to break auth-core → services-utilities cycle
          // Note: lib/auth/token-binding is in root lib/, not src/lib/
          if (id.includes('src/lib/auth/unified-auth-system') ||
              id.includes('src/lib/auth/client-session-vault') ||
              id.includes('src/lib/auth/secure-token-manager') ||
              id.includes('src/lib/auth/passphrase-provider') ||
              id.includes('src/lib/auth/fetch-with-auth') ||
              id.includes('src/lib/auth/user-identities-auth') ||
              id.includes('lib/auth/token-binding') ||
              id.includes('src/lib/auth/nfc-vault-policy') ||
              id.includes('src/lib/auth/nfc-auth-bridge') ||
              id.includes('src/lib/auth/nsec-session-bridge') ||
              id.includes('src/lib/auth/recovery-session-bridge') ||
              id.includes('src/components/auth/AuthProvider') ||
              id.includes('src/components/auth/PassphraseVaultModal') ||
              id.includes('src/hooks/useAuth') ||
              id.includes('src/hooks/usePrivacyFirstAuth') ||
              id.includes('src/hooks/useFamilyFederationAuth') ||
              id.includes('src/utils/authManager') ||
              id.includes('src/utils/secureSession') ||
              id.includes('src/services/toastService')) {
            return 'auth-core';
          }

          // Other auth modules that aren't critical path (can be lazy-loaded)
          if (id.includes('src/lib/auth/')) {
            return 'auth-extended';
          }

          // ========================================================================
          // PHASE 3 OPTIMIZATION: Consolidated services-utilities chunk
          // Analysis showed that nostr-services, lightning-services, and core-hooks
          // all have bidirectional dependencies with services-utilities.
          // Merging them into a single consolidated chunk eliminates circular imports.
          // Final structure maintains the original architecture while keeping
          // the chunk under the 500KB limit (~415KB consolidated).
          // ========================================================================

          // SERVICES-UTILITIES: Consolidated services, hooks, and Nostr/Lightning layer
          // Includes: Nostr services, Lightning services, hooks, contexts, and general services
          // All consolidated to eliminate bidirectional dependency cycles
          if (id.includes('src/hooks/') ||
              id.includes('src/lib/hooks/') ||
              id.includes('src/lib/contexts/') ||
              id.includes('src/lib/nostr/') ||
              id.includes('src/lib/nostr-browser') ||
              id.includes('src/lib/nostr-profile-service') ||
              id.includes('src/lib/nip05-verification') ||
              id.includes('src/lib/nip42/') ||
              id.includes('src/lib/nip46/') ||
              id.includes('src/lib/messaging/') ||
              id.includes('src/lib/gift-wrapped-messaging/') ||
              id.includes('src/lib/signers/') ||
              id.includes('src/lib/noise/') ||
              id.includes('src/lib/enhanced-family-coordinator') ||
              id.includes('src/lib/family-liquidity-manager') ||
              id.includes('src/lib/liquidity-intelligence') ||
              id.includes('src/lib/internal-lightning-bridge') ||
              id.includes('src/lib/payment-automation') ||
              id.includes('src/lib/phoenixd-client') ||
              id.includes('src/lib/enhanced-phoenixd-manager') ||
              id.includes('src/lib/lightning-client') ||
              id.includes('src/lib/cross-mint-cashu-manager') ||
              id.includes('src/lib/geochat/') ||
              id.includes('src/lib/family-wallet')) {
            return 'services-utilities';
          }

          // Privacy and security utilities
          // Note: vault-config is handled earlier with higher priority
          if (id.includes('src/lib/privacy/') ||
              id.includes('src/lib/security/') ||
              id.includes('src/lib/crypto/')) {
            return 'security';
          }

          // Steward/FROST NFC MFA - merge with components to break components ↔ frost-nfc-mfa cycle
          if (id.includes('src/lib/steward/')) {
            return 'components';
          }

          // PHASE 2: Components - split by feature and directory
          if (id.includes('src/components/')) {
            // Public landing pages (lazy-loaded)
            if (id.includes('src/components/pages/')) {
              return 'landing-pages';
            }

            // ADMIN-COMPONENTS: Admin dashboard components (lazy-loaded, not critical path)
            // These are accessed via /admin-dashboard and /admin-account-control routes
            if (id.includes('src/components/admin/')) {
              return 'admin-components';
            }

            // Education components (courses, progress, etc.)
            if (id.includes('src/components/education/')) {
              return 'education-components';
            }

            // Trust system components (trust scoring, providers, etc.)
            if (id.includes('src/components/trust/')) {
              return 'trust-components';
            }

            // Profile customization components (banner manager, etc.)
            if (id.includes('src/components/profile/')) {
              return 'profile-components';
            }

            // DASHBOARD-FEATURES: User dashboard components (lazy-loaded via React.lazy)
            // FamilyDashboard and IndividualFinancesDashboard are now lazy-loaded in App.tsx
            // Note: Creates services-utilities ↔ dashboard-features cycle, but keeping separate
            // to avoid components chunk exceeding 500KB limit
            if (id.includes('FamilyDashboard') ||
                id.includes('IndividualFinancesDashboard') ||
                id.includes('FamilyFinancials') ||
                id.includes('IndividualFinances') ||
                id.includes('EnhancedFamily') ||
                id.includes('EnhancedLiquidity')) {
              return 'dashboard-features';
            }

            // Modal components (remaining modals not in ui-modals)
            if (id.includes('Modal') || id.includes('Dialog')) {
              return 'ui-modals';
            }

            // Form components
            if (id.includes('Form') || id.includes('Input')) {
              return 'ui-forms';
            }

            // Messaging and communications
            if (id.includes('src/components/communications/') ||
                id.includes('src/components/messaging/') ||
                id.includes('src/components/privacy-messaging/')) {
              return 'messaging-components';
            }

            // Payment components
            if (id.includes('src/components/payments/') ||
                id.includes('PaymentModal') ||
                id.includes('PaymentAutomation')) {
              return 'payment-components';
            }

            // Wallet components
            if (id.includes('src/components/wallet/') ||
                id.includes('FamilyWallet') ||
                id.includes('LNBits')) {
              return 'wallet-components';
            }

            // Platform and ecosystem components - merged with main components to break cycle
            // components ↔ platform-components have bidirectional dependencies
            if (id.includes('NostrEcosystem') ||
                id.includes('DynasticSovereignty') ||
                id.includes('EducationPlatform') ||
                id.includes('SovereignFamilyBanking') ||
                id.includes('SovereigntyEducation') ||
                id.includes('FeaturesOverview') ||
                id.includes('VisibilityModeExplainer') ||
                id.includes('FamilyFedimintGovernance') ||
                id.includes('FamilyLightningTreasury') ||
                id.includes('UnifiedFamilyPayments') ||
                id.includes('FamilyCoordination') ||
                id.includes('FamilyOnboarding') ||
                id.includes('PhoenixDFamilyManager') ||
                id.includes('GuardianOnboardingGuide') ||
                id.includes('NameTagCredentialingQuest')) {
              return 'components';
            }

            // Utility and shared UI components - keep in services-utilities
            // These are loaded on demand when specific features are accessed
            if (id.includes('ErrorBoundary') ||
                id.includes('ContactCard') ||
                id.includes('ContactsList') ||
                id.includes('TransactionHistory') ||
                id.includes('Settings') ||
                id.includes('CreditsBalance') ||
                id.includes('CryptoPreloader') ||
                id.includes('CryptoProvider') ||
                id.includes('ContextualAvatar') ||
                id.includes('OperationTypeBadge') ||
                id.includes('ToastContainer') ||
                id.includes('ProtectedRoute') ||
                id.includes('FeatureGate') ||
                id.includes('ApiStatus') ||
                id.includes('ServerStatus') ||
                id.includes('PrivacyControls') ||
                id.includes('ProfileURLDisplay') ||
                id.includes('ProfileVisibilitySettings') ||
                id.includes('PublicProfilePage') ||
                id.includes('SupabaseConfigModal') ||
                id.includes('AtomicSwapModal') ||
                id.includes('NWCModal') ||
                id.includes('KeyImportForm') ||
                id.includes('MaxPrivacyAuth') ||
                id.includes('IndividualAuth') ||
                id.includes('PrivacyFirstIdentityManager') ||
                id.includes('PrivacyFirstMessaging') ||
                id.includes('FrostSignaturePanel') ||
                id.includes('PhoenixDNodeStatus') ||
                id.includes('IndividualPaymentDashboard') ||
                id.includes('PaymentAutomationCard') ||
                id.includes('AddContactForm') ||
                id.includes('EditContactForm') ||
                id.includes('ContactsManagerModal') ||
                id.includes('NotificationsTab') ||
                id.includes('OTPVerificationPanel')) {
              return 'services-utilities';
            }

            // Everything else stays in components
            return 'components';
          }

          // SERVICES-UTILITIES: General services layer (loaded on demand)
          // Note: Nostr and Lightning services are handled earlier by their respective chunks
          // This catches remaining general services like contacts, attestations, etc.
          if (id.includes('src/services/')) {
            return 'services-utilities';
          }

          // Crypto-factory - keep in services-utilities (loaded on demand via CryptoPreloader)
          // Note: crypto-factory is in utils/, not lib/
          if (id.includes('utils/crypto-factory')) {
            return 'services-utilities';
          }

          // Utils
          if (id.includes('src/utils/')) {
            return 'utils';
          }

          // Fallback: return undefined to let Vite handle automatically
          // This prevents empty chunks by not forcing modules into specific chunks
          return undefined;
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: (assetInfo) => {
          const info = assetInfo.names ? assetInfo.names[0].split(".") : [];
          const ext = info[info.length - 1];

          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext || "")) {
            return "assets/images/[name]-[hash][extname]";
          }
          if (/css/i.test(ext || "")) {
            return "assets/styles/[name]-[hash][extname]";
          }
          if (/wasm/i.test(ext || "")) {
            return "assets/wasm/[name][extname]";
          }
          return "assets/[name]-[hash][extname]";
        },
      },
    },

    // Diagnostics: keep console logs in production temporarily to trace white-screen root cause
    terserOptions: isProduction ? {
      compress: {
        drop_console: false,
        drop_debugger: false,
      },
    } : undefined,
  },

  define: {
    global: "globalThis",
    __DEV__: isDevelopment,
    // Provide a concrete process.env object at runtime so dynamic lookups work in the browser
    // This includes ALL VITE_* environment variables automatically
    'process.env': JSON.stringify(getAllViteEnvVars()),
  },

  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "lucide-react",
      "clsx",
      "crypto-js",
      // CRITICAL FIX: Include crypto libraries for proper Netlify production bundling
      "nostr-tools",
      "@scure/bip32",
      "@scure/bip39",
      "@noble/curves",
      "@noble/hashes",
      "@noble/ciphers",
      "@scure/base",
    ],
    // Remove exclude to ensure crypto libraries are properly bundled
    exclude: [],
  },

  worker: {
    format: "es",
  },
});
