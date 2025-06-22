#!/usr/bin/env tsx
/**
 * @fileoverview Debug Environment Loading
 * @description Debug what's actually in the environment files
 */

import { config } from "dotenv";
import { readFileSync } from "fs";

console.log("🔍 Debugging Environment Files");
console.log("═══════════════════════════════════");

// Read .env.local directly
try {
  const envLocalContent = readFileSync(".env.local", "utf8");
  console.log("\n📄 .env.local content (full file):");
  console.log(envLocalContent);

  // Look for SUPABASE_URL specifically
  const supabaseUrlMatch = envLocalContent.match(/SUPABASE_URL=(.+)/);
  if (supabaseUrlMatch) {
    console.log("\n🎯 Found SUPABASE_URL in .env.local:", supabaseUrlMatch[1]);
  }

  const serviceKeyMatch = envLocalContent.match(
    /SUPABASE_SERVICE_ROLE_KEY=(.+)/
  );
  if (serviceKeyMatch) {
    console.log(
      "🎯 Found SUPABASE_SERVICE_ROLE_KEY in .env.local:",
      serviceKeyMatch[1].substring(0, 20) + "..."
    );
  }
} catch (error) {
  console.error("❌ Error reading .env.local:", error);
}

// Now test loading with dotenv
console.log("\n🔧 Testing dotenv loading...");

// Clear any existing env vars first
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log(
  "Before loading - SUPABASE_URL:",
  process.env.SUPABASE_URL || "NOT SET"
);

// Load .env.local with override
const result = config({ path: ".env.local", override: true });
console.log("Dotenv result:", result.error ? result.error.message : "SUCCESS");

console.log(
  "After loading - SUPABASE_URL:",
  process.env.SUPABASE_URL || "NOT SET"
);
console.log(
  "After loading - SERVICE_KEY:",
  process.env.SUPABASE_SERVICE_ROLE_KEY
    ? process.env.SUPABASE_SERVICE_ROLE_KEY.substring(0, 20) + "..."
    : "NOT SET"
);
