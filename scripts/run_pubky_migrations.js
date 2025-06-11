/**
 * Run Pubky Migrations
 * 
 * This script runs the Pubky-related database migrations in the correct order.
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { config } = require('../config');

// Create a PostgreSQL connection pool
const pool = new Pool({
  connectionString: config.database.url,
});

// Migration files in order
const migrationFiles = [
  '20250601_add_pubky_tables.sql',
  '20250602_enhance_existing_tables.sql',
  '20250603_create_pubky_triggers.sql',
];

// Function to run a migration file
async function runMigration(filename) {
  console.log(`Running migration: ${filename}`);
  
  try {
    // Read the migration file
    const filePath = path.join(__dirname, '..', 'migrations', filename);
    const sql = await fs.promises.readFile(filePath, 'utf8');
    
    // Start a transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if migration has already been run
      const { rows } = await client.query(
        'SELECT * FROM schema_migrations WHERE migration_name = $1',
        [filename]
      );
      
      if (rows.length > 0) {
        console.log(`Migration ${filename} has already been run. Skipping.`);
        await client.query('ROLLBACK');
        return;
      }
      
      // Run the migration
      await client.query(sql);
      
      // Record the migration
      await client.query(
        'INSERT INTO schema_migrations (migration_name, applied_at) VALUES ($1, NOW())',
        [filename]
      );
      
      // Commit the transaction
      await client.query('COMMIT');
      console.log(`Migration ${filename} completed successfully.`);
    } catch (err) {
      // Rollback the transaction on error
      await client.query('ROLLBACK');
      console.error(`Error running migration ${filename}:`, err);
      throw err;
    } finally {
      // Release the client back to the pool
      client.release();
    }
  } catch (err) {
    console.error(`Error processing migration ${filename}:`, err);
    throw err;
  }
}

// Function to ensure the schema_migrations table exists
async function ensureSchemaTable() {
  const client = await pool.connect();
  
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        migration_name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
  } catch (err) {
    console.error('Error creating schema_migrations table:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Main function to run all migrations
async function runMigrations() {
  try {
    // Ensure the schema_migrations table exists
    await ensureSchemaTable();
    
    // Run each migration in order
    for (const file of migrationFiles) {
      await runMigration(file);
    }
    
    console.log('All migrations completed successfully.');
  } catch (err) {
    console.error('Migration process failed:', err);
    process.exit(1);
  } finally {
    // Close the pool
    await pool.end();
  }
}

// Run the migrations
runMigrations();