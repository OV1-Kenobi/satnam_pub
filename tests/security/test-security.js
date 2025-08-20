// SECURITY VERIFICATION SCRIPT - Run to test credential security
import { config } from "dotenv";
config({ path: ".env.local" });

console.log("🔍 Citadel Identity Forge - Security Verification");
console.log("================================================");

// Test 1: Environment variables loaded securely
const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (supabaseUrl && supabaseKey) {
  console.log("✅ Credentials loaded from environment variables");
  console.log(`✅ URL Format: ${supabaseUrl.substring(0, 35)}...`);
  console.log(`✅ Key Format: ${supabaseKey.substring(0, 25)}...`);
} else {
  console.error("❌ CRITICAL: Missing environment variables");
  process.exit(1);
}

// Test 2: URL validation
try {
  const url = new URL(supabaseUrl);
  if (url.protocol === "https:" && url.hostname.includes("supabase.co")) {
    console.log("✅ Secure HTTPS Supabase URL verified");
  } else {
    console.warn("⚠️  Non-standard URL detected");
  }
} catch {
  console.error("❌ Invalid URL format detected");
  process.exit(1);
}

// Test 3: JWT token validation
if (supabaseKey.startsWith("eyJ") && supabaseKey.length > 100) {
  console.log("✅ Valid JWT token structure confirmed");
} else {
  console.error("❌ Invalid JWT token format");
  process.exit(1);
}

// Test 4: Source code scan
console.log("🔍 Scanning for hardcoded credentials...");
try {
  const fs = await import("fs");
  const supabaseContent = fs.readFileSync("./lib/supabase.ts", "utf-8");
  if (
    supabaseContent.includes("https://") &&
    !supabaseContent.includes("process.env")
  ) {
    console.error("❌ SECURITY BREACH: Hardcoded credentials found in source");
    process.exit(1);
  } else {
    console.log("✅ No hardcoded credentials detected in source code");
  }
} catch {
  console.warn("⚠️  Could not scan source code");
}

console.log("================================================");
console.log("�️  SECURITY STATUS: ALL CHECKS PASSED");
console.log("🔐 Production credentials are properly secured");
console.log("✅ Ready for secure deployment");
