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
    chunkSizeWarningLimit: 400, // Reduced from 600kb to encourage smaller chunks

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

            // Supabase: bundle ALL @supabase/* libs together to avoid cross-chunk eval/TDZ issues
            if (id.includes('@supabase/')) {
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

          // Configuration: let Vite decide chunking to avoid forced early-load ordering
          // Intentionally not forcing a separate 'config' chunk.

          // Core API client (base)
          if (id.includes('src/lib/api.ts') || id.includes('src/lib/api.js')) {
            return 'api-core';
          }

          // Specific API modules
          if (id.includes('src/lib/api/')) {
            return 'api-modules';
          }

          // Supabase and database: allow Vite to chunk automatically to prevent evaluation-order issues
          // Intentionally do not force a separate 'database' chunk to avoid cross-chunk cycles
          // if (id.includes('src/lib/supabase')) {
          //   return 'database';
          // }

          // Authentication: let Vite decide chunking to avoid potential circular-eval TDZ issues
          // Intentionally not forcing a separate 'auth' chunk.

          // Nostr/browser cryptography: do not mix app code into vendor chunks
          // Let Vite handle these automatically to prevent cross-chunk cycles.

          // Lightning and payments
          if (id.includes('src/lib/enhanced-family-coordinator') ||
              id.includes('src/lib/family-liquidity-manager') ||
              id.includes('src/lib/liquidity-intelligence') ||
              id.includes('src/lib/internal-lightning-bridge') ||
              id.includes('src/lib/payment-automation')) {
            return 'lightning';
          }

          // Privacy and security utilities
          if (id.includes('src/lib/privacy/') ||
              id.includes('src/lib/security/') ||
              id.includes('src/lib/crypto/')) {
            return 'security';
          }

          // PHASE 2: Components - split by feature and directory
          if (id.includes('src/components/')) {
            // Public landing pages (lazy-loaded)
            if (id.includes('src/components/pages/')) {
              return 'landing-pages';
            }

            // Admin components (admin dashboard, analytics, etc.)
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

            // Dashboard components (all *Dashboard.tsx files)
            if (id.includes('Dashboard.tsx') ||
                id.includes('FamilyFinancials') ||
                id.includes('IndividualFinances') ||
                id.includes('EnhancedFamily') ||
                id.includes('EnhancedLiquidity')) {
              return 'dashboard-components';
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

            // Everything else stays in components
            return 'components';
          }

          // Services - keep together to avoid initialization order issues
          // This includes verification services, toast service, etc.
          if (id.includes('src/services/')) {
            return 'services';
          }

          // Hooks
          if (id.includes('src/hooks/')) {
            return 'hooks';
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
