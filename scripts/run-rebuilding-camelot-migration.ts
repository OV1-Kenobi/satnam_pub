#!/usr/bin/env tsx
// scripts/run-rebuilding-camelot-migration.ts

import { readFileSync } from "fs";
import { join } from "path";
import { supabase } from "../lib/supabase";

/**
 * Splits SQL text into individual statements, properly handling semicolons
 * within string literals and comments.
 */
function splitSQLStatements(sql: string): string[] {
  const statements: string[] = [];
  let currentStatement = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inSingleLineComment = false;
  let inMultiLineComment = false;
  let i = 0;

  while (i < sql.length) {
    const char = sql[i];
    const nextChar = i + 1 < sql.length ? sql[i + 1] : "";
    const prevChar = i > 0 ? sql[i - 1] : "";

    // Handle single-line comments (-- comment)
    if (
      !inSingleQuote &&
      !inDoubleQuote &&
      !inMultiLineComment &&
      char === "-" &&
      nextChar === "-"
    ) {
      inSingleLineComment = true;
      currentStatement += char;
      i++;
      continue;
    }

    // End single-line comment on newline
    if (inSingleLineComment && (char === "\n" || char === "\r")) {
      inSingleLineComment = false;
      currentStatement += char;
      i++;
      continue;
    }

    // Handle multi-line comments (/* comment */)
    if (
      !inSingleQuote &&
      !inDoubleQuote &&
      !inSingleLineComment &&
      char === "/" &&
      nextChar === "*"
    ) {
      inMultiLineComment = true;
      currentStatement += char;
      i++;
      continue;
    }

    // End multi-line comment
    if (inMultiLineComment && char === "*" && nextChar === "/") {
      inMultiLineComment = false;
      currentStatement += char + nextChar;
      i += 2;
      continue;
    }

    // Skip processing if we're in a comment
    if (inSingleLineComment || inMultiLineComment) {
      currentStatement += char;
      i++;
      continue;
    }

    // Handle single quotes (with escape sequences)
    if (char === "'" && !inDoubleQuote) {
      if (!inSingleQuote) {
        inSingleQuote = true;
      } else if (nextChar === "'") {
        // Handle escaped single quote ('')
        currentStatement += char + nextChar;
        i += 2;
        continue;
      } else if (prevChar !== "\\") {
        // End single quote (not escaped)
        inSingleQuote = false;
      }
    }

    // Handle double quotes (with escape sequences)
    if (char === '"' && !inSingleQuote) {
      if (!inDoubleQuote) {
        inDoubleQuote = true;
      } else if (prevChar !== "\\") {
        // End double quote (not escaped)
        inDoubleQuote = false;
      }
    }

    // Handle semicolon - only split if not within quotes or comments
    if (
      char === ";" &&
      !inSingleQuote &&
      !inDoubleQuote &&
      !inSingleLineComment &&
      !inMultiLineComment
    ) {
      // Add the current statement (without the semicolon)
      const trimmedStatement = currentStatement.trim();
      if (trimmedStatement.length > 0 && !trimmedStatement.startsWith("--")) {
        statements.push(trimmedStatement);
      }
      currentStatement = "";
      i++;
      continue;
    }

    currentStatement += char;
    i++;
  }

  // Add the final statement if there's content
  const finalStatement = currentStatement.trim();
  if (finalStatement.length > 0 && !finalStatement.startsWith("--")) {
    statements.push(finalStatement);
  }

  return statements;
}

async function runRebuildingCamelotMigration() {
  console.log("🏰 Running Rebuilding Camelot OTP System Migration...");

  try {
    // Read the migration file
    const migrationPath = join(
      process.cwd(),
      "migrations",
      "012_rebuilding_camelot_otp_system.sql"
    );
    const migrationSQL = readFileSync(migrationPath, "utf-8");

    // Split the migration into individual statements using robust parser
    const statements = splitSQLStatements(migrationSQL);

    console.log(`📝 Found ${statements.length} SQL statements to execute`);

    // Track failed statements
    let failedStatements = 0;

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      // Skip comments and empty statements
      if (statement.startsWith("--") || statement.trim().length === 0) {
        continue;
      }

      console.log(`⚡ Executing statement ${i + 1}/${statements.length}...`);

      try {
        const { error } = await supabase.rpc("exec_sql", { sql: statement });

        if (error) {
          console.error(`❌ Failed to execute statement ${i + 1}:`, error);
          console.error("Statement:", statement.substring(0, 100) + "...");
          failedStatements++;
          // Continue with other statements but track failures
        } else {
          console.log(`✅ Statement ${i + 1} executed successfully`);
        }
      } catch (execError) {
        console.warn(`⚠️  Statement ${i + 1} may have failed:`, execError);
        console.error("Statement:", statement.substring(0, 100) + "...");
        failedStatements++;
        // Continue with other statements
      }
    }

    // Report on failed statements
    if (failedStatements > 0) {
      console.warn(
        `⚠️  ${failedStatements} statement(s) failed during migration`
      );
    }

    // Verify the migration by checking if the table exists
    console.log("🔍 Verifying migration...");

    const { data: tableExists, error: checkError } = await supabase
      .from("family_otp_verification")
      .select("count", { count: "exact", head: true });

    if (checkError) {
      console.error("❌ Migration verification failed:", checkError);
      console.log(
        "⚠️  You may need to run the migration manually in your Supabase dashboard"
      );
      console.log("📄 Migration file location:", migrationPath);
    } else {
      console.log("✅ Migration verified successfully!");
      console.log("🎉 Rebuilding Camelot OTP system is ready to use");
    }

    // Check if vault functions are available
    console.log("🔐 Checking vault functions...");
    try {
      const { error: vaultError } = await supabase.rpc(
        "get_rebuilding_camelot_nip05"
      );
      if (vaultError) {
        console.warn(
          "⚠️  Vault functions may not be available:",
          vaultError.message
        );
        console.log("📝 Make sure to:");
        console.log("   1. Enable the Supabase Vault extension");
        console.log(
          "   2. Add your actual Rebuilding Camelot credentials to the vault"
        );
        console.log("   3. Replace placeholder values in the migration file");
      } else {
        console.log("✅ Vault functions are accessible");
      }
    } catch (vaultCheckError) {
      console.warn("⚠️  Could not verify vault functions:", vaultCheckError);
    }

    console.log("\n🚀 Migration completed!");
    console.log("\n📋 Next steps:");
    console.log("   1. Update your .env file with OTP_SALT if not already set");
    console.log("   2. Replace placeholder credentials in Supabase Vault");
    console.log("   3. Test OTP functionality with the updated API endpoints");
    console.log("\n🔗 API Endpoints:");
    console.log("   POST /api/auth/otp/initiate - Send OTP via Nostr DM");
    console.log("   POST /api/auth/otp/verify - Verify OTP code");
  } catch (error) {
    console.error("💥 Migration failed:", error);
    process.exit(1);
  }
}

// Run the migration
runRebuildingCamelotMigration().catch(console.error);
