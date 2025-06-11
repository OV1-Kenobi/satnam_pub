/**
 * Domain Provider Interface
 * 
 * This interface defines the contract for all domain providers.
 * Each provider must implement these methods to handle domain operations.
 */

export interface DomainRecord {
  id: string;
  domainName: string;
  domainType: 'traditional' | 'pubky' | 'handshake' | 'ens';
  familyId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DNSRecord {
  type: string;  // A, AAAA, CNAME, MX, TXT, etc.
  name: string;  // Subdomain or @ for root
  value: string; // IP address, domain name, text value, etc.
  ttl?: number;  // Time to live in seconds
  priority?: number; // For MX records
}

export interface VerificationRecord {
  id: string;
  domainRecordId: string;
  verificationType: 'txt_record' | 'pubky_signature' | 'dns_challenge';
  verificationData: string;
  verifiedAt?: Date;
  expiresAt?: Date;
}

export interface DomainOperationResult {
  success: boolean;
  message: string;
  data?: any;
}

export interface DomainProvider {
  /**
   * Get the provider name
   */
  getProviderName(): string;

  /**
   * Get the provider type
   */
  getProviderType(): 'traditional' | 'pubky' | 'handshake' | 'ens';

  /**
   * Check if a domain is available for registration
   */
  checkDomainAvailability(domainName: string): Promise<boolean>;

  /**
   * Register a new domain
   */
  registerDomain(domainName: string, familyId: string, options?: any): Promise<DomainOperationResult>;

  /**
   * Verify domain ownership
   */
  verifyDomain(domainRecordId: string): Promise<DomainOperationResult>;

  /**
   * Get verification instructions for a domain
   */
  getVerificationInstructions(domainRecordId: string): Promise<string>;

  /**
   * Add a DNS record to a domain
   */
  addDNSRecord(domainRecordId: string, record: DNSRecord): Promise<DomainOperationResult>;

  /**
   * Update a DNS record
   */
  updateDNSRecord(domainRecordId: string, recordId: string, record: DNSRecord): Promise<DomainOperationResult>;

  /**
   * Delete a DNS record
   */
  deleteDNSRecord(domainRecordId: string, recordId: string): Promise<DomainOperationResult>;

  /**
   * Get all DNS records for a domain
   */
  getDNSRecords(domainRecordId: string): Promise<DNSRecord[]>;

  /**
   * Configure NIP-05 for a domain
   */
  configureNIP05(domainRecordId: string, username: string, pubkey: string): Promise<DomainOperationResult>;

  /**
   * Configure Lightning address for a domain
   */
  configureLightningAddress(domainRecordId: string, username: string, lnurlOrAddress: string): Promise<DomainOperationResult>;

  /**
   * Transfer a domain to another provider
   */
  transferDomain(domainRecordId: string, targetProvider: string): Promise<DomainOperationResult>;

  /**
   * Calculate domain sovereignty score (0-100)
   * Higher score means more sovereignty/control over the domain
   */
  calculateSovereigntyScore(domainRecordId: string): Promise<number>;
}