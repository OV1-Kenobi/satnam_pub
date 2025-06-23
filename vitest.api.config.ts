import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "API Tests",
    include: ["api/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**"],
    environment: "node",
    globals: true,
    setupFiles: ["./api/__tests__/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["api/**/*.ts"],
      exclude: [
        "api/**/*.test.ts",
        "api/**/__tests__/**",
        "api/**/types.ts",
        "api/**/interfaces.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@api": path.resolve(__dirname, "./api"),
    },
  },
});
