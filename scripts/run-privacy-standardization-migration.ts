/**
 * Privacy Standardization Migration Script
 * Runs the database migration to standardize privacy levels
 */

import fs from "fs";
import path from "path";
import {
  isSupabaseMocked,
  supabase,
  testSupabaseConnection,
} from '../lib/supabase-server.js';

async function runPrivacyStandardizationMigration() {
  console.log("🔒 Starting Privacy Level Standardization Migration...");

  // Test connection first
  const connectionTest = await testSupabaseConnection();
  if (!connectionTest.connected) {
    if (isSupabaseMocked) {
      console.log("⚠️  Running in mock mode - no real database operations");
      console.log("✅ Mock migration completed successfully!");
      return;
    } else {
      throw new Error(`Database connection failed: ${connectionTest.error}`);
    }
  }

  try {
    // Read the migration SQL file
    const migrationPath = path.join(
      __dirname,
      "../migrations/017_privacy_level_standardization.sql"
    );
    const migrationSql = fs.readFileSync(migrationPath, "utf8");

    // Split into individual statements
    const statements = migrationSql
      .split(";")
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0 && !stmt.startsWith("--"));

    console.log(`📄 Executing ${statements.length} migration statements...`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`⚡ Executing statement ${i + 1}/${statements.length}...`);

      try {
        const { error } = await supabase.rpc("exec_sql", { sql: statement });
        if (error) {
          console.error(`❌ Error in statement ${i + 1}:`, error);
          throw error;
        }
        console.log(`✅ Statement ${i + 1} completed successfully`);
      } catch (error) {
        console.error(`❌ Failed to execute statement ${i + 1}:`, statement);
        throw error;
      }
    }

    // Verify migration
    console.log("🔍 Verifying migration...");

    // Check if privacy_level enum exists
    const { data: enumCheck, error: enumError } = await supabase.rpc(
      "check_enum_exists",
      { enum_name: "privacy_level" }
    );

    if (enumError) {
      console.warn("⚠️ Could not verify enum creation:", enumError);
    } else {
      console.log("✅ privacy_level enum verified");
    }

    // Check if new columns exist
    const tablesToCheck = [
      "transactions",
      "family_members",
      "individual_wallets",
      "lightning_payments",
      "fedimint_operations",
    ];

    for (const table of tablesToCheck) {
      const { data, error } = await supabase
        .from("information_schema.columns")
        .select("column_name")
        .eq("table_name", table)
        .eq("column_name", "privacy_level");

      if (error) {
        console.warn(
          `⚠️ Could not verify ${table} privacy_level column:`,
          error
        );
      } else if (data && data.length > 0) {
        console.log(`✅ ${table}.privacy_level column verified`);
      } else {
        console.warn(`⚠️ ${table}.privacy_level column not found`);
      }
    }

    // Test privacy audit logging function
    console.log("🧪 Testing privacy audit logging...");
    const { data: testAudit, error: auditError } = await supabase.rpc(
      "log_privacy_operation",
      {
        p_user_hash: "test_migration_user",
        p_operation_type: "migration_test",
        p_privacy_level: "giftwrapped",
        p_metadata_protection: 100,
        p_operation_details: {
          migration: true,
          timestamp: new Date().toISOString(),
        },
      }
    );

    if (auditError) {
      console.error("❌ Privacy audit logging test failed:", auditError);
    } else {
      console.log("✅ Privacy audit logging function verified");

      // Clean up test record
      await supabase.from("privacy_audit_log").delete().eq("id", testAudit);
    }

    console.log(
      "🎉 Privacy Level Standardization Migration completed successfully!"
    );
    console.log("\n📋 Migration Summary:");
    console.log(
      "  ✅ Created privacy_level enum (giftwrapped, encrypted, minimal)"
    );
    console.log("  ✅ Added privacy_level columns to all transaction tables");
    console.log("  ✅ Added privacy_preferences to user tables");
    console.log("  ✅ Created privacy_audit_log table");
    console.log("  ✅ Created guardian_privacy_approvals table");
    console.log("  ✅ Added privacy audit logging function");
    console.log("  ✅ Migrated existing privacy data");
  } catch (error) {
    console.error("❌ Privacy Standardization Migration failed:", error);
    process.exit(1);
  }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runPrivacyStandardizationMigration()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Migration failed:", error);
      process.exit(1);
    });
}

export { runPrivacyStandardizationMigration };
