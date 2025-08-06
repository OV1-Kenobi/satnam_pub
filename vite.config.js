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

export default defineConfig({
  plugins: [],

  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react'
  },

  resolve: {
    alias: {
      "@": resolve("src"),
      "@/components": resolve("src/components"),
      "@/lib": resolve("src/lib"),
      "@/hooks": resolve("src/hooks"),
      "@/services": resolve("src/services"),
      "@/types": resolve("src/types"),
      "@/utils": resolve("src/utils"),
    },
  },

  server: {
    port: 8888,
    host: "127.0.0.1",
    headers: {
      "Access-Control-Allow-Origin": "http://127.0.0.1:8888",
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
        if (req.url && req.url.includes('.mjs')) {
          res.setHeader('Content-Type', 'application/javascript');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Cache-Control', 'no-cache');
        }
        // Handle @vite internal modules
        if (req.url && req.url.startsWith('/@vite/')) {
          res.setHeader('Content-Type', 'application/javascript');
          res.setHeader('X-Content-Type-Options', 'nosniff');
        }
        next();
      });
    },
  },

  build: {
    outDir: "dist",
    sourcemap: isDevelopment,
    minify: isProduction ? "terser" : false,
    target: "esnext",
    chunkSizeWarningLimit: 600, // Slightly increase from 500kb to 600kb

    // CRITICAL FIX: Ensure proper ES module output for dynamic imports
    format: "es",

    rollupOptions: {
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

            // UI libraries - only create chunks for libraries that are actually used
            if (id.includes('lucide-react')) return 'icons-vendor';
            // Remove ui-vendor chunk as clsx/tailwind-merge might not be imported directly

            // Everything else
            return 'vendor';
          }

          // Source code chunking - be more specific to avoid mixed imports
          // Priority order: most specific first to avoid conflicts

          // Core API client (base)
          if (id.includes('src/lib/api.ts') || id.includes('src/lib/api.js')) {
            return 'api-core';
          }

          // Specific API modules
          if (id.includes('src/lib/api/')) {
            return 'api-modules';
          }

          // Supabase and database
          if (id.includes('src/lib/supabase') || id.includes('lib/supabase')) {
            return 'database';
          }

          // Authentication - keep together (including recent auth-adapter changes)
          if (id.includes('src/lib/auth/') ||
              id.includes('src/hooks/useAuth') ||
              id.includes('src/hooks/usePrivacyFirstAuth') ||
              id.includes('src/hooks/useFamilyFederationAuth') ||
              id.includes('src/utils/authManager') ||
              id.includes('src/utils/secureSession')) {
            return 'auth';
          }

          // Nostr functionality - merge with crypto-vendor since they're related
          if (id.includes('src/lib/nostr-browser') ||
              id.includes('lib/nostr.ts') ||
              id.includes('lib/nostr.js') ||
              id.includes('src/lib/nip05-verification') ||
              id.includes('lib/nip05-verification') ||
              id.includes('netlify/functions/nostr') ||
              (id.includes('src/lib/') && (id.includes('nostr') || id.includes('nip05') || id.includes('nip07')))) {
            return 'crypto-vendor'; // Merge with crypto since they use similar dependencies
          }

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

          // Components - split by feature
          if (id.includes('src/components/')) {
            if (id.includes('Modal') || id.includes('Dialog')) return 'ui-modals';
            if (id.includes('Form') || id.includes('Input')) return 'ui-forms';
            return 'components';
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

    terserOptions: isProduction ? {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ["console.log", "console.info", "console.debug"],
      },
    } : undefined,
  },

  define: {
    global: "globalThis",
    'process.env.NODE_ENV': JSON.stringify(getEnvVar('NODE_ENV') || 'production'),
    __DEV__: isDevelopment,
    // CRITICAL FIX: Inject Supabase environment variables into process.env for browser
    'process.env.VITE_SUPABASE_URL': JSON.stringify(getEnvVar('VITE_SUPABASE_URL')),
    'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(getEnvVar('VITE_SUPABASE_ANON_KEY')),
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
      "@noble/secp256k1",
      "@noble/hashes",
      "@scure/base",
    ],
    // Remove exclude to ensure crypto libraries are properly bundled
    exclude: [],
  },

  worker: {
    format: "es",
  },
});
