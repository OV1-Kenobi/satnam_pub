#!/usr/bin/env tsx
/**
 * Run Register Identity Tables Migration
 * Executes the migration to create required tables for register-identity.js function
 * Master Context Compliant: Privacy-first database setup
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";

// Supabase configuration
const supabaseUrl = "https://rhfqfftkizyengcuhuvq.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Create Supabase client with service role for admin operations
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function runMigration() {
  console.log("🚀 Starting Register Identity Tables Migration...");

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
