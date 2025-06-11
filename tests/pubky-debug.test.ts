/**
 * Pubky Debug Tests
 * 
 * This file contains tests specifically designed for debugging the Pubky system.
 * It includes tests for keypair generation, domain registration, and WebSocket subscriptions.
 */

import { EnhancedPubkyClient } from '../lib/pubky-enhanced-client';
import { PubkyClient } from '../services/domain/PubkyClient';
import WebSocket from 'ws';
import { config } from '../config';

describe('Pubky Debug Tests', () => {
  // Test the keypair generation
  describe('Keypair Generation', () => {
    it('should generate a valid Ed25519 keypair', async () => {
      // Create an enhanced client
      const enhancedClient = new EnhancedPubkyClient({
        homeserver_url: 'https://homeserver.pubky.tech',
        pkarr_relays: ['https://relay.pkarr.org'],
        debug: true
      });
      
      // Generate a keypair - this will hit the breakpoint in generatePubkyKeypair
      const keypair = await enhancedClient.generatePubkyKeypair();
      
      // Verify the keypair
      expect(keypair.private_key).toBeDefined();
      expect(keypair.public_key).toBeDefined();
      expect(keypair.pubky_url).toMatch(/^pubky:\/\//);
      expect(keypair.z32_address).toBeDefined();
    });
    
    it('should generate a keypair through the PubkyClient', async () => {
      // Create a client
      const client = new PubkyClient();
      
      // Generate a keypair - this will call enhancedClient.generatePubkyKeypair
      const keypair = await client.generateKeypair();
      
      // Verify the keypair
      expect(keypair.privateKey).toBeDefined();
      expect(keypair.publicKey).toBeDefined();
    });
  });
  
  // Test domain registration
  describe('Domain Registration', () => {
    it('should register a domain with PKARR', async () => {
      // Create an enhanced client
      const enhancedClient = new EnhancedPubkyClient({
        homeserver_url: 'https://homeserver.pubky.tech',
        pkarr_relays: ['https://relay.pkarr.org'],
        debug: true
      });
      
      // Generate a keypair
      const keypair = await enhancedClient.generatePubkyKeypair();
      
      // Create domain records
      const domainRecords = [
        {
          name: '@',
          type: 'TXT',
          value: 'test=value',
          ttl: 3600
        },
        {
          name: 'www',
          type: 'A',
          value: '192.168.1.1',
          ttl: 3600
        }
      ];
      
      // Register the domain - this will hit the breakpoints in registerPubkyDomain
      const result = await enhancedClient.registerPubkyDomain(keypair, domainRecords);
      
      // Verify the result
      expect(result.pubky_url).toBe(keypair.pubky_url);
      expect(result.pkarr_published).toBe(true);
      expect(result.domain_records).toEqual(domainRecords);
      expect(result.sovereignty_score).toBe(100);
    });
    
    it('should register a domain through the PubkyClient', async () => {
      // Create a client
      const client = new PubkyClient();
      
      // Generate a keypair
      const keypair = await client.generateKeypair();
      
      // Create domain records
      const domainRecords = [
        {
          name: '@',
          type: 'TXT',
          value: 'test=value',
          ttl: 3600
        },
        {
          name: 'www',
          type: 'A',
          value: '192.168.1.1',
          ttl: 3600
        }
      ];
      
      // Register the domain
      const result = await client.registerPubkyDomain(keypair, domainRecords);
      
      // Verify the result
      expect(result.success).toBe(true);
      expect(result.pubky_url).toBeDefined();
      expect(result.sovereignty_score).toBe(100);
    });
  });
  
  // Test WebSocket subscriptions
  describe('WebSocket Subscriptions', () => {
    it('should connect to the WebSocket server and subscribe to a Pubky URL', async () => {
      // Skip this test if not in debug mode
      if (process.env.NODE_ENV !== 'development') {
        return;
      }
      
      // Create a WebSocket client
      const ws = new WebSocket(`ws://localhost:${process.env.PUBKY_WS_PORT || 3002}?token=${getTestToken()}`);
      
      // Wait for the connection to open
      await new Promise<void>((resolve) => {
        ws.on('open', () => {
          resolve();
        });
      });
      
      // Generate a test Pubky URL
      const enhancedClient = new EnhancedPubkyClient({
        homeserver_url: 'https://homeserver.pubky.tech',
        pkarr_relays: ['https://relay.pkarr.org'],
        debug: true
      });
      const keypair = await enhancedClient.generatePubkyKeypair();
      
      // Subscribe to the Pubky URL - this will hit the breakpoints in handleSubscribe
      ws.send(JSON.stringify({
        type: 'subscribe',
        data: {
          pubkyUrl: keypair.pubky_url
        }
      }));
      
      // Wait for the subscription confirmation
      const response = await new Promise<any>((resolve) => {
        ws.on('message', (data) => {
          resolve(JSON.parse(data.toString()));
        });
      });
      
      // Verify the response
      expect(response.type).toBe('subscribed');
      expect(response.data.entity).toBe('pubkyUrl');
      expect(response.data.url).toBe(keypair.pubky_url);
      
      // Close the connection
      ws.close();
    });
  });
});

// Helper function to generate a test JWT token
function getTestToken(): string {
  const jwt = require('jsonwebtoken');
  return jwt.sign({ userId: 'test-user' }, config.auth.jwtSecret, { expiresIn: '1h' });
}