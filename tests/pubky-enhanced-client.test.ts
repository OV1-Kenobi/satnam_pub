/**
 * Enhanced Pubky Client Tests
 * 
 * This file contains tests for the enhanced Pubky client implementation.
 */

import { EnhancedPubkyClient, PubkyKeypair } from '../lib/pubky-enhanced-client';
import { pubkyTestConfig } from './config/pubky-test-config';
import { v4 as uuidv4 } from 'uuid';

// Mock axios for testing
jest.mock('axios', () => ({
  default: {
    post: jest.fn().mockImplementation((url) => {
      if (url.includes('/publish')) {
        return Promise.resolve({ status: 200, data: { success: true } });
      }
      return Promise.resolve({ status: 200 });
    }),
    get: jest.fn().mockImplementation((url) => {
      if (url.includes('/resolve')) {
        return Promise.resolve({
          status: 200,
          data: {
            content: { message: 'Test content' },
            content_type: 'application/json',
            content_hash: 'test-hash',
            signature: 'test-signature',
            timestamp: Date.now(),
            public_key: 'test-public-key'
          }
        });
      }
      return Promise.resolve({ status: 200 });
    })
  },
  // Provide named exports too (covers both import styles)
  post: jest.fn().mockImplementation((url) => {
    if (url.includes('/publish')) {
      return Promise.resolve({ status: 200, data: { success: true } });
    }
    return Promise.resolve({ status: 200 });
  }),
  get: jest.fn().mockImplementation((url) => {
    if (url.includes('/resolve')) {
      return Promise.resolve({
        status: 200,
        data: {
          content: { message: 'Test content' },
          content_type: 'application/json',
          content_hash: 'test-hash',
          signature: 'test-signature',
          timestamp: Date.now(),
          public_key: 'test-public-key'
        }
      });
    }
    return Promise.resolve({ status: 200 });
  })
}));

// Mock database for testing
jest.mock('../lib/db', () => ({
  query: jest.fn().mockImplementation(() => {
    return Promise.resolve({ rows: [{ id: uuidv4() }] });
  })
}));

describe('Enhanced Pubky Client', () => {
  let client: EnhancedPubkyClient;
  let testKeypair: PubkyKeypair;
  
  beforeAll(() => {
    // Initialize client with test configuration
    client = new EnhancedPubkyClient({
      homeserver_url: pubkyTestConfig.homeserverUrl,
      pkarr_relays: [pubkyTestConfig.pkarrRelayUrl],
      storage_provider: 'memory', // Use memory storage for tests
      debug: true
    });
  });
  
  test('should generate valid Pubky keypairs', async () => {
    // Generate a keypair
    testKeypair = await client.generatePubkyKeypair();
    
    // Verify keypair structure
    expect(testKeypair).toHaveProperty('private_key');
    expect(testKeypair).toHaveProperty('public_key');
    expect(testKeypair).toHaveProperty('pubky_url');
    expect(testKeypair).toHaveProperty('z32_address');
    
    // Verify pubky URL format
    expect(testKeypair.pubky_url).toMatch(/^pubky:\/\/[a-z0-9]+$/);
    
    // Verify key lengths
    expect(testKeypair.private_key.length).toBeGreaterThanOrEqual(64);
    expect(testKeypair.public_key.length).toBeGreaterThanOrEqual(64);
  });
  
  test('should import existing keypairs', async () => {
    // Use a pre-generated keypair from test config
    const importedKeypair = await client.importKeypair(pubkyTestConfig.testKeypairs[0].private_key);
    
    // Verify imported keypair
    expect(importedKeypair).toHaveProperty('private_key');
    expect(importedKeypair).toHaveProperty('public_key');
    expect(importedKeypair).toHaveProperty('pubky_url');
    expect(importedKeypair).toHaveProperty('z32_address');
  });
  
  test('should register Pubky domains with PKARR', async () => {
    // Create test domain records
    const domainRecords = [
      {
        name: '@',
        type: 'TXT',
        value: 'pubky-verification=true',
        ttl: 3600
      },
      {
        name: '_pubky',
        type: 'TXT',
        value: 'v=pubky1',
        ttl: 3600
      }
    ];
    
    // Register domain
    const result = await client.registerPubkyDomain(testKeypair, domainRecords);
    
    // Verify registration result
    expect(result).toHaveProperty('pubky_url');
    expect(result).toHaveProperty('pkarr_published');
    expect(result).toHaveProperty('domain_records');
    expect(result).toHaveProperty('sovereignty_score');
    
    expect(result.pubky_url).toBe(testKeypair.pubky_url);
    expect(result.pkarr_published).toBe(true);
    expect(result.sovereignty_score).toBe(100);
  });
  
  test('should publish content to Pubky URLs', async () => {
    // Create test content
    const testContent = {
      title: 'Test Document',
      content: 'This is a test document for Pubky content publishing',
      timestamp: Date.now()
    };
    
    // Publish content
    const result = await client.publishContent(
      testKeypair,
      '/test-document',
      testContent,
      'application/json'
    );
    
    // Verify publish result
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('pubky_url');
    expect(result).toHaveProperty('content_hash');
    expect(result).toHaveProperty('timestamp');
    
    expect(result.success).toBe(true);
    expect(result.pubky_url).toBe(`${testKeypair.pubky_url}/test-document`);
  });
  
  test('should resolve Pubky URLs', async () => {
    // Resolve content
    const content = await client.resolvePubkyUrl(`${testKeypair.pubky_url}/test-document`);
    
    // Verify resolved content
    expect(content).not.toBeNull();
    expect(content).toHaveProperty('content');
    expect(content).toHaveProperty('content_type');
    expect(content).toHaveProperty('content_hash');
    expect(content).toHaveProperty('signature');
    expect(content).toHaveProperty('timestamp');
    expect(content).toHaveProperty('public_key');
  });
  
  test('should migrate family domains to Pubky', async () => {
    // Generate guardian keypairs
    const guardianKeypairs = [
      await client.generatePubkyKeypair(),
      await client.generatePubkyKeypair(),
      await client.generatePubkyKeypair()
    ];
    
    // Migrate domain
    const result = await client.migrateFamilyDomainToPubky(
      'test-family.com',
      `test-family-${uuidv4()}`,
      guardianKeypairs
    );
    
    // Verify migration result
    expect(result).toHaveProperty('family_id');
    expect(result).toHaveProperty('traditional_domain');
    expect(result).toHaveProperty('pubky_url');
    expect(result).toHaveProperty('sovereignty_score_improvement');
    expect(result).toHaveProperty('migration_success');
    
    expect(result.traditional_domain).toBe('test-family.com');
    expect(result.sovereignty_score_improvement).toBe(85);
    expect(result.migration_success).toBe(true);
  });
  
  test('should verify domain ownership cryptographically', async () => {
    // Verify ownership with correct keypair
    const isOwner = await client.verifyDomainOwnership(
      testKeypair.pubky_url,
      testKeypair.private_key
    );
    
    expect(isOwner).toBe(true);
    
    // Verify ownership with incorrect keypair
    const wrongKeypair = await client.generatePubkyKeypair();
    const isNotOwner = await client.verifyDomainOwnership(
      testKeypair.pubky_url,
      wrongKeypair.private_key
    );
    
    expect(isNotOwner).toBe(false);
  });
  
  test('should rotate keypairs for Pubky domains', async () => {
    // Create test domain records
    const domainRecords = [
      {
        name: '@',
        type: 'TXT',
        value: 'pubky-verification=true',
        ttl: 3600
      }
    ];
    
    // Rotate keypair
    const newKeypair = await client.rotateKeypair(testKeypair, domainRecords);
    
    // Verify new keypair
    expect(newKeypair).toHaveProperty('private_key');
    expect(newKeypair).toHaveProperty('public_key');
    expect(newKeypair).toHaveProperty('pubky_url');
    expect(newKeypair).toHaveProperty('z32_address');
    
    // Verify keys are different
    expect(newKeypair.private_key).not.toBe(testKeypair.private_key);
    expect(newKeypair.public_key).not.toBe(testKeypair.public_key);
    expect(newKeypair.pubky_url).not.toBe(testKeypair.pubky_url);
  });
  
  test('should create and recover domain backups', async () => {
    // Generate guardian keypairs
    const guardianKeypairs = [
      await client.generatePubkyKeypair(),
      await client.generatePubkyKeypair(),
      await client.generatePubkyKeypair()
    ];
    
    // Create test domain data
    const domainData = {
      domain_name: 'test-backup.pubky',
      records: [
        { name: '@', type: 'TXT', value: 'backup-test=true', ttl: 3600 }
      ],
      metadata: {
        created_at: new Date().toISOString(),
        owner: 'Test User'
      }
    };
    
    // Create backup
    const backupUrls = await client.createDomainBackup(
      testKeypair,
      domainData,
      guardianKeypairs
    );
    
    // Verify backup URLs
    expect(backupUrls.length).toBe(guardianKeypairs.length);
    backupUrls.forEach(url => {
      expect(url).toMatch(/^pubky:\/\/[a-z0-9]+\/backup\//);
    });
    
    // Recover from backup
    const recoveredData = await client.recoverDomainFromBackup(
      testKeypair.pubky_url,
      guardianKeypairs
    );
    
    // Verify recovered data
    expect(recoveredData).toHaveProperty('domain_name');
    expect(recoveredData).toHaveProperty('records');
    expect(recoveredData).toHaveProperty('metadata');
  });
});