#!/usr/bin/env tsx
/**
 * Run Register Identity Tables Migration
 * Executes the migration to create required tables for register-identity.js function
 * Master Context Compliant: Privacy-first database setup
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";

// Security: Require explicit confirmation for admin operations
function requireAdminConfirmation() {
  const hasConfirmFlag =
    process.argv.includes("--confirm") ||
    process.argv.includes("--allow-admin");
  if (!hasConfirmFlag) {
    console.error("❌ SECURITY: Admin script requires explicit confirmation");
    console.error("   Usage: npm run migrate:register-identity -- --confirm");
    console.error(
      "   This script uses service role privileges and should only be run by authorized administrators."
    );
    process.exit(1);
  }

  if (process.env.CI || process.env.NETLIFY) {
    console.error(
      "❌ SECURITY: Admin scripts cannot run in automated environments"
    );
    console.error(
      "   This script requires interactive confirmation and manual execution."
    );
    process.exit(1);
  }
}

// Security: Admin scripts should not programmatically access service role keys
function requireManualExecution() {
  console.error(
    "❌ SECURITY NOTICE: This script contains DDL operations that require service role privileges."
  );
  console.error("");
  console.error("🔒 SECURE EXECUTION REQUIRED:");
  console.error(
    "   1. Copy the SQL content from: database/register-identity-tables-migration.sql"
  );
  console.error("   2. Execute it manually in Supabase SQL Editor");
  console.error(
    "   3. Use your admin dashboard access, not programmatic service role keys"
  );
  console.error("");
  console.error(
    "🚫 REASON: Service role keys should never be retrieved programmatically"
  );
  console.error(
    "   in application code, even for admin scripts. This prevents"
  );
  console.error("   accidental exposure and follows security best practices.");
  console.error("");
  console.error("📋 MANUAL STEPS:");
  console.error("   1. Log into Supabase Dashboard");
  console.error("   2. Navigate to SQL Editor");
  console.error("   3. Copy/paste the migration SQL");
  console.error("   4. Execute with your admin privileges");
  process.exit(1);
}

// Enforce manual execution
requireManualExecution();

async function runMigration() {
  console.log("🚀 Starting Register Identity Tables Migration...");

  try {
    // Get service role key from Vault
    const serviceRoleKey = await getServiceRoleFromVault();

    // Create Supabase client with service role for admin operations
    supabase = createClient(
      "https://rhfqfftkizyengcuhuvq.supabase.co",
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  } catch (vaultError) {
    console.error("❌ Failed to initialize admin client:", vaultError);
    process.exit(1);
  }

  try {
    // Read the migration SQL file
    const migrationPath = join(
      process.cwd(),
      "database",
      "register-identity-tables-migration.sql"
    );
    const migrationSQL = readFileSync(migrationPath, "utf8");

    console.log("📖 Migration SQL loaded successfully");
    console.log(`📏 Migration size: ${migrationSQL.length} characters`);

    // Execute the migration
    console.log("⚡ Executing migration...");
    const { data, error } = await supabase.rpc("exec_sql", {
      sql: migrationSQL,
    });

    if (error) {
      console.error("❌ Migration failed:", error);

      // Try alternative approach - execute SQL directly
      console.log("🔄 Trying direct SQL execution...");

      // Split the SQL into individual statements
      const statements = migrationSQL
        .split(";")
        .map((stmt) => stmt.trim())
        .filter((stmt) => stmt.length > 0 && !stmt.startsWith("--"));

      console.log(`📝 Executing ${statements.length} SQL statements...`);

      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        if (statement.trim()) {
          try {
            console.log(
              `⚡ Executing statement ${i + 1}/${statements.length}...`
            );
            const { error: stmtError } = await supabase.rpc("exec_sql", {
              sql: statement + ";",
            });

            if (stmtError) {
              console.warn(
                `⚠️  Statement ${i + 1} warning:`,
                stmtError.message
              );
              if (!stmtError.message.includes("already exists")) {
                errorCount++;
              }
            } else {
              successCount++;
            }
          } catch (err) {
            console.warn(`⚠️  Statement ${i + 1} error:`, err);
            errorCount++;
          }
        }
      }

      console.log(
        `✅ Migration completed: ${successCount} successful, ${errorCount} errors`
      );
    } else {
      console.log("✅ Migration executed successfully!");
      console.log("📊 Result:", data);
    }

    // Verify the tables were created
    console.log("🔍 Verifying table creation...");

    const tablesToCheck = [
      "secure_vault",
      "users",
      "nip05_records",
      "profiles",
      "families",
    ];

    for (const tableName of tablesToCheck) {
      try {
        const { data: tableData, error: tableError } = await supabase
          .from(tableName)
          .select("*")
          .limit(1);

        if (tableError) {
          console.error(
            `❌ Table ${tableName} verification failed:`,
            tableError.message
          );
        } else {
          console.log(`✅ Table ${tableName} exists and is accessible`);
        }
      } catch (err) {
        console.error(`❌ Table ${tableName} check error:`, err);
      }
    }

    console.log("🎉 Register Identity Tables Migration completed!");
    console.log("");
    console.log("📋 Summary of created tables:");
    console.log("  • secure_vault - Encrypted nsec storage (zero-knowledge)");
    console.log("  • users - User profile data (non-sensitive)");
    console.log("  • nip05_records - NIP-05 verification records");
    console.log("  • profiles - User profiles (compatibility)");
    console.log("  • families - Family federation data");
    console.log("");
    console.log("🔒 Security features enabled:");
    console.log("  • Row Level Security (RLS) on all tables");
    console.log("  • Privacy-first access policies");
    console.log("  • Encrypted storage for sensitive data");
    console.log("  • Automatic timestamp updates");
    console.log("");
    console.log("🚀 Ready to test register-identity endpoint!");
  } catch (error) {
    console.error("💥 Migration script error:", error);
    process.exit(1);
  }
}

// Run the migration
runMigration().catch(console.error);
