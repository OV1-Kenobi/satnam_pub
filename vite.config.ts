import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3002, // Frontend runs on 3002
    proxy: {
      // Proxy API calls to backend server
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    // Optimize chunk size limits
    chunkSizeWarningLimit: 1000,
    // Additional build optimizations
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true,
        pure_funcs: ["console.log", "console.info", "console.debug"],
      },
      mangle: {
        safari10: true,
      },
    },
    // Optimize CSS
    cssCodeSplit: true,
    cssMinify: true,
    rollupOptions: {
      output: {
        // Manual chunking strategy for better code splitting
        manualChunks: (id) => {
          // React and core dependencies
          if (id.includes("react") || id.includes("react-dom")) {
            return "react-vendor";
          }

          // UI components and styling
          if (
            id.includes("lucide-react") ||
            id.includes("@radix-ui") ||
            id.includes("class-variance-authority") ||
            id.includes("clsx") ||
            id.includes("tailwind-merge")
          ) {
            return "ui-vendor";
          }

          // Crypto dependencies - separate heavy crypto libraries
          if (
            id.includes("nostr-tools") ||
            id.includes("@noble/ed25519") ||
            id.includes("@noble/secp256k1")
          ) {
            return "crypto-nostr";
          }

          // Noble hashes separately (used by multiple crypto modules)
          if (id.includes("@noble/hashes")) {
            return "crypto-hashes";
          }

          // BIP39 and HD wallet dependencies
          if (id.includes("bip39") || id.includes("@scure/bip32")) {
            return "crypto-bip";
          }

          // Password hashing utilities
          if (id.includes("bcryptjs") || id.includes("argon2")) {
            return "crypto-password";
          }

          // General crypto utilities
          if (id.includes("crypto-js")) {
            return "crypto-utils";
          }

          // Lightning and Bitcoin utilities
          if (id.includes("bolt11") || id.includes("bech32")) {
            return "lightning-vendor";
          }

          // Supabase and database
          if (id.includes("@supabase/supabase-js")) {
            return "database-vendor";
          }

          // Nostr ecosystem
          if (id.includes("@nostr-dev-kit/ndk")) {
            return "nostr-vendor";
          }

          // QR code generation
          if (id.includes("qrcode")) {
            return "qr-vendor";
          }

          // HTTP client
          if (id.includes("axios")) {
            return "http-vendor";
          }

          // Validation and utilities
          if (id.includes("zod") || id.includes("uuid")) {
            return "utils-vendor";
          }

          // Secret sharing and advanced crypto
          if (id.includes("shamirs-secret-sharing") || id.includes("z32")) {
            return "advanced-crypto";
          }

          // Node.js polyfills
          if (
            id.includes("crypto-browserify") ||
            id.includes("stream-browserify") ||
            id.includes("util") ||
            id.includes("buffer") ||
            id.includes("process")
          ) {
            return "node-polyfills";
          }

          // Large third-party crypto math libraries
          if (
            id.includes("node_modules") &&
            (id.includes("elliptic") ||
              id.includes("bn.js") ||
              id.includes("miller-rabin") ||
              id.includes("brorand"))
          ) {
            return "crypto-math";
          }

          // Our crypto modules
          if (id.includes("/utils/crypto-") && !id.includes("node_modules")) {
            return "app-crypto";
          }

          // Other large node_modules
          if (id.includes("node_modules")) {
            return "vendor";
          }
        },

        // Optimize chunk naming for better caching
        chunkFileNames: (chunkInfo) => {
          const _facadeModuleId = chunkInfo.facadeModuleId
            ? chunkInfo.facadeModuleId
                .split("/")
                .pop()
                ?.replace(/\.[^/.]+$/, "")
            : "chunk";

          // Special naming for crypto modules
          if (chunkInfo.name?.includes("crypto")) {
            return `assets/crypto-[name]-[hash].js`;
          }

          // Special naming for vendor chunks
          if (chunkInfo.name?.includes("vendor")) {
            return `assets/vendor-[name]-[hash].js`;
          }

          return `assets/[name]-[hash].js`;
        },

        // Optimize asset naming
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name?.split(".") || [];
          const ext = info[info.length - 1];

          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext || "")) {
            return `assets/images/[name]-[hash][extname]`;
          }

          if (/css/i.test(ext || "")) {
            return `assets/styles/[name]-[hash][extname]`;
          }

          return `assets/[name]-[hash][extname]`;
        },
      },
    },
  },
  define: {
    // Define Node.js globals for browser compatibility
    global: "globalThis",
  },
  resolve: {
    alias: {
      // Provide browser-compatible alternatives for Node.js modules
      crypto: "crypto-browserify",
      stream: "stream-browserify",
      util: "util",
    },
  },

  // Optimize dependencies
  optimizeDeps: {
    include: [
      // Pre-bundle these dependencies for better performance
      "react",
      "react-dom",
      "lucide-react",
      "@radix-ui/react-slot",
      "class-variance-authority",
      "clsx",
      "tailwind-merge",
      "axios",
      "uuid",
      "zod",
    ],
    exclude: [
      // Exclude crypto modules from pre-bundling to maintain lazy loading
      "nostr-tools",
      "bip39",
      "@scure/bip32",
      "@noble/ed25519",
      "@noble/hashes",
      "@noble/secp256k1",
      "crypto-js",
      "bcryptjs",
      "argon2",
      "shamirs-secret-sharing",
    ],
  },
});
