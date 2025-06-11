/**
 * Pubky WebSocket Handler
 * 
 * This module handles WebSocket connections for Pubky events.
 */

import * as WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { Client } from 'pg';
import * as jwt from 'jsonwebtoken';
import { db } from '../../lib';
import { config } from '../../config';
import { PubkyDomainEvent, SovereigntyScoreEvent } from './models/PubkyModels';

interface PubkyWebSocketClient {
  id: string;
  socket: WebSocket.WebSocket;
  userId: string;
  subscriptions: {
    pubkyDomains: string[];
    pubkyUrls: string[];
    sovereigntyScores: string[];
  };
}

export class PubkyWebSocketHandler {
  private wss: WebSocket.Server;
  private clients: Map<string, PubkyWebSocketClient> = new Map();
  private pgClient: Client | null = null;
  private retryTimeout: NodeJS.Timeout | null = null;
  
  constructor(server: WebSocket.Server) {
    this.wss = server;
    this.setupWebSocketServer();
    this.setupPostgresListeners();
  }
  
  /**
   * Set up the WebSocket server
   */
  private setupWebSocketServer() {
    this.wss.on('connection', (socket: WebSocket.WebSocket, request) => {
      // Extract the token from the URL query parameters
      if (!request.url) {
        socket.close(1008, 'Invalid request');
        return;
      }
      const url = new URL(request.url, `http://${request.headers.host}`);
      const token = url.searchParams.get('token');
      
      if (!token) {
        socket.close(1008, 'Authentication required');
        return;
      }
      
      // Verify the JWT token
      this.verifyToken(token).then(userId => {
        if (!userId) {
          socket.close(1008, 'Invalid authentication token');
          return;
        }
        
        // Create a new client
        const client: PubkyWebSocketClient = {
          id: uuidv4(),
          socket,
          userId,
          subscriptions: {
            pubkyDomains: [],
            pubkyUrls: [],
            sovereigntyScores: []
          }
        };
        
        this.clients.set(client.id, client);
        
        // Set up event handlers
        socket.on('message', (message: string) => {
          try {
            const data = JSON.parse(message);
            this.handleMessage(client, data);
          } catch (error) {
            console.error('Error handling WebSocket message:', error);
            this.sendError(client, 'Invalid message format');
          }
        });
        
        socket.on('close', () => {
          this.clients.delete(client.id);
        });
        
        socket.on('error', (error) => {
          console.error('WebSocket error:', error);
          this.clients.delete(client.id);
        });
        
        // Send a welcome message
        this.send(client, {
          type: 'connected',
          data: {
            clientId: client.id,
            message: 'Connected to Pubky WebSocket server'
          }
        });
      }).catch(error => {
        console.error('Token verification error:', error);
        socket.close(1008, 'Authentication error');
      });
    });
  }
  
  /**
   * Set up PostgreSQL LISTEN/NOTIFY listeners
   */
  private async setupPostgresListeners() {
    try {
      // Create a dedicated PostgreSQL client for LISTEN/NOTIFY
      this.pgClient = new Client({
        connectionString: config.database.url,
      });
      
      // Connect to the database
      await this.pgClient.connect();
      
      // Listen for Pubky domain changes
      await this.pgClient.query('LISTEN pubky_domain_changes');
      
      // Listen for PKARR record changes
      await this.pgClient.query('LISTEN pkarr_record_changes');
      
      // Listen for sovereignty score changes
      await this.pgClient.query('LISTEN sovereignty_score_changes');
      
      // Listen for domain migration changes
      await this.pgClient.query('LISTEN domain_migration_changes');
      
      // Set up notification handler
      this.pgClient.on('notification', (notification) => {
        try {
          const payload = JSON.parse(notification.payload || '{}');
          
          switch (notification.channel) {
            case 'pubky_domain_changes':
              this.handlePubkyDomainNotification(payload);
              break;
            case 'pkarr_record_changes':
              this.handlePkarrRecordNotification(payload);
              break;
            case 'sovereignty_score_changes':
              this.handleSovereigntyScoreNotification(payload);
              break;
            case 'domain_migration_changes':
              this.handleDomainMigrationNotification(payload);
              break;
            default:
              console.log(`Received notification on unknown channel: ${notification.channel}`);
          }
        } catch (error) {
          console.error('Error handling PostgreSQL notification:', error);
        }
      });
      
      console.log('PostgreSQL LISTEN/NOTIFY listeners set up successfully');
    } catch (error) {
      console.error('Error setting up PostgreSQL LISTEN/NOTIFY listeners:', error);
      
      // Try to reconnect after a delay
      this.retryTimeout = setTimeout(() => {
        this.setupPostgresListeners();
      }, 5000);
    }
  }
  
  /**
   * Handle a WebSocket message
   */
  private handleMessage(client: PubkyWebSocketClient, message: any) {
    switch (message.type) {
      case 'subscribe':
        this.handleSubscribe(client, message.data);
        break;
      case 'unsubscribe':
        this.handleUnsubscribe(client, message.data);
        break;
      case 'ping':
        this.send(client, { type: 'pong', data: { timestamp: new Date() } });
        break;
      default:
        this.sendError(client, 'Unknown message type');
    }
  }
  
  /**
   * Handle a subscription request
   */
  private async handleSubscribe(client: PubkyWebSocketClient, data: any) {
    try {
      if (data.pubkyDomainId) {
        // Check if the user has access to this domain
        const hasAccess = await this.checkDomainAccess(client.userId, data.pubkyDomainId);
        
        if (!hasAccess) {
          this.sendError(client, 'Access denied to Pubky domain');
          return;
        }
        
        if (!client.subscriptions.pubkyDomains.includes(data.pubkyDomainId)) {
          client.subscriptions.pubkyDomains.push(data.pubkyDomainId);
        }
        
        this.send(client, {
          type: 'subscribed',
          data: {
            entity: 'pubkyDomain',
            id: data.pubkyDomainId
          }
        });
      }
      
      if (data.pubkyUrl) {
        // Validate the Pubky URL
        if (!this.isValidPubkyUrl(data.pubkyUrl)) {
          this.sendError(client, 'Invalid Pubky URL format');
          return;
        }
        
        if (!client.subscriptions.pubkyUrls.includes(data.pubkyUrl)) {
          client.subscriptions.pubkyUrls.push(data.pubkyUrl);
        }
        
        this.send(client, {
          type: 'subscribed',
          data: {
            entity: 'pubkyUrl',
            url: data.pubkyUrl
          }
        });
      }
      
      if (data.sovereigntyScoreDomainId) {
        // Check if the user has access to this domain
        const hasAccess = await this.checkDomainAccess(client.userId, data.sovereigntyScoreDomainId);
        
        if (!hasAccess) {
          this.sendError(client, 'Access denied to domain sovereignty score');
          return;
        }
        
        if (!client.subscriptions.sovereigntyScores.includes(data.sovereigntyScoreDomainId)) {
          client.subscriptions.sovereigntyScores.push(data.sovereigntyScoreDomainId);
        }
        
        this.send(client, {
          type: 'subscribed',
          data: {
            entity: 'sovereigntyScore',
            id: data.sovereigntyScoreDomainId
          }
        });
      }
    } catch (error) {
      console.error('Error handling subscription:', error);
      this.sendError(client, 'Error processing subscription');
    }
  }
  
  /**
   * Handle an unsubscribe request
   */
  private handleUnsubscribe(client: PubkyWebSocketClient, data: any) {
    if (data.pubkyDomainId) {
      client.subscriptions.pubkyDomains = client.subscriptions.pubkyDomains.filter(
        id => id !== data.pubkyDomainId
      );
      
      this.send(client, {
        type: 'unsubscribed',
        data: {
          entity: 'pubkyDomain',
          id: data.pubkyDomainId
        }
      });
    }
    
    if (data.pubkyUrl) {
      client.subscriptions.pubkyUrls = client.subscriptions.pubkyUrls.filter(
        url => url !== data.pubkyUrl
      );
      
      this.send(client, {
        type: 'unsubscribed',
        data: {
          entity: 'pubkyUrl',
          url: data.pubkyUrl
        }
      });
    }
    
    if (data.sovereigntyScoreDomainId) {
      client.subscriptions.sovereigntyScores = client.subscriptions.sovereigntyScores.filter(
        id => id !== data.sovereigntyScoreDomainId
      );
      
      this.send(client, {
        type: 'unsubscribed',
        data: {
          entity: 'sovereigntyScore',
          id: data.sovereigntyScoreDomainId
        }
      });
    }
  }
  
  /**
   * Handle a Pubky domain notification
   */
  private async handlePubkyDomainNotification(payload: any) {
    try {
      // Get the domain record ID
      const domainRecordId = payload.domain_record_id;
      
      // Create an event
      const event: PubkyDomainEvent = {
        eventType: 'registration',
        domainId: domainRecordId,
        publicKey: payload.public_key,
        details: {
          operation: payload.operation,
          registrationStatus: payload.registration_status,
          updatedAt: payload.updated_at
        },
        timestamp: new Date()
      };
      
      // Broadcast to subscribed clients
      for (const client of this.clients.values()) {
        if (client.subscriptions.pubkyDomains.includes(domainRecordId)) {
          this.send(client, {
            type: 'pubky_domain_event',
            data: event
          });
        }
      }
    } catch (error) {
      console.error('Error handling Pubky domain notification:', error);
    }
  }
  
  /**
   * Handle a PKARR record notification
   */
  private async handlePkarrRecordNotification(payload: any) {
    try {
      // Get the Pubky domain
      const pubkyDomainResult = await db.query(
        `SELECT domain_record_id as "domainRecordId", public_key as "publicKey"
        FROM pubky_domains
        WHERE id = $1`,
        [payload.pubky_domain_id]
      );
      
      if (pubkyDomainResult.rows.length === 0) {
        return;
      }
      
      const pubkyDomain = pubkyDomainResult.rows[0];
      
      // Create an event
      const event: PubkyDomainEvent = {
        eventType: 'record_change',
        domainId: pubkyDomain.domainRecordId,
        publicKey: pubkyDomain.publicKey,
        details: {
          operation: payload.operation,
          recordType: payload.record_type,
          recordName: payload.record_name,
          publishStatus: payload.publish_status,
          updatedAt: payload.updated_at
        },
        timestamp: new Date()
      };
      
      // Broadcast to subscribed clients
      for (const client of this.clients.values()) {
        if (client.subscriptions.pubkyDomains.includes(pubkyDomain.domainRecordId)) {
          this.send(client, {
            type: 'pkarr_record_event',
            data: event
          });
        }
      }
    } catch (error) {
      console.error('Error handling PKARR record notification:', error);
    }
  }
  
  /**
   * Handle a sovereignty score notification
   */
  private async handleSovereigntyScoreNotification(payload: any) {
    try {
      // Create an event
      const event: SovereigntyScoreEvent = {
        domainId: payload.domain_record_id,
        domainName: payload.domain_name,
        score: payload.score,
        calculatedAt: new Date(payload.calculated_at),
        scoreBreakdown: {}
      };
      
      // Get the score breakdown
      const scoreResult = await db.query(
        `SELECT score_breakdown as "scoreBreakdown"
        FROM sovereignty_scores
        WHERE domain_record_id = $1`,
        [payload.domain_record_id]
      );
      
      if (scoreResult.rows.length > 0) {
        event.scoreBreakdown = scoreResult.rows[0].scoreBreakdown;
      }
      
      // Broadcast to subscribed clients
      for (const client of this.clients.values()) {
        if (client.subscriptions.sovereigntyScores.includes(payload.domain_record_id)) {
          this.send(client, {
            type: 'sovereignty_score_event',
            data: event
          });
        }
      }
    } catch (error) {
      console.error('Error handling sovereignty score notification:', error);
    }
  }
  
  /**
   * Handle a domain migration notification
   */
  private async handleDomainMigrationNotification(payload: any) {
    try {
      // Create an event
      const event: PubkyDomainEvent = {
        eventType: 'migration',
        domainId: payload.domain_record_id,
        details: {
          operation: payload.operation,
          domainName: payload.domain_name,
          sourceProvider: payload.source_provider,
          targetProvider: payload.target_provider,
          migrationStatus: payload.migration_status,
          updatedAt: payload.updated_at
        },
        timestamp: new Date()
      };
      
      // Broadcast to subscribed clients
      for (const client of this.clients.values()) {
        if (client.subscriptions.pubkyDomains.includes(payload.domain_record_id)) {
          this.send(client, {
            type: 'domain_migration_event',
            data: event
          });
        }
      }
    } catch (error) {
      console.error('Error handling domain migration notification:', error);
    }
  }
  
  /**
   * Send a message to a client
   */
  private send(client: PubkyWebSocketClient, data: any) {
    if (client.socket.readyState === WebSocket.WebSocket.OPEN) {
      client.socket.send(JSON.stringify(data));
    }
  }
  
  /**
   * Send an error message to a client
   */
  private sendError(client: PubkyWebSocketClient, message: string) {
    this.send(client, {
      type: 'error',
      data: { message }
    });
  }
  
  /**
   * Verify a token
   */
  private async verifyToken(token: string): Promise<string | null> {
    try {
      const decoded = jwt.verify(token, config.auth.jwtSecret) as { userId: string };
      // Additional validation can be added here if needed
      return decoded.userId;
    } catch (error) {
      console.error('Token verification failed:', error);
      return null;
    }
  }
  
  /**
   * Check if a user has access to a domain
   */
  private async checkDomainAccess(userId: string, domainRecordId: string): Promise<boolean> {
    try {
      // Get the domain record
      const domainResult = await db.query(
        `SELECT family_id as "familyId"
        FROM domain_records
        WHERE id = $1`,
        [domainRecordId]
      );
      
      if (domainResult.rows.length === 0) {
        return false;
      }
      
      const familyId = domainResult.rows[0].familyId;
      
      // Check if the user is a member of the family
      const memberResult = await db.query(
        `SELECT id
        FROM family_members
        WHERE family_id = $1 AND user_id = $2`,
        [familyId, userId]
      );
      
      return memberResult.rows.length > 0;
    } catch (error) {
      console.error('Error checking domain access:', error);
      return false;
    }
  }
  
  /**
   * Check if a URL is a valid Pubky URL
   */
  private isValidPubkyUrl(url: string): boolean {
    if (!url.startsWith('pubky://')) {
      return false;
    }
    const publicKeyPart = url.substring(8).split('/')[0];
    // z32 addresses should be 52 characters for 32-byte keys
    return /^[ybndrfg8ejkmcpqxot1uwisza345h769]{52}$/.test(publicKeyPart);
  }
  
  /**
   * Clean up resources
   */
  public async close() {
    // Close all WebSocket connections
    for (const client of this.clients.values()) {
      client.socket.close();
    }
    
    this.clients.clear();
    
    // Clear any pending retry timeout
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
    
    // Close the PostgreSQL client
    if (this.pgClient) {
      try {
        await this.pgClient.end();
      } catch (error) {
        console.error('Error closing PostgreSQL client:', error);
      }
    }
  }
  
  /**
   * Get connection statistics
   */
  public getConnectionStats() {
    const totalConnections = this.clients.size;
    const pubkyDomainSubscriptions = new Map<string, number>();
    const pubkyUrlSubscriptions = new Map<string, number>();
    const sovereigntyScoreSubscriptions = new Map<string, number>();
    
    // Count subscriptions
    for (const client of this.clients.values()) {
      for (const domainId of client.subscriptions.pubkyDomains) {
        pubkyDomainSubscriptions.set(
          domainId,
          (pubkyDomainSubscriptions.get(domainId) || 0) + 1
        );
      }
      
      for (const url of client.subscriptions.pubkyUrls) {
        pubkyUrlSubscriptions.set(
          url,
          (pubkyUrlSubscriptions.get(url) || 0) + 1
        );
      }
      
      for (const domainId of client.subscriptions.sovereigntyScores) {
        sovereigntyScoreSubscriptions.set(
          domainId,
          (sovereigntyScoreSubscriptions.get(domainId) || 0) + 1
        );
      }
    }
    
    return {
      totalConnections,
      pubkyDomainSubscriptions: Object.fromEntries(pubkyDomainSubscriptions),
      pubkyUrlSubscriptions: Object.fromEntries(pubkyUrlSubscriptions),
      sovereigntyScoreSubscriptions: Object.fromEntries(sovereigntyScoreSubscriptions),
      timestamp: new Date(),
      pgClientStatus: this.pgClient ? 'connected' : 'disconnected'
    };
  }
}