#!/usr/bin/env node

/**
 * Database migration script
 * Usage: npm run migrate
 */

import db from "../lib/db.js";

async function main() {
  try {
    console.log("🚀 Starting database migrations...");

    // Run migrations
    await (db as any).migrations.runMigrations();

    console.log("✅ All migrations completed successfully!");

    // Show executed migrations
    const executedMigrations = await (
      db as any
    ).migrations.getExecutedMigrations();
    console.log("\n📋 Executed migrations:");
    executedMigrations.forEach((migration: any) => {
      console.log(`  ✓ ${migration}`);
    });
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    // Close database connection
    (db as any).end();
  }
}

main().catch(console.error);
