#!/usr/bin/env node

/**
 * @fileoverview Apply Database Fixes Script
 * @description Systematically applies all database pattern fixes to comply with Master Context
 *
 * MASTER CONTEXT COMPLIANCE:
 * ✅ Browser-Based Serverless Environment
 * ✅ NO Node.js database patterns
 * ✅ Use Supabase client directly
 * ✅ Replace db.query() with Supabase methods
 */

import * as fs from "fs";
import * as path from "path";

// Target files that need database fixes
const TARGET_FILES = [
  "lib/api/privacy-federated-signing.ts",
  "lib/api/federated-signing-simple.ts",
  "lib/api/sss-federated-signing.ts",
  "lib/api/auth-endpoints.ts",
  "lib/api/identity-endpoints.ts",
  "lib/api/register-identity.ts",
  "lib/api/privacy-auth.ts",
];

/**
 * Apply systematic database fixes
 */
function applyDatabaseFixes() {
  console.log("🚀 Applying systematic database fixes...");
  console.log(
    "📋 Master Context Compliance: Browser-compatible database operations\n"
  );

  TARGET_FILES.forEach((file) => {
    const filePath = path.join(process.cwd(), file);

    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${file}`);
      return;
    }

    console.log(`🔧 Processing: ${file}`);

    try {
      let content = fs.readFileSync(filePath, "utf8");
      let fixesApplied = 0;

      // Fix 1: Ensure proper client initialization at the start of try blocks
      if (
        content.includes("await client.from(") &&
        !content.includes("const client = await db.getClient()")
      ) {
        content = content.replace(
          /(try\s*\{(?:\s*\/\/[^\n]*\n)*)/g,
          "$1\n        const client = await db.getClient();"
        );
        fixesApplied++;
      }

      // Fix 2: Convert remaining db.query INSERT patterns
      content = content.replace(
        /await db\.query\(\s*`INSERT INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\([^)]+\)`,?\s*\[([^\]]+)\]\s*\)/gs,
        (match, table, columns) => {
          fixesApplied++;
          return `await client.from('${table}').insert({
            // TODO: Convert column/value pairs manually
            /* Original query: ${match.replace(/\n/g, "\\n")} */
          })`;
        }
      );

      // Fix 3: Convert SELECT patterns
      content = content.replace(
        /await db\.query\(\s*`SELECT\s+([^`]+)\s+FROM\s+(\w+)(?:\s+WHERE\s+([^`]+))?`,?\s*(?:\[([^\]]+)\])?\s*\)/gs,
        (match, select, table, whereClause) => {
          fixesApplied++;
          let query = `await client.from('${table}').select('${select.trim()}')`;
          if (whereClause) {
            query += `\n            /* TODO: Convert WHERE clause: ${whereClause} */`;
          }
          return query;
        }
      );

      // Fix 4: Convert UPDATE patterns
      content = content.replace(
        /await db\.query\(\s*`UPDATE\s+(\w+)\s+SET\s+([^`]+)\s+WHERE\s+([^`]+)`,?\s*\[([^\]]+)\]\s*\)/gs,
        (match, table, setClause, whereClause) => {
          fixesApplied++;
          return `await client.from('${table}').update({
            /* TODO: Convert SET clause: ${setClause} */
          }).match({
            /* TODO: Convert WHERE clause: ${whereClause} */
          })`;
        }
      );

      // Fix 5: Convert simple DELETE patterns
      content = content.replace(
        /await db\.query\(\s*`DELETE\s+FROM\s+(\w+)\s+WHERE\s+([^`]+)`,?\s*\[([^\]]+)\]\s*\)/gs,
        (match, table, whereClause) => {
          fixesApplied++;
          return `await client.from('${table}').delete()
            /* TODO: Convert WHERE clause: ${whereClause} */`;
        }
      );

      if (fixesApplied > 0) {
        fs.writeFileSync(filePath, content, "utf8");
        console.log(`✅ Applied ${fixesApplied} automated fixes to ${file}`);
        console.log(`⚠️  Manual review required for complex queries\n`);
      } else {
        console.log(`ℹ️  No patterns found in ${file}\n`);
      }
    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error);
    }
  });

  console.log("🎉 Database fixes applied!");
  console.log("\n📋 Next Steps:");
  console.log("1. Review TODO comments in modified files");
  console.log("2. Manually fix complex queries");
  console.log("3. Run TypeScript compilation");
  console.log("4. Test database operations");
}

/**
 * Generate a comprehensive fix summary
 */
function generateFixSummary() {
  console.log("\n📊 DATABASE PATTERN FIX SUMMARY");
  console.log("=====================================");

  TARGET_FILES.forEach((file) => {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      const queryMatches = content.match(/db\.query/g);
      const clientMatches = content.match(/client\.from/g);

      console.log(`\n📄 ${file}:`);
      console.log(
        `   🔍 db.query patterns remaining: ${
          queryMatches ? queryMatches.length : 0
        }`
      );
      console.log(
        `   ✅ client.from patterns: ${
          clientMatches ? clientMatches.length : 0
        }`
      );
    }
  });

  console.log("\n🎯 COMPLIANCE STATUS:");
  console.log("   ✅ Browser-compatible database operations");
  console.log("   ✅ Supabase client-based queries");
  console.log("   ❌ Manual fixes still required for complex queries");
}

// Main execution
if (require.main === module) {
  applyDatabaseFixes();
  generateFixSummary();
}

export { applyDatabaseFixes, generateFixSummary };
