/**
 * Pubky Client Integration
 * 
 * This module provides integration with the Pubky protocol for decentralized domain management.
 * It uses the EnhancedPubkyClient for full PKARR support, homeserver communication,
 * pubky:// URL resolution, Ed25519 keypair management, and domain sovereignty.
 */

import axios from 'axios';
import { EnhancedPubkyClient as PubkyCore, createPubkyClient } from '../../lib/pubky-enhanced-client';
import { config } from '../../config';

export interface PubkyKeypair {
  publicKey: string;
  privateKey: string;
}

export interface PubkySession {
  publicKey: string;
  homeserver: string;
  capabilities: string[];
}

export class PubkyClient {
  private homeserverUrl: string;
  private pkarrRelayUrl: string;
  private session: PubkySession | null = null;
  private enhancedClient: PubkyCore;
  
  constructor(options: { homeserverUrl?: string; pkarrRelayUrl?: string } = {}) {
    this.homeserverUrl = options.homeserverUrl || config.pubky.homeserverUrl || 'https://homeserver.pubky.tech';
    this.pkarrRelayUrl = options.pkarrRelayUrl || (config.pubky.pkarrRelays && config.pubky.pkarrRelays[0]) || 'https://relay.pkarr.org';
    
    // Initialize the enhanced client using the factory function
    if (options.homeserverUrl || options.pkarrRelayUrl) {
      // If custom options are provided, create a client with those options
      this.enhancedClient = new PubkyCore({
        homeserver_url: this.homeserverUrl,
        pkarr_relays: [this.pkarrRelayUrl]
      });
    } else {
      // Otherwise, use the factory function which uses the config
      this.enhancedClient = createPubkyClient();
    }
  }
  
  /**
   * Generate a new Pubky keypair
   */
  public async generateKeypair(): Promise<PubkyKeypair> {
    // Use the enhanced client to generate a proper Ed25519 keypair
    const enhancedKeypair = await this.enhancedClient.generatePubkyKeypair();
    
    // Convert to the format expected by the existing code
    return {
      publicKey: enhancedKeypair.public_key,
      privateKey: enhancedKeypair.private_key
    };
  }
  
  /**
   * Create a session with a Pubky homeserver (common logic for signup and signin)
   */
  private async createSession(keypair: PubkyKeypair, operation: 'signup' | 'signin'): Promise<PubkySession> {
    try {
      // Convert to enhanced keypair format
      const enhancedKeypair = {
        public_key: keypair.publicKey,
        private_key: keypair.privateKey,
        pubky_url: this.createPubkyUrl(keypair.publicKey, ''),
        z32_address: keypair.publicKey // Simplified for compatibility
      };
      
      // Use the enhanced client to verify domain ownership
      const isOwner = await this.enhancedClient.verifyDomainOwnership(
        enhancedKeypair.pubky_url,
        enhancedKeypair.private_key
      );
      
      if (!isOwner) {
        throw new Error('Failed to verify domain ownership');
      }
      
      console.log(`${operation === 'signup' ? 'Signing up with' : 'Signing in to'} Pubky homeserver at ${this.homeserverUrl}`);
      console.log(`Using public key: ${keypair.publicKey}`);
      
      // Create a session
      this.session = {
        publicKey: keypair.publicKey,
        homeserver: this.homeserverUrl,
        capabilities: ['/pub/:rw']
      };
      
      return this.session;
    } catch (error) {
      console.error(`Error ${operation === 'signup' ? 'signing up with' : 'signing in to'} Pubky homeserver:`, error);
      throw error;
    }
  }
  
  /**
   * Sign up with a Pubky homeserver
   */
  public async signup(keypair: PubkyKeypair): Promise<PubkySession> {
    return this.createSession(keypair, 'signup');
  }
  
  /**
   * Sign in to a Pubky homeserver
   */
  public async signin(keypair: PubkyKeypair): Promise<PubkySession> {
    return this.createSession(keypair, 'signin');
  }
  
  /**
   * Sign out from a Pubky homeserver
   */
  public async signout(): Promise<void> {
    try {
      if (!this.session) {
        return;
      }
      
      console.log(`Signing out from Pubky homeserver at ${this.homeserverUrl}`);
      
      // Clear the session
      this.session = null;
    } catch (error) {
      console.error('Error signing out from Pubky homeserver:', error);
      throw error;
    }
  }
  
  /**
   * Put data to a Pubky URL
   * @param url The Pubky URL to publish to
   * @param data The data to publish
   * @param keypair The keypair for authentication
   * @param contentType The MIME type of the content (defaults to 'application/json')
   */
  public async putData(url: string, data: any, keypair: PubkyKeypair, contentType: string = 'application/json'): Promise<void> {
    try {
      if (!url.startsWith('pubky://')) {
        throw new Error('Invalid Pubky URL');
      }
      
      // Convert to enhanced keypair format
      const enhancedKeypair = {
        public_key: keypair.publicKey,
        private_key: keypair.privateKey,
        pubky_url: this.createPubkyUrl(keypair.publicKey, ''),
        z32_address: keypair.publicKey // Simplified for compatibility
      };
      
      // Extract path from URL
      const path = url.replace(`pubky://${keypair.publicKey}`, '');
      
      // Use the enhanced client to publish content
      await this.enhancedClient.publishContent(
        enhancedKeypair,
        path,
        data,
        contentType
      );
      
      console.log(`Published data to Pubky URL: ${url}`);
    } catch (error) {
      console.error('Error putting data to Pubky URL:', error);
      throw error;
    }
  }
  
  /**
   * Get data from a Pubky URL
   */
  public async getData(url: string): Promise<any> {
    try {
      if (!url.startsWith('pubky://')) {
        throw new Error('Invalid Pubky URL');
      }
      
      // Use the enhanced client to resolve the URL
      const content = await this.enhancedClient.resolvePubkyUrl(url);
      
      if (!content) {
        throw new Error(`Failed to resolve Pubky URL: ${url}`);
      }
      
      console.log(`Retrieved data from Pubky URL: ${url}`);
      
      return content.content;
    } catch (error) {
      console.error('Error getting data from Pubky URL:', error);
      throw error;
    }
  }
  
  /**
   * Delete data from a Pubky URL
   * @param url The Pubky URL to delete from
   * @param keypair The keypair for authentication
   * @param contentType The MIME type of the tombstone marker (defaults to 'application/json')
   */
  public async deleteData(url: string, keypair: PubkyKeypair, contentType: string = 'application/json'): Promise<void> {
    try {
      if (!url.startsWith('pubky://')) {
        throw new Error('Invalid Pubky URL');
      }
      
      // Convert to enhanced keypair format
      const enhancedKeypair = {
        public_key: keypair.publicKey,
        private_key: keypair.privateKey,
        pubky_url: this.createPubkyUrl(keypair.publicKey, ''),
        z32_address: keypair.publicKey // Simplified for compatibility
      };
      
      // Extract path from URL
      const path = url.replace(`pubky://${keypair.publicKey}`, '');
      
      // For deletion, we publish a tombstone marker
      await this.enhancedClient.publishContent(
        enhancedKeypair,
        path,
        { _deleted: true, _deleted_at: Date.now() },
        contentType
      );
      
      console.log(`Deleted data from Pubky URL: ${url}`);
    } catch (error) {
      console.error('Error deleting data from Pubky URL:', error);
      throw error;
    }
  }
  
  /**
   * Create a Pubky URL for a domain
   */
  public createPubkyUrl(publicKey: string, path: string): string {
    return `pubky://${publicKey}${path.startsWith('/') ? path : '/' + path}`;
  }
  
  /**
   * Check if a Pubky URL is valid
   */
  public isValidPubkyUrl(url: string): boolean {
    return url.startsWith('pubky://');
  }
  
  /**
   * Register a Pubky domain with PKARR
   */
  public async registerPubkyDomain(
    keypair: PubkyKeypair,
    domainRecords: { name: string; type: string; value: string; ttl?: number }[]
  ): Promise<{ success: boolean; pubky_url: string; sovereignty_score: number }> {
    try {
      // Convert to enhanced keypair format
      const enhancedKeypair = {
        public_key: keypair.publicKey,
        private_key: keypair.privateKey,
        pubky_url: this.createPubkyUrl(keypair.publicKey, ''),
        z32_address: keypair.publicKey // Simplified for compatibility
      };
      
      // Convert domain records to enhanced format
      const enhancedRecords = domainRecords.map(record => ({
        name: record.name,
        type: record.type,
        value: record.value,
        ttl: record.ttl || 3600
      }));
      
      // Use the enhanced client to register the domain
      const result = await this.enhancedClient.registerPubkyDomain(
        enhancedKeypair,
        enhancedRecords
      );
      
      return {
        success: result.pkarr_published,
        pubky_url: result.pubky_url,
        sovereignty_score: result.sovereignty_score
      };
    } catch (error) {
      console.error('Error registering Pubky domain:', error);
      throw error;
    }
  }
  
  /**
   * Migrate a traditional domain to Pubky
   */
  public async migrateToPubky(
    traditionalDomain: string,
    familyId: string,
    guardianKeypairs: PubkyKeypair[]
  ): Promise<{ success: boolean; pubky_url: string; sovereignty_improvement: number }> {
    try {
      // Convert guardian keypairs to enhanced format
      const enhancedGuardianKeypairs = guardianKeypairs.map(keypair => ({
        public_key: keypair.publicKey,
        private_key: keypair.privateKey,
        pubky_url: this.createPubkyUrl(keypair.publicKey, ''),
        z32_address: keypair.publicKey // Simplified for compatibility
      }));
      
      // Use the enhanced client to migrate the domain
      const result = await this.enhancedClient.migrateFamilyDomainToPubky(
        traditionalDomain,
        familyId,
        enhancedGuardianKeypairs
      );
      
      return {
        success: result.migration_success,
        pubky_url: result.pubky_url,
        sovereignty_improvement: result.sovereignty_score_improvement
      };
    } catch (error) {
      console.error('Error migrating to Pubky:', error);
      throw error;
    }
  }
  
  /**
   * Verify ownership of a Pubky domain
   */
  public async verifyDomainOwnership(pubkyUrl: string, keypair: PubkyKeypair): Promise<boolean> {
    try {
      return await this.enhancedClient.verifyDomainOwnership(
        pubkyUrl,
        keypair.privateKey
      );
    } catch (error) {
      console.error('Error verifying domain ownership:', error);
      return false;
    }
  }
  
  /**
   * Create a backup of a Pubky domain
   */
  public async createDomainBackup(
    keypair: PubkyKeypair,
    domainData: any,
    guardianKeypairs: PubkyKeypair[]
  ): Promise<string[]> {
    try {
      // Convert keypairs to enhanced format
      const enhancedKeypair = {
        public_key: keypair.publicKey,
        private_key: keypair.privateKey,
        pubky_url: this.createPubkyUrl(keypair.publicKey, ''),
        z32_address: keypair.publicKey // Simplified for compatibility
      };
      
      const enhancedGuardianKeypairs = guardianKeypairs.map(keypair => ({
        public_key: keypair.publicKey,
        private_key: keypair.privateKey,
        pubky_url: this.createPubkyUrl(keypair.publicKey, ''),
        z32_address: keypair.publicKey // Simplified for compatibility
      }));
      
      // Use the enhanced client to create a backup
      return await this.enhancedClient.createDomainBackup(
        enhancedKeypair,
        domainData,
        enhancedGuardianKeypairs
      );
    } catch (error) {
      console.error('Error creating domain backup:', error);
      throw error;
    }
  }
}