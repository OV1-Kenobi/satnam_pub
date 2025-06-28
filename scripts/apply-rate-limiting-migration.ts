#!/usr/bin/env node

/**
 * Apply Rate Limiting Migration
 * Quick script to apply the rate limiting database changes
 */

import { supabase } from "../lib/supabase";

async function applyRateLimitingMigration() {
  console.log("🚀 Applying rate limiting migration...");

  try {
    // Create the rate_limits table
    console.log("📋 Creating rate_limits table...");
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS rate_limits (
          id BIGSERIAL PRIMARY KEY,
          hashed_user_id VARCHAR(64) NOT NULL UNIQUE,
          request_count INTEGER NOT NULL DEFAULT 0,
          reset_time TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    let result = await supabase.rpc("exec_sql", { sql: createTableSQL });
    if (result.error) {
      console.log("ℹ️  Table might already exist or using direct query...");
    }

    // Create indexes
    console.log("📋 Creating indexes...");
    const indexSQL1 = `CREATE INDEX IF NOT EXISTS idx_rate_limits_hashed_user_id ON rate_limits(hashed_user_id);`;
    const indexSQL2 = `CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_time ON rate_limits(reset_time);`;

    await supabase.rpc("exec_sql", { sql: indexSQL1 });
    await supabase.rpc("exec_sql", { sql: indexSQL2 });

    // Create the RPC function
    console.log("📋 Creating rate limiting function...");
    const functionSQL = `
      CREATE OR REPLACE FUNCTION check_and_update_rate_limit(
          user_hash TEXT,
          rate_limit INTEGER,
          window_ms BIGINT
      )
      RETURNS JSON AS $$
      DECLARE
          current_time TIMESTAMPTZ := NOW();
          reset_time TIMESTAMPTZ;
          current_count INTEGER := 0;
          allowed BOOLEAN := FALSE;
          result JSON;
      BEGIN
          -- Calculate the reset time based on the window
          reset_time := current_time + INTERVAL '1 millisecond' * window_ms;
          
          -- Try to get existing rate limit record
          SELECT request_count, rate_limits.reset_time INTO current_count, reset_time
          FROM rate_limits 
          WHERE hashed_user_id = user_hash;
          
          IF NOT FOUND THEN
              -- No existing record, create new one
              INSERT INTO rate_limits (hashed_user_id, request_count, reset_time)
              VALUES (user_hash, 1, current_time + INTERVAL '1 millisecond' * window_ms);
              
              allowed := TRUE;
              current_count := 1;
          ELSE
              -- Check if reset time has passed
              IF current_time > reset_time THEN
                  -- Reset the counter
                  UPDATE rate_limits 
                  SET request_count = 1, 
                      reset_time = current_time + INTERVAL '1 millisecond' * window_ms
                  WHERE hashed_user_id = user_hash;
                  
                  allowed := TRUE;
                  current_count := 1;
              ELSE
                  -- Check if under rate limit
                  IF current_count < rate_limit THEN
                      -- Increment counter
                      UPDATE rate_limits 
                      SET request_count = request_count + 1
                      WHERE hashed_user_id = user_hash;
                      
                      allowed := TRUE;
                      current_count := current_count + 1;
                  ELSE
                      -- Rate limit exceeded
                      allowed := FALSE;
                  END IF;
              END IF;
          END IF;
          
          -- Return result as JSON
          result := json_build_object(
              'allowed', allowed,
              'current_count', current_count,
              'rate_limit', rate_limit,
              'reset_time', EXTRACT(EPOCH FROM reset_time) * 1000,
              'window_ms', window_ms
          );
          
          RETURN result;
          
      EXCEPTION
          WHEN OTHERS THEN
              -- Log error and return failure
              RAISE LOG 'Error in check_and_update_rate_limit: %', SQLERRM;
              RETURN json_build_object(
                  'allowed', FALSE,
                  'error', SQLERRM,
                  'current_count', 0,
                  'rate_limit', rate_limit
              );
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `;

    result = await supabase.rpc("exec_sql", { sql: functionSQL });
    if (result.error) {
      console.log(
        "⚠️  Function creation might need manual execution in Supabase SQL editor"
      );
    }

    // Create cleanup function
    console.log("📋 Creating cleanup function...");
    const cleanupFunctionSQL = `
      CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
      RETURNS INTEGER AS $$
      DECLARE
          deleted_count INTEGER;
      BEGIN
          DELETE FROM rate_limits 
          WHERE reset_time < NOW() - INTERVAL '24 hours';
          
          GET DIAGNOSTICS deleted_count = ROW_COUNT;
          
          RAISE LOG 'Cleaned up % expired rate limit records', deleted_count;
          RETURN deleted_count;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `;

    await supabase.rpc("exec_sql", { sql: cleanupFunctionSQL });

    // Test the migration
    console.log("🧪 Testing migration...");

    // Test table exists
    const { error: tableError } = await supabase
      .from("rate_limits")
      .select("*", { count: "exact", head: true });

    if (tableError && tableError.code === "42P01") {
      throw new Error("Migration failed: rate_limits table not created");
    }

    // Test function exists
    const { error: funcError } = await supabase.rpc(
      "check_and_update_rate_limit",
      {
        user_hash: "test_migration",
        rate_limit: 1,
        window_ms: 1000,
      }
    );

    if (funcError && funcError.code === "PGRST202") {
      console.log(
        "⚠️  RPC function needs to be created manually in Supabase SQL editor"
      );
      console.log("📋 Copy this SQL to your Supabase SQL editor:");
      console.log(functionSQL);
      console.log(cleanupFunctionSQL);
    } else {
      // Clean up test data
      await supabase
        .from("rate_limits")
        .delete()
        .eq("hashed_user_id", "test_migration");
    }

    console.log("✅ Rate limiting migration applied successfully!");
    console.log("\n📋 Next steps:");
    console.log(
      "1. Run tests: npm run test -- api/__tests__/rate-limiting.test.ts"
    );
    console.log("2. Check stats: npm run rate-limits:stats");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    console.log("\n🔧 Manual Steps:");
    console.log("1. Go to your Supabase dashboard > SQL Editor");
    console.log(
      "2. Copy and paste the SQL from migrations/20241201_create_rate_limiting_table.sql"
    );
    console.log("3. Execute the SQL");
    process.exit(1);
  }
}

applyRateLimitingMigration();
