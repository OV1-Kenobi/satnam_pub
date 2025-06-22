// Test Supabase connection
import dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: ".env.local" });

console.log("=== Testing Supabase Connection ===");
console.log(
  "NEXT_PUBLIC_SUPABASE_URL:",
  process.env.NEXT_PUBLIC_SUPABASE_URL ? "SET" : "NOT SET"
);
console.log(
  "NEXT_PUBLIC_SUPABASE_ANON_KEY:",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "SET" : "NOT SET"
);
console.log(
  "SUPABASE_SERVICE_ROLE_KEY:",
  process.env.SUPABASE_SERVICE_ROLE_KEY ? "SET" : "NOT SET"
);

// Test Supabase client import and connection
try {
  const { supabase } = await import("./lib/supabase.js");
  console.log("\n=== Supabase Client Test ===");

  // Test basic connection
  const { error } = await supabase
    .from("profiles")
    .select("count", { count: "exact", head: true });

  if (error) {
    console.error("❌ Supabase connection failed:", error.message);
    console.error("Error details:", error);
  } else {
    console.log("✅ Supabase connection successful!");
    console.log("Profiles table accessible");
  }

  // Test service role access
  console.log("\n=== Testing Service Role Access ===");
  const { createClient } = await import("@supabase/supabase-js");

  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { error: serviceError } = await serviceClient
      .from("profiles")
      .select("count", { count: "exact", head: true });

    if (serviceError) {
      console.error("❌ Service role connection failed:", serviceError.message);
    } else {
      console.log("✅ Service role connection successful!");
    }
  } else {
    console.warn("⚠️  Service role credentials not available for testing");
  }
} catch (error) {
  console.error("❌ Failed to test Supabase connection:", error.message);
  console.error("Full error:", error);
}
