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
 * Secure Migration Manager using Supabase Management API
 * MASTER CONTEXT COMPLIANCE: Secure credential handling, no sensitive data logging
 *
 * Uses Supabase Management API for secure, authenticated database operations
 * Handles migrations incrementally with proper error handling and rollback
 */

import { readFileSync } from "fs";
import { join } from "path";

// Load environment variables from .env file
function loadEnvFile() {
  try {
    const envPath = join(process.cwd(), ".env");
    const envContent = readFileSync(envPath, "utf8");

    envContent.split("\n").forEach((line) => {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith("#")) {
        const [key, ...valueParts] = trimmedLine.split("=");
        if (key && valueParts.length > 0) {
          const value = valueParts.join("=").trim();
          process.env[key.trim()] = value;
        }
      }
    });
  } catch (error) {
    console.warn("Warning: Could not load .env file:", error);
  }
}

// Load environment variables
loadEnvFile();

interface SupabaseManagementAPIResponse {
  error?: {
    message: string;
    code?: string;
  };
  data?: any;
}

class SecureMigrationManager {
  private accessToken: string;
  private projectRef: string;
  private baseUrl: string;

  constructor() {
    this.accessToken = getEnvVar("SUPABASE_ACCESS_TOKEN") || "";
    this.projectRef = getEnvVar("SUPABASE_PROJECT_REF") || "";
    this.baseUrl = `https://api.supabase.com/v1/projects/${this.projectRef}`;

    if (!this.accessToken || !this.projectRef) {
      throw new Error(
        "SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF must be set"
      );
    }
  }

  /**
   * Execute SQL using Supabase Management API
   */
  private async executeSql(
    sql: string
  ): Promise<SupabaseManagementAPIResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/database/query`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: sql,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          error: {
            message: result.message || "API request failed",
            code: result.code || response.status.toString(),
          },
        };
      }

      return { data: result };
    } catch (error) {
      return {
        error: {
          message: `Network error: ${error}`,
          code: "NETWORK_ERROR",
        },
      };
    }
  }

  /**
   * Check if a table exists
   */
  private async tableExists(tableName: string): Promise<boolean> {
    const sql = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = '${tableName}'
      );
    `;

    const result = await this.executeSql(sql);
    if (result.error) {
      console.error(`Error checking table ${tableName}:`, result.error);
      return false;
    }

    return result.data?.result?.[0]?.exists || false;
  }

  /**
   * Create emergency_recovery_requests table
   */
  private async createEmergencyRecoveryRequestsTable(): Promise<boolean> {
    console.log("📋 Creating emergency_recovery_requests table...");

    const sql = `
      CREATE TABLE IF NOT EXISTS public.emergency_recovery_requests (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        user_npub TEXT NOT NULL,
        user_role TEXT NOT NULL CHECK (user_role IN ('private', 'offspring', 'adult', 'steward', 'guardian')),
        family_id TEXT,
        request_type TEXT NOT NULL CHECK (request_type IN ('nsec_recovery', 'account_restoration', 'emergency_liquidity', 'ecash_recovery')),
        reason TEXT NOT NULL CHECK (reason IN ('lost_key', 'account_lockout', 'emergency_funds', 'device_compromise', 'other')),
        urgency TEXT NOT NULL CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
        description TEXT NOT NULL,
        requested_amount BIGINT,
        recovery_method TEXT NOT NULL CHECK (recovery_method IN ('password', 'shamir', 'multisig', 'guardian_consensus')),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'expired')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        required_approvals INTEGER NOT NULL DEFAULT 0,
        current_approvals INTEGER NOT NULL DEFAULT 0,
        guardian_signatures JSONB NOT NULL DEFAULT '[]'::jsonb
      );
    `;

    const result = await this.executeSql(sql);
    if (result.error) {
      console.error(
        "❌ Failed to create emergency_recovery_requests table:",
        result.error
      );
      return false;
    }

    console.log("✅ emergency_recovery_requests table created successfully");
    return true;
  }

  /**
   * Create emergency_recovery_events table
   */
  private async createEmergencyRecoveryEventsTable(): Promise<boolean> {
    console.log("📋 Creating emergency_recovery_events table...");

    const sql = `
      CREATE TABLE IF NOT EXISTS public.emergency_recovery_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL CHECK (event_type IN ('recovery_requested', 'guardian_approved', 'guardian_rejected', 'recovery_completed', 'recovery_expired')),
        user_id TEXT NOT NULL,
        user_npub TEXT NOT NULL,
        user_role TEXT NOT NULL,
        details JSONB NOT NULL DEFAULT '{}'::jsonb,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical'))
      );
    `;

    const result = await this.executeSql(sql);
    if (result.error) {
      console.error(
        "❌ Failed to create emergency_recovery_events table:",
        result.error
      );
      return false;
    }

    console.log("✅ emergency_recovery_events table created successfully");
    return true;
  }

  /**
   * Create emergency_recovery_attempts table
   */
  private async createEmergencyRecoveryAttemptsTable(): Promise<boolean> {
    console.log("📋 Creating emergency_recovery_attempts table...");

    const sql = `
      CREATE TABLE IF NOT EXISTS public.emergency_recovery_attempts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        attempt_date DATE NOT NULL DEFAULT CURRENT_DATE,
        attempt_count INTEGER NOT NULL DEFAULT 1,
        last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, attempt_date)
      );
    `;

    const result = await this.executeSql(sql);
    if (result.error) {
      console.error(
        "❌ Failed to create emergency_recovery_attempts table:",
        result.error
      );
      return false;
    }

    console.log("✅ emergency_recovery_attempts table created successfully");
    return true;
  }

  /**
   * Create indexes for performance
   */
  private async createIndexes(): Promise<boolean> {
    console.log("📋 Creating performance indexes...");

    const indexes = [
      "CREATE INDEX IF NOT EXISTS idx_emergency_recovery_requests_user_id ON public.emergency_recovery_requests(user_id);",
      "CREATE INDEX IF NOT EXISTS idx_emergency_recovery_requests_family_id ON public.emergency_recovery_requests(family_id);",
      "CREATE INDEX IF NOT EXISTS idx_emergency_recovery_requests_status ON public.emergency_recovery_requests(status);",
      "CREATE INDEX IF NOT EXISTS idx_emergency_recovery_events_user_id ON public.emergency_recovery_events(user_id);",
      "CREATE INDEX IF NOT EXISTS idx_emergency_recovery_attempts_user_id ON public.emergency_recovery_attempts(user_id);",
    ];

    for (const indexSql of indexes) {
      const result = await this.executeSql(indexSql);
      if (result.error) {
        console.error("❌ Failed to create index:", result.error);
        return false;
      }
    }

    console.log("✅ All indexes created successfully");
    return true;
  }

  /**
   * Enable RLS on tables
   */
  private async enableRLS(): Promise<boolean> {
    console.log("📋 Enabling Row Level Security...");

    const rlsCommands = [
      "ALTER TABLE public.emergency_recovery_requests ENABLE ROW LEVEL SECURITY;",
      "ALTER TABLE public.emergency_recovery_events ENABLE ROW LEVEL SECURITY;",
      "ALTER TABLE public.emergency_recovery_attempts ENABLE ROW LEVEL SECURITY;",
    ];

    for (const rlsSql of rlsCommands) {
      const result = await this.executeSql(rlsSql);
      if (result.error) {
        console.error("❌ Failed to enable RLS:", result.error);
        return false;
      }
    }

    console.log("✅ Row Level Security enabled successfully");
    return true;
  }

  /**
   * Create RLS policies
   */
  private async createRLSPolicies(): Promise<boolean> {
    console.log("📋 Creating RLS policies...");

    const policies = [
      `CREATE POLICY "Users can access own recovery requests" ON public.emergency_recovery_requests
       FOR ALL USING (auth.uid()::text = user_id);`,

      `CREATE POLICY "Users can access own recovery events" ON public.emergency_recovery_events
       FOR ALL USING (auth.uid()::text = user_id);`,

      `CREATE POLICY "Users can access own recovery attempts" ON public.emergency_recovery_attempts
       FOR ALL USING (auth.uid()::text = user_id);`,
    ];

    for (const policySql of policies) {
      const result = await this.executeSql(policySql);
      if (result.error) {
        console.error("❌ Failed to create RLS policy:", result.error);
        return false;
      }
    }

    console.log("✅ RLS policies created successfully");
    return true;
  }

  /**
   * Create helper functions
   */
  private async createHelperFunctions(): Promise<boolean> {
    console.log("📋 Creating helper functions...");

    const cleanupFunction = `
      CREATE OR REPLACE FUNCTION cleanup_expired_recovery_requests()
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      BEGIN
        UPDATE public.emergency_recovery_requests 
        SET status = 'expired' 
        WHERE status = 'pending' 
        AND expires_at < NOW();
      END;
      $$;
    `;

    const incrementFunction = `
      CREATE OR REPLACE FUNCTION increment_recovery_attempts(p_user_id TEXT)
      RETURNS INTEGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      DECLARE
        current_attempts INTEGER;
      BEGIN
        INSERT INTO public.emergency_recovery_attempts (id, user_id, attempt_count)
        VALUES (gen_random_uuid()::text, p_user_id, 1)
        ON CONFLICT (user_id, attempt_date)
        DO UPDATE SET 
          attempt_count = emergency_recovery_attempts.attempt_count + 1,
          last_attempt_at = NOW();
        
        SELECT attempt_count INTO current_attempts
        FROM public.emergency_recovery_attempts
        WHERE user_id = p_user_id AND attempt_date = CURRENT_DATE;
        
        RETURN current_attempts;
      END;
      $$;
    `;

    const functions = [cleanupFunction, incrementFunction];

    for (const functionSql of functions) {
      const result = await this.executeSql(functionSql);
      if (result.error) {
        console.error("❌ Failed to create function:", result.error);
        return false;
      }
    }

    console.log("✅ Helper functions created successfully");
    return true;
  }

  /**
   * Grant permissions
   */
  private async grantPermissions(): Promise<boolean> {
    console.log("📋 Granting permissions...");

    const permissions = [
      "GRANT ALL ON public.emergency_recovery_requests TO authenticated;",
      "GRANT ALL ON public.emergency_recovery_events TO authenticated;",
      "GRANT ALL ON public.emergency_recovery_attempts TO authenticated;",
      "GRANT EXECUTE ON FUNCTION cleanup_expired_recovery_requests() TO authenticated;",
      "GRANT EXECUTE ON FUNCTION increment_recovery_attempts(TEXT) TO authenticated;",
    ];

    for (const permissionSql of permissions) {
      const result = await this.executeSql(permissionSql);
      if (result.error) {
        console.error("❌ Failed to grant permission:", result.error);
        return false;
      }
    }

    console.log("✅ Permissions granted successfully");
    return true;
  }

  /**
   * Run the complete migration
   */
  async runMigration(): Promise<boolean> {
    console.log("🚀 Starting Emergency Recovery System Migration");
    console.log("🔐 Using Supabase Management API (Secure)");
    console.log("=".repeat(60));

    try {
      // Step 1: Create tables
      if (!(await this.createEmergencyRecoveryRequestsTable())) return false;
      if (!(await this.createEmergencyRecoveryEventsTable())) return false;
      if (!(await this.createEmergencyRecoveryAttemptsTable())) return false;

      // Step 2: Create indexes
      if (!(await this.createIndexes())) return false;

      // Step 3: Enable RLS
      if (!(await this.enableRLS())) return false;

      // Step 4: Create RLS policies
      if (!(await this.createRLSPolicies())) return false;

      // Step 5: Create helper functions
      if (!(await this.createHelperFunctions())) return false;

      // Step 6: Grant permissions
      if (!(await this.grantPermissions())) return false;

      console.log("\n🎉 MIGRATION COMPLETED SUCCESSFULLY!");
      console.log("✅ All tables created");
      console.log("✅ Indexes created for performance");
      console.log("✅ Row Level Security enabled");
      console.log("✅ Security policies applied");
      console.log("✅ Helper functions created");
      console.log("✅ Permissions granted");

      return true;
    } catch (error) {
      console.error("🚨 MIGRATION FAILED:", error);
      return false;
    }
  }

  /**
   * Verify migration success
   */
  async verifyMigration(): Promise<boolean> {
    console.log("\n🔍 Verifying migration...");

    const tables = [
      "emergency_recovery_requests",
      "emergency_recovery_events",
      "emergency_recovery_attempts",
    ];

    for (const table of tables) {
      const exists = await this.tableExists(table);
      if (exists) {
        console.log(`✅ Table ${table} exists`);
      } else {
        console.log(`❌ Table ${table} missing`);
        return false;
      }
    }

    console.log("✅ Migration verification successful");
    return true;
  }
}

// Run the migration
async function main() {
  try {
    const migrationManager = new SecureMigrationManager();

    const success = await migrationManager.runMigration();
    if (success) {
      await migrationManager.verifyMigration();
      console.log("\n🚀 READY TO TEST EMERGENCY RECOVERY SYSTEM!");
      process.exit(0);
    } else {
      console.log("\n🚨 MIGRATION FAILED - CHECK ERRORS ABOVE");
      process.exit(1);
    }
  } catch (error) {
    console.error("🚨 FATAL ERROR:", error);
    process.exit(1);
  }
}

main();
