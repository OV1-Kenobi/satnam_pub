/**
 * Mock Database Helper
 * 
 * This file provides a mock database implementation for testing.
 */

import { v4 as uuidv4 } from 'uuid';
import { pubkyTestConfig } from '../config/pubky-test-config';

// Define interfaces for database entities
interface Family {
  id: string;
  name: string;
  pubky_enabled: boolean;
  pubky_url: string | null;
  pubky_public_key: string | null;
  pubky_homeserver_url: string;
  pubky_relay_url: string;
  created_at: Date;
  updated_at: Date;
}

interface User {
  id: string;
  name: string;
  pubky_url: string | null;
  pubky_public_key: string | null;
  pubky_private_key_encrypted: string | null;
  created_at: Date;
  updated_at: Date;
}

interface DomainRecord {
  id: string;
  family_id: string;
  domain_name: string;
  domain_type: string;
  pubky_enabled: boolean;
  pubky_homeserver_url?: string;
  pubky_relay_url?: string;
  sovereignty_score: number;
  created_at: Date;
  updated_at: Date;
}

interface PubkyDomain {
  id: string;
  domain_record_id: string;
  public_key: string;
  private_key_encrypted: string;
  homeserver_url: string;
  pkarr_relay_url: string;
  registration_status: string;
  last_verified_at: Date;
  created_at: Date;
  updated_at: Date;
}

interface PubkyKeypair {
  id: string;
  family_id: string;
  name: string;
  public_key: string;
  private_key_encrypted: string;
  key_type: string;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
}

interface DomainMigration {
  id: string;
  family_id: string;
  traditional_domain: string;
  pubky_url: string;
  pubky_public_key: string;
  migration_status: string;
  sovereignty_upgrade: boolean;
  migrated_at: Date;
  created_at: Date;
  updated_at: Date;
}

interface PkarrRecord {
  id: string;
  pubky_domain_id: string;
  record_type: string;
  record_name: string;
  record_value: string;
  ttl: number;
  publish_status: string;
  last_published_at?: Date;
  created_at: Date;
  updated_at: Date;
}

interface SovereigntyScore {
  id: string;
  domain_record_id: string;
  score: number;
  score_breakdown: Record<string, number>;
  calculated_at: Date;
  created_at: Date;
  updated_at: Date;
}

interface FederationGuardian {
  id: string;
  family_id: string;
  name: string;
  pubky_backup_status: string;
  pubky_backup_url: string;
  pubky_backup_last_updated: Date;
  created_at: Date;
  updated_at: Date;
}

// In-memory database for testing
const mockDatabase = {
  families: new Map<string, Family>(),
  users: new Map<string, User>(),
  domainRecords: new Map<string, DomainRecord>(),
  pubkyDomains: new Map<string, PubkyDomain>(),
  pubkyKeypairs: new Map<string, PubkyKeypair>(),
  domainMigrations: new Map<string, DomainMigration>(),
  pkarrRecords: new Map<string, PkarrRecord>(),
  sovereigntyScores: new Map<string, SovereigntyScore>(),
  federationGuardians: new Map<string, FederationGuardian>()
};

// Initialize with some test data
function initializeMockDatabase() {
  // Create test family
  const familyId = pubkyTestConfig.testFamilyId;
  mockDatabase.families.set(familyId, {
    id: familyId,
    name: pubkyTestConfig.testFamilyName,
    pubky_enabled: false,
    pubky_url: null,
    pubky_public_key: null,
    pubky_homeserver_url: pubkyTestConfig.homeserverUrl,
    pubky_relay_url: pubkyTestConfig.pkarrRelayUrl,
    created_at: new Date(),
    updated_at: new Date()
  });
  
  // Create test user
  const userId = pubkyTestConfig.testUserId;
  mockDatabase.users.set(userId, {
    id: userId,
    name: pubkyTestConfig.testUserName,
    pubky_url: null,
    pubky_public_key: null,
    pubky_private_key_encrypted: null,
    created_at: new Date(),
    updated_at: new Date()
  });
  
  // Create test traditional domain
  const traditionalDomainId = uuidv4();
  mockDatabase.domainRecords.set(traditionalDomainId, {
    id: traditionalDomainId,
    family_id: familyId,
    domain_name: pubkyTestConfig.testDomains.traditional,
    domain_type: 'traditional',
    pubky_enabled: false,
    sovereignty_score: 20,
    created_at: new Date(),
    updated_at: new Date()
  });
  
  // Create test Pubky domain
  const pubkyDomainRecordId = uuidv4();
  mockDatabase.domainRecords.set(pubkyDomainRecordId, {
    id: pubkyDomainRecordId,
    family_id: familyId,
    domain_name: pubkyTestConfig.testDomains.pubky,
    domain_type: 'pubky',
    pubky_enabled: true,
    pubky_homeserver_url: pubkyTestConfig.homeserverUrl,
    pubky_relay_url: pubkyTestConfig.pkarrRelayUrl,
    sovereignty_score: 85,
    created_at: new Date(),
    updated_at: new Date()
  });
  
  // Create test Pubky domain entry
  const pubkyDomainId = uuidv4();
  mockDatabase.pubkyDomains.set(pubkyDomainId, {
    id: pubkyDomainId,
    domain_record_id: pubkyDomainRecordId,
    public_key: pubkyTestConfig.testKeypairs[0].public_key,
    // TEST ONLY - Not actually encrypted for testing purposes
    private_key_encrypted: `TEST_KEY_${pubkyTestConfig.testKeypairs[0].private_key}`,
    homeserver_url: pubkyTestConfig.homeserverUrl,
    pkarr_relay_url: pubkyTestConfig.pkarrRelayUrl,
    registration_status: 'registered',
    last_verified_at: new Date(),
    created_at: new Date(),
    updated_at: new Date()
  });
  
  // Create test keypair
  const keypairId = uuidv4();
  mockDatabase.pubkyKeypairs.set(keypairId, {
    id: keypairId,
    family_id: familyId,
    name: 'Default Keypair',
    public_key: pubkyTestConfig.testKeypairs[0].public_key,
    // TEST ONLY - Not actually encrypted for testing purposes
    private_key_encrypted: `TEST_KEY_${pubkyTestConfig.testKeypairs[0].private_key}`,
    key_type: 'ed25519',
    is_default: true,
    created_at: new Date(),
    updated_at: new Date()
  });
  
  // Create test sovereignty score
  const traditionalScoreId = uuidv4();
  mockDatabase.sovereigntyScores.set(traditionalScoreId, {
    id: traditionalScoreId,
    domain_record_id: traditionalDomainId,
    score: 20,
    score_breakdown: pubkyTestConfig.testSovereigntyScores.traditional,
    calculated_at: new Date(),
    created_at: new Date(),
    updated_at: new Date()
  });
  
  const pubkyScoreId = uuidv4();
  mockDatabase.sovereigntyScores.set(pubkyScoreId, {
    id: pubkyScoreId,
    domain_record_id: pubkyDomainRecordId,
    score: 85,
    score_breakdown: pubkyTestConfig.testSovereigntyScores.pubky,
    calculated_at: new Date(),
    created_at: new Date(),
    updated_at: new Date()
  });
}

// Define query result interface
interface QueryResult {
  rows: Record<string, unknown>[];
}

// Mock query function
export function mockQuery(query: string, params: unknown[] = []): Promise<QueryResult> {
  // Simulate database delay
  const delay = Math.floor(
    Math.random() * 
    (pubkyTestConfig.dbMockBehavior.maxDelay - pubkyTestConfig.dbMockBehavior.minDelay) + 
    pubkyTestConfig.dbMockBehavior.minDelay
  );
  
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      // Simulate database errors
      if (
        pubkyTestConfig.dbMockBehavior.simulateErrors &&
        Math.random() < pubkyTestConfig.dbMockBehavior.errorProbability
      ) {
        reject(new Error('Simulated database error'));
        return;
      }
      
      try {
        // Handle different query types
        if (query.toUpperCase().startsWith('SELECT')) {
          resolve(handleSelect(query, params));
        } else if (query.toUpperCase().startsWith('INSERT')) {
          resolve(handleInsert(query, params));
        } else if (query.toUpperCase().startsWith('UPDATE')) {
          resolve(handleUpdate(query, params));
        } else if (query.toUpperCase().startsWith('DELETE')) {
          resolve(handleDelete(query, params));
        } else {
          // Other queries (e.g., CREATE TABLE)
          resolve({ rows: [] });
        }
      } catch (error) {
        reject(error);
      }
    }, delay);
  });
}

// Handle SELECT queries
function handleSelect(query: string, params: unknown[]): { rows: Record<string, unknown>[] } {
  // Extract table name from query
  const tableMatch = query.match(/FROM\s+([a-z_]+)/i);
  if (!tableMatch) {
    return { rows: [] };
  }
  
  const tableName = tableMatch[1];
  let results: Record<string, unknown>[] = [];
  
  // Handle different tables
  switch (tableName) {
    case 'families':
      results = Array.from(mockDatabase.families.values());
      break;
    case 'users':
      results = Array.from(mockDatabase.users.values());
      break;
    case 'domain_records':
      results = Array.from(mockDatabase.domainRecords.values());
      break;
    case 'pubky_domains':
      results = Array.from(mockDatabase.pubkyDomains.values());
      break;
    case 'pubky_keypairs':
      results = Array.from(mockDatabase.pubkyKeypairs.values());
      break;
    case 'domain_migrations':
      results = Array.from(mockDatabase.domainMigrations.values());
      break;
    case 'pkarr_records':
      results = Array.from(mockDatabase.pkarrRecords.values());
      break;
    case 'sovereignty_scores':
      results = Array.from(mockDatabase.sovereigntyScores.values());
      break;
    case 'federation_guardians':
      results = Array.from(mockDatabase.federationGuardians.values());
      break;
    default:
      return { rows: [] };
  }
  
  // Apply WHERE conditions
  if (query.toUpperCase().includes('WHERE') && params.length > 0) {
    // Extract WHERE conditions
    const whereMatch = query.match(/WHERE\s+(.+?)(?:ORDER BY|GROUP BY|LIMIT|$)/i);
    if (whereMatch) {
      const whereCondition = whereMatch[1];
      
      // Simple condition parsing (this is a simplified version)
      // In a real implementation, this would be more sophisticated
      if (whereCondition.includes('id = $1')) {
        results = results.filter(row => row.id === params[0]);
      } else if (whereCondition.includes('family_id = $1')) {
        results = results.filter(row => row.family_id === params[0]);
      } else if (whereCondition.includes('domain_record_id = $1')) {
        results = results.filter(row => row.domain_record_id === params[0]);
      }
    }
  }
  
  // Convert column names to camelCase if needed
  if (query.includes(' as "')) {
    const camelCaseResults = results.map(row => {
      const camelCaseRow: Record<string, unknown> = {};
      
      // Extract column aliases from the query
      const aliasMatches = Array.from(query.matchAll(/([a-z_]+)\s+as\s+"([a-zA-Z]+)"/g));
      
      for (const [, columnName, alias] of aliasMatches) {
        camelCaseRow[alias] = row[columnName as keyof typeof row];
      }
      
      return camelCaseRow;
    });
    
    return { rows: camelCaseResults };
  }
  
  return { rows: results };
}

// Handle INSERT queries
function handleInsert(query: string, params: unknown[]): { rows: Record<string, unknown>[] } {
  // Extract table name from query
  const tableMatch = query.match(/INTO\s+([a-z_]+)/i);
  if (!tableMatch) {
    return { rows: [] };
  }
  
  const tableName = tableMatch[1];
  const id = params[0] || uuidv4();
  
  // Create a new row based on the table
  const newRow: Record<string, unknown> = { id };
  
  // Extract column names from query
  const columnMatch = query.match(/\(([^)]+)\)/);
  if (columnMatch) {
    const columns = columnMatch[1].split(',').map(col => col.trim());
    
    // Assign values to columns
    for (let i = 0; i < columns.length; i++) {
      if (columns[i] !== 'id') {
        newRow[columns[i]] = params[i] || null;
      }
    }
  }
  
  // Add timestamps
  const now = new Date();
  newRow.created_at = now;
  newRow.updated_at = now;
  
  // Add to the appropriate table
  switch (tableName) {
    case 'families':
      mockDatabase.families.set(id, newRow);
      break;
    case 'users':
      mockDatabase.users.set(id, newRow);
      break;
    case 'domain_records':
      mockDatabase.domainRecords.set(id, newRow);
      break;
    case 'pubky_domains':
      mockDatabase.pubkyDomains.set(id, newRow);
      break;
    case 'pubky_keypairs':
      mockDatabase.pubkyKeypairs.set(id, newRow);
      break;
    case 'domain_migrations':
      mockDatabase.domainMigrations.set(id, newRow);
      break;
    case 'pkarr_records':
      mockDatabase.pkarrRecords.set(id, newRow);
      break;
    case 'sovereignty_scores':
      mockDatabase.sovereigntyScores.set(id, newRow);
      break;
    case 'federation_guardians':
      mockDatabase.federationGuardians.set(id, newRow);
      break;
  }
  
  // Convert to camelCase for the result
  const camelCaseRow: Record<string, unknown> = {};
  Object.entries(newRow).forEach(([key, value]) => {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    camelCaseRow[camelKey] = value;
  });
  
  return { rows: [camelCaseRow] };
}

// Handle UPDATE queries
function handleUpdate(query: string, params: unknown[]): { rows: Record<string, unknown>[] } {
  // Extract table name from query
  const tableMatch = query.match(/UPDATE\s+([a-z_]+)/i);
  if (!tableMatch) {
    return { rows: [] };
  }
  
  const tableName = tableMatch[1];
  
  // Extract WHERE condition
  const whereMatch = query.match(/WHERE\s+(.+?)(?:RETURNING|$)/i);
  if (!whereMatch) {
    return { rows: [] };
  }
  
  const whereCondition = whereMatch[1];
  let targetMap: Map<string, Record<string, unknown>>;
  
  // Determine which table to update
  switch (tableName) {
    case 'families':
      targetMap = mockDatabase.families;
      break;
    case 'users':
      targetMap = mockDatabase.users;
      break;
    case 'domain_records':
      targetMap = mockDatabase.domainRecords;
      break;
    case 'pubky_domains':
      targetMap = mockDatabase.pubkyDomains;
      break;
    case 'pubky_keypairs':
      targetMap = mockDatabase.pubkyKeypairs;
      break;
    case 'domain_migrations':
      targetMap = mockDatabase.domainMigrations;
      break;
    case 'pkarr_records':
      targetMap = mockDatabase.pkarrRecords;
      break;
    case 'sovereignty_scores':
      targetMap = mockDatabase.sovereigntyScores;
      break;
    case 'federation_guardians':
      targetMap = mockDatabase.federationGuardians;
      break;
    default:
      return { rows: [] };
  }
  
  // Find the row to update
  let targetId: string | null = null;
  
  if (whereCondition.includes('id = $')) {
    const paramIndex = parseInt(whereCondition.match(/id = \$(\d+)/)?.[1] || '1') - 1;
    targetId = params[paramIndex];
  }
  
  if (!targetId || !targetMap.has(targetId)) {
    return { rows: [] };
  }
  
  // Get the existing row
  const existingRow = targetMap.get(targetId);
  
  // Extract SET clause
  const setMatch = query.match(/SET\s+(.+?)(?:WHERE|RETURNING|$)/i);
  if (!setMatch) {
    return { rows: [] };
  }
  
  const setClauses = setMatch[1].split(',').map(clause => clause.trim());
  
  // Update the row
  for (const clause of setClauses) {
    const [column, value] = clause.split('=').map(part => part.trim());
    
    if (value.startsWith('$')) {
      const paramIndex = parseInt(value.substring(1)) - 1;
      existingRow[column] = params[paramIndex];
    } else if (value === 'NOW()') {
      existingRow[column] = new Date();
    }
  }
  
  // Always update the updated_at timestamp
  existingRow.updated_at = new Date();
  
  // Save the updated row
  targetMap.set(targetId, existingRow);
  
  // Convert to camelCase for the result
  const camelCaseRow: Record<string, unknown> = {};
  Object.entries(existingRow).forEach(([key, value]) => {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    camelCaseRow[camelKey] = value;
  });
  
  return { rows: [camelCaseRow] };
}

// Handle DELETE queries
function handleDelete(query: string, params: unknown[]): { rows: Record<string, unknown>[] } {
  // Extract table name from query
  const tableMatch = query.match(/FROM\s+([a-z_]+)/i);
  if (!tableMatch) {
    return { rows: [] };
  }
  
  const tableName = tableMatch[1];
  
  // Extract WHERE condition
  const whereMatch = query.match(/WHERE\s+(.+?)(?:RETURNING|$)/i);
  if (!whereMatch) {
    return { rows: [] };
  }
  
  const whereCondition = whereMatch[1];
  let targetMap: Map<string, Record<string, unknown>>;
  
  // Determine which table to delete from
  switch (tableName) {
    case 'families':
      targetMap = mockDatabase.families;
      break;
    case 'users':
      targetMap = mockDatabase.users;
      break;
    case 'domain_records':
      targetMap = mockDatabase.domainRecords;
      break;
    case 'pubky_domains':
      targetMap = mockDatabase.pubkyDomains;
      break;
    case 'pubky_keypairs':
      targetMap = mockDatabase.pubkyKeypairs;
      break;
    case 'domain_migrations':
      targetMap = mockDatabase.domainMigrations;
      break;
    case 'pkarr_records':
      targetMap = mockDatabase.pkarrRecords;
      break;
    case 'sovereignty_scores':
      targetMap = mockDatabase.sovereigntyScores;
      break;
    case 'federation_guardians':
      targetMap = mockDatabase.federationGuardians;
      break;
    default:
      return { rows: [] };
  }
  
  // Find the row to delete
  let targetId: string | null = null;
  
  if (whereCondition.includes('id = $')) {
    const paramIndex = parseInt(whereCondition.match(/id = \$(\d+)/)?.[1] || '1') - 1;
    targetId = params[paramIndex];
  }
  
  if (!targetId || !targetMap.has(targetId)) {
    return { rows: [] };
  }
  
  // Get the row before deleting
  const deletedRow = targetMap.get(targetId);
  
  // Delete the row
  targetMap.delete(targetId);
  
  // Convert to camelCase for the result
  const camelCaseRow: Record<string, unknown> = {};
  Object.entries(deletedRow).forEach(([key, value]) => {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    camelCaseRow[camelKey] = value;
  });
  
  return { rows: [camelCaseRow] };
}

// Initialize the mock database
initializeMockDatabase();

// Export the mock database and query function
export const mockDb = {
  query: mockQuery,
  reset: initializeMockDatabase
};