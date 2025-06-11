/**
 * Domain Management Service Tests
 */

import { DomainService } from '../services/domain/DomainService';
import { TraditionalDNSProvider } from '../services/domain/providers/TraditionalDNSProvider';
import { PubkyDNSProvider } from '../services/domain/providers/PubkyDNSProvider';
import { DomainProviderFactory } from '../services/domain/providers/DomainProviderFactory';
import { v4 as uuidv4 } from 'uuid';

// Mock the database
jest.mock('../lib/db', () => ({
  query: jest.fn(),
  getClient: jest.fn(() => ({
    query: jest.fn(),
    release: jest.fn(),
    connect: jest.fn(),
    end: jest.fn()
  }))
}));

describe('Domain Management Service', () => {
  let domainService: DomainService;
  
  beforeEach(() => {
    domainService = new DomainService();
    jest.clearAllMocks();
  });
  
  describe('Domain Provider Factory', () => {
    it('should create a traditional DNS provider', () => {
      const provider = DomainProviderFactory.createProvider('traditional', { provider: 'namecheap' });
      expect(provider).toBeInstanceOf(TraditionalDNSProvider);
      expect(provider.getProviderName()).toBe('namecheap');
      expect(provider.getProviderType()).toBe('traditional');
    });
    
    it('should create a Pubky DNS provider', () => {
      const provider = DomainProviderFactory.createProvider('pubky');
      expect(provider).toBeInstanceOf(PubkyDNSProvider);
      expect(provider.getProviderName()).toBe('pubky');
      expect(provider.getProviderType()).toBe('pubky');
    });
    
    it('should throw an error for unsupported providers', () => {
      expect(() => {
        DomainProviderFactory.createProvider('handshake' as any);
      }).toThrow('Handshake provider not implemented yet');
    });
  });
  
  describe('Domain Registration', () => {
    it('should register a traditional domain', async () => {
      const db = require('../lib/db');
      db.query.mockResolvedValueOnce({ rows: [] }); // checkDomainAvailability
      db.query.mockResolvedValueOnce({ rows: [{ id: 'domain-id' }] }); // registerDomain
      db.query.mockResolvedValueOnce({ rows: [] }); // createVerificationRecord
      
      const result = await domainService.registerDomain(
        'example.com',
        'family-id',
        'traditional',
        { provider: 'namecheap' }
      );
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Domain registered successfully');
      expect(db.query).toHaveBeenCalledTimes(3);
    });
    
    it('should register a Pubky domain', async () => {
      const db = require('../lib/db');
      db.query.mockResolvedValueOnce({ rows: [] }); // checkDomainAvailability
      db.query.mockResolvedValueOnce({ rows: [{ id: 'domain-id' }] }); // registerDomain
      db.query.mockResolvedValueOnce({ rows: [] }); // createVerificationRecord
      
      const result = await domainService.registerDomain(
        'example.pubky',
        'family-id',
        'pubky'
      );
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Pubky domain registered successfully');
      expect(db.query).toHaveBeenCalledTimes(3);
    });
    
    it('should fail if domain is not available', async () => {
      const db = require('../lib/db');
      db.query.mockResolvedValueOnce({ rows: [{ id: 'domain-id' }] }); // checkDomainAvailability
      
      const result = await domainService.registerDomain(
        'example.com',
        'family-id',
        'traditional',
        { provider: 'namecheap' }
      );
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('not available');
      expect(db.query).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('Domain Verification', () => {
    it('should verify a domain', async () => {
      const db = require('../lib/db');
      db.query.mockResolvedValueOnce({ rows: [{ id: 'verification-id', verificationType: 'txt_record' }] }); // getVerificationRecord
      db.query.mockResolvedValueOnce({ rows: [] }); // updateVerificationRecord
      
      const result = await domainService.verifyDomain('domain-id');
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('verified successfully');
      expect(db.query).toHaveBeenCalledTimes(2);
    });
    
    it('should fail if no verification record exists', async () => {
      const db = require('../lib/db');
      db.query.mockResolvedValueOnce({ rows: [] }); // getVerificationRecord
      
      const result = await domainService.verifyDomain('domain-id');
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('No pending verification found');
      expect(db.query).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('DNS Record Management', () => {
    it('should add a DNS record', async () => {
      const db = require('../lib/db');
      db.query.mockResolvedValueOnce({ rows: [{ dns_records: { records: [] } }] }); // getDomainRecord
      db.query.mockResolvedValueOnce({ rows: [] }); // updateDomainRecord
      
      const result = await domainService.addDNSRecord('domain-id', {
        type: 'A',
        name: '@',
        value: '192.168.1.1'
      });
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('DNS record added successfully');
      expect(db.query).toHaveBeenCalledTimes(2);
    });
    
    it('should update a DNS record', async () => {
      const db = require('../lib/db');
      const recordId = uuidv4();
      db.query.mockResolvedValueOnce({ 
        rows: [{ 
          dns_records: { 
            records: [{ id: recordId, type: 'A', name: '@', value: '192.168.1.1' }] 
          } 
        }] 
      }); // getDomainRecord
      db.query.mockResolvedValueOnce({ rows: [] }); // updateDomainRecord
      
      const result = await domainService.updateDNSRecord('domain-id', recordId, {
        type: 'A',
        name: '@',
        value: '192.168.1.2'
      });
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('DNS record updated successfully');
      expect(db.query).toHaveBeenCalledTimes(2);
    });
    
    it('should delete a DNS record', async () => {
      const db = require('../lib/db');
      const recordId = uuidv4();
      db.query.mockResolvedValueOnce({ 
        rows: [{ 
          dns_records: { 
            records: [{ id: recordId, type: 'A', name: '@', value: '192.168.1.1' }] 
          } 
        }] 
      }); // getDomainRecord
      db.query.mockResolvedValueOnce({ rows: [] }); // updateDomainRecord
      
      const result = await domainService.deleteDNSRecord('domain-id', recordId);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('DNS record deleted successfully');
      expect(db.query).toHaveBeenCalledTimes(2);
    });
  });
  
  describe('Domain Transfer', () => {
    it('should initiate a domain transfer', async () => {
      const db = require('../lib/db');
      db.query.mockResolvedValueOnce({ rows: [{ domainType: 'traditional', domainName: 'example.com' }] }); // getDomainRecord
      db.query.mockResolvedValueOnce({ rows: [] }); // checkDomainAvailability
      db.query.mockResolvedValueOnce({ rows: [] }); // createTransferRequest
      
      const result = await domainService.initiateDomainTransfer('domain-id', 'pubky');
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Domain transfer initiated');
      expect(db.query).toHaveBeenCalledTimes(3);
    });
    
    it('should complete a domain transfer', async () => {
      const db = require('../lib/db');
      db.query.mockResolvedValueOnce({ 
        rows: [{ 
          domainRecordId: 'domain-id', 
          sourceProvider: 'traditional', 
          targetProvider: 'pubky', 
          status: 'pending' 
        }] 
      }); // getTransferRequest
      db.query.mockResolvedValueOnce({ rows: [{ id: 'domain-id', domainName: 'example.com' }] }); // getDomainRecord
      db.query.mockResolvedValueOnce({ rows: [] }); // updateDomainRecord
      db.query.mockResolvedValueOnce({ rows: [] }); // updateTransferRequest
      
      const result = await domainService.completeDomainTransfer('transfer-id');
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Domain transfer completed');
      expect(db.query).toHaveBeenCalledTimes(4);
    });
  });
  
  describe('Domain Members', () => {
    it('should add a domain member', async () => {
      const db = require('../lib/db');
      db.query.mockResolvedValueOnce({ rows: [] }); // checkExistingMember
      db.query.mockResolvedValueOnce({ rows: [{ id: 'member-id' }] }); // addMember
      
      const result = await domainService.addDomainMember('domain-id', 'user-id', 'admin', ['manage', 'edit']);
      
      expect(result).toEqual({ id: 'member-id' });
      expect(db.query).toHaveBeenCalledTimes(2);
    });
    
    it('should fail if user is already a member', async () => {
      const db = require('../lib/db');
      db.query.mockResolvedValueOnce({ rows: [{ id: 'member-id' }] }); // checkExistingMember
      
      await expect(domainService.addDomainMember('domain-id', 'user-id')).rejects.toThrow('already a member');
      expect(db.query).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('Domain Inheritance', () => {
    it('should set up domain inheritance', async () => {
      const db = require('../lib/db');
      db.query.mockResolvedValueOnce({ rows: [{ id: 'domain-id' }] }); // checkDomainExists
      db.query.mockResolvedValueOnce({ rows: [{ id: 'user-id' }] }); // checkUserExists
      db.query.mockResolvedValueOnce({ rows: [] }); // checkExistingInheritance
      db.query.mockResolvedValueOnce({ rows: [] }); // createInheritance
      
      const result = await domainService.setupDomainInheritance('domain-id', 'user-id', { timeDelay: 90 });
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Domain inheritance plan set up successfully');
      expect(db.query).toHaveBeenCalledTimes(4);
    });
  });
  
  describe('Family Domain Federation', () => {
    it('should federate family domains', async () => {
      const db = require('../lib/db');
      db.query.mockResolvedValueOnce({ 
        rows: [
          { id: 'domain-1', domainName: 'example.com', domainType: 'traditional' },
          { id: 'domain-2', domainName: 'example.pubky', domainType: 'pubky' }
        ] 
      }); // getFamilyDomains
      db.query.mockResolvedValueOnce({ rows: [] }); // createFederationRecord for domain-1
      db.query.mockResolvedValueOnce({ rows: [] }); // createFederationRecord for domain-2
      
      const result = await domainService.federateFamilyDomains('family-id');
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully federated 2 domains');
      expect(db.query).toHaveBeenCalledTimes(3);
    });
    
    it('should fail if no domains exist for the family', async () => {
      const db = require('../lib/db');
      db.query.mockResolvedValueOnce({ rows: [] }); // getFamilyDomains
      
      const result = await domainService.federateFamilyDomains('family-id');
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('No domains found');
      expect(db.query).toHaveBeenCalledTimes(1);
    });
  });
});