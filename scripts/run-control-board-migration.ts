/**
 * @fileoverview Control Board Migration Script
 * @description Run the control board schema migration safely
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { supabase } from '../lib/supabase.js';

interface MigrationResult {
  success: boolean;
  message: string;
  error?: string;
}

async function runControlBoardMigration(): Promise<MigrationResult> {
  try {
    console.log("🚀 Starting Control Board schema migration...");

    // Read the migration SQL file
    const migrationPath = resolve(
      __dirname,
      "../migrations/008_control_board_schema.sql",
    );
    const migrationSQL = readFileSync(migrationPath, "utf-8");

    // Execute the migration
    const { error } = await supabase.rpc("exec_sql", {
      sql: migrationSQL,
    });

    if (error) {
      // If exec_sql doesn't exist, try direct execution (for local dev)
      console.log("exec_sql RPC not found, trying direct execution...");

      // Split SQL into individual statements and execute them
      const statements = migrationSQL
        .split(";")
        .map((stmt) => stmt.trim())
        .filter((stmt) => stmt.length > 0 && !stmt.startsWith("--"));

      for (const statement of statements) {
        if (statement.trim()) {
          const { error: stmtError } = await supabase.rpc("exec", {
            sql: statement,
          });

          if (stmtError) {
            console.warn(`Warning executing statement: ${stmtError.message}`);
            // Continue with other statements unless it's a critical error
            if (stmtError.code && ["42P07", "42701"].includes(stmtError.code)) {
              console.log("Object already exists, continuing...");
            } else {
              throw stmtError;
            }
          }
        }
      }
    }

    // Verify migration by checking if key tables exist
    const { data: tables, error: tablesError } =
      await supabase.rpc("get_tables");

    if (tablesError) {
      // Alternative verification - try to select from one of the new tables
      const { error: verifyError } = await supabase
        .from("transactions")
        .select("id")
        .limit(1);

      if (verifyError && verifyError.code === "42P01") {
        throw new Error("Migration verification failed - tables not created");
      }
    }

    console.log("✅ Control Board schema migration completed successfully!");

    return {
      success: true,
      message: "Control Board schema migration completed successfully",
    };
  } catch (error) {
    console.error("❌ Migration failed:", error);

    return {
      success: false,
      message: "Control Board schema migration failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Verification function to check migration status
async function verifyMigration(): Promise<boolean> {
  try {
    console.log("🔍 Verifying Control Board migration...");

    const requiredTables = [
      "transactions",
      "nostr_relays",
      "nostr_events",
      "lightning_nodes",
      "family_privacy_settings",
      "privacy_operations_log",
    ];

    for (const table of requiredTables) {
      const { error } = await supabase.from(table).select("*").limit(1);

      if (error && error.code === "42P01") {
        console.error(`❌ Table ${table} does not exist`);
        return false;
      }
    }

    // Check views
    const requiredViews = [
      "control_board_overview",
      "privacy_metrics",
      "recent_activity",
    ];

    for (const view of requiredViews) {
      const { error } = await supabase.from(view).select("*").limit(1);

      if (error && error.code === "42P01") {
        console.error(`❌ View ${view} does not exist`);
        return false;
      }
    }

    console.log("✅ All Control Board tables and views verified successfully!");
    return true;
  } catch (error) {
    console.error("❌ Migration verification failed:", error);
    return false;
  }
}

// Test function to insert sample data
async function insertSampleData(): Promise<void> {
  try {
    console.log("📝 Inserting sample data for testing...");

    // Get the first family ID
    const { data: families, error: familyError } = await supabase
      .from("families")
      .select("id")
      .limit(1);

    if (familyError || !families?.length) {
      console.log("No families found, skipping sample data insertion");
      return;
    }

    const familyId = families[0].id;

    // Insert sample transaction
    const { error: txError } = await supabase.from("transactions").insert({
      family_id: familyId,
      type: "received",
      amount: 50000,
      from_address: "alice@getalby.com",
      to_address: "dad@satnam.pub",
      description: "Test payment",
      status: "confirmed",
      privacy_enabled: true,
      privacy_fee: 2.5,
    });

    if (txError) {
      console.warn("Sample transaction insert failed:", txError.message);
    } else {
      console.log("✅ Sample transaction inserted");
    }

    // Insert sample Nostr relay
    const { error: relayError } = await supabase.from("nostr_relays").insert({
      family_id: familyId,
      url: "wss://relay.example.com",
      status: "connected",
      read_access: true,
      write_access: true,
      message_count: 100,
    });

    if (relayError && relayError.code !== "23505") {
      // Ignore unique constraint violations
      console.warn("Sample relay insert failed:", relayError.message);
    } else {
      console.log("✅ Sample Nostr relay inserted");
    }

    console.log("✅ Sample data insertion completed!");
  } catch (error) {
    console.error("❌ Sample data insertion failed:", error);
  }
}

// Rollback function (for emergencies)
async function rollbackMigration(): Promise<MigrationResult> {
  try {
    console.log("🔄 Rolling back Control Board migration...");

    const rollbackTables = [
      "privacy_operations_log",
      "family_privacy_settings",
      "lightning_nodes",
      "nostr_events",
      "nostr_relays",
      "transactions",
    ];

    const rollbackViews = [
      "recent_activity",
      "privacy_metrics",
      "control_board_overview",
    ];

    // Drop views first
    for (const view of rollbackViews) {
      const { error } = await supabase.rpc("exec", {
        sql: `DROP VIEW IF EXISTS ${view} CASCADE;`,
      });

      if (error) {
        console.warn(`Warning dropping view ${view}:`, error.message);
      }
    }

    // Drop tables
    for (const table of rollbackTables) {
      const { error } = await supabase.rpc("exec", {
        sql: `DROP TABLE IF EXISTS ${table} CASCADE;`,
      });

      if (error) {
        console.warn(`Warning dropping table ${table}:`, error.message);
      }
    }

    console.log("✅ Control Board migration rollback completed!");

    return {
      success: true,
      message: "Control Board migration rollback completed",
    };
  } catch (error) {
    console.error("❌ Rollback failed:", error);

    return {
      success: false,
      message: "Control Board migration rollback failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "migrate";

  switch (command) {
    case "migrate":
      const result = await runControlBoardMigration();
      if (result.success) {
        await verifyMigration();
        if (args.includes("--sample-data")) {
          await insertSampleData();
        }
      }
      process.exit(result.success ? 0 : 1);

    case "verify":
      const isVerified = await verifyMigration();
      process.exit(isVerified ? 0 : 1);

    case "rollback":
      const rollbackResult = await rollbackMigration();
      process.exit(rollbackResult.success ? 0 : 1);

    case "sample-data":
      await insertSampleData();
      process.exit(0);

    default:
      console.log(`
Usage: npm run migrate:control-board [command]

Commands:
  migrate       Run the control board migration (default)
  verify        Verify migration was successful
  rollback      Rollback the migration (DANGEROUS)
  sample-data   Insert sample data for testing

Options:
  --sample-data   Insert sample data after migration

Examples:
  npm run migrate:control-board
  npm run migrate:control-board -- migrate --sample-data
  npm run migrate:control-board -- verify
      `);
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { rollbackMigration, runControlBoardMigration, verifyMigration };
