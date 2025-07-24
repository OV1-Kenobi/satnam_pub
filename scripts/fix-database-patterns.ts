#!/usr/bin/env tsx

/**
 * @fileoverview Database Pattern Fix Script
 * @description Systematically fixes all db.query() patterns to comply with Master Context
 *
 * FIXES APPLIED:
 * ✅ Convert db.query() to proper Supabase client usage
 * ✅ Replace raw SQL with Supabase API calls
 * ✅ Ensure browser-compatible database operations
 * ✅ Follow Master Context guidelines
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

// Files that need database pattern fixes
const FILES_TO_FIX = [
  "lib/api/privacy-federated-signing.ts",
  "lib/api/federated-signing-simple.ts",
  "lib/api/sss-federated-signing.ts",
  "lib/api/auth-endpoints.ts",
  "lib/api/identity-endpoints.ts",
  "lib/api/register-identity.ts",
  "lib/api/privacy-auth.ts",
];

// Common database query patterns to fix
const QUERY_PATTERNS = [
  // INSERT patterns
  {
    pattern:
      /await db\.query\(\s*`INSERT INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)`,?\s*\[([^\]]+)\]\s*\)/gs,
    replacement: `await client.from('$1').insert({\n$2\n})`,
  },

  // SELECT patterns
  {
    pattern:
      /await db\.query\(\s*`SELECT\s+([^`]+)\s+FROM\s+(\w+)(?:\s+WHERE\s+([^`]+))?`,?\s*(?:\[([^\]]+)\])?\s*\)/gs,
    replacement: `await client.from('$2').select('$1')$3`,
  },

  // UPDATE patterns
  {
    pattern:
      /await db\.query\(\s*`UPDATE\s+(\w+)\s+SET\s+([^`]+)\s+WHERE\s+([^`]+)`,?\s*\[([^\]]+)\]\s*\)/gs,
    replacement: `await client.from('$1').update({\n$2\n}).match({\n$3\n})`,
  },

  // DELETE patterns
  {
    pattern:
      /await db\.query\(\s*`DELETE\s+FROM\s+(\w+)\s+WHERE\s+([^`]+)`,?\s*\[([^\]]+)\]\s*\)/gs,
    replacement: `await client.from('$1').delete().match({\n$2\n})`,
  },
];

/**
 * Convert SQL INSERT values to Supabase object format
 */
function convertInsertToSupabase(
  columns: string,
  values: string,
  params: string
): string {
  const columnArray = columns.split(",").map((c) => c.trim());
  const paramArray = params.split(",").map((p) => p.trim());

  let result = "";
  columnArray.forEach((col: string, i: number) => {
    if (i > 0) result += ",\n            ";
    result += `${col}: ${paramArray[i] || "undefined"}`;
  });

  return result;
}

/**
 * Fix database patterns in a single file
 */
function fixFilePatterns(filePath: string): void {
  console.log(`\n🔧 Fixing database patterns in: ${filePath}`);

  try {
    const fullPath = join(process.cwd(), filePath);
    let content = readFileSync(fullPath, "utf8");
    let fixesApplied = 0;

    // Step 1: Fix basic db.query patterns
    content = content.replace(
      /await db\.query\(\s*`INSERT INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\([^)]+\)`,?\s*\[([^\]]+)\]\s*\)/gs,
      (match, table, columns, params) => {
        fixesApplied++;
        const columnArray = columns.split(",").map((c: string) => c.trim());
        const paramArray = params.split(",").map((p: string) => p.trim());

        let insertObject = "{\n";
        columnArray.forEach((col: string, i: number) => {
          if (i > 0) insertObject += ",\n";
          insertObject += `            ${col}: ${paramArray[i] || "undefined"}`;
        });
        insertObject += "\n          }";

        return `await client.from('${table}').insert(${insertObject})`;
      }
    );

    // Step 2: Fix SELECT patterns
    content = content.replace(
      /await db\.query\(\s*`SELECT\s+([^`]+)\s+FROM\s+(\w+)(?:\s+WHERE\s+([^`]+))?`,?\s*(?:\[([^\]]+)\])?\s*\)/gs,
      (match, select, table, where, params) => {
        fixesApplied++;
        let query = `await client.from('${table}').select('${select
          .replace(/\s+/g, " ")
          .trim()}')`;

        if (where) {
          // Convert WHERE clause to Supabase filters
          if (where.includes("=")) {
            const conditions = where.split("=").map((c: string) => c.trim());
            query += `.eq('${conditions[0]}', ${conditions[1]})`;
          }
        }

        return query;
      }
    );

    // Step 3: Fix UPDATE patterns
    content = content.replace(
      /await db\.query\(\s*`UPDATE\s+(\w+)\s+SET\s+([^`]+)\s+WHERE\s+([^`]+)`,?\s*\[([^\]]+)\]\s*\)/gs,
      (match, table, setClause, whereClause, params) => {
        fixesApplied++;
        return `await client.from('${table}').update({\n            ${setClause}\n          }).match({\n            ${whereClause}\n          })`;
      }
    );

    // Step 4: Ensure proper client initialization
    if (
      content.includes("await client.from(") &&
      !content.includes("const client = await db.getClient()")
    ) {
      content = content.replace(
        /(try\s*\{)/g,
        `$1\n        const client = await db.getClient();`
      );
      fixesApplied++;
    }

    if (fixesApplied > 0) {
      writeFileSync(fullPath, content, "utf8");
      console.log(`✅ Applied ${fixesApplied} fixes to ${filePath}`);
    } else {
      console.log(`ℹ️  No fixes needed for ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ Error fixing ${filePath}:`, error);
  }
}

/**
 * Main execution function
 */
function main(): void {
  console.log("🚀 Starting systematic database pattern fixes...");
  console.log("📋 Master Context Compliance:");
  console.log("   ✅ Browser-compatible database operations");
  console.log("   ✅ Supabase client instead of raw SQL");
  console.log("   ✅ No Node.js database patterns");
  console.log("");

  let totalFixes = 0;

  FILES_TO_FIX.forEach((file) => {
    try {
      fixFilePatterns(file);
      totalFixes++;
    } catch (error) {
      console.error(`❌ Failed to process ${file}:`, error);
    }
  });

  console.log(`\n🎉 Database pattern fixes completed!`);
  console.log(`📊 Files processed: ${totalFixes}/${FILES_TO_FIX.length}`);
  console.log(`\n📋 Next steps:`);
  console.log(`   1. Run TypeScript compilation to check for errors`);
  console.log(`   2. Test database operations`);
  console.log(`   3. Update any remaining manual patterns`);
}

// Run the fix script
// Using ES modules pattern instead of CommonJS
if (import.meta.url === import.meta.resolve("./fix-database-patterns.ts")) {
  main();
}

export { fixFilePatterns, main };
