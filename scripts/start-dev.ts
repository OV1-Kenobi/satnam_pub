#!/usr/bin/env tsx

/**
 * MASTER CONTEXT COMPLIANCE: Browser-compatible environment variable handling
 * @param {string} key - Environment variable key
 * @returns {string|undefined} Environment variable value
 */
function getEnvVar(key: string): string | undefined {
  if (typeof import.meta !== "undefined") {
    const metaWithEnv = /** @type {Object} */ (import.meta);
    if (metaWithEnv.env) {
      return metaWithEnv.env[key];
    }
  }
  return process.env[key];
}

/**
 * Development Startup Script
 *
 * This script helps start both the frontend and backend servers for development.
 * It provides clear instructions and checks for common issues.
 */

import { spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

console.log("🚀 Satnam.pub Development Startup");
console.log("═".repeat(50));

// Check if node_modules exists
if (!existsSync(path.join(PROJECT_ROOT, "node_modules"))) {
  console.log("❌ node_modules not found. Please run: npm install");
  process.exit(1);
}

console.log("📋 Development Server Setup:");
console.log("   Frontend (Vite): http://localhost:3000");
console.log("   Backend (Express): http://localhost:8000");
console.log("   API Proxy: Frontend proxies /api/* to backend");
console.log("");

console.log("🔧 To start development servers:");
console.log("");
console.log("   Terminal 1 - Backend Server:");
console.log("   npm run server:dev");
console.log("");
console.log("   Terminal 2 - Frontend Server:");
console.log("   npm run dev");
console.log("");

console.log("✅ Configuration Summary:");
console.log("   - Frontend: Vite dev server on port 3000");
console.log("   - Backend: Express server on port 8000");
console.log("   - API calls from frontend are proxied to backend");
console.log("   - Session endpoints updated to correct paths");
console.log("");

console.log("🔍 Troubleshooting:");
console.log('   - If you see "Failed to get session info" errors:');
console.log("     1. Make sure backend server is running (npm run server:dev)");
console.log("     2. Check that port 8000 is not in use");
console.log("     3. Verify API proxy is working in browser dev tools");
console.log("");

console.log("🎯 Next Steps:");
console.log("   1. Start backend: npm run server:dev");
console.log("   2. Start frontend: npm run dev");
console.log("   3. Visit: http://localhost:3000");
console.log("");

// Optional: Auto-start servers if --auto flag is provided
if (process.argv.includes("--auto")) {
  console.log("🤖 Auto-starting servers...");

  // Start backend server
  const backend = spawn("npm", ["run", "server:dev"], {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    shell: true,
  });

  backend.on("error", (error) => {
    console.error("❌ Failed to start backend server:", error);
    process.exit(1);
  });

  // Wait a moment for backend to start
  setTimeout(
    () => {
      // Start frontend server
      const frontend = spawn("npm", ["run", "dev"], {
        cwd: PROJECT_ROOT,
        stdio: "inherit",
        shell: true,
      });

      frontend.on("error", (error) => {
        console.error("❌ Failed to start frontend server:", error);
        backend.kill("SIGTERM");
        process.exit(1);
      });

      // Handle cleanup
      process.on("SIGINT", () => {
        console.log("\n🛑 Shutting down servers...");
        backend.kill("SIGTERM");
        frontend.kill("SIGTERM");

        // Force kill after timeout
        setTimeout(() => {
          backend.kill("SIGKILL");
          frontend.kill("SIGKILL");
          process.exit(0);
        }, 5000);
      });
    },
    getEnvVar("NODE_ENV") === "test" ? 100 : 3000
  ); // Configurable delay
}
