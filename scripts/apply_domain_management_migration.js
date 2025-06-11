/**
 * Apply Domain Management Migration
 * 
 * This script applies the domain management migration to the database.
 */

import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Initialize dotenv
dotenv.config();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function applyMigration() {
  try {
    // Read migration file
    const migrationPath = path.join(__dirname, '..', 'migrations', 'domain_management.sql');
    const migration = fs.readFileSync(migrationPath, 'utf8');
    console.log('Migration file read successfully');
    
    // In development mode, we can just log the migration without applying it
    if (process.env.NODE_ENV !== 'production') {
      console.log('In development mode, migration is not applied to the database');
      console.log('Migration simulation completed successfully');
      return;
    }
    
    // Connect to the database
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
    });
    
    await client.connect();
    console.log('Connected to database');

    // Apply migration
    console.log('Applying domain management migration...');
    await client.query(migration);
    console.log('Migration applied successfully');

    // Create initial domain members for existing domains
    console.log('Creating initial domain members for existing domains...');
    const domainsResult = await client.query(`
      SELECT dr.id, dr.family_id, f.admin_id
      FROM domain_records dr
      JOIN families f ON dr.family_id = f.id
      WHERE NOT EXISTS (
        SELECT 1 FROM domain_members dm WHERE dm.domain_record_id = dr.id
      )
    `);

    for (const domain of domainsResult.rows) {
      console.log(`Creating owner for domain ${domain.id}`);
      await client.query(`
        INSERT INTO domain_members (
          domain_record_id, user_id, role, permissions, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, NOW(), NOW())
      `, [domain.id, domain.admin_id, 'owner', JSON.stringify(['manage', 'edit', 'view'])]);
    }

    console.log('Initial domain members created successfully');
    
    await client.end();
    console.log('Disconnected from database');
  } catch (error) {
    console.error('Error applying migration:', error);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
}

applyMigration().catch(error => {
  console.error('Unhandled error in migration script:', error);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});