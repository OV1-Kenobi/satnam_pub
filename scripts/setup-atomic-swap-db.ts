/**
 * @fileoverview Atomic Swap Database Setup Script
 * @description Sets up database tables and indexes for atomic swap functionality
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";

// Load environment variables
import dotenv from "dotenv";
dotenv.config();

async function setupAtomicSwapDatabase() {
  console.log("🚀 Setting up Atomic Swap database tables...");

  // Initialize Supabase client
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // Read the SQL schema file
    const schemaPath = join(__dirname, "create-atomic-swap-tables.sql");
    const schemaSql = readFileSync(schemaPath, "utf8");

    // Split the SQL into individual statements
    const statements = schemaSql
      .split(";")
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0 && !stmt.startsWith("--"));

    console.log(`📝 Executing ${statements.length} SQL statements...`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(
        `   ${i + 1}/${statements.length}: ${statement.substring(0, 50)}...`
      );

      const { error } = await supabase.rpc("exec_sql", {
        sql: statement + ";",
      });

      if (error) {
        console.error(`❌ Error executing statement ${i + 1}:`, error);
        throw error;
      }
    }

    console.log("✅ Atomic Swap database setup completed successfully!");

    // Verify tables were created
    const { data: tables, error: tablesError } = await supabase
      .from("information_schema.tables")
      .select("table_name")
      .eq("table_schema", "public")
      .in("table_name", ["atomic_swaps", "atomic_swap_logs"]);

    if (tablesError) {
      console.error("❌ Error verifying tables:", tablesError);
    } else {
      console.log(
        "📊 Created tables:",
        tables?.map((t) => t.table_name).join(", ")
      );
    }

    // Test basic functionality
    console.log("🧪 Testing basic functionality...");

    const testSwapId = `test_${Date.now()}`;
    const { error: insertError } = await supabase.from("atomic_swaps").insert({
      swap_id: testSwapId,
      from_context: "family",
      to_context: "individual",
      from_member_id: "test_family",
      to_member_id: "test_individual",
      amount: 1000,
      swap_type: "fedimint_to_cashu",
      purpose: "transfer",
      status: "completed",
    });

    if (insertError) {
      console.error("❌ Error inserting test data:", insertError);
    } else {
      console.log("✅ Test data inserted successfully");

      // Clean up test data
      await supabase.from("atomic_swaps").delete().eq("swap_id", testSwapId);

      console.log("🧹 Test data cleaned up");
    }
  } catch (error) {
    console.error("❌ Failed to setup Atomic Swap database:", error);
    process.exit(1);
  }
}

// Run the setup if this script is executed directly
if (require.main === module) {
  setupAtomicSwapDatabase()
    .then(() => {
      console.log("🎉 Atomic Swap database setup complete!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Setup failed:", error);
      process.exit(1);
    });
}

export { setupAtomicSwapDatabase };
