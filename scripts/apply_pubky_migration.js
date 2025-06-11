/**
 * Script to apply the Pubky integration migration
 * 
 * This script reads the SQL migration file and executes it against the database.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

// Initialize environment variables
dotenv.config();

// Get current file directory (ES modules don't have __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a database connection pool
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' 
    ? {
        rejectUnauthorized: process.env.NODE_ENV === 'production',
        ca: process.env.DATABASE_CA_CERT,
      }
    : undefined,
});

async function applyMigration() {
  try {
    console.log('Applying Pubky integration migration...');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'migrations', 'pubky_integration.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Start a transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Execute the migration
      await client.query(migrationSQL);
      
      await client.query('COMMIT');
      console.log('Migration applied successfully!');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error applying migration:', error);
      process.exit(1);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the migration
applyMigration();