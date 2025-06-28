import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3002, // Frontend runs on 3002
    host: true, // Allow external connections
    // Configure dev server to serve static files from public directory
    // This handles the serverless/static file approach
    middlewareMode: false,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    // Optimize chunk size limits
    chunkSizeWarningLimit: 1000,
    // Handle dynamic imports
    dynamicImportVarsOptions: {
      warnOnError: false,
    },
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
        // Simplified manual chunking to avoid empty chunks
        manualChunks: {
          // React and core dependencies
          "react-vendor": ["react", "react-dom"],

          // Crypto dependencies
          "crypto-vendor": [
            "nostr-tools",
            "@noble/secp256k1",
            "@scure/bip32",
            "@scure/bip39",
            "crypto-js",
          ],
        },

        // Optimize chunk naming for better caching
        chunkFileNames: (chunkInfo) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  // Optimize dependencies
  optimizeDeps: {
    include: [
      // Pre-bundle these dependencies for better performance
      "react",
      "react-dom",
      "lucide-react",
      "clsx",
      "crypto-js",
    ],
    exclude: [
      // Exclude crypto modules from pre-bundling to maintain lazy loading
      "nostr-tools",
      "@scure/bip32",
      "@scure/bip39",
      "@noble/secp256k1",
    ],
    esbuildOptions: {
      // Node.js global to browser globalThis
      define: {
        global: "globalThis",
      },
    },
  },
});
