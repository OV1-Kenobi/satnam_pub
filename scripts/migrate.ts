#!/usr/bin/env node

/**
 * Database migration script
 * Usage: npm run migrate
 */

import db from "../lib/db";

async function main() {
  try {
    console.log("🚀 Starting database migrations...");

    // Run migrations
    await db.migrations.runMigrations();

    console.log("✅ All migrations completed successfully!");

    // Show executed migrations
    const executedMigrations = await db.migrations.getExecutedMigrations();
    console.log("\n📋 Executed migrations:");
    executedMigrations.forEach((migration) => {
      console.log(`  ✓ ${migration}`);
    });
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    // Close database connection
    db.end();
  }
}

main().catch(console.error);
