import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import { defineConfig } from "vite";

// Helper function to recursively collect all entry points in a directory
function getAllEntries(
  dir: string,
  exts: string[] = [".ts", ".tsx", ".js", ".jsx"]
): Record<string, string> {
  let entries: Record<string, string> = {};

  if (!fs.existsSync(dir)) {
    console.warn(`Directory ${dir} does not exist`);
    return entries;
  }

  try {
    fs.readdirSync(dir).forEach((file) => {
      const fullPath = path.join(dir, file);

      // Skip development files and other problematic files
      if (
        file.includes("-recovered") ||
        file.includes(".hot-update") ||
        file.includes(".vite") ||
        file.startsWith(".") ||
        file.includes("node-")
      ) {
        return;
      }

      if (fs.statSync(fullPath).isDirectory()) {
        // Recursively collect entries from subdirectories
        entries = { ...entries, ...getAllEntries(fullPath, exts) };
      } else if (exts.includes(path.extname(fullPath))) {
        // Use relative path from src as key for better organization
        const relativePath = path.relative(
          path.join(__dirname, "src"),
          fullPath
        );
        const entryKey = relativePath
          .replace(/\\/g, "/") // Normalize path separators
          .replace(/\.[^/.]+$/, "") // Remove file extension
          .replace(/\/index$/, ""); // Remove /index from entry names

        entries[entryKey || "index"] = fullPath;
      }
    });
  } catch (error) {
    console.warn(`Error reading directory ${dir}:`, error);
  }

  return entries;
}

// Collect all component and lib entries
const componentEntries = getAllEntries(
  path.resolve(__dirname, "src/components")
);
const libEntries = getAllEntries(path.resolve(__dirname, "src/lib"));

console.log(`Found ${Object.keys(componentEntries).length} component entries`);
console.log(`Found ${Object.keys(libEntries).length} lib entries`);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@components": path.resolve(__dirname, "src/components"),
      "@lib": path.resolve(__dirname, "src/lib"),
      "@/components": path.resolve(__dirname, "src/components"),
      "@/lib": path.resolve(__dirname, "src/lib"),
      "@/hooks": path.resolve(__dirname, "src/hooks"),
      "@/services": path.resolve(__dirname, "src/services"),
      "@/types": path.resolve(__dirname, "src/types"),
      "@/utils": path.resolve(__dirname, "src/utils"),
    },
  },
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
      input: {
        main: path.resolve(__dirname, "index.html"),
        // Only include component and lib entries from src/
        ...componentEntries,
        ...libEntries,
      },
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
