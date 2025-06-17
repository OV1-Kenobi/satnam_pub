/**
 * @fileoverview Vitest Configuration
 * @description Test configuration for Satnam.pub family banking platform
 */

import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    include: [
      "**/__tests__/**/*.test.{ts,tsx}",
      "**/*.test.{ts,tsx}",
      "lib/__tests__/**/*.test.ts",
      "scripts/__tests__/**/*.test.ts",
      "api/__tests__/**/*.test.ts",
      "src/**/*.test.{ts,tsx}",
      "src/lib/__tests__/**/*.test.ts",
      "src/components/__tests__/**/*.test.tsx",
    ],
    exclude: ["node_modules", "dist", ".next", "build"],
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 60000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@lib": resolve(__dirname, "./lib"),
      "@api": resolve(__dirname, "./api"),
    },
  },
  define: {
    "import.meta.env": "process.env",

    // Zeus LSP configuration
    "process.env.ZEUS_LSP_ENDPOINT": JSON.stringify(
      process.env.ZEUS_LSP_ENDPOINT,
    ),
    "process.env.ZEUS_API_KEY": JSON.stringify(process.env.ZEUS_API_KEY),
    "process.env.ZEUS_LSP_ENABLED": JSON.stringify(
      process.env.ZEUS_LSP_ENABLED,
    ),

    // Lightning infrastructure
    "process.env.VOLTAGE_NODE_ID": JSON.stringify(process.env.VOLTAGE_NODE_ID),
    "process.env.LNBITS_ADMIN_KEY": JSON.stringify(
      process.env.LNBITS_ADMIN_KEY,
    ),

    // Test configuration
    "process.env.TEST_FAMILY_ID": JSON.stringify(process.env.TEST_FAMILY_ID),
    "process.env.TEST_PARENT_MEMBER_ID": JSON.stringify(
      process.env.TEST_PARENT_MEMBER_ID,
    ),
    "process.env.TEST_CHILD_MEMBER_ID": JSON.stringify(
      process.env.TEST_CHILD_MEMBER_ID,
    ),
  },
});
