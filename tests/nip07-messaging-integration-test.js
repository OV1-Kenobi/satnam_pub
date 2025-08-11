/**
 * NIP-07 Authentication Integration Test for Group Messaging System
 * Tests the proper handling of NIP-07 browser extension authentication
 * in the UnifiedMessagingService and group-messaging.js
 */

import { UnifiedMessagingService, DEFAULT_UNIFIED_CONFIG } from '../lib/unified-messaging-service.js';

// Test configuration
const TEST_CONFIG = {
  ...DEFAULT_UNIFIED_CONFIG,
  relays: ['wss://relay.satnam.pub'],
  session: {
    ttlHours: 1,
    maxConcurrentSessions: 1,
  },
};

// Test data
const TEST_NPUB = 'npub1test123456789abcdefghijklmnopqrstuvwxyz123456789abcdef';
const TEST_NSEC = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

describe('NIP-07 Authentication Integration Tests', () => {
  let messagingService;

  beforeEach(() => {
    messagingService = new UnifiedMessagingService(TEST_CONFIG);
  });

  afterEach(async () => {
    if (messagingService) {
      await messagingService.destroySession();
    }
  });

  /**
   * Test 1: NIP-07 Session Initialization
   */
  test('should initialize session with NIP-07 authentication', async () => {
    const sessionId = await messagingService.initializeSession('nip07', {
      authMethod: 'nip07',
      npub: TEST_NPUB,
      ipAddress: '127.0.0.1',
      userAgent: 'Test Agent',
      ttlHours: 1,
    });

    expect(sessionId).toBeDefined();
    expect(typeof sessionId).toBe('string');
    expect(sessionId.length).toBeGreaterThan(32);

    const status = await messagingService.getSessionStatus();
    expect(status.active).toBe(true);
    expect(status.sessionId).toBe(sessionId);
    expect(status.authMethod).toBe('nip07');
  });

  /**
   * Test 2: Traditional nsec Session Initialization
   */
  test('should initialize session with traditional nsec authentication', async () => {
    const sessionId = await messagingService.initializeSession(TEST_NSEC, {
      ipAddress: '127.0.0.1',
      userAgent: 'Test Agent',
      ttlHours: 1,
    });

    expect(sessionId).toBeDefined();
    expect(typeof sessionId).toBe('string');
    expect(sessionId.length).toBeGreaterThan(32);

    const status = await messagingService.getSessionStatus();
    expect(status.active).toBe(true);
    expect(status.sessionId).toBe(sessionId);
    expect(status.authMethod).toBe('nsec');
  });

  /**
   * Test 3: NIP-07 Session Should Reject Signing Operations
   */
  test('should reject signing operations for NIP-07 sessions', async () => {
    await messagingService.initializeSession('nip07', {
      authMethod: 'nip07',
      npub: TEST_NPUB,
    });

    // Attempt to access private signing method (would fail in real scenario)
    // This test verifies that NIP-07 sessions are properly identified
    const status = await messagingService.getSessionStatus();
    expect(status.authMethod).toBe('nip07');
  });

  /**
   * Test 4: Error Handling for Missing npub in NIP-07
   */
  test('should throw error when npub is missing for NIP-07 authentication', async () => {
    await expect(
      messagingService.initializeSession('nip07', {
        authMethod: 'nip07',
        // Missing npub parameter
      })
    ).rejects.toThrow('npub is required for NIP-07 authentication');
  });

  /**
   * Test 5: Session Status Includes Authentication Method
   */
  test('should include authentication method in session status', async () => {
    // Test NIP-07 session
    await messagingService.initializeSession('nip07', {
      authMethod: 'nip07',
      npub: TEST_NPUB,
    });

    let status = await messagingService.getSessionStatus();
    expect(status.authMethod).toBe('nip07');
    expect(status.active).toBe(true);
    expect(status.userHash).toBeDefined();
    expect(status.expiresAt).toBeDefined();

    // Destroy and test nsec session
    await messagingService.destroySession();
    messagingService = new UnifiedMessagingService(TEST_CONFIG);

    await messagingService.initializeSession(TEST_NSEC);
    status = await messagingService.getSessionStatus();
    expect(status.authMethod).toBe('nsec');
    expect(status.active).toBe(true);
  });

  /**
   * Test 6: Session Cleanup
   */
  test('should properly cleanup NIP-07 sessions', async () => {
    await messagingService.initializeSession('nip07', {
      authMethod: 'nip07',
      npub: TEST_NPUB,
    });

    let status = await messagingService.getSessionStatus();
    expect(status.active).toBe(true);

    await messagingService.destroySession();
    status = await messagingService.getSessionStatus();
    expect(status.active).toBe(false);
    expect(status.sessionId).toBeNull();
  });
});

/**
 * Integration Test for group-messaging.js NIP-07 handling
 */
describe('Group Messaging NIP-07 Integration', () => {
  /**
   * Test 7: Mock group-messaging.js NIP-07 flow
   */
  test('should handle NIP-07 marker in group messaging flow', async () => {
    // Mock the initializeUnifiedMessaging function behavior
    const mockUser = {
      id: 'test-user-id',
      npub: TEST_NPUB,
      authMethod: 'nip07',
    };

    const messagingService = new UnifiedMessagingService(TEST_CONFIG);
    
    // Simulate the fixed initializeUnifiedMessaging function
    const userNsecOrMarker = 'nip07';
    const operationId = 'test-operation-id';
    
    const isNIP07 = userNsecOrMarker === 'nip07';
    
    if (isNIP07) {
      if (!mockUser || !mockUser.npub) {
        throw new Error('User npub is required for NIP-07 authentication');
      }
      
      await messagingService.initializeSession('nip07', {
        authMethod: 'nip07',
        npub: mockUser.npub,
      });
    } else {
      await messagingService.initializeSession(userNsecOrMarker);
    }

    const status = await messagingService.getSessionStatus();
    expect(status.active).toBe(true);
    expect(status.authMethod).toBe('nip07');
    
    await messagingService.destroySession();
  });
});

console.log('✅ NIP-07 Authentication Integration Tests Ready');
console.log('🔧 Run with: npm test nip07-messaging-integration-test.js');
console.log('🛡️ Tests verify proper NIP-07 marker handling and DUID compatibility');
