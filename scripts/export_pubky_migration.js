/**
 * Script to export the Pubky integration migration SQL to a file
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current file directory (ES modules don't have __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function exportMigration() {
  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'migrations', 'pubky_integration.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Write to an output file
    const outputPath = path.join(__dirname, '..', 'pubky_migration_export.sql');
    fs.writeFileSync(outputPath, migrationSQL, 'utf8');
    
    console.log(`Migration SQL exported to: ${outputPath}`);
    console.log('You can now run this SQL file directly in your database client.');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Export the migration
exportMigration();