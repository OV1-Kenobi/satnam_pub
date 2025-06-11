/**
 * Domain WebSocket Service
 * 
 * This service provides real-time updates for domain management operations.
 */

import * as WebSocket from 'ws';
import * as http from 'http';
import { v4 as uuidv4 } from 'uuid';
import * as jwt from 'jsonwebtoken';
import { db } from '../../lib';
import { config } from '../../config';

interface WebSocketClient {
  id: string;
  socket: WebSocket.WebSocket;
  userId: string;
  subscriptions: {
    domains: string[];
    families: string[];
    pubkyUrls: string[];
  };
}

interface WebSocketMessage {
  type: string;
  data: Record<string, unknown>;
}

interface SubscriptionData {
  domainId?: string;
  familyId?: string;
  pubkyUrl?: string;
}

interface DomainEventDetails {
  [key: string]: unknown;
}

interface PubkySubscription {
  url: string;
  clientId: string;
  lastUpdated: Date;
  status: 'active' | 'pending' | 'error';
  relayStatus?: {
    relay: string;
    connected: boolean;
    lastSeen: Date;
  }[];
}

export class DomainWebSocketService {
  private wss: WebSocket.Server;
  private clients: Map<string, WebSocketClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private pgClient: any = null; // Will hold the PostgreSQL client for LISTEN/NOTIFY
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  
  // Pubky-specific properties
  private pubkySubscriptions: Map<string, PubkySubscription> = new Map();
  private pubkyRelayStatus: Map<string, { connected: boolean; lastSeen: Date }> = new Map();
  private pubkyContentCache: Map<string, { content: any; timestamp: number; expires: number }> = new Map();
  private pubkyUpdateInterval: NodeJS.Timeout | null = null;
  private readonly PUBKY_UPDATE_INTERVAL = 60000; // 60 seconds
  private readonly PUBKY_CACHE_TTL = 300000; // 5 minutes
  private readonly MAX_PUBKY_SUBSCRIPTIONS_PER_CLIENT = 50; // Limit subscriptions per client
  private readonly PUBKY_FEATURES_ENABLED = config.features.enablePubkySubscriptions;
  private pubkyClientModule: any = null;
  
  constructor(server: http.Server) {
    this.wss = new WebSocket.Server({ server });
    this.initialize();
    this.startHeartbeat();
    this.startPubkyUpdates();
    
    // Initialize default PKARR relays
    this.initializePubkyRelays();
    
    // Handle process termination
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }
  
  /**
   * Shutdown the service gracefully
   */
  public async shutdown() {
    console.log('Shutting down WebSocket service...');
    
    // Clear intervals
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    if (this.pubkyUpdateInterval) {
      clearInterval(this.pubkyUpdateInterval);
      this.pubkyUpdateInterval = null;
    }
    
    // Clear Pubky resources
    this.pubkySubscriptions.clear();
    this.pubkyRelayStatus.clear();
    this.pubkyContentCache.clear();
    
    // Close all client connections
    for (const client of this.clients.values()) {
      client.socket.close(1001, 'Server shutting down');
    }
    
    // Clear clients map
    this.clients.clear();
    
    // Close PostgreSQL client
    if (this.pgClient) {
      try {
        await this.pgClient.query('UNLISTEN domain_events');
        this.pgClient.release();
        this.pgClient = null;
      } catch (error) {
        console.error('Error closing PostgreSQL client:', error);
      }
    }
    
    // Close WebSocket server
    this.wss.close((err) => {
      if (err) {
        console.error('Error closing WebSocket server:', err);
      } else {
        console.log('WebSocket server closed successfully');
      }
    });
  }
  
  private initialize() {
    this.wss.on('connection', (socket: WebSocket.WebSocket, request: http.IncomingMessage) => {
      // Handle the connection
      this.handleConnection(socket, request).catch(error => {
        console.error('WebSocket connection error:', error);
        if (socket.readyState === WebSocket.WebSocket.OPEN) {
          socket.close(1011, 'Internal server error');
        }
      });
    });
    
    // Set up database listeners for domain events
    this.setupDatabaseListeners();
  }
  
  /**
   * Handle a new WebSocket connection
   */
  private async handleConnection(socket: WebSocket.WebSocket, request: http.IncomingMessage): Promise<void> {
    // Extract token from URL query parameters
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const token = url.searchParams.get('token');
    
    if (!token) {
      socket.close(1008, 'Authentication required');
      return;
    }
    
    // Verify the token and get user ID
    const userId = await this.verifyAuthToken(token);
    
    if (!userId) {
      socket.close(1008, 'Invalid authentication token');
      return;
    }
    
    const client: WebSocketClient = {
      id: uuidv4(),
      socket,
      userId,
      subscriptions: {
        domains: [],
        families: [],
        pubkyUrls: []
      }
    };
    
    this.clients.set(client.id, client);
    
    socket.on('message', (message: string) => {
      try {
        const data = JSON.parse(message);
        this.handleMessage(client, data);
      } catch (error) {
        this.sendError(client, 'Invalid message format');
      }
    });
    
    socket.on('close', () => {
      this.clients.delete(client.id);
    });
    
    // Send welcome message
    this.send(client, {
      type: 'connection',
      data: {
        clientId: client.id,
        message: 'Connected to Domain WebSocket Service'
      }
    });
  }
  
  private handleMessage(client: WebSocketClient, message: WebSocketMessage) {
    switch (message.type) {
      case 'subscribe':
        this.handleSubscribe(client, message.data as SubscriptionData);
        break;
      case 'unsubscribe':
        this.handleUnsubscribe(client, message.data as SubscriptionData);
        break;
      case 'pubky_relay_status':
        if (!this.PUBKY_FEATURES_ENABLED) {
          this.sendError(client, 'Pubky features are not enabled');
          return;
        }
        this.handlePubkyRelayStatusRequest(client);
        break;
      case 'pubky_resolve':
        if (!this.PUBKY_FEATURES_ENABLED) {
          this.sendError(client, 'Pubky features are not enabled');
          return;
        }
        this.handlePubkyResolveRequest(client, message.data as { url: string });
        break;
      case 'pubky_sovereignty_score':
        if (!this.PUBKY_FEATURES_ENABLED) {
          this.sendError(client, 'Pubky features are not enabled');
          return;
        }
        this.handlePubkySovereigntyScoreRequest(client, message.data as { url: string });
        break;
      case 'pubky_guardian_status':
        if (!this.PUBKY_FEATURES_ENABLED) {
          this.sendError(client, 'Pubky features are not enabled');
          return;
        }
        this.handlePubkyGuardianStatusRequest(client, message.data as { familyId: string });
        break;
      default:
        this.sendError(client, 'Unknown message type');
    }
  }
  
  /**
   * Handle request for PKARR relay status
   */
  private handlePubkyRelayStatusRequest(client: WebSocketClient) {
    // Send the current status of all PKARR relays
    this.send(client, {
      type: 'pubky_relay_status',
      data: {
        relays: Array.from(this.pubkyRelayStatus.entries()).map(([relay, status]) => ({
          relay,
          connected: status.connected,
          lastSeen: status.lastSeen.toISOString()
        }))
      }
    });
    
    // Log the activity
    this.logPubkyActivity(client.userId, 'relay_status_request', 'system');
  }
  
  /**
   * Handle request to resolve a Pubky URL
   */
  private async handlePubkyResolveRequest(client: WebSocketClient, data: { url: string }) {
    try {
      if (!data.url || !this.isValidPubkyUrl(data.url)) {
        this.sendError(client, 'Invalid Pubky URL');
        return;
      }
      
      // Check if the user has access to this Pubky URL
      const hasAccess = await this.checkPubkyUrlAccess(client.userId, data.url);
      
      if (!hasAccess) {
        this.sendError(client, 'Access denied to Pubky URL');
        return;
      }
      
      // Check if the content is in cache
      const cacheKey = `pubky:${data.url}`;
      const cachedContent = this.pubkyContentCache.get(cacheKey);
      
      if (cachedContent && cachedContent.expires > Date.now()) {
        // Use cached content
        this.send(client, {
          type: 'pubky_resolve_result',
          data: {
            url: data.url,
            content: cachedContent.content,
            cached: true,
            timestamp: new Date(cachedContent.timestamp).toISOString()
          }
        });
        return;
      }
      
      // Resolve the URL
      const content = await this.resolvePubkyUrl(data.url);
      
      if (content) {
        // Cache the content
        this.pubkyContentCache.set(cacheKey, {
          content,
          timestamp: Date.now(),
          expires: Date.now() + this.PUBKY_CACHE_TTL
        });
        
        // Send the result
        this.send(client, {
          type: 'pubky_resolve_result',
          data: {
            url: data.url,
            content,
            cached: false,
            timestamp: new Date().toISOString()
          }
        });
      } else {
        this.sendError(client, 'Failed to resolve Pubky URL');
      }
      
      // Log the activity
      this.logPubkyActivity(client.userId, 'resolve_request', data.url);
    } catch (error) {
      console.error(`Error handling Pubky resolve request for ${data.url}:`, error);
      this.sendError(client, 'Error resolving Pubky URL');
    }
  }
  
  /**
   * Handle request for Pubky sovereignty score
   */
  private async handlePubkySovereigntyScoreRequest(client: WebSocketClient, data: { url: string }) {
    try {
      if (!data.url || !this.isValidPubkyUrl(data.url)) {
        this.sendError(client, 'Invalid Pubky URL');
        return;
      }
      
      // Extract the public key from the Pubky URL
      const publicKey = data.url.replace('pubky://', '').split('/')[0];
      
      if (!publicKey) {
        this.sendError(client, 'Invalid Pubky URL format');
        return;
      }
      
      // Get the sovereignty score from the database
      const result = await db.query(
        `SELECT sovereignty_score, provider_independence, key_ownership, 
         censorship_resistance, privacy, portability
         FROM pubky_domains 
         WHERE public_key = $1`,
        [publicKey]
      );
      
      if (result.rows.length === 0) {
        this.sendError(client, 'Pubky domain not found');
        return;
      }
      
      // Send the sovereignty score
      this.send(client, {
        type: 'pubky_sovereignty_score',
        data: {
          url: data.url,
          sovereignty_score: result.rows[0].sovereignty_score,
          components: {
            provider_independence: result.rows[0].provider_independence,
            key_ownership: result.rows[0].key_ownership,
            censorship_resistance: result.rows[0].censorship_resistance,
            privacy: result.rows[0].privacy,
            portability: result.rows[0].portability
          },
          timestamp: new Date().toISOString()
        }
      });
      
      // Log the activity
      this.logPubkyActivity(client.userId, 'sovereignty_score_request', data.url);
    } catch (error) {
      console.error(`Error handling Pubky sovereignty score request for ${data.url}:`, error);
      this.sendError(client, 'Error getting sovereignty score');
    }
  }
  
  /**
   * Handle request for Pubky guardian status
   */
  private async handlePubkyGuardianStatusRequest(client: WebSocketClient, data: { familyId: string }) {
    try {
      if (!data.familyId) {
        this.sendError(client, 'Family ID is required');
        return;
      }
      
      // Check if the user has access to this family
      const hasAccess = await this.checkFamilyAccess(client.userId, data.familyId);
      
      if (!hasAccess) {
        this.sendError(client, 'Access denied to family');
        return;
      }
      
      // Get the guardian status from the database
      const result = await db.query(
        `SELECT g.pubky_public_key, g.pubky_url, g.last_seen_at, g.status,
         u.display_name, u.email
         FROM pubky_guardians g
         JOIN users u ON g.user_id = u.id
         WHERE g.family_id = $1`,
        [data.familyId]
      );
      
      // Send the guardian status
      this.send(client, {
        type: 'pubky_guardian_status',
        data: {
          family_id: data.familyId,
          guardians: result.rows.map(row => ({
            pubky_url: row.pubky_url,
            status: row.status,
            last_seen: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
            user: {
              display_name: row.display_name,
              email: row.email
            }
          })),
          timestamp: new Date().toISOString()
        }
      });
      
      // Log the activity
      this.logPubkyActivity(client.userId, 'guardian_status_request', `family:${data.familyId}`);
    } catch (error) {
      console.error(`Error handling Pubky guardian status request for family ${data.familyId}:`, error);
      this.sendError(client, 'Error getting guardian status');
    }
  }
  
  private async handleSubscribe(client: WebSocketClient, data: SubscriptionData) {
    if (data.domainId) {
      await this.handleDomainSubscription(client, data.domainId);
    }
    
    if (data.familyId) {
      await this.handleFamilySubscription(client, data.familyId);
    }
    
    if (data.pubkyUrl) {
      await this.handlePubkyUrlSubscription(client, data.pubkyUrl);
    }
  }
  
  /**
   * Handle subscription to a domain
   */
  private async handleDomainSubscription(client: WebSocketClient, domainId: string) {
    try {
      // Check if user has access to this domain
      const hasAccess = await this.checkDomainAccess(client.userId, domainId);
      
      if (!hasAccess) {
        this.sendError(client, 'Access denied to domain');
        return;
      }
      
      if (!client.subscriptions.domains.includes(domainId)) {
        client.subscriptions.domains.push(domainId);
      }
      
      this.send(client, {
        type: 'subscribed',
        data: {
          entity: 'domain',
          id: domainId
        }
      });
    } catch (error) {
      console.error('Error checking domain access:', error);
      this.sendError(client, 'Error processing domain subscription');
    }
  }
  
  /**
   * Handle subscription to a family
   */
  private async handleFamilySubscription(client: WebSocketClient, familyId: string) {
    try {
      // Check if user has access to this family
      const hasAccess = await this.checkFamilyAccess(client.userId, familyId);
      
      if (!hasAccess) {
        this.sendError(client, 'Access denied to family');
        return;
      }
      
      if (!client.subscriptions.families.includes(familyId)) {
        client.subscriptions.families.push(familyId);
      }
      
      this.send(client, {
        type: 'subscribed',
        data: {
          entity: 'family',
          id: familyId
        }
      });
    } catch (error) {
      console.error('Error checking family access:', error);
      this.sendError(client, 'Error processing family subscription');
    }
  }
  
  /**
   * Handle subscription to a Pubky URL
   */
  private async handlePubkyUrlSubscription(client: WebSocketClient, pubkyUrl: string) {
    try {
      // Check if Pubky features are enabled
      if (!this.PUBKY_FEATURES_ENABLED) {
        this.sendError(client, 'Pubky features are not enabled');
        return;
      }
      
      // Validate the Pubky URL format
      if (!this.isValidPubkyUrl(pubkyUrl)) {
        this.sendError(client, 'Invalid Pubky URL format');
        return;
      }
      
      // Check for rate limiting - maximum number of subscriptions per client
      if (client.subscriptions.pubkyUrls.length >= this.MAX_PUBKY_SUBSCRIPTIONS_PER_CLIENT) {
        this.sendError(client, `Maximum number of Pubky subscriptions (${this.MAX_PUBKY_SUBSCRIPTIONS_PER_CLIENT}) reached`);
        return;
      }
      
      // Check if the user has access to this Pubky URL
      const hasAccess = await this.checkPubkyUrlAccess(client.userId, pubkyUrl);
      
      if (!hasAccess) {
        this.sendError(client, 'Access denied to Pubky URL');
        return;
      }
      
      // Add to client subscriptions if not already subscribed
      if (!client.subscriptions.pubkyUrls.includes(pubkyUrl)) {
        client.subscriptions.pubkyUrls.push(pubkyUrl);
      }
      
      // Create or update the Pubky subscription
      const subscription: PubkySubscription = this.pubkySubscriptions.get(pubkyUrl) || {
        url: pubkyUrl,
        clientId: client.id,
        lastUpdated: new Date(0), // Force immediate update
        status: 'pending',
        relayStatus: []
      };
      
      // Update relay status for this subscription
      subscription.relayStatus = Array.from(this.pubkyRelayStatus.entries()).map(([relay, status]) => ({
        relay,
        connected: status.connected,
        lastSeen: status.lastSeen
      }));
      
      // Save the subscription
      this.pubkySubscriptions.set(pubkyUrl, subscription);
      
      // Send subscription confirmation
      this.send(client, {
        type: 'subscribed',
        data: {
          entity: 'pubkyUrl',
          url: pubkyUrl,
          status: subscription.status,
          relayStatus: subscription.relayStatus.map(status => ({
            relay: status.relay,
            connected: status.connected,
            lastSeen: status.lastSeen.toISOString()
          }))
        }
      });
      
      console.log(`Client ${client.id} subscribed to Pubky URL: ${pubkyUrl}`);
      
      // Immediately try to resolve the URL and send the content
      this.resolvePubkyUrl(pubkyUrl).then(content => {
        if (content) {
          // Update subscription status
          subscription.status = 'active';
          subscription.lastUpdated = new Date();
          this.pubkySubscriptions.set(pubkyUrl, subscription);
          
          // Cache the content
          const cacheKey = `pubky:${pubkyUrl}`;
          this.pubkyContentCache.set(cacheKey, {
            content,
            timestamp: Date.now(),
            expires: Date.now() + this.PUBKY_CACHE_TTL
          });
          
          // Notify the client
          this.notifyPubkyContentUpdate(pubkyUrl, content);
        }
      }).catch(error => {
        console.error(`Error resolving Pubky URL ${pubkyUrl}:`, error);
        
        // Update subscription status
        subscription.status = 'error';
        subscription.lastUpdated = new Date();
        this.pubkySubscriptions.set(pubkyUrl, subscription);
        
        // Notify the client
        this.notifyPubkySubscriptionError(pubkyUrl, 'Failed to resolve Pubky URL');
      });
    } catch (error) {
      console.error('Error processing Pubky URL subscription:', error);
      this.sendError(client, 'Error processing Pubky URL subscription');
    }
  }
  
  /**
   * Check if a URL is a valid Pubky URL
   */
  private isValidPubkyUrl(url: string): boolean {
    // Pubky URLs start with pubky:// followed by a public key
    return url.startsWith('pubky://') && url.length > 10;
  }
  
  /**
   * Initialize Pubky relays monitoring
   */
  private initializePubkyRelays() {
    // Skip if Pubky features are disabled
    if (!this.PUBKY_FEATURES_ENABLED) {
      return;
    }
    
    // Get PKARR relays from configuration
    const relays = config.pubky.pkarrRelays || [
      'https://relay.pkarr.org',
      'https://pkarr.relay.pubky.tech',
      'https://pkarr.relay.synonym.to'
    ];
    
    // Initialize relay status
    for (const relay of relays) {
      this.pubkyRelayStatus.set(relay, {
        connected: false,
        lastSeen: new Date()
      });
    }
    
    // Check relay status immediately
    this.checkPubkyRelayStatus();
  }
  
  /**
   * Check the status of all PKARR relays
   */
  private async checkPubkyRelayStatus() {
    for (const [relay, status] of this.pubkyRelayStatus.entries()) {
      try {
        // Ping the relay to check if it's online
        const response = await fetch(`${relay}/health`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });
        
        const newStatus = {
          connected: response.ok,
          lastSeen: new Date()
        };
        
        // Update relay status
        this.pubkyRelayStatus.set(relay, newStatus);
        
        // If status changed, notify subscribers
        if (status.connected !== newStatus.connected) {
          this.notifyPubkyRelayStatusChange(relay, newStatus);
        }
      } catch (error) {
        console.error(`Error checking PKARR relay status for ${relay}:`, error);
        
        // Update relay status to disconnected
        this.pubkyRelayStatus.set(relay, {
          connected: false,
          lastSeen: status.lastSeen // Keep the last seen time
        });
        
        // If status changed, notify subscribers
        if (status.connected) {
          this.notifyPubkyRelayStatusChange(relay, { connected: false, lastSeen: status.lastSeen });
        }
      }
    }
  }
  
  /**
   * Notify clients about relay status changes
   */
  private notifyPubkyRelayStatusChange(relay: string, status: { connected: boolean; lastSeen: Date }) {
    // Find all clients that have subscribed to Pubky URLs
    for (const client of this.clients.values()) {
      if (client.subscriptions.pubkyUrls.length > 0) {
        this.send(client, {
          type: 'pubky_relay_status',
          data: {
            relay,
            connected: status.connected,
            lastSeen: status.lastSeen.toISOString()
          }
        });
      }
    }
  }
  
  /**
   * Start the Pubky update interval
   */
  private startPubkyUpdates() {
    // Skip if Pubky features are disabled
    if (!this.PUBKY_FEATURES_ENABLED) {
      return;
    }
    
    if (this.pubkyUpdateInterval) {
      clearInterval(this.pubkyUpdateInterval);
    }
    
    this.pubkyUpdateInterval = setInterval(() => {
      // Check relay status
      this.checkPubkyRelayStatus();
      
      // Update Pubky subscriptions
      this.updatePubkySubscriptions();
      
      // Clean up expired cache entries
      this.cleanupPubkyCache();
    }, this.PUBKY_UPDATE_INTERVAL);
  }
  
  /**
   * Update all Pubky subscriptions
   */
  private async updatePubkySubscriptions() {
    for (const [url, subscription] of this.pubkySubscriptions.entries()) {
      try {
        // Skip if the subscription was updated recently
        const now = new Date();
        const timeSinceLastUpdate = now.getTime() - subscription.lastUpdated.getTime();
        if (timeSinceLastUpdate < this.PUBKY_UPDATE_INTERVAL) {
          continue;
        }
        
        // Check if the content is in cache
        const cacheKey = `pubky:${url}`;
        const cachedContent = this.pubkyContentCache.get(cacheKey);
        
        if (cachedContent && cachedContent.expires > Date.now()) {
          // Use cached content
          this.notifyPubkyContentUpdate(url, cachedContent.content);
          continue;
        }
        
        // Fetch the latest content from the Pubky URL
        const content = await this.resolvePubkyUrl(url);
        
        if (content) {
          // Update subscription status
          subscription.status = 'active';
          subscription.lastUpdated = now;
          this.pubkySubscriptions.set(url, subscription);
          
          // Cache the content
          this.pubkyContentCache.set(cacheKey, {
            content,
            timestamp: Date.now(),
            expires: Date.now() + this.PUBKY_CACHE_TTL
          });
          
          // Notify subscribers
          this.notifyPubkyContentUpdate(url, content);
        }
      } catch (error) {
        console.error(`Error updating Pubky subscription for ${url}:`, error);
        
        // Update subscription status
        subscription.status = 'error';
        subscription.lastUpdated = new Date();
        this.pubkySubscriptions.set(url, subscription);
        
        // Notify subscribers about the error
        this.notifyPubkySubscriptionError(url, 'Failed to update subscription');
      }
    }
  }
  
  /**
   * Clean up expired cache entries
   */
  private cleanupPubkyCache() {
    const now = Date.now();
    
    for (const [key, entry] of this.pubkyContentCache.entries()) {
      if (entry.expires < now) {
        this.pubkyContentCache.delete(key);
      }
    }
  }
  
  /**
   * Resolve a Pubky URL
   */
  private async resolvePubkyUrl(url: string): Promise<any> {
    try {
      // Import the PubkyClient (cached)
      if (!this.pubkyClientModule) {
        this.pubkyClientModule = await import('./PubkyClient');
      }
      const { PubkyClient } = this.pubkyClientModule;
      
      // Create a client instance
      const client = new PubkyClient();
      
      // Resolve the URL
      return await client.getData(url);
    } catch (error) {
      console.error(`Error resolving Pubky URL ${url}:`, error);
      return null;
    }
  }
  
  /**
   * Notify subscribers about Pubky content updates
   */
  private notifyPubkyContentUpdate(url: string, content: any) {
    // Find clients subscribed to this URL
    for (const client of this.clients.values()) {
      if (client.subscriptions.pubkyUrls.includes(url)) {
        this.send(client, {
          type: 'pubky_content_update',
          data: {
            url,
            content,
            timestamp: new Date().toISOString()
          }
        });
      }
    }
  }
  
  /**
   * Notify subscribers about Pubky subscription errors
   */
  private notifyPubkySubscriptionError(url: string, errorMessage: string) {
    // Find clients subscribed to this URL
    for (const client of this.clients.values()) {
      if (client.subscriptions.pubkyUrls.includes(url)) {
        this.send(client, {
          type: 'pubky_subscription_error',
          data: {
            url,
            error: errorMessage,
            timestamp: new Date().toISOString()
          }
        });
      }
    }
  }
  
  /**
   * Log Pubky activity for audit purposes
   */
  private async logPubkyActivity(userId: string, action: string, pubkyUrl: string, details?: Record<string, unknown>) {
    try {
      // Extract the public key from the Pubky URL
      const publicKey = pubkyUrl.replace('pubky://', '').split('/')[0];
      
      // Log the activity to the database
      await db.query(
        `INSERT INTO pubky_activity_logs (
          id, user_id, action, pubky_url, pubky_public_key, details, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          uuidv4(),
          userId,
          action,
          pubkyUrl,
          publicKey,
          details ? JSON.stringify(details) : null
        ]
      );
    } catch (error) {
      console.error('Error logging Pubky activity:', error);
      // Non-critical error, so we don't throw
    }
  }
  
  private handleUnsubscribe(client: WebSocketClient, data: SubscriptionData) {
    if (data.domainId) {
      client.subscriptions.domains = client.subscriptions.domains.filter(id => id !== data.domainId);
      
      this.send(client, {
        type: 'unsubscribed',
        data: {
          entity: 'domain',
          id: data.domainId
        }
      });
    }
    
    if (data.familyId) {
      client.subscriptions.families = client.subscriptions.families.filter(id => id !== data.familyId);
      
      this.send(client, {
        type: 'unsubscribed',
        data: {
          entity: 'family',
          id: data.familyId
        }
      });
    }
    
    if (data.pubkyUrl) {
      // Remove from client subscriptions
      client.subscriptions.pubkyUrls = client.subscriptions.pubkyUrls.filter(url => url !== data.pubkyUrl);
      
      // Check if any other clients are still subscribed to this URL
      let hasOtherSubscribers = false;
      for (const otherClient of this.clients.values()) {
        if (otherClient.id !== client.id && otherClient.subscriptions.pubkyUrls.includes(data.pubkyUrl)) {
          hasOtherSubscribers = true;
          break;
        }
      }
      
      // If no other clients are subscribed, remove the subscription
      if (!hasOtherSubscribers) {
        this.pubkySubscriptions.delete(data.pubkyUrl);
        
        // Also remove from cache
        const cacheKey = `pubky:${data.pubkyUrl}`;
        this.pubkyContentCache.delete(cacheKey);
      }
      
      // Send unsubscription confirmation
      this.send(client, {
        type: 'unsubscribed',
        data: {
          entity: 'pubkyUrl',
          url: data.pubkyUrl
        }
      });
      
      console.log(`Client ${client.id} unsubscribed from Pubky URL: ${data.pubkyUrl}`);
      
      // Log the unsubscription for audit purposes
      this.logPubkyActivity(client.userId, 'unsubscribe', data.pubkyUrl);
    }
  }
  
  private send(client: WebSocketClient, data: WebSocketMessage) {
    if (client.socket.readyState === WebSocket.WebSocket.OPEN) {
      client.socket.send(JSON.stringify(data));
    }
  }
  
  private sendError(client: WebSocketClient, message: string) {
    this.send(client, {
      type: 'error',
      data: {
        message
      }
    });
  }
  
  /**
   * Verify authentication token and extract user ID
   * @param token JWT token
   * @returns User ID if token is valid, null otherwise
   */
  private async verifyAuthToken(token: string): Promise<string | null> {
    try {
      // Verify JWT token
      const decoded = jwt.verify(token, config.auth.jwtSecret) as { userId: string };
      
      // Check if user exists in database
      const result = await db.query(
        'SELECT id FROM users WHERE id = $1',
        [decoded.userId]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return decoded.userId;
    } catch (error) {
      console.error('Error verifying auth token:', error);
      return null;
    }
  }
  
  /**
   * Start the heartbeat interval to keep connections alive
   */
  private startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((socket) => {
        if (socket.readyState === WebSocket.WebSocket.OPEN) {
          socket.ping();
        }
      });
      
      // Also clean up any dead connections
      this.cleanupDeadConnections();
    }, this.HEARTBEAT_INTERVAL);
  }
  
  /**
   * Clean up any dead connections
   */
  private cleanupDeadConnections() {
    for (const [clientId, client] of this.clients.entries()) {
      if (client.socket.readyState !== WebSocket.WebSocket.OPEN) {
        this.clients.delete(clientId);
        console.log(`Cleaned up dead connection: ${clientId}`);
      }
    }
  }
  
  /**
   * Check if a user has access to a domain
   */
  private async checkDomainAccess(userId: string, domainId: string): Promise<boolean> {
    try {
      // Check if user is a member of the domain
      const memberResult = await db.query(
        `SELECT id FROM domain_members 
         WHERE domain_record_id = $1 AND user_id = $2`,
        [domainId, userId]
      );
      
      if (memberResult.rows.length > 0) {
        return true;
      }
      
      // Check if user is a member of the family that owns the domain
      const familyResult = await db.query(
        `SELECT f.id 
         FROM domain_records d
         JOIN family_members f ON d.family_id = f.family_id
         WHERE d.id = $1 AND f.user_id = $2`,
        [domainId, userId]
      );
      
      return familyResult.rows.length > 0;
    } catch (error) {
      console.error('Error checking domain access:', error);
      return false;
    }
  }
  
  /**
   * Check if a user has access to a family
   */
  private async checkFamilyAccess(userId: string, familyId: string): Promise<boolean> {
    try {
      // Check if user is a member of the family
      const result = await db.query(
        `SELECT id FROM family_members 
         WHERE family_id = $1 AND user_id = $2`,
        [familyId, userId]
      );
      
      return result.rows.length > 0;
    } catch (error) {
      console.error('Error checking family access:', error);
      return false;
    }
  }
  
  /**
   * Check if a user has access to a Pubky URL
   */
  private async checkPubkyUrlAccess(userId: string, pubkyUrl: string): Promise<boolean> {
    try {
      // Extract the public key from the Pubky URL
      const publicKey = pubkyUrl.replace('pubky://', '').split('/')[0];
      
      if (!publicKey) {
        return false;
      }
      
      // Check if the user owns this Pubky URL
      const ownerResult = await db.query(
        `SELECT id FROM pubky_keypairs 
         WHERE public_key = $1 AND user_id = $2`,
        [publicKey, userId]
      );
      
      if (ownerResult.rows.length > 0) {
        return true;
      }
      
      // Check if the Pubky URL is associated with a family the user belongs to
      const familyResult = await db.query(
        `SELECT f.id 
         FROM pubky_family_domains p
         JOIN family_members f ON p.family_id = f.family_id
         WHERE p.pubky_public_key = $1 AND f.user_id = $2`,
        [publicKey, userId]
      );
      
      if (familyResult.rows.length > 0) {
        return true;
      }
      
      // Check if the Pubky URL is public (no access control)
      const publicResult = await db.query(
        `SELECT id FROM pubky_domains 
         WHERE public_key = $1 AND access_control = 'public'`,
        [publicKey]
      );
      
      if (publicResult.rows.length > 0) {
        return true;
      }
      
      // Check if the user has been granted access to this Pubky URL
      const grantedResult = await db.query(
        `SELECT id FROM pubky_access_grants 
         WHERE pubky_public_key = $1 AND user_id = $2 AND expires_at > NOW()`,
        [publicKey, userId]
      );
      
      return grantedResult.rows.length > 0;
    } catch (error) {
      console.error('Error checking Pubky URL access:', error);
      
      // Deny access by default on error for security
      return false;
    }
  }
  
  private async setupDatabaseListeners() {
    try {
      // Clean up existing client if there is one
      if (this.pgClient) {
        try {
          await this.pgClient.query('UNLISTEN domain_events');
          this.pgClient.release();
        } catch (e) {
          console.error('Error cleaning up existing PostgreSQL client:', e);
        }
      }
      
      // Create a dedicated client for LISTEN/NOTIFY
      this.pgClient = await db.getClient();
      
      // Listen for domain events
      await this.pgClient.query('LISTEN domain_events');
      
      // Set up notification handler
      this.pgClient.on('notification', async (notification) => {
        try {
          // Parse the payload
          const payload = JSON.parse(notification.payload || '{}');
          const { domainRecordId, action, details } = payload;
          
          if (!domainRecordId) {
            console.error('Invalid notification payload:', payload);
            return;
          }
          
          // Get the domain record
          const domainResult = await db.query(`
            SELECT id, family_id as "familyId"
            FROM domain_records
            WHERE id = $1
          `, [domainRecordId]);
          
          if (domainResult.rows.length === 0) {
            return;
          }
          
          const domain = domainResult.rows[0];
          
          // Notify clients subscribed to this domain
          for (const client of this.clients.values()) {
            if (
              client.subscriptions.domains.includes(domain.id) ||
              client.subscriptions.families.includes(domain.familyId)
            ) {
              this.send(client, {
                type: 'domain_event',
                data: {
                  event: action,
                  domainId: domain.id,
                  familyId: domain.familyId,
                  details,
                  timestamp: new Date()
                }
              });
            }
          }
        } catch (error) {
          console.error('Error processing notification:', error);
        }
      });
      
      // Handle client errors
      this.pgClient.on('error', (err) => {
        console.error('Error in PostgreSQL notification client:', err);
        
        // Release the client
        if (this.pgClient) {
          try {
            this.pgClient.release();
          } catch (e) {
            // Ignore release errors
          }
          this.pgClient = null;
        }
        
        // Try to reconnect after a delay
        setTimeout(() => this.setupDatabaseListeners(), 5000);
      });
      
      console.log('PostgreSQL LISTEN/NOTIFY setup complete for domain events');
    } catch (error) {
      console.error('Error setting up database listeners:', error);
      
      // Release the client if it was created
      if (this.pgClient) {
        try {
          this.pgClient.release();
        } catch (e) {
          // Ignore release errors
        }
        this.pgClient = null;
      }
      
      // Try to reconnect after a delay
      setTimeout(() => this.setupDatabaseListeners(), 5000);
    }
  }
  
  /**
   * Get connection statistics
   */
  public getConnectionStats() {
    const totalConnections = this.clients.size;
    const domainSubscriptions = new Map<string, number>();
    const familySubscriptions = new Map<string, number>();
    const pubkyUrlSubscriptions = new Map<string, number>();
    
    // Count subscriptions
    for (const client of this.clients.values()) {
      for (const domainId of client.subscriptions.domains) {
        domainSubscriptions.set(
          domainId, 
          (domainSubscriptions.get(domainId) || 0) + 1
        );
      }
      
      for (const familyId of client.subscriptions.families) {
        familySubscriptions.set(
          familyId,
          (familySubscriptions.get(familyId) || 0) + 1
        );
      }
      
      for (const pubkyUrl of client.subscriptions.pubkyUrls) {
        pubkyUrlSubscriptions.set(
          pubkyUrl,
          (pubkyUrlSubscriptions.get(pubkyUrl) || 0) + 1
        );
      }
    }
    
    return {
      totalConnections,
      domainSubscriptions: Object.fromEntries(domainSubscriptions),
      familySubscriptions: Object.fromEntries(familySubscriptions),
      pubkyUrlSubscriptions: Object.fromEntries(pubkyUrlSubscriptions),
      timestamp: new Date(),
      pgClientStatus: this.pgClient ? 'connected' : 'disconnected'
    };
  }
  
  /**
   * Broadcast a Pubky URL event to all subscribed clients
   */
  public async broadcastPubkyEvent(
    pubkyUrl: string,
    event: string,
    details: Record<string, unknown>
  ) {
    try {
      // Find all clients subscribed to this Pubky URL
      for (const client of this.clients.values()) {
        if (client.subscriptions.pubkyUrls.includes(pubkyUrl)) {
          this.send(client, {
            type: 'pubky_event',
            data: {
              event,
              pubkyUrl,
              details,
              timestamp: new Date()
            }
          });
        }
      }
      
      // Log the event
      console.log(`Broadcasting Pubky event: ${event} for URL: ${pubkyUrl}`);
    } catch (error) {
      console.error('Error broadcasting Pubky event:', error);
    }
  }
  
  /**
   * Broadcast a domain event to all subscribed clients
   */
  public async broadcastDomainEvent(
    domainId: string,
    event: string,
    details: DomainEventDetails
  ) {
    try {
      // Get the domain record
      const result = await db.query(`
        SELECT id, family_id as "familyId"
        FROM domain_records
        WHERE id = $1
      `, [domainId]);
      
      if (result.rows.length === 0) {
        return;
      }
      
      const domain = result.rows[0];
      
      // Log the event
      const eventId = uuidv4();
      await db.query(`
        INSERT INTO domain_audit_log (
          id, domain_record_id, action, details, created_at
        ) VALUES ($1, $2, $3, $4, NOW())
      `, [eventId, domainId, event, JSON.stringify(details)]);
      
      // Notify PostgreSQL listeners
      const notificationPayload = JSON.stringify({
        domainRecordId: domainId,
        action: event,
        details,
        eventId
      });
      
      await db.query(`SELECT pg_notify('domain_events', $1)`, [notificationPayload]);
      
      // Also directly notify currently connected clients
      // This provides redundancy in case the NOTIFY/LISTEN mechanism fails
      for (const client of this.clients.values()) {
        if (
          client.subscriptions.domains.includes(domain.id) ||
          client.subscriptions.families.includes(domain.familyId)
        ) {
          this.send(client, {
            type: 'domain_event',
            data: {
              event,
              domainId: domain.id,
              familyId: domain.familyId,
              details,
              timestamp: new Date(),
              eventId
            }
          });
        }
      }
    } catch (error) {
      console.error('Error broadcasting domain event:', error);
    }
  }
}