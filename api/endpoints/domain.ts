/**
 * Domain Management API Endpoints
 * 
 * This file defines the REST API endpoints for domain management.
 */

import * as express from 'express';
import { Request, Response, NextFunction } from 'express';

// Define a type for express route handlers
type RouteHandler = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;
import { DomainService } from '../../services/domain/DomainService';
import { authenticateUser, authorizeFamily } from '../middleware/auth';

// Validation functions
/**
 * Validates a domain name according to RFC-1035 standards
 * - Letters, numbers, hyphens
 * - Cannot start or end with hyphen
 * - Max 63 characters per label
 * - Labels separated by dots
 * - TLD must be letters only
 */
function isValidDomainName(domain: string): boolean {
  // Basic RFC-1035 validation
  const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  
  if (!domainRegex.test(domain)) {
    return false;
  }
  
  // Check label length (max 63 chars)
  const labels = domain.split('.');
  for (const label of labels) {
    if (label.length > 63) {
      return false;
    }
  }
  
  return true;
}

/**
 * Validates a UUID string
 * Format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx where x is a hexadecimal digit
 */
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// Define provider type
type ProviderType = 'traditional' | 'pubky' | 'handshake' | 'ens';

// Define request body interfaces
interface RegisterDomainRequest {
  domainName: string;
  familyId: string;
  providerType: ProviderType;
  providerConfig?: Record<string, unknown>;
  options?: Record<string, unknown>;
}

interface AddDNSRecordRequest {
  type: string;
  name: string;
  value: string;
  ttl?: number;
  priority?: number;
}

interface UpdateDNSRecordRequest {
  type?: string;
  name?: string;
  value?: string;
  ttl?: number;
  priority?: number;
}

interface NIP05Request {
  username: string;
  pubkey: string;
}

interface LightningAddressRequest {
  username: string;
  lnurlOrAddress: string;
}

interface DomainTransferRequest {
  targetProviderType: ProviderType;
  targetProviderConfig?: Record<string, unknown>;
}

interface DomainMemberRequest {
  userId: string;
  role?: 'owner' | 'admin' | 'member';
  permissions?: string[];
}

interface DomainOwnershipTransferRequest {
  newOwnerId: string;
}

interface DomainInheritanceRequest {
  heirUserId: string;
  activationConditions: Record<string, unknown>;
}

const router = express.Router();
const domainService = new DomainService();

/**
 * Get all domains for a family
 * 
 * GET /api/domains/family/:familyId
 */
router.get('/family/:familyId', authenticateUser, authorizeFamily, (async (req: Request, res: Response) => {
  try {
    const { familyId } = req.params;
    
    // Validate family ID (UUID format)
    if (!isValidUUID(familyId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid family ID format. Must be a valid UUID.'
      });
    }
    
    const domains = await domainService.getDomainsByFamilyId(familyId);
    res.json({ success: true, domains });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'An error occurred' 
    });
  }
}) as RouteHandler);

/**
 * Get a domain by ID
 * 
 * GET /api/domains/:id
 */
router.get('/:id', authenticateUser, (async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Validate domain ID (UUID format)
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid domain ID format. Must be a valid UUID.'
      });
    }
    
    const domain = await domainService.getDomainById(id);
    
    if (!domain) {
      return res.status(404).json({ success: false, message: 'Domain not found' });
    }
    
    // Check if user has access to this domain's family
    // This would be handled by a middleware in a real implementation
    
    res.json({ success: true, domain });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'An error occurred' 
    });
  }
}) as RouteHandler);

/**
 * Check domain availability
 * 
 * GET /api/domains/check/:domainName
 */
router.get('/check/:domainName', authenticateUser, (async (req: Request, res: Response) => {
  try {
    const { domainName } = req.params;
    const { providerType } = req.query;
    
    // Validate domain name format (RFC-1035)
    if (!isValidDomainName(domainName)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid domain name format. Must follow RFC-1035 standards.'
      });
    }
    
    if (!providerType || typeof providerType !== 'string') {
      return res.status(400).json({ 
        success: false, 
        message: 'Provider type is required' 
      });
    }
    
    if (!['traditional', 'pubky', 'handshake', 'ens'].includes(String(providerType))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid provider type. Must be one of: traditional, pubky, handshake, ens'
      });
    }
    
    const isAvailable = await domainService.checkDomainAvailability(
      domainName, 
      providerType as ProviderType
    );
    
    res.json({ success: true, isAvailable });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'An error occurred' 
    });
  }
}) as RouteHandler);

/**
 * Register a new domain
 * 
 * POST /api/domains/register
 */
router.post('/register', authenticateUser, (async (req: Request, res: Response) => {
  try {
    const { domainName, familyId, providerType, providerConfig, options } = req.body as RegisterDomainRequest;
    
    if (!domainName || !familyId || !providerType) {
      return res.status(400).json({ 
        success: false, 
        message: 'Domain name, family ID, and provider type are required' 
      });
    }
    
    // Validate domain name format (RFC-1035)
    if (!isValidDomainName(domainName)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid domain name format. Must follow RFC-1035 standards.'
      });
    }
    
    // Validate family ID (UUID format)
    if (!isValidUUID(familyId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid family ID format. Must be a valid UUID.'
      });
    }
    
    if (!['traditional', 'pubky', 'handshake', 'ens'].includes(String(providerType))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid provider type. Must be one of: traditional, pubky, handshake, ens'
      });
    }
    
    // Check if user has access to this family
    // This would be handled by a middleware in a real implementation
    
    const result = await domainService.registerDomain(
      domainName, 
      familyId, 
      providerType,
      providerConfig,
      options
    );
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'An error occurred' 
    });
  }
}) as RouteHandler);

/**
 * Verify domain ownership
 * 
 * POST /api/domains/:id/verify
 */
router.post('/:id/verify', authenticateUser, (async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Validate domain ID (UUID format)
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid domain ID format. Must be a valid UUID.'
      });
    }
    
    // Check if user has access to this domain
    // This would be handled by a middleware in a real implementation
    
    const result = await domainService.verifyDomain(id);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'An error occurred' 
    });
  }
}) as RouteHandler);

/**
 * Get verification instructions for a domain
 * 
 * GET /api/domains/:id/verification-instructions
 */
router.get('/:id/verification-instructions', authenticateUser, (async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Check if user has access to this domain
    // This would be handled by a middleware in a real implementation
    
    const instructions = await domainService.getVerificationInstructions(id);
    
    res.json({ success: true, instructions });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'An error occurred' 
    });
  }
}) as RouteHandler);

/**
 * Get DNS records for a domain
 * 
 * GET /api/domains/:id/dns-records
 */
router.get('/:id/dns-records', authenticateUser, (async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Check if user has access to this domain
    // This would be handled by a middleware in a real implementation
    
    const records = await domainService.getDNSRecords(id);
    
    res.json({ success: true, records });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'An error occurred' 
    });
  }
}) as RouteHandler);

/**
 * Add a DNS record to a domain
 * 
 * POST /api/domains/:id/dns-records
 */
router.post('/:id/dns-records', authenticateUser, (async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { type, name, value, ttl, priority } = req.body as AddDNSRecordRequest;
    
    // Validate domain ID (UUID format)
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid domain ID format. Must be a valid UUID.'
      });
    }
    
    if (!type || !name || !value) {
      return res.status(400).json({ 
        success: false, 
        message: 'Record type, name, and value are required' 
      });
    }
    
    // Validate DNS record name format
    // Allow @ for root domain, * for wildcard, or valid hostname format
    const dnsNameRegex = /^(@|\*|([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)$/;
    if (!dnsNameRegex.test(name)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid DNS record name format.'
      });
    }
    
    // Check if user has access to this domain
    // This would be handled by a middleware in a real implementation
    
    const result = await domainService.addDNSRecord(id, {
      type,
      name,
      value,
      ttl,
      priority
    });
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'An error occurred' 
    });
  }
}) as RouteHandler);

/**
 * Update a DNS record
 * 
 * PUT /api/domains/:id/dns-records/:recordId
 */
router.put('/:id/dns-records/:recordId', authenticateUser, (async (req: Request, res: Response) => {
  try {
    const { id, recordId } = req.params;
    const { type, name, value, ttl, priority } = req.body as UpdateDNSRecordRequest;
    
    // Check if user has access to this domain
    // This would be handled by a middleware in a real implementation
    
    // Get the current record to use as fallback values
    const currentRecords = await domainService.getDNSRecords(id);
    const currentRecord = currentRecords.find(record => record.name === name || record.type === type);
    
    const result = await domainService.updateDNSRecord(id, recordId, {
      type: type || (currentRecord?.type || ''),
      name: name || (currentRecord?.name || ''),
      value: value || (currentRecord?.value || ''),
      ttl,
      priority
    });
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'An error occurred' 
    });
  }
}) as RouteHandler);

/**
 * Delete a DNS record
 * 
 * DELETE /api/domains/:id/dns-records/:recordId
 */
router.delete('/:id/dns-records/:recordId', authenticateUser, (async (req: Request, res: Response) => {
  try {
    const { id, recordId } = req.params;
    
    // Check if user has access to this domain
    // This would be handled by a middleware in a real implementation
    
    const result = await domainService.deleteDNSRecord(id, recordId);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'An error occurred' 
    });
  }
}) as RouteHandler);

/**
 * Configure NIP-05 for a domain
 * 
 * POST /api/domains/:id/nip05
 */
router.post('/:id/nip05', authenticateUser, (async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { username, pubkey } = req.body as NIP05Request;
    
    // Validate domain ID (UUID format)
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid domain ID format. Must be a valid UUID.'
      });
    }
    
    if (!username || !pubkey) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username and pubkey are required' 
      });
    }
    
    // Validate username format (alphanumeric and underscore only)
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid username format. Only alphanumeric characters and underscores are allowed.'
      });
    }
    
    // Check if user has access to this domain
    // This would be handled by a middleware in a real implementation
    
    const result = await domainService.configureNIP05(id, username, pubkey);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'An error occurred' 
    });
  }
}) as RouteHandler);

/**
 * Configure Lightning address for a domain
 * 
 * POST /api/domains/:id/lightning
 */
router.post('/:id/lightning', authenticateUser, (async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { username, lnurlOrAddress } = req.body as LightningAddressRequest;
    
    // Validate domain ID (UUID format)
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid domain ID format. Must be a valid UUID.'
      });
    }
    
    if (!username || !lnurlOrAddress) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username and LNURL or Lightning address are required' 
      });
    }
    
    // Validate username format (alphanumeric and underscore only)
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid username format. Only alphanumeric characters and underscores are allowed.'
      });
    }
    
    // Check if user has access to this domain
    // This would be handled by a middleware in a real implementation
    
    const result = await domainService.configureLightningAddress(id, username, lnurlOrAddress);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'An error occurred' 
    });
  }
}) as RouteHandler);

/**
 * Calculate domain sovereignty score
 * 
 * GET /api/domains/:id/sovereignty-score
 */
router.get('/:id/sovereignty-score', authenticateUser, (async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Check if user has access to this domain
    // This would be handled by a middleware in a real implementation
    
    const score = await domainService.calculateSovereigntyScore(id);
    
    res.json({ success: true, score });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'An error occurred' 
    });
  }
}) as RouteHandler);

/**
 * Initiate domain transfer
 * 
 * POST /api/domains/:id/transfer
 */
router.post('/:id/transfer', authenticateUser, (async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { targetProviderType, targetProviderConfig } = req.body as DomainTransferRequest;
    
    if (!targetProviderType) {
      return res.status(400).json({ 
        success: false, 
        message: 'Target provider type is required' 
      });
    }
    
    if (!['traditional', 'pubky', 'handshake', 'ens'].includes(String(targetProviderType))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid target provider type. Must be one of: traditional, pubky, handshake, ens'
      });
    }
    
    // Check if user has access to this domain
    // This would be handled by a middleware in a real implementation
    
    const result = await domainService.initiateDomainTransfer(
      id, 
      targetProviderType,
      targetProviderConfig
    );
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'An error occurred' 
    });
  }
}) as RouteHandler);

/**
 * Complete domain transfer
 * 
 * POST /api/domains/transfers/:transferId/complete
 */
router.post('/transfers/:transferId/complete', authenticateUser, (async (req: Request, res: Response) => {
  try {
    const { transferId } = req.params;
    
    // Check if user has access to this transfer
    // This would be handled by a middleware in a real implementation
    
    const result = await domainService.completeDomainTransfer(transferId);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'An error occurred' 
    });
  }
}) as RouteHandler);

/**
 * Add a member to a domain
 * 
 * POST /api/domains/:id/members
 */
router.post('/:id/members', authenticateUser, (async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId, role, permissions } = req.body as DomainMemberRequest;
    
    // Validate domain ID (UUID format)
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid domain ID format. Must be a valid UUID.'
      });
    }
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID is required' 
      });
    }
    
    // Validate user ID (UUID format)
    if (!isValidUUID(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format. Must be a valid UUID.'
      });
    }
    
    // Check if user has access to this domain
    // This would be handled by a middleware in a real implementation
    
    const member = await domainService.addDomainMember(id, userId, role, permissions);
    
    res.json({ success: true, member });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'An error occurred' 
    });
  }
}) as RouteHandler);

/**
 * Get domain members
 * 
 * GET /api/domains/:id/members
 */
router.get('/:id/members', authenticateUser, (async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Check if user has access to this domain
    // This would be handled by a middleware in a real implementation
    
    const members = await domainService.getDomainMembers(id);
    
    res.json({ success: true, members });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'An error occurred' 
    });
  }
}) as RouteHandler);

/**
 * Update a domain member
 * 
 * PUT /api/domains/:id/members/:userId
 */
router.put('/:id/members/:userId', authenticateUser, (async (req: Request, res: Response) => {
  try {
    const { id, userId } = req.params;
    const { role, permissions } = req.body as DomainMemberRequest;
    
    // Check if user has access to this domain
    // This would be handled by a middleware in a real implementation
    
    const member = await domainService.updateDomainMember(id, userId, { role, permissions });
    
    res.json({ success: true, member });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'An error occurred' 
    });
  }
}) as RouteHandler);

/**
 * Remove a domain member
 * 
 * DELETE /api/domains/:id/members/:userId
 */
router.delete('/:id/members/:userId', authenticateUser, (async (req: Request, res: Response) => {
  try {
    const { id, userId } = req.params;
    
    // Check if user has access to this domain
    // This would be handled by a middleware in a real implementation
    
    await domainService.removeDomainMember(id, userId);
    
    res.json({ success: true, message: 'Member removed successfully' });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'An error occurred' 
    });
  }
}) as RouteHandler);

/**
 * Transfer domain ownership
 * 
 * POST /api/domains/:id/transfer-ownership
 */
router.post('/:id/transfer-ownership', authenticateUser, (async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { newOwnerId } = req.body as DomainOwnershipTransferRequest;
    
    // Validate domain ID (UUID format)
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid domain ID format. Must be a valid UUID.'
      });
    }
    
    if (!newOwnerId) {
      return res.status(400).json({ 
        success: false, 
        message: 'New owner ID is required' 
      });
    }
    
    // Validate new owner ID (UUID format)
    if (!isValidUUID(newOwnerId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid new owner ID format. Must be a valid UUID.'
      });
    }
    
    // Check if user has access to this domain
    // This would be handled by a middleware in a real implementation
    
    const member = await domainService.transferDomainOwnership(id, newOwnerId);
    
    res.json({ success: true, member });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'An error occurred' 
    });
  }
}) as RouteHandler);

/**
 * Set up domain inheritance
 * 
 * POST /api/domains/:id/inheritance
 */
router.post('/:id/inheritance', authenticateUser, (async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { heirUserId, activationConditions } = req.body as DomainInheritanceRequest;
    
    // Validate domain ID (UUID format)
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid domain ID format. Must be a valid UUID.'
      });
    }
    
    if (!heirUserId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Heir user ID is required' 
      });
    }
    
    // Validate heir user ID (UUID format)
    if (!isValidUUID(heirUserId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid heir user ID format. Must be a valid UUID.'
      });
    }
    
    // Check if user has access to this domain
    // This would be handled by a middleware in a real implementation
    
    const result = await domainService.setupDomainInheritance(id, heirUserId, activationConditions);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'An error occurred' 
    });
  }
}) as RouteHandler);

/**
 * Federate family domains
 * 
 * POST /api/domains/family/:familyId/federate
 */
router.post('/family/:familyId/federate', authenticateUser, authorizeFamily, (async (req: Request, res: Response) => {
  try {
    const { familyId } = req.params;
    
    // Validate family ID (UUID format)
    if (!isValidUUID(familyId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid family ID format. Must be a valid UUID.'
      });
    }
    
    const result = await domainService.federateFamilyDomains(familyId);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'An error occurred' 
    });
  }
}) as RouteHandler);

export default router;