/**
 * Pubky Sovereignty Service
 * 
 * This service manages Pubky domains and sovereignty scores.
 */

import { v4 as uuidv4 } from 'uuid';
import { db } from '../../lib';
import { config } from '../../config';
import { PubkyClient, PubkyKeypair } from './PubkyClient';
import { 
  PubkyDomain, 
  PubkyKeypair as PubkyKeypairModel, 
  SovereigntyScore,
  PkarrRecord,
  DomainMigration
} from './models/PubkyModels';
import { DomainRecord } from './providers/DomainProvider';

/**
 * Interface for sovereignty score breakdown
 */
interface ScoreBreakdown {
  providerIndependence: number;
  keyOwnership: number;
  censorship: number;
  privacy: number;
  portability: number;
}

export class PubkySovereigntyService {
  private pubkyClient: PubkyClient;
  
  constructor() {
    this.pubkyClient = new PubkyClient();
  }
  
  /**
   * Create a new Pubky domain
   */
  async createPubkyDomain(
    domainRecordId: string,
    keypair?: PubkyKeypair
  ): Promise<PubkyDomain> {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      
      // Get the domain record
      const domainResult = await client.query(
        `SELECT id, domain_name as "domainName", domain_type as "domainType", family_id as "familyId"
        FROM domain_records
        WHERE id = $1`,
        [domainRecordId]
      );
      
      if (domainResult.rows.length === 0) {
        throw new Error('Domain record not found');
      }
      
      const domain = domainResult.rows[0];
      
      // Generate a keypair if not provided
      if (!keypair) {
        keypair = await this.pubkyClient.generateKeypair();
      }
      
      // Create the Pubky domain record
      const pubkyDomainId = uuidv4();
      const result = await client.query(
        `INSERT INTO pubky_domains (
          id, domain_record_id, public_key, private_key_encrypted,
          homeserver_url, pkarr_relay_url, registration_status,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING id, domain_record_id as "domainRecordId", public_key as "publicKey",
        private_key_encrypted as "privateKeyEncrypted", homeserver_url as "homeserverUrl",
        pkarr_relay_url as "pkarrRelayUrl", registration_status as "registrationStatus",
        last_verified_at as "lastVerifiedAt", created_at as "createdAt", updated_at as "updatedAt"`,
        [
          pubkyDomainId,
          domainRecordId,
          keypair.publicKey,
          keypair.privateKey,
          config.pubky.homeserverUrl,
          config.pubky.pkarrRelays[0],
          'pending'
        ]
      );
      
      // Update the domain record
      await client.query(
        `UPDATE domain_records
        SET pubky_enabled = TRUE,
            pubky_homeserver_url = $1,
            pubky_relay_url = $2,
            updated_at = NOW()
        WHERE id = $3`,
        [config.pubky.homeserverUrl, config.pubky.pkarrRelays[0], domainRecordId]
      );
      
      // Calculate initial sovereignty score within the transaction
      // Get the domain record for score calculation
      const scoreDomainResult = await client.query(
        `SELECT id, domain_name as "domainName", domain_type as "domainType",
        pubky_enabled as "pubkyEnabled"
        FROM domain_records
        WHERE id = $1`,
        [domainRecordId]
      );
      
      if (scoreDomainResult.rows.length === 0) {
        throw new Error('Domain record not found for score calculation');
      }
      
      const scoreDomain = scoreDomainResult.rows[0];
      
      // Calculate individual score components
      const providerIndependence = this.calculateProviderIndependenceScore(scoreDomain.domainType);
      const keyOwnership = await this.calculateKeyOwnershipScoreWithClient(
        client,
        scoreDomain.domainType, 
        scoreDomain.pubkyEnabled, 
        domainRecordId
      );
      const censorship = this.calculateCensorshipResistanceScore(scoreDomain.domainType);
      const privacy = this.calculatePrivacyScore(scoreDomain.domainType);
      const portability = this.calculatePortabilityScore(scoreDomain.domainType);
      
      // Calculate total score
      const totalScore = providerIndependence + keyOwnership + censorship + privacy + portability;
      
      // Store the score in the database
      const scoreBreakdown: ScoreBreakdown = {
        providerIndependence,
        keyOwnership,
        censorship,
        privacy,
        portability
      };
      
      await client.query(
        `INSERT INTO sovereignty_scores (
          id, domain_record_id, score, score_breakdown, calculated_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW())
        ON CONFLICT (domain_record_id)
        DO UPDATE SET
          score = $3,
          score_breakdown = $4,
          calculated_at = NOW(),
          updated_at = NOW()`,
        [
          uuidv4(),
          domainRecordId,
          totalScore,
          JSON.stringify(scoreBreakdown)
        ]
      );
      
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating Pubky domain:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Version of calculateKeyOwnershipScore that uses a transaction client
   */
  private async calculateKeyOwnershipScoreWithClient(
    client: any,
    domainType: string, 
    pubkyEnabled: boolean, 
    domainRecordId: string
  ): Promise<number> {
    if (pubkyEnabled) {
      // Check if there's a Pubky domain record
      const pubkyDomainResult = await client.query(
        `SELECT id FROM pubky_domains WHERE domain_record_id = $1`,
        [domainRecordId]
      );
      
      return pubkyDomainResult.rows.length > 0 ? 25 : 10;
    } else {
      return domainType === 'traditional' ? 0 : 15;
    }
  }
  
  /**
   * Get a Pubky domain by domain record ID
   */
  async getPubkyDomainByDomainId(domainRecordId: string): Promise<PubkyDomain | null> {
    try {
      const result = await db.query(
        `SELECT id, domain_record_id as "domainRecordId", public_key as "publicKey",
        private_key_encrypted as "privateKeyEncrypted", homeserver_url as "homeserverUrl",
        pkarr_relay_url as "pkarrRelayUrl", registration_status as "registrationStatus",
        last_verified_at as "lastVerifiedAt", created_at as "createdAt", updated_at as "updatedAt"
        FROM pubky_domains
        WHERE domain_record_id = $1`,
        [domainRecordId]
      );
      
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error('Error getting Pubky domain:', error);
      throw error;
    }
  }
  
  /**
   * Update a Pubky domain's registration status
   */
  async updatePubkyDomainStatus(
    pubkyDomainId: string,
    status: 'pending' | 'registered' | 'failed' | 'revoked'
  ): Promise<PubkyDomain> {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      
      const result = await client.query(
        `UPDATE pubky_domains
        SET registration_status = $1,
            ${status === 'registered' ? 'last_verified_at = NOW(),' : ''}
            updated_at = NOW()
        WHERE id = $2
        RETURNING id, domain_record_id as "domainRecordId", public_key as "publicKey",
        private_key_encrypted as "privateKeyEncrypted", homeserver_url as "homeserverUrl",
        pkarr_relay_url as "pkarrRelayUrl", registration_status as "registrationStatus",
        last_verified_at as "lastVerifiedAt", created_at as "createdAt", updated_at as "updatedAt"`,
        [status, pubkyDomainId]
      );
      
      if (result.rows.length === 0) {
        throw new Error('Pubky domain not found');
      }
      
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error updating Pubky domain status:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Create a PKARR record for a Pubky domain
   */
  async createPkarrRecord(
    pubkyDomainId: string,
    recordType: string,
    recordName: string,
    recordValue: string,
    ttl: number = 3600
  ): Promise<PkarrRecord> {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      
      const result = await client.query(
        `INSERT INTO pkarr_records (
          id, pubky_domain_id, record_type, record_name, record_value, ttl,
          publish_status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING id, pubky_domain_id as "pubkyDomainId", record_type as "recordType",
        record_name as "recordName", record_value as "recordValue", ttl,
        last_published_at as "lastPublishedAt", publish_status as "publishStatus",
        error_message as "errorMessage", created_at as "createdAt", updated_at as "updatedAt"`,
        [uuidv4(), pubkyDomainId, recordType, recordName, recordValue, ttl, 'pending']
      );
      
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating PKARR record:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Update a PKARR record's publish status
   */
  async updatePkarrRecordStatus(
    pkarrRecordId: string,
    status: 'pending' | 'published' | 'failed',
    errorMessage?: string
  ): Promise<PkarrRecord> {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      
      const result = await client.query(
        `UPDATE pkarr_records
        SET publish_status = $1,
            ${status === 'published' ? 'last_published_at = NOW(),' : ''}
            ${errorMessage ? 'error_message = $3,' : ''}
            updated_at = NOW()
        WHERE id = $2
        RETURNING id, pubky_domain_id as "pubkyDomainId", record_type as "recordType",
        record_name as "recordName", record_value as "recordValue", ttl,
        last_published_at as "lastPublishedAt", publish_status as "publishStatus",
        error_message as "errorMessage", created_at as "createdAt", updated_at as "updatedAt"`,
        errorMessage ? [status, pkarrRecordId, errorMessage] : [status, pkarrRecordId]
      );
      
      if (result.rows.length === 0) {
        throw new Error('PKARR record not found');
      }
      
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error updating PKARR record status:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Calculate provider independence score based on domain type
   */
  private calculateProviderIndependenceScore(domainType: string): number {
    switch (domainType) {
      case 'pubky':
        return 25;
      case 'handshake':
        return 20;
      case 'ens':
        return 15;
      case 'traditional':
        return 5;
      default:
        return 0;
    }
  }
  
  /**
   * Calculate key ownership score based on domain type and Pubky status
   */
  private async calculateKeyOwnershipScore(
    domainType: string, 
    pubkyEnabled: boolean, 
    domainRecordId: string
  ): Promise<number> {
    if (pubkyEnabled) {
      // Check if there's a Pubky domain record
      const pubkyDomainResult = await db.query(
        `SELECT id FROM pubky_domains WHERE domain_record_id = $1`,
        [domainRecordId]
      );
      
      return pubkyDomainResult.rows.length > 0 ? 25 : 10;
    } else {
      return domainType === 'traditional' ? 0 : 15;
    }
  }
  
  /**
   * Calculate censorship resistance score based on domain type
   */
  private calculateCensorshipResistanceScore(domainType: string): number {
    switch (domainType) {
      case 'pubky':
        return 20;
      case 'handshake':
        return 15;
      case 'ens':
        return 15;
      case 'traditional':
        return 5;
      default:
        return 0;
    }
  }
  
  /**
   * Calculate privacy score based on domain type
   */
  private calculatePrivacyScore(domainType: string): number {
    switch (domainType) {
      case 'pubky':
        return 15;
      case 'handshake':
        return 10;
      case 'ens':
        return 10;
      case 'traditional':
        return 5;
      default:
        return 0;
    }
  }
  
  /**
   * Calculate portability score based on domain type
   */
  private calculatePortabilityScore(domainType: string): number {
    switch (domainType) {
      case 'pubky':
        return 15;
      case 'handshake':
        return 10;
      case 'ens':
        return 10;
      case 'traditional':
        return 5;
      default:
        return 0;
    }
  }
  
  /**
   * Calculate sovereignty score for a domain
   */
  async calculateSovereigntyScore(domainRecordId: string): Promise<SovereigntyScore> {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      
      // Get the domain record
      const domainResult = await client.query(
        `SELECT id, domain_name as "domainName", domain_type as "domainType",
        pubky_enabled as "pubkyEnabled"
        FROM domain_records
        WHERE id = $1`,
        [domainRecordId]
      );
      
      if (domainResult.rows.length === 0) {
        throw new Error('Domain record not found');
      }
      
      const domain = domainResult.rows[0];
      
      // Calculate individual score components
      const providerIndependence = this.calculateProviderIndependenceScore(domain.domainType);
      const keyOwnership = await this.calculateKeyOwnershipScoreWithClient(
        client,
        domain.domainType, 
        domain.pubkyEnabled, 
        domainRecordId
      );
      const censorship = this.calculateCensorshipResistanceScore(domain.domainType);
      const privacy = this.calculatePrivacyScore(domain.domainType);
      const portability = this.calculatePortabilityScore(domain.domainType);
      
      // Calculate total score
      const totalScore = providerIndependence + keyOwnership + censorship + privacy + portability;
      
      // Store the score in the database
      const scoreBreakdown: ScoreBreakdown = {
        providerIndependence,
        keyOwnership,
        censorship,
        privacy,
        portability
      };
      
      // Store the score in the database within the transaction
      const scoreResult = await client.query(
        `INSERT INTO sovereignty_scores (
          id, domain_record_id, score, score_breakdown, calculated_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW())
        ON CONFLICT (domain_record_id)
        DO UPDATE SET
          score = $3,
          score_breakdown = $4,
          calculated_at = NOW(),
          updated_at = NOW()
        RETURNING id, domain_record_id as "domainRecordId", score,
        score_breakdown as "scoreBreakdown", calculated_at as "calculatedAt",
        created_at as "createdAt", updated_at as "updatedAt"`,
        [
          uuidv4(),
          domainRecordId,
          totalScore,
          JSON.stringify(scoreBreakdown)
        ]
      );
      
      await client.query('COMMIT');
      return scoreResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error calculating sovereignty score:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Get sovereignty score for a domain
   */
  async getSovereigntyScore(domainRecordId: string): Promise<SovereigntyScore | null> {
    try {
      const result = await db.query(
        `SELECT id, domain_record_id as "domainRecordId", score,
        score_breakdown as "scoreBreakdown", calculated_at as "calculatedAt",
        created_at as "createdAt", updated_at as "updatedAt"
        FROM sovereignty_scores
        WHERE domain_record_id = $1`,
        [domainRecordId]
      );
      
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error('Error getting sovereignty score:', error);
      throw error;
    }
  }
  
  /**
   * Create a domain migration
   */
  async createDomainMigration(
    domainRecordId: string,
    sourceProvider: string,
    targetProvider: string
  ): Promise<DomainMigration> {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      
      const result = await client.query(
        `INSERT INTO domain_migrations (
          id, domain_record_id, source_provider, target_provider,
          migration_status, started_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), NOW())
        RETURNING id, domain_record_id as "domainRecordId", source_provider as "sourceProvider",
        target_provider as "targetProvider", migration_status as "migrationStatus",
        started_at as "startedAt", completed_at as "completedAt", error_message as "errorMessage",
        migration_data as "migrationData", created_at as "createdAt", updated_at as "updatedAt"`,
        [uuidv4(), domainRecordId, sourceProvider, targetProvider, 'pending']
      );
      
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating domain migration:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Update a domain migration status
   */
  async updateDomainMigrationStatus(
    migrationId: string,
    status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled',
    errorMessage?: string,
    migrationData?: Record<string, unknown>
  ): Promise<DomainMigration> {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      
      // Build SQL parts and parameters in a more structured way
      const setClauses = ['migration_status = $1'];
      const params = [status, migrationId]; // Always include status and migrationId
      
      // Add conditional clauses with proper parameter indexing
      if (status === 'completed' || status === 'failed') {
        setClauses.push('completed_at = NOW()');
      }
      
      if (errorMessage) {
        params.push(errorMessage);
        setClauses.push(`error_message = $${params.length}`);
      }
      
      if (migrationData) {
        params.push(JSON.stringify(migrationData));
        setClauses.push(`migration_data = $${params.length}`);
      }
      
      // Always add updated_at
      setClauses.push('updated_at = NOW()');
      
      // Construct the final query
      const query = `
        UPDATE domain_migrations
        SET ${setClauses.join(', ')}
        WHERE id = $2
        RETURNING id, domain_record_id as "domainRecordId", source_provider as "sourceProvider",
        target_provider as "targetProvider", migration_status as "migrationStatus",
        started_at as "startedAt", completed_at as "completedAt", error_message as "errorMessage",
        migration_data as "migrationData", created_at as "createdAt", updated_at as "updatedAt"
      `;
      
      const result = await client.query(query, params);
      
      if (result.rows.length === 0) {
        throw new Error('Domain migration not found');
      }
      
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error updating domain migration status:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Create a family keypair
   */
  async createFamilyKeypair(
    familyId: string,
    name: string,
    isDefault: boolean = false
  ): Promise<PubkyKeypairModel> {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      
      // Generate a keypair
      const keypair = await this.pubkyClient.generateKeypair();
      
      // If this is the default keypair, update any existing default keypairs
      if (isDefault) {
        await client.query(
          `UPDATE pubky_keypairs
          SET is_default = FALSE,
              updated_at = NOW()
          WHERE family_id = $1 AND is_default = TRUE`,
          [familyId]
        );
      }
      
      // Create the keypair record
      const result = await client.query(
        `INSERT INTO pubky_keypairs (
          id, family_id, name, public_key, private_key_encrypted,
          key_type, is_default, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING id, family_id as "familyId", name, public_key as "publicKey",
        private_key_encrypted as "privateKeyEncrypted", key_type as "keyType",
        is_default as "isDefault", created_at as "createdAt", updated_at as "updatedAt"`,
        [
          uuidv4(),
          familyId,
          name,
          keypair.publicKey,
          keypair.privateKey,
          'ed25519',
          isDefault
        ]
      );
      
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating family keypair:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Get family keypairs
   */
  async getFamilyKeypairs(familyId: string): Promise<PubkyKeypairModel[]> {
    try {
      const result = await db.query(
        `SELECT id, family_id as "familyId", name, public_key as "publicKey",
        private_key_encrypted as "privateKeyEncrypted", key_type as "keyType",
        is_default as "isDefault", created_at as "createdAt", updated_at as "updatedAt"
        FROM pubky_keypairs
        WHERE family_id = $1
        ORDER BY is_default DESC, name ASC`,
        [familyId]
      );
      
      return result.rows;
    } catch (error) {
      console.error('Error getting family keypairs:', error);
      throw error;
    }
  }
  
  /**
   * Enable Pubky for a family
   */
  async enablePubkyForFamily(familyId: string): Promise<void> {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      
      // Check if the family has any keypairs
      const keypairsResult = await client.query(
        `SELECT id FROM pubky_keypairs WHERE family_id = $1 LIMIT 1`,
        [familyId]
      );
      
      // If no keypairs, create a default one within this transaction
      let defaultPublicKey = null;
      if (keypairsResult.rows.length === 0) {
        // Generate a keypair
        const keypair = await this.pubkyClient.generateKeypair();
        
        // Create the keypair record directly in this transaction
        const keypairResult = await client.query(
          `INSERT INTO pubky_keypairs (
            id, family_id, name, public_key, private_key_encrypted,
            key_type, is_default, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
          RETURNING public_key as "publicKey"`,
          [
            uuidv4(),
            familyId,
            'Default Keypair',
            keypair.publicKey,
            keypair.privateKey,
            'ed25519',
            true
          ]
        );
        
        defaultPublicKey = keypairResult.rows[0].publicKey;
      } else {
        // Get the default keypair
        const defaultKeypairResult = await client.query(
          `SELECT public_key as "publicKey"
          FROM pubky_keypairs
          WHERE family_id = $1 AND is_default = TRUE
          LIMIT 1`,
          [familyId]
        );
        
        defaultPublicKey = defaultKeypairResult.rows.length > 0
          ? defaultKeypairResult.rows[0].publicKey
          : null;
      }
      
      // Update the family record
      await client.query(
        `UPDATE families
        SET pubky_enabled = TRUE,
            ${defaultPublicKey ? 'pubky_public_key = $2,' : ''}
            pubky_url = ${defaultPublicKey ? '$3,' : 'NULL,'}
            updated_at = NOW()
        WHERE id = $1`,
        defaultPublicKey
          ? [familyId, defaultPublicKey, `pubky://${defaultPublicKey}`]
          : [familyId]
      );
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error enabling Pubky for family:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Disable Pubky for a family
   */
  async disablePubkyForFamily(familyId: string): Promise<void> {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      
      // Update the family record
      await client.query(
        `UPDATE families
        SET pubky_enabled = FALSE,
            updated_at = NOW()
        WHERE id = $1`,
        [familyId]
      );
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error disabling Pubky for family:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}