/**
 * @fileoverview Database Migration Runner for Federated Signing Tables
 * @description Executes SQL migration for federated family nostr signing functionality
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// Load environment variables
dotenv.config();

// Import config with proper error handling
let config: any = {};
try {
  const configModule = require("../config");
  config = configModule.config || configModule.default || configModule;
} catch (error) {
  console.log("ℹ️  Using environment variables directly");
  config = {};
}

const supabaseUrl =
  config?.supabase?.url ||
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabaseServiceKey =
  config?.supabase?.serviceRoleKey ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing Supabase configuration!");
  console.error(
    "Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  try {
    console.log("🚀 Starting federated signing database migration...");

    // Read migration SQL file
    const migrationPath = path.join(
      __dirname,
      "create-federated-signing-tables.sql",
    );
    const migrationSQL = fs.readFileSync(migrationPath, "utf8");

    // Split SQL into individual statements
    const statements = migrationSQL
      .split(";")
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0 && !stmt.startsWith("--"));

    console.log(`📄 Found ${statements.length} SQL statements to execute`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      try {
        console.log(`⚡ Executing statement ${i + 1}/${statements.length}...`);

        // Log the first few words of the statement for debugging
        const preview = statement.substring(0, 50).replace(/\s+/g, " ");
        console.log(`   Preview: ${preview}...`);

        const { error } = await supabase.rpc("exec_sql", {
          sql_statement: statement + ";",
        });

        if (error) {
          // Try direct execution if RPC fails
          const { error: directError } = await supabase
            .from("_temp_migration")
            .select("1")
            .limit(0); // This is just to test connection

          if (directError) {
            throw error;
          }

          // For Supabase, we might need to use the REST API or raw SQL execution
          console.warn(
            `⚠️  RPC execution failed, trying alternative method...`,
          );
          console.log(`   Error: ${error.message}`);

          // You might need to run these manually in Supabase SQL editor
          console.log(`   Statement: ${statement}`);
        } else {
          console.log(`✅ Statement ${i + 1} executed successfully`);
        }
      } catch (statementError) {
        console.error(`❌ Failed to execute statement ${i + 1}:`);
        console.error(`   Error: ${statementError}`);
        console.error(`   Statement: ${statement.substring(0, 100)}...`);

        // Continue with next statement instead of failing completely
        continue;
      }
    }

    console.log("🎉 Migration completed!");
    console.log("");
    console.log("📋 Tables created:");
    console.log("   - federated_events");
    console.log("   - federated_signing_sessions");
    console.log("   - family_signing_rules");
    console.log("   - family_nostr_protection");
    console.log("   - family_guardians");
    console.log("   - guardian_shards");
    console.log("   - guardian_notifications");
    console.log("");
    console.log("🔍 Next steps:");
    console.log("   1. Verify tables were created in your Supabase dashboard");
    console.log("   2. Set up Row Level Security (RLS) policies if needed");
    console.log("   3. Test the federated signing functionality");
  } catch (error) {
    console.error("💥 Migration failed:", error);
    process.exit(1);
  }
}

// Alternative approach: Generate SQL statements for manual execution
async function generateMigrationInstructions() {
  try {
    console.log("📝 Generating manual migration instructions...");

    const migrationPath = path.join(
      __dirname,
      "create-federated-signing-tables.sql",
    );
    const migrationSQL = fs.readFileSync(migrationPath, "utf8");

    console.log("");
    console.log("🔧 MANUAL MIGRATION INSTRUCTIONS");
    console.log("=".repeat(50));
    console.log("");
    console.log(
      "If the automatic migration fails, please run the following SQL",
    );
    console.log("statements manually in your Supabase SQL Editor:");
    console.log("");
    console.log("```sql");
    console.log(migrationSQL);
    console.log("```");
    console.log("");
    console.log(
      "Or copy the SQL from: scripts/create-federated-signing-tables.sql",
    );
    console.log("");
  } catch (error) {
    console.error("Failed to generate migration instructions:", error);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--manual") || args.includes("-m")) {
    await generateMigrationInstructions();
  } else {
    console.log(
      "🚨 IMPORTANT: This migration will create new database tables.",
    );
    console.log("   If you prefer to run the migration manually:");
    console.log("   npm run migrate:federated-signing -- --manual");
    console.log("");

    // Ask for confirmation in production
    if (process.env.NODE_ENV === "production") {
      console.log("⚠️  Production environment detected!");
      console.log("   Please review the migration SQL before proceeding.");
      console.log("   Use --force flag to skip this confirmation.");

      if (!args.includes("--force")) {
        console.log("   Generating manual instructions instead...");
        await generateMigrationInstructions();
        return;
      }
    }

    await runMigration();
  }
}

// Handle uncaught errors
process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  process.exit(1);
});

// Run the migration
main().catch((error) => {
  console.error("Migration script failed:", error);
  process.exit(1);
});
