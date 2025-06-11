/**
 * Domain Provider Factory
 * 
 * This factory creates domain providers based on the provider type.
 */

import { DomainProvider } from './DomainProvider';
import { TraditionalDNSProvider, TraditionalDNSConfig } from './TraditionalDNSProvider';
import { PubkyDNSProvider, PubkyDNSConfig } from './PubkyDNSProvider';

export class DomainProviderFactory {
  /**
   * Create a domain provider based on the provider type
   */
  static createProvider(
    providerType: 'traditional' | 'pubky' | 'handshake' | 'ens',
    config?: any
  ): DomainProvider {
    switch (providerType) {
      case 'traditional':
        return new TraditionalDNSProvider(config as TraditionalDNSConfig);
      case 'pubky':
        return new PubkyDNSProvider(config as PubkyDNSConfig);
      case 'handshake':
        // Placeholder for future implementation
        throw new Error('Handshake provider not implemented yet');
      case 'ens':
        // Placeholder for future implementation
        throw new Error('ENS provider not implemented yet');
      default:
        throw new Error(`Unknown provider type: ${providerType}`);
    }
  }
  
  /**
   * Create a provider based on a domain record
   */
  static async createProviderForDomain(domainRecordId: string): Promise<DomainProvider> {
    // Import db here to avoid circular dependencies
    const { db } = require('../../../lib');
    
    // Get the domain record
    const result = await db.query(
      `SELECT domain_type as "domainType", dns_records, pubky_public_key as "pubkyPublicKey"
      FROM domain_records
      WHERE id = $1`,
      [domainRecordId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Domain not found');
    }
    
    const domainRecord = result.rows[0];
    
    // Create the appropriate provider
    switch (domainRecord.domainType) {
      case 'traditional': {
        const dnsRecords = domainRecord.dns_records || {};
        const provider = dnsRecords.provider || 'namecheap';
        return new TraditionalDNSProvider({ provider });
      }
      case 'pubky': {
        return new PubkyDNSProvider({
          publicKey: domainRecord.pubkyPublicKey
        });
      }
      case 'handshake':
      case 'ens':
        // Placeholder for future implementation
        throw new Error(`${domainRecord.domainType} provider not implemented yet`);
      default:
        throw new Error(`Unknown domain type: ${domainRecord.domainType}`);
    }
  }
}