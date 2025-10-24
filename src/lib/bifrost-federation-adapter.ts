/**
 * BIFROST Federation Adapter for Satnam Family Federations
 * 
 * Integrates BIFROST (FROSTR protocol implementation) with Satnam's Family Federation
 * architecture. Provides threshold signature generation, share management, and Nostr-based
 * guardian coordination.
 * 
 * @see https://github.com/FROSTR-ORG/bifrost
 */

import {
  BifrostNode,
  generate_dealer_pkg,
  encode_group_pkg,
  encode_share_pkg,
  decode_group_pkg,
  decode_share_pkg,
} from '@frostr/bifrost';
import { CEPS } from './central_event_publishing_service';
import { FeatureFlags } from './feature-flags';

/**
 * BIFROST share generation result
 */
export interface BifrostShareResult {
  groupPkg: string; // Bech32-encoded group package
  sharePkgs: string[]; // Bech32-encoded share packages
}

/**
 * BIFROST signing result
 */
export interface BifrostSigningResult {
  success: boolean;
  signature?: string;
  error?: string;
}

/**
 * BIFROST ECDH result
 */
export interface BifrostECDHResult {
  success: boolean;
  sharedSecret?: string;
  error?: string;
}

/**
 * BIFROST Federation Adapter
 * 
 * Manages BIFROST node initialization, share generation, and signing operations
 * for Satnam Family Federations.
 */
export class BifrostFamilyFederation {
  private node: BifrostNode | null = null;
  private federationId: string;
  private relays: string[];
  private groupPkg: string | null = null;
  private sharePkg: string | null = null;
  private isReady: boolean = false;

  constructor(federationId: string, relays: string[] = []) {
    this.federationId = federationId;
    this.relays = relays.length > 0 ? relays : CEPS.getRelays();
    
    console.log('🌉 BIFROST Federation Adapter initialized:', {
      federationId: this.federationId,
      relayCount: this.relays.length,
      relays: this.relays,
    });
  }

  /**
   * Generate threshold shares using BIFROST dealer package
   * 
   * @param threshold - Minimum number of shares required to sign
   * @param members - Total number of shares to generate
   * @param secret - Hex-encoded secret key for share generation
   * @returns Share packages (group and individual shares)
   */
  async generateShares(
    threshold: number,
    members: number,
    secret: string
  ): Promise<BifrostShareResult> {
    try {
      if (!FeatureFlags.isBifrostEnabled()) {
        throw new Error('BIFROST integration not enabled');
      }

      // Generate dealer package using BIFROST
      const { group, shares } = generate_dealer_pkg(threshold, members, [secret]);

      // Encode packages as bech32 strings
      const groupPkg = encode_group_pkg(group);
      const sharePkgs = shares.map(encode_share_pkg);

      console.log('✅ BIFROST shares generated:', {
        threshold,
        members,
        groupPkgLength: groupPkg.length,
        sharePkgCount: sharePkgs.length,
      });

      return {
        groupPkg,
        sharePkgs,
      };
    } catch (error) {
      console.error('❌ BIFROST share generation failed:', error);
      throw error;
    }
  }

  /**
   * Initialize BIFROST node with group and share packages
   * 
   * @param groupPkg - Bech32-encoded group package
   * @param sharePkg - Bech32-encoded share package
   */
  async initializeNode(groupPkg: string, sharePkg: string): Promise<void> {
    try {
      if (!FeatureFlags.isBifrostEnabled()) {
        console.warn('⚠️ BIFROST not enabled - skipping node initialization');
        return;
      }

      // Decode packages
      const group = decode_group_pkg(groupPkg);
      const share = decode_share_pkg(sharePkg);

      // Initialize BIFROST node with relay configuration
      const options = {
        debug: false,
        cache: {
          ecdh: new Map<string, string>(),
        },
      };

      this.node = new BifrostNode(group, share, this.relays, options);

      // Setup event listeners
      this.node.on('ready', () => {
        this.isReady = true;
        console.log('✅ BIFROST node ready:', this.federationId);
      });

      this.node.on('closed', () => {
        this.isReady = false;
        console.log('⚠️ BIFROST node closed:', this.federationId);
      });

      this.node.on('bounced', (relay: string, msg: any) => {
        console.warn('⚠️ BIFROST message bounced from relay:', relay);
      });

      // Connect to relays
      await this.node.connect();

      this.groupPkg = groupPkg;
      this.sharePkg = sharePkg;

      console.log('✅ BIFROST node initialized:', this.federationId);
    } catch (error) {
      console.error('❌ BIFROST node initialization failed:', error);
      throw error;
    }
  }

  /**
   * Sign a message using BIFROST threshold signatures
   * 
   * @param message - Message to sign
   * @param options - Optional signing parameters
   * @returns Signing result with signature or error
   */
  async signMessage(
    message: string,
    options?: any
  ): Promise<BifrostSigningResult> {
    try {
      if (!this.node) {
        return {
          success: false,
          error: 'BIFROST node not initialized',
        };
      }

      if (!this.isReady) {
        return {
          success: false,
          error: 'BIFROST node not ready',
        };
      }

      // Request signature from BIFROST node
      const result = await this.node.req.sign(message, options);

      if (result.ok) {
        console.log('✅ BIFROST message signed:', {
          federationId: this.federationId,
          messageLength: message.length,
        });

        return {
          success: true,
          signature: result.data,
        };
      } else {
        return {
          success: false,
          error: 'BIFROST signing failed',
        };
      }
    } catch (error) {
      console.error('❌ BIFROST signing error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Perform ECDH key exchange using BIFROST
   * 
   * @param ecdhPk - Public key for ECDH exchange
   * @param peerPks - Array of peer public keys
   * @returns ECDH result with shared secret or error
   */
  async performECDH(
    ecdhPk: string,
    peerPks: string[]
  ): Promise<BifrostECDHResult> {
    try {
      if (!this.node) {
        return {
          success: false,
          error: 'BIFROST node not initialized',
        };
      }

      if (!this.isReady) {
        return {
          success: false,
          error: 'BIFROST node not ready',
        };
      }

      // Request ECDH from BIFROST node
      const result = await this.node.req.ecdh(ecdhPk, peerPks);

      if (result.ok) {
        console.log('✅ BIFROST ECDH completed:', {
          federationId: this.federationId,
          peerCount: peerPks.length,
        });

        return {
          success: true,
          sharedSecret: result.data,
        };
      } else {
        return {
          success: false,
          error: 'BIFROST ECDH failed',
        };
      }
    } catch (error) {
      console.error('❌ BIFROST ECDH error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get BIFROST node status
   */
  getStatus() {
    return {
      federationId: this.federationId,
      isInitialized: this.node !== null,
      isReady: this.isReady,
      relayCount: this.relays.length,
      hasGroupPkg: this.groupPkg !== null,
      hasSharePkg: this.sharePkg !== null,
    };
  }

  /**
   * Close BIFROST node connection
   */
  async close(): Promise<void> {
    if (this.node) {
      await this.node.close();
      this.node = null;
      this.isReady = false;
      console.log('✅ BIFROST node closed:', this.federationId);
    }
  }
}

/**
 * Create BIFROST federation adapter
 */
export function createBifrostFederation(
  federationId: string,
  relays?: string[]
): BifrostFamilyFederation {
  return new BifrostFamilyFederation(federationId, relays);
}

