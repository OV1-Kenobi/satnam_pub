/**
 * Pubky Test Configuration
 * 
 * This file contains configuration for Pubky integration tests.
 */

import { v4 as uuidv4 } from 'uuid';

export const pubkyTestConfig = {
  // Test environment
  environment: 'test',
  
  // Test homeserver and relay URLs
  homeserverUrl: 'https://test-homeserver.pubky.org',
  pkarrRelayUrl: 'https://test-relay.pkarr.org',
  
  // Test family
  testFamilyId: `test-family-${uuidv4()}`,
  testFamilyName: 'Test Family',
  
  // Test domains
  testDomains: {
    traditional: 'test-traditional.com',
    pubky: 'test-pubky.pubky'
  },
  
  // Test users
  testUserId: `test-user-${uuidv4()}`,
  testUserName: 'Test User',
  
  // Test keypairs (pre-generated for deterministic tests)
  testKeypairs: [
    {
      public_key: '8a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u',
      private_key: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z',
      pubky_url: 'pubky://8a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u'
    },
    {
      public_key: '8z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4j3i2h1g0f',
      private_key: 'z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4j3i2h1g0f1e2d3c4b5a',
      pubky_url: 'pubky://8z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4j3i2h1g0f'
    }
  ],
  
  // Test DNS records
  testDnsRecords: [
    {
      name: '@',
      type: 'TXT',
      value: 'pubky-verification=true',
      ttl: 3600
    },
    {
      name: 'www',
      type: 'A',
      value: '192.168.1.1',
      ttl: 3600
    },
    {
      name: '_pubky',
      type: 'TXT',
      value: 'v=pubky1',
      ttl: 3600
    }
  ],
  
  // Test sovereignty scores
  testSovereigntyScores: {
    traditional: {
      providerIndependence: 5,
      keyOwnership: 0,
      censorship: 5,
      privacy: 5,
      portability: 5
    },
    pubky: {
      providerIndependence: 25,
      keyOwnership: 25,
      censorship: 20,
      privacy: 15,
      portability: 15
    }
  },
  
  // Test WebSocket
  testWebSocketPort: 3002,
  testWebSocketToken: 'test-jwt-token-for-pubky-websocket',
  
  // Database mock behavior
  dbMockBehavior: {
    // Whether to simulate database errors
    simulateErrors: false,
    
    // Probability of simulating a database error (0-1)
    errorProbability: 0.1,
    
    // Delay range for database operations (ms)
    minDelay: 10,
    maxDelay: 50
  }
};