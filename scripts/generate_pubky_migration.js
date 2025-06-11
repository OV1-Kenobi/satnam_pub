/**
 * Script to generate the Pubky integration migration SQL
 * 
 * This script outputs the SQL migration to the console, which can then be run manually.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current file directory (ES modules don't have __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateMigration() {
  try {
    console.log('Generating Pubky integration migration SQL...');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'migrations', 'pubky_integration.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Output the SQL to the console
    console.log('\n--- SQL Migration ---\n');
    console.log(migrationSQL);
    console.log('\n--- End of SQL Migration ---\n');
    
    console.log('Copy the SQL above and run it in your database client.');
    console.log('Alternatively, create a .env file with the correct DATABASE_URL and run apply_pubky_migration.js');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Generate the migration
generateMigration();