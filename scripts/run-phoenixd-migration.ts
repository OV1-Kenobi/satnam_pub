/**
 * PhoenixD Integration Migration Script
 *
 * Runs the PhoenixD database schema migration to add:
 * - PhoenixD channel tracking
 * - Liquidity events logging
 * - Automated allowance configuration
 *
 * @fileoverview PhoenixD migration runner
 */

import { readFileSync } from "fs";
import { join } from "path";
import { supabase } from "../lib/supabase.js";

/**
 * Safely splits SQL into statements, handling:
 * - Dollar-quoted strings ($$...$$)
 * - PL/pgSQL function bodies
 * - DO blocks
 * - Comments
 */
function splitSQLSafely(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;
  let inDollarQuote = false;
  let dollarTag = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inComment = false;

  while (i < sql.length) {
    const char = sql[i];
    const next = sql[i + 1];
    const peek = sql.substr(i, 10);

    // Handle line comments
    if (
      !inDollarQuote &&
      !inSingleQuote &&
      !inDoubleQuote &&
      char === "-" &&
      next === "-"
    ) {
      inComment = true;
      current += char;
      i++;
      continue;
    }

    // End of line comment
    if (inComment && (char === "\n" || char === "\r")) {
      inComment = false;
      current += char;
      i++;
      continue;
    }

    // Skip processing if in comment
    if (inComment) {
      current += char;
      i++;
      continue;
    }

    // Handle dollar quoting
    if (!inSingleQuote && !inDoubleQuote) {
      if (char === "$") {
        // Look for dollar tag
        const match = sql.substr(i).match(/^\$([^$]*)\$/);
        if (match) {
          const tag = match[1];
          if (!inDollarQuote) {
            // Starting dollar quote
            inDollarQuote = true;
            dollarTag = tag;
            current += match[0];
            i += match[0].length;
            continue;
          } else if (tag === dollarTag) {
            // Ending dollar quote
            inDollarQuote = false;
            dollarTag = "";
            current += match[0];
            i += match[0].length;
            continue;
          }
        }
      }
    }

    // Handle regular quotes (only if not in dollar quote)
    if (!inDollarQuote) {
      if (char === "'" && !inDoubleQuote) {
        // Handle escaped quotes
        if (sql[i - 1] !== "\\") {
          inSingleQuote = !inSingleQuote;
        }
      } else if (char === '"' && !inSingleQuote) {
        if (sql[i - 1] !== "\\") {
          inDoubleQuote = !inDoubleQuote;
        }
      }
    }

    // Handle semicolon (statement separator)
    if (!inDollarQuote && !inSingleQuote && !inDoubleQuote && char === ";") {
      current += char;
      const trimmed = current.trim();
      if (trimmed && !trimmed.startsWith("--")) {
        statements.push(trimmed);
      }
      current = "";
      i++;
      continue;
    }

    current += char;
    i++;
  }

  // Add any remaining content
  const trimmed = current.trim();
  if (trimmed && !trimmed.startsWith("--")) {
    statements.push(trimmed);
  }

  return statements;
}

async function runPhoenixdMigration() {
  console.log("🔥 Starting PhoenixD integration migration...\n");

  try {
    // Read the migration SQL file
    const migrationPath = join(
      process.cwd(),
      "migrations",
      "009_phoenixd_integration.sql"
    );
    const migrationSQL = readFileSync(migrationPath, "utf8");

    console.log("📄 Migration file loaded:", migrationPath);
    console.log("📏 Migration size:", migrationSQL.length, "characters\n");

    // First, try to execute the entire migration as one statement
    // This is the safest approach for complex SQL with functions/procedures
    console.log(
      "🎯 Attempting to run entire migration as single transaction...\n"
    );

    try {
      const { error: wholeFileError } = await supabase.rpc("exec_sql", {
        sql_query: migrationSQL,
      });

      if (!wholeFileError) {
        console.log(
          "✅ Migration executed successfully as single transaction!\n"
        );
        console.log("🎉 PhoenixD migration completed successfully!");
        console.log("\n🔥 PhoenixD integration is now ready:");
        console.log("   • PhoenixD channel tracking enabled");
        console.log("   • Liquidity events logging configured");
        console.log("   • Automated allowance system ready");
        console.log("   • Family banking views created");

        console.log("\n⚡ Next steps:");
        console.log("   1. Start your PhoenixD daemon");
        console.log("   2. Configure PHOENIXD_* environment variables");
        console.log("   3. Test the API endpoints at /api/phoenixd/*");
        console.log("   4. Setup family member channels via API");
        return;
      }

      console.log(
        "⚠️ Single transaction failed, falling back to statement-by-statement execution..."
      );
      console.log("Error:", wholeFileError.message, "\n");
    } catch (singleTxError) {
      console.log(
        "⚠️ Single transaction failed, falling back to statement-by-statement execution..."
      );
      console.log("Error:", singleTxError, "\n");
    }

    // Fallback: Split into statements using safe parser
    console.log("🔍 Parsing SQL with dollar-quote and PL/pgSQL awareness...");
    const statements = splitSQLSafely(migrationSQL);

    console.log("🔢 Found", statements.length, "SQL statements to execute\n");

    // Execute each statement
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      try {
        console.log(`⚡ Executing statement ${i + 1}/${statements.length}...`);

        // Show what we're executing (first 100 chars)
        const preview = statement.substring(0, 100).replace(/\s+/g, " ");
        console.log(`   ${preview}${statement.length > 100 ? "..." : ""}`);

        const { error } = await supabase.rpc("exec_sql", {
          sql_query: statement,
        });

        if (error) {
          throw error;
        }

        console.log(`   ✅ Success\n`);
        successCount++;
      } catch (error) {
        console.error(`   ❌ Error:`, error);
        console.error(`   Statement:`, statement.substring(0, 200), "...\n");
        errorCount++;

        // For critical errors, we might want to stop
        if (
          (error as Error).message?.includes("syntax error") ||
          (error as Error).message?.includes("does not exist")
        ) {
          console.error(
            "🚨 Critical error detected. Stopping migration to prevent corruption."
          );
          break;
        }
      }
    }

    // Summary
    console.log("📊 Migration Summary:");
    console.log(`   ✅ Successful statements: ${successCount}`);
    console.log(`   ❌ Failed statements: ${errorCount}`);
    console.log(`   📝 Total statements: ${statements.length}\n`);

    if (errorCount === 0) {
      console.log("🎉 PhoenixD migration completed successfully!");
      console.log("\n🔥 PhoenixD integration is now ready:");
      console.log("   • PhoenixD channel tracking enabled");
      console.log("   • Liquidity events logging configured");
      console.log("   • Automated allowance system ready");
      console.log("   • Family banking views created");

      console.log("\n⚡ Next steps:");
      console.log("   1. Start your PhoenixD daemon");
      console.log("   2. Configure PHOENIXD_* environment variables");
      console.log("   3. Test the API endpoints at /api/phoenixd/*");
      console.log("   4. Setup family member channels via API");
    } else {
      console.log(
        "⚠️ Migration completed with errors. Please review and fix failed statements."
      );
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Migration failed:", error);
    console.error("\n🔧 Troubleshooting:");
    console.error("   • Check Supabase connection");
    console.error("   • Verify database permissions");
    console.error("   • Ensure migration file exists");
    process.exit(1);
  }
}

// Run migration if this script is executed directly
if (import.meta.url.endsWith(process.argv[1])) {
  runPhoenixdMigration().catch((error) => {
    console.error("❌ Migration script failed:", error);
    process.exit(1);
  });
}

export { runPhoenixdMigration };
