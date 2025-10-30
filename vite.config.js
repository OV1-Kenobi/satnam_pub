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
            // React ecosystem - CRITICAL: must be separate to reduce main bundle
            if (id.includes('react') && !id.includes('@')) {
              return 'react-vendor';
            }
            if (id.includes('react-dom')) {
              return 'react-vendor';
            }

            // Sentry error tracking - large library, must be separate
            if (id.includes('@sentry/')) {
              return 'sentry-vendor';
            }

            // React Router - commonly used, should be separate
            if (id.includes('react-router')) {
              return 'router-vendor';
            }

            // Supabase - large library with many dependencies
            if (id.includes('@supabase/')) {
              return 'supabase-vendor';
            }

            // Nostr and crypto libraries - group together
            if (id.includes('nostr-tools') ||
                id.includes('@noble/') ||
                id.includes('@scure/') ||
                id.includes('nip19') ||
                id.includes('crypto-js')) {
              return 'crypto-vendor';
            }

            // Lightning and payment libraries
            if (id.includes('@getalby/') ||
                id.includes('bolt11') ||
                id.includes('lnurl') ||
                id.includes('jose')) {
              return 'lightning-vendor';
            }

            // UI and icon libraries
            if (id.includes('lucide-react') ||
                id.includes('react-icons')) {
              return 'icons-vendor';
            }

            // Form and validation
            if (id.includes('react-hook-form') ||
                id.includes('zod') ||
                id.includes('yup')) {
              return 'forms-vendor';
            }

            // Date utilities
            if (id.includes('date-fns')) {
              return 'date-vendor';
            }

            // SEO and meta
            if (id.includes('react-helmet')) {
              return 'seo-vendor';
            }

            // Loading and skeleton UI
            if (id.includes('react-loading-skeleton')) {
              return 'ui-utils-vendor';
            }

            // QR code
            if (id.includes('qrcode')) {
              return 'qr-code-vendor';
            }

            // Image editing
            if (id.includes('react-easy-crop')) {
              return 'image-vendor';
            }

            // Everything else in node_modules goes to vendor
            return 'vendor';
          }

          // Source code chunking - aggressive splitting to reduce main bundle
          // Priority order: most specific first to avoid conflicts

          // Configuration - keep separate to avoid circular dependencies
          if (id.includes('src/config/')) {
            return 'config';
          }

          // Authentication - CRITICAL: large module, must be separate
          if (id.includes('src/lib/auth/')) {
            return 'auth';
          }

          // API modules - split into separate chunk
          if (id.includes('src/lib/api/') || id.includes('src/lib/api.ts')) {
            return 'api';
          }

          // Supabase and database
          if (id.includes('src/lib/supabase')) {
            return 'database';
          }

          // Nostr and crypto functionality
          if (id.includes('src/lib/nostr') ||
              id.includes('src/lib/nip') ||
              id.includes('src/lib/crypto') ||
              id.includes('src/lib/privacy')) {
            return 'nostr-crypto';
          }

          // Lightning and payments
          if (id.includes('src/lib/lightning') ||
              id.includes('src/lib/payment') ||
              id.includes('src/lib/liquidity') ||
              id.includes('src/lib/family-liquidity')) {
            return 'lightning-payments';
          }

          // Messaging and communications
          if (id.includes('src/lib/messaging') ||
              id.includes('src/lib/giftwrapped')) {
            return 'messaging';
          }

          // Components - split by feature
          if (id.includes('src/components/')) {
            // Dashboard components - large and feature-specific
            if (id.includes('Dashboard') ||
                id.includes('Financials') ||
                id.includes('Liquidity')) {
              return 'dashboard-components';
            }

            // Payment and wallet modals - large feature area
            if (id.includes('PaymentModal') ||
                id.includes('PaymentAutomation') ||
                id.includes('PaymentCascade') ||
                id.includes('SmartPayment') ||
                id.includes('SimplePayment') ||
                id.includes('LNBits') ||
                id.includes('NWCWallet') ||
                id.includes('Wallet')) {
              return 'payment-modals';
            }

            // Family and federation modals
            if (id.includes('FamilyFoundry') ||
                id.includes('FamilyFederation') ||
                id.includes('FamilyPayment')) {
              return 'family-modals';
            }

            // Identity and auth modals
            if (id.includes('IdentityForge') ||
                id.includes('SignIn') ||
                id.includes('NTAG424') ||
                id.includes('NFC')) {
              return 'identity-modals';
            }

            // Other modals
            if (id.includes('Modal') || id.includes('Dialog')) {
              return 'ui-modals';
            }

            // Auth components
            if (id.includes('src/components/auth/')) {
              return 'auth-components';
            }

            // Admin components
            if (id.includes('src/components/admin/')) {
              return 'admin-components';
            }

            // Education components
            if (id.includes('src/components/education/')) {
              return 'education-components';
            }

            // Messaging components
            if (id.includes('src/components/communications/') ||
                id.includes('Messaging') ||
                id.includes('Invitation')) {
              return 'messaging-components';
            }

            // Everything else in components
            return 'components';
          }

          // Services
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

          // Contexts
          if (id.includes('src/contexts/')) {
            return 'contexts';
          }

          // Fallback: return undefined to let Vite handle automatically
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
