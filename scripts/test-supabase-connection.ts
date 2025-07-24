#!/usr/bin/env node

/**
 * Test Supabase connection
 */

import { supabase } from '../lib/supabase.js';

async function testConnection() {
  try {
    console.log("🔍 Testing Supabase connection...");

    // Test basic connection
    const { data, error } = await supabase
      .from("profiles")
      .select("count")
      .limit(1);

    if (error && error.code === "PGRST116") {
      console.log("✅ Connection successful!");
      console.log("ℹ️  Tables not created yet - this is expected");
      console.log("📝 Ready to run migration");
    } else if (error) {
      console.log("❌ Connection error:", error.message);
    } else {
      console.log("✅ Connection successful!");
      console.log("✅ Tables already exist");
    }

    // Test auth
    const { data: authData, error: authError } =
      await supabase.auth.getSession();
    if (authError) {
      console.log("ℹ️  Auth not configured yet (this is normal)");
    } else {
      console.log("✅ Auth system available");
    }
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

testConnection();
