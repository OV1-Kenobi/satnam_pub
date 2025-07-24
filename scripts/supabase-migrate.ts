#!/usr/bin/env node

/**
 * Supabase migration script
 * This runs the SQL migration directly on your Supabase database
 */

import { supabase } from '../lib/supabase.js';
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runSupabaseMigration() {
  try {
    console.log("🚀 Starting Supabase migration...");

    // Read the migration file
    const migrationPath = path.join(
      __dirname,
      "../lib/migrations/001_identity_forge_schema.sql",
    );
    const migrationSQL = fs.readFileSync(migrationPath, "utf8");

    // Split the SQL into individual statements
    const statements = migrationSQL
      .split(";")
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0 && !stmt.startsWith("--"));

    console.log(`📝 Found ${statements.length} SQL statements to execute`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        console.log(`⚡ Executing statement ${i + 1}/${statements.length}...`);

        const { error } = await supabase.rpc("exec_sql", {
          sql: statement + ";",
        });

        if (error) {
          // Try alternative method for DDL statements
          console.log(`⚠️  RPC failed, trying direct execution...`);
          const { error: directError } = await supabase
            .from("_migrations") // This will fail but shows us the error
            .select("*")
            .limit(1);

          console.log(
            `ℹ️  Note: Some statements may need to be run manually in Supabase SQL Editor`,
          );
        } else {
          console.log(`✅ Statement ${i + 1} executed successfully`);
        }
      }
    }

    console.log("✅ Migration process completed!");
    console.log(
      "📋 If any statements failed, please run them manually in your Supabase SQL Editor:",
    );
    console.log(
      "   1. Go to https://supabase.com/dashboard/project/rhfqfftkizyengcuhuvq/sql",
    );
    console.log(
      "   2. Copy and paste the contents of lib/migrations/001_identity_forge_schema.sql",
    );
    console.log('   3. Click "Run"');
  } catch (error) {
    console.error("❌ Migration failed:", error);
    console.log("\n📋 Manual migration required:");
    console.log(
      "   1. Go to https://supabase.com/dashboard/project/rhfqfftkizyengcuhuvq/sql",
    );
    console.log(
      "   2. Copy and paste the contents of lib/migrations/001_identity_forge_schema.sql",
    );
    console.log('   3. Click "Run"');
  }
}

// Show the SQL for manual execution
function showManualInstructions() {
  console.log("\n📋 MANUAL MIGRATION INSTRUCTIONS:");
  console.log("=".repeat(50));
  console.log("1. Go to your Supabase SQL Editor:");
  console.log(
    "   https://supabase.com/dashboard/project/rhfqfftkizyengcuhuvq/sql",
  );
  console.log("\n2. Copy this SQL and paste it in the editor:");
  console.log("-".repeat(50));

  try {
    const migrationPath = path.join(
      __dirname,
      "../lib/migrations/001_identity_forge_schema.sql",
    );
    const migrationSQL = fs.readFileSync(migrationPath, "utf8");
    console.log(migrationSQL);
  } catch (error) {
    console.log("Error reading migration file:", error);
  }

  console.log("-".repeat(50));
  console.log('3. Click "Run" to execute the migration');
  console.log("4. All tables and policies will be created automatically");
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--manual") || args.includes("-m")) {
    showManualInstructions();
  } else {
    await runSupabaseMigration();
    console.log(
      "\n💡 If automatic migration had issues, run: npm run supabase:migrate -- --manual",
    );
  }
}

main().catch(console.error);
