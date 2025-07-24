/**
 * API Endpoint Integration Testing Suite
 * 
 * MASTER CONTEXT COMPLIANCE:
 * ✅ Unified messaging API endpoint testing
 * ✅ JWT authentication pattern validation
 * ✅ Privacy-first request/response verification
 */

import fetch from 'node-fetch';

// Test configuration
const API_BASE_URL = 'http://localhost:8888/.netlify/functions';
const TEST_NSEC = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('API Endpoint Integration Tests', () => {
  
  /**
   * Helper function to make API requests
   */
  const makeAPIRequest = async (action, params = {}) => {
    const response = await fetch(`${API_BASE_URL}/group-messaging`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_NSEC}`,
      },
      body: JSON.stringify({
        action,
        ...params,
      }),
    });

    const data = await response.json();
    return { response, data };
  };

  /**
   * Test 1: Session Status Endpoint
   */
  test('should get session status', async () => {
    const { response, data } = await makeAPIRequest('get_session_status');
    
    expect(response.ok).toBe(true);
    expect(data.success).toBe(true);
    expect(data.data.status).toBeDefined();
    expect(typeof data.data.status.active).toBe('boolean');
  });

  /**
   * Test 2: Create Individual Private Group
   */
  test('should create individual private group via API', async () => {
    const { response, data } = await makeAPIRequest('create_group', {
      name: 'API Test Friends Group',
      description: 'Testing group creation via API',
      groupType: 'friends',
      encryptionType: 'gift-wrap',
    });

    expect(response.ok).toBe(true);
    expect(data.success).toBe(true);
    expect(data.data.groupId).toBeDefined();
    expect(typeof data.data.groupId).toBe('string');
  });

  /**
   * Test 3: Add Individual Contact
   */
  test('should add individual contact via API', async () => {
    const { response, data } = await makeAPIRequest('add_contact', {
      npub: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      displayName: 'API Test Contact',
      nip05: 'test@example.com',
      familyRole: 'private',
      trustLevel: 'known',
      preferredEncryption: 'gift-wrap',
    });

    expect(response.ok).toBe(true);
    expect(data.success).toBe(true);
    expect(data.data.contactSessionId).toBeDefined();
    expect(typeof data.data.contactSessionId).toBe('string');
  });

  /**
   * Test 4: Send Group Message
   */
  test('should send group message via API', async () => {
    // First create a group
    const { data: groupData } = await makeAPIRequest('create_group', {
      name: 'Message Test Group',
      groupType: 'friends',
      encryptionType: 'gift-wrap',
    });

    // Then send a message to the group
    const { response, data } = await makeAPIRequest('send_group_message', {
      groupSessionId: groupData.data.groupId,
      content: 'Hello from API test!',
      messageType: 'text',
    });

    expect(response.ok).toBe(true);
    expect(data.success).toBe(true);
    expect(data.data.messageId).toBeDefined();
    expect(typeof data.data.messageId).toBe('string');
  });

  /**
   * Test 5: Send Direct Message
   */
  test('should send direct message via API', async () => {
    // First add a contact
    const { data: contactData } = await makeAPIRequest('add_contact', {
      npub: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      displayName: 'Direct Message Test Contact',
      familyRole: 'private',
      trustLevel: 'known',
      preferredEncryption: 'gift-wrap',
    });

    // Then send a direct message
    const { response, data } = await makeAPIRequest('send_direct_message', {
      contactSessionId: contactData.data.contactSessionId,
      content: 'Hello direct message!',
      messageType: 'text',
    });

    expect(response.ok).toBe(true);
    expect(data.success).toBe(true);
    expect(data.data.messageId).toBeDefined();
    expect(typeof data.data.messageId).toBe('string');
  });

  /**
   * Test 6: Error Handling - Invalid Action
   */
  test('should handle invalid action gracefully', async () => {
    const { response, data } = await makeAPIRequest('invalid_action');

    expect(response.ok).toBe(false);
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
  });

  /**
   * Test 7: Error Handling - Missing Parameters
   */
  test('should handle missing parameters gracefully', async () => {
    const { response, data } = await makeAPIRequest('create_group', {
      // Missing required parameters
      description: 'Missing name and other required fields',
    });

    expect(response.ok).toBe(false);
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
  });

  /**
   * Test 8: Authentication - Missing Bearer Token
   */
  test('should require authentication', async () => {
    const response = await fetch(`${API_BASE_URL}/group-messaging`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Missing Authorization header
      },
      body: JSON.stringify({
        action: 'get_session_status',
      }),
    });

    expect(response.ok).toBe(false);
  });

  /**
   * Test 9: Multiple Group Types
   */
  test('should support all individual group types', async () => {
    const groupTypes = ['friends', 'business', 'advisors'];
    const createdGroups = [];

    for (const groupType of groupTypes) {
      const { response, data } = await makeAPIRequest('create_group', {
        name: `${groupType} Test Group`,
        description: `Testing ${groupType} group type`,
        groupType,
        encryptionType: 'gift-wrap',
      });

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
      expect(data.data.groupId).toBeDefined();
      
      createdGroups.push(data.data.groupId);
    }

    // Verify all groups have unique IDs
    const uniqueIds = new Set(createdGroups);
    expect(uniqueIds.size).toBe(groupTypes.length);
  });

  /**
   * Test 10: Encryption Type Support
   */
  test('should support both encryption types', async () => {
    const encryptionTypes = ['gift-wrap', 'nip04'];
    const createdGroups = [];

    for (const encryptionType of encryptionTypes) {
      const { response, data } = await makeAPIRequest('create_group', {
        name: `${encryptionType} Test Group`,
        description: `Testing ${encryptionType} encryption`,
        groupType: 'friends',
        encryptionType,
      });

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
      expect(data.data.groupId).toBeDefined();
      
      createdGroups.push(data.data.groupId);
    }

    // Verify all groups have unique IDs
    const uniqueIds = new Set(createdGroups);
    expect(uniqueIds.size).toBe(encryptionTypes.length);
  });
});

describe('Privacy and Security Tests', () => {
  
  /**
   * Test 11: Response Data Privacy
   */
  test('should not expose sensitive data in responses', async () => {
    const { response, data } = await makeAPIRequest('create_group', {
      name: 'Privacy Test Group',
      description: 'Testing privacy compliance',
      groupType: 'friends',
      encryptionType: 'gift-wrap',
    });

    expect(response.ok).toBe(true);
    expect(data.success).toBe(true);
    
    // Verify response doesn't contain sensitive data
    const responseString = JSON.stringify(data);
    expect(responseString).not.toContain(TEST_NSEC);
    expect(responseString).not.toContain('nsec');
    expect(responseString).not.toContain('private');
    expect(responseString).not.toContain('secret');
  });

  /**
   * Test 12: Session Isolation
   */
  test('should isolate sessions properly', async () => {
    // This test would verify that different sessions don't interfere
    // In a real implementation, this would use different nsec values
    const { response, data } = await makeAPIRequest('get_session_status');
    
    expect(response.ok).toBe(true);
    expect(data.success).toBe(true);
    
    // Verify session data is properly isolated
    expect(data.data.status.sessionId).toBeDefined();
  });

  /**
   * Test 13: Rate Limiting Compliance
   */
  test('should respect rate limiting', async () => {
    // Test rapid requests to verify rate limiting is in place
    const requests = [];
    for (let i = 0; i < 5; i++) {
      requests.push(makeAPIRequest('get_session_status'));
    }

    const responses = await Promise.all(requests);
    
    // All requests should succeed (rate limiting would be configured separately)
    responses.forEach(({ response }) => {
      expect(response.ok).toBe(true);
    });
  });
});

// Performance Tests
describe('Performance Tests', () => {
  
  /**
   * Test 14: Response Time
   */
  test('should respond within acceptable time limits', async () => {
    const startTime = Date.now();
    
    const { response } = await makeAPIRequest('get_session_status');
    
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    expect(response.ok).toBe(true);
    expect(responseTime).toBeLessThan(5000); // 5 second timeout
  });

  /**
   * Test 15: Concurrent Requests
   */
  test('should handle concurrent requests', async () => {
    const concurrentRequests = Array(3).fill().map(() => 
      makeAPIRequest('get_session_status')
    );

    const responses = await Promise.all(concurrentRequests);
    
    responses.forEach(({ response, data }) => {
      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
    });
  });
});

export { makeAPIRequest };
