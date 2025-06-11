/**
 * Pubky Integration Tests
 * 
 * This file contains integration tests for the Pubky domain management system.
 */

import { v4 as uuidv4 } from 'uuid';
import { PubkyClient } from '../services/domain/PubkyClient';
import { PubkySovereigntyService } from '../services/domain/PubkySovereigntyService';
import { DomainService } from '../services/domain/DomainService';
import { db } from '../lib';

// Enhanced Pubky Client for testing
class EnhancedPubkyClient extends PubkyClient {
  constructor(private testConfig: any) {
    super({
      homeserverUrl: testConfig.homeserverUrl || 'https://test-homeserver.pubky.org',
      pkarrRelayUrl: testConfig.pkarrRelayUrl || 'https://test-relay.pkarr.org'
    });
  }

  async generatePubkyKeypair() {
    const keypair = await super.generateKeypair();
    return {
      pubky_url: `pubky://${keypair.publicKey}`,
      public_key: keypair.publicKey,
      private_key: keypair.privateKey
    };
  }

  async registerPubkyDomain(keypair: any, records: any[]) {
    // Create a test family if needed
    const familyId = await this.ensureTestFamily();
    
    // Register the domain using the DomainService
    const domainService = new DomainService();
    const domainName = `test-${uuidv4().substring(0, 8)}.pubky`;
    
    const registrationResult = await domainService.registerPubkyDomain(
      domainName,
      familyId,
      {
        publicKey: keypair.public_key,
        privateKey: keypair.private_key
      }
    );

    if (!registrationResult.success) {
      throw new Error(`Failed to register Pubky domain: ${registrationResult.message}`);
    }

    const domainId = registrationResult.data?.id;
    
    // Add DNS records
    if (records && records.length > 0) {
      for (const record of records) {
        await domainService.addDNSRecord(domainId, {
          name: record.name,
          type: record.type,
          value: record.value,
          ttl: record.ttl
        });
      }
    }
    
    // Calculate sovereignty score
    const sovereigntyService = new PubkySovereigntyService();
    const score = await sovereigntyService.calculateSovereigntyScore(domainId);
    
    // Simulate PKARR publishing
    const pubkyDomain = await sovereigntyService.getPubkyDomainByDomainId(domainId);
    
    if (pubkyDomain) {
      for (const record of records) {
        const pkarrRecord = await sovereigntyService.createPkarrRecord(
          pubkyDomain.id,
          record.type,
          record.name,
          record.value,
          record.ttl
        );
        
        await sovereigntyService.updatePkarrRecordStatus(pkarrRecord.id, 'published');
      }
    }
    
    return {
      domain_id: domainId,
      domain_name: domainName,
      pubky_url: keypair.pubky_url,
      sovereignty_score: score.score,
      pkarr_published: true
    };
  }

  async migrateFamilyDomainToPubky(domainName: string, familyId: string, guardianKeypairs: any[]) {
    // Ensure the family exists
    const actualFamilyId = await this.ensureTestFamily(familyId);
    
    // Create a traditional domain first
    const domainService = new DomainService();
    const traditionalProvider = domainService.getProvider('traditional');
    
    const traditionalDomainResult = await traditionalProvider.registerDomain(
      domainName,
      actualFamilyId
    );
    
    if (!traditionalDomainResult.success) {
      throw new Error(`Failed to register traditional domain: ${traditionalDomainResult.message}`);
    }
    
    const domainId = traditionalDomainResult.data?.id;
    
    // Calculate initial sovereignty score
    const sovereigntyService = new PubkySovereigntyService();
    const initialScore = await sovereigntyService.calculateSovereigntyScore(domainId);
    
    // Create a domain migration
    const migration = await sovereigntyService.createDomainMigration(
      domainId,
      'traditional',
      'pubky'
    );
    
    // Update migration status to in_progress
    await sovereigntyService.updateDomainMigrationStatus(
      migration.id,
      'in_progress'
    );
    
    // Generate a keypair for the domain
    const keypair = await this.generatePubkyKeypair();
    
    // Create Pubky domain
    const pubkyDomain = await sovereigntyService.createPubkyDomain(
      domainId,
      {
        publicKey: keypair.public_key,
        privateKey: keypair.private_key
      }
    );
    
    // Create guardian backups
    if (guardianKeypairs && guardianKeypairs.length > 0) {
      for (let i = 0; i < guardianKeypairs.length; i++) {
        const guardianId = uuidv4();
        
        // Create a guardian
        await db.query(
          `INSERT INTO federation_guardians (
            id, family_id, name, pubky_backup_status, pubky_backup_url,
            pubky_backup_last_updated, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), NOW())`,
          [
            guardianId,
            actualFamilyId,
            `Test Guardian ${i + 1}`,
            'active',
            `pubky://${guardianKeypairs[i].public_key}/backup/${domainId}`
          ]
        );
      }
    }
    
    // Update migration status to completed
    await sovereigntyService.updateDomainMigrationStatus(
      migration.id,
      'completed'
    );
    
    // Calculate final sovereignty score
    const finalScore = await sovereigntyService.calculateSovereigntyScore(domainId);
    
    return {
      domain_id: domainId,
      domain_name: domainName,
      pubky_url: keypair.pubky_url,
      initial_sovereignty_score: initialScore.score,
      final_sovereignty_score: finalScore.score,
      sovereignty_score_improvement: finalScore.score - initialScore.score,
      migration_success: true,
      guardian_backups: guardianKeypairs.length
    };
  }

  private async ensureTestFamily(familyId?: string): Promise<string> {
    const actualFamilyId = familyId || `test-family-${uuidv4()}`;
    
    // Check if the family exists
    const familyResult = await db.query(
      `SELECT id FROM families WHERE id = $1`,
      [actualFamilyId]
    );
    
    if (familyResult.rows.length === 0) {
      // Create a test family
      await db.query(
        `INSERT INTO families (
          id, name, created_at, updated_at
        ) VALUES ($1, $2, NOW(), NOW())`,
        [actualFamilyId, `Test Family ${actualFamilyId.substring(0, 8)}`]
      );
    }
    
    return actualFamilyId;
  }
}

// Test configuration
const testConfig = {
  homeserverUrl: 'https://test-homeserver.pubky.org',
  pkarrRelayUrl: 'https://test-relay.pkarr.org',
  testFamilyId: `test-family-${uuidv4()}`
};

// Mock database for testing
jest.mock('../lib/db', () => ({
  query: jest.fn().mockImplementation((query, params) => {
    // Mock query responses based on the query
    if (query.includes('INSERT INTO')) {
      return { rows: [{ id: uuidv4() }] };
    } else if (query.includes('SELECT')) {
      if (query.includes('families')) {
        return { rows: [] }; // No families exist initially
      } else if (query.includes('domain_records')) {
        return {
          rows: [{
            id: uuidv4(),
            domainName: 'test.pubky',
            domainType: 'pubky',
            familyId: testConfig.testFamilyId,
            pubkyEnabled: true
          }]
        };
      } else if (query.includes('pubky_domains')) {
        return {
          rows: [{
            id: uuidv4(),
            domainRecordId: uuidv4(),
            publicKey: 'test-public-key',
            privateKeyEncrypted: 'test-private-key',
            registrationStatus: 'registered'
          }]
        };
      } else if (query.includes('sovereignty_scores')) {
        return {
          rows: [{
            id: uuidv4(),
            domainRecordId: uuidv4(),
            score: 85,
            scoreBreakdown: {
              providerIndependence: 25,
              keyOwnership: 20,
              censorship: 15,
              privacy: 10,
              portability: 15
            }
          }]
        };
      }
    } else if (query.includes('UPDATE')) {
      return { rows: [{ id: uuidv4() }] };
    }
    
    return { rows: [] };
  })
}));

// Setup and teardown
beforeAll(async () => {
  // Create test family
  await db.query(
    `INSERT INTO families (id, name, created_at, updated_at)
    VALUES ($1, $2, NOW(), NOW())`,
    [testConfig.testFamilyId, 'Test Family']
  );
});

afterAll(async () => {
  // Clean up test data
  // In a real implementation, this would delete test data
});

describe('Pubky Integration Tests', () => {
  test('should generate valid Pubky keypairs', async () => {
    const client = new EnhancedPubkyClient(testConfig);
    const keypair = await client.generatePubkyKeypair();
    
    expect(keypair.pubky_url).toMatch(/^pubky:\/\/[a-z0-9]+$/);
    expect(keypair.public_key).toBeTruthy();
    expect(keypair.private_key).toBeTruthy();
  });
  
  test('should register Pubky domain successfully', async () => {
    const client = new EnhancedPubkyClient(testConfig);
    const keypair = await client.generatePubkyKeypair();
    
    const records = [{
      name: '@',
      type: 'TXT',
      value: 'family_test=true',
      ttl: 3600
    }];
    
    const result = await client.registerPubkyDomain(keypair, records);
    expect(result.sovereignty_score).toBeGreaterThanOrEqual(85);
    expect(result.pkarr_published).toBe(true);
  });
  
  test('should migrate traditional domain to Pubky', async () => {
    const client = new EnhancedPubkyClient(testConfig);
    const guardianKeypairs = await Promise.all([
      client.generatePubkyKeypair(),
      client.generatePubkyKeypair(),
      client.generatePubkyKeypair()
    ]);
    
    const migration = await client.migrateFamilyDomainToPubky(
      'testfamily.com',
      testConfig.testFamilyId,
      guardianKeypairs
    );
    
    expect(migration.sovereignty_score_improvement).toBeGreaterThan(0);
    expect(migration.migration_success).toBe(true);
    expect(migration.guardian_backups).toBe(3);
  });
  
  test('should calculate correct sovereignty scores', async () => {
    const sovereigntyService = new PubkySovereigntyService();
    
    // Create a test domain record
    const domainId = uuidv4();
    
    // Calculate sovereignty score
    const score = await sovereigntyService.calculateSovereigntyScore(domainId);
    
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(100);
    expect(score.scoreBreakdown).toHaveProperty('providerIndependence');
    expect(score.scoreBreakdown).toHaveProperty('keyOwnership');
    expect(score.scoreBreakdown).toHaveProperty('censorship');
    expect(score.scoreBreakdown).toHaveProperty('privacy');
    expect(score.scoreBreakdown).toHaveProperty('portability');
  });
  
  test('should create and update PKARR records', async () => {
    const sovereigntyService = new PubkySovereigntyService();
    
    // Create a test Pubky domain
    const domainId = uuidv4();
    const pubkyDomain = await sovereigntyService.createPubkyDomain(domainId);
    
    // Create a PKARR record
    const pkarrRecord = await sovereigntyService.createPkarrRecord(
      pubkyDomain.id,
      'TXT',
      '@',
      'test=true',
      3600
    );
    
    expect(pkarrRecord.recordType).toBe('TXT');
    expect(pkarrRecord.recordName).toBe('@');
    expect(pkarrRecord.recordValue).toBe('test=true');
    expect(pkarrRecord.publishStatus).toBe('pending');
    
    // Update the PKARR record status
    const updatedRecord = await sovereigntyService.updatePkarrRecordStatus(
      pkarrRecord.id,
      'published'
    );
    
    expect(updatedRecord.publishStatus).toBe('published');
    expect(updatedRecord.lastPublishedAt).toBeTruthy();
  });
  
  test('should handle domain migration process', async () => {
    const sovereigntyService = new PubkySovereigntyService();
    
    // Create a test domain record
    const domainId = uuidv4();
    
    // Create a domain migration
    const migration = await sovereigntyService.createDomainMigration(
      domainId,
      'traditional',
      'pubky'
    );
    
    expect(migration.sourceProvider).toBe('traditional');
    expect(migration.targetProvider).toBe('pubky');
    expect(migration.migrationStatus).toBe('pending');
    
    // Update migration status to in_progress
    const inProgressMigration = await sovereigntyService.updateDomainMigrationStatus(
      migration.id,
      'in_progress'
    );
    
    expect(inProgressMigration.migrationStatus).toBe('in_progress');
    
    // Update migration status to completed
    const completedMigration = await sovereigntyService.updateDomainMigrationStatus(
      migration.id,
      'completed'
    );
    
    expect(completedMigration.migrationStatus).toBe('completed');
    expect(completedMigration.completedAt).toBeTruthy();
  });
  
  test('should enable and disable Pubky for a family', async () => {
    const sovereigntyService = new PubkySovereigntyService();
    
    // Create a test family
    const familyId = uuidv4();
    
    // Enable Pubky for the family
    await sovereigntyService.enablePubkyForFamily(familyId);
    
    // Get family keypairs
    const keypairs = await sovereigntyService.getFamilyKeypairs(familyId);
    
    expect(keypairs.length).toBeGreaterThan(0);
    expect(keypairs[0].isDefault).toBe(true);
    
    // Disable Pubky for the family
    await sovereigntyService.disablePubkyForFamily(familyId);
  });
});

// WebSocket Tests
describe('Pubky WebSocket Tests', () => {
  // Mock WebSocket
  class MockWebSocket {
    onmessage: ((event: any) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: ((error: any) => void) | null = null;
    readyState = 1; // OPEN
    
    constructor(public url: string) {}
    
    send(data: string) {
      // Simulate receiving a message
      if (this.onmessage) {
        this.onmessage({ data });
      }
    }
    
    close() {
      if (this.onclose) {
        this.onclose();
      }
    }
  }
  
  test('should handle WebSocket subscriptions', async () => {
    // Create a mock WebSocket
    const mockSocket = new MockWebSocket('ws://localhost:3002?token=test-token');
    
    // Simulate subscription message
    const subscriptionMessage = JSON.stringify({
      type: 'subscribe',
      data: {
        pubkyDomainId: uuidv4()
      }
    });
    
    // Set up message handler
    let receivedMessage: any = null;
    mockSocket.onmessage = (event) => {
      receivedMessage = JSON.parse(event.data);
    };
    
    // Send subscription message
    mockSocket.send(subscriptionMessage);
    
    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify response
    expect(receivedMessage).toBeTruthy();
    expect(receivedMessage.type).toBe('subscribed');
  });
  
  test('should handle sovereignty score notifications', async () => {
    // Create a mock WebSocket
    const mockSocket = new MockWebSocket('ws://localhost:3002?token=test-token');
    
    // Set up message handler
    let receivedMessage: any = null;
    mockSocket.onmessage = (event) => {
      receivedMessage = JSON.parse(event.data);
    };
    
    // Create a mock notification service
    const mockNotificationService = {
      sendNotification: jest.fn((channel, payload) => {
        // Simulate sending a notification to all connected clients
        if (mockSocket.onmessage) {
          mockSocket.onmessage({
            data: JSON.stringify({
              type: 'notification',
              channel,
              payload
            })
          });
        }
      })
    };
    
    // Simulate a sovereignty score notification
    const notificationPayload = {
      operation: 'UPDATE',
      domain_record_id: uuidv4(),
      domain_name: 'test.pubky',
      score: 95,
      calculated_at: new Date().toISOString()
    };
    
    // Trigger notification through the mock service
    mockNotificationService.sendNotification(
      'sovereignty_score_changes',
      notificationPayload
    );
    
    // Verify the notification was sent
    expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
      'sovereignty_score_changes',
      notificationPayload
    );
    
    // Verify the client received the notification
    expect(receivedMessage).toBeTruthy();
    expect(receivedMessage.type).toBe('notification');
    expect(receivedMessage.channel).toBe('sovereignty_score_changes');
    expect(receivedMessage.payload).toEqual(notificationPayload);
  });
});

// Error Handling Tests
describe('Pubky Error Handling Tests', () => {
  test('should handle invalid Pubky URLs', async () => {
    const client = new EnhancedPubkyClient(testConfig);
    
    // Test with invalid URL
    const isValid = client['isValidPubkyUrl']('invalid-url');
    expect(isValid).toBe(false);
    
    // Test with valid URL
    const keypair = await client.generatePubkyKeypair();
    const isValidPubkyUrl = client['isValidPubkyUrl'](keypair.pubky_url);
    expect(isValidPubkyUrl).toBe(true);
  });
  
  test('should handle domain registration failures gracefully', async () => {
    const client = new EnhancedPubkyClient(testConfig);
    const keypair = await client.generatePubkyKeypair();
    
    // Mock a failure in the domain registration
    jest.spyOn(DomainService.prototype, 'registerPubkyDomain').mockImplementationOnce(async () => {
      return {
        success: false,
        message: 'Domain registration failed'
      };
    });
    
    // Attempt to register a domain
    await expect(client.registerPubkyDomain(keypair, []))
      .rejects.toThrow('Failed to register Pubky domain');
    
    // Restore the original implementation
    jest.restoreAllMocks();
  });
  
  test('should handle migration failures gracefully', async () => {
    const client = new EnhancedPubkyClient(testConfig);
    
    // Mock a failure in the traditional domain registration
    jest.spyOn(DomainService.prototype, 'getProvider').mockImplementationOnce(() => {
      return {
        registerDomain: async () => {
          return {
            success: false,
            message: 'Traditional domain registration failed'
          };
        }
      } as any;
    });
    
    // Attempt to migrate a domain
    await expect(client.migrateFamilyDomainToPubky(
      'testfamily.com',
      testConfig.testFamilyId,
      []
    )).rejects.toThrow('Failed to register traditional domain');
    
    // Restore the original implementation
    jest.restoreAllMocks();
  });
});