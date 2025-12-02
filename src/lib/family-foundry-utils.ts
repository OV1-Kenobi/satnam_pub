/**
 * Family Foundry Utility Functions
 * 
 * Helper functions for federation creation including:
 * - Input validation
 * - Error formatting
 * - Data hashing
 * - Type definitions
 */

import { sha256Hex } from './content-provenance/hashing';

/**
 * Type definitions for Family Foundry
 */
export interface CharterDefinition {
  familyName: string;
  familyMotto?: string;
  foundingDate: string;
  missionStatement?: string;
  coreValues: string[];
}

export interface RoleDefinition {
  id: 'guardian' | 'steward' | 'adult' | 'offspring';
  name: string;
  hierarchyLevel: number;
  rights: string[];
  responsibilities: string[];
  rewards?: string[];
}

export interface RBACDefinition {
  roles: RoleDefinition[];
}

export interface TrustedPeer {
  name: string;
  npub: string;
  role: 'guardian' | 'steward' | 'adult' | 'offspring';
  relationship?: string;
}

export interface FederationCreationError {
  field: string;
  message: string;
  code?: string;
}

/**
 * Validate federation input data
 * 
 * Checks:
 * - Family name is not empty
 * - Founding date is valid
 * - Core values array is not empty
 * - At least one role defined
 * - At least one guardian role exists
 * 
 * @param charter - Charter definition
 * @param rbac - RBAC definition
 * @returns Array of validation errors (empty if valid)
 */
export function validateFederationInput(
  charter: CharterDefinition,
  rbac: RBACDefinition
): FederationCreationError[] {
  const errors: FederationCreationError[] = [];
  
  // Validate charter
  if (!charter.familyName || charter.familyName.trim().length === 0) {
    errors.push({
      field: 'familyName',
      message: 'Family name is required',
      code: 'EMPTY_FAMILY_NAME'
    });
  }
  
  if (charter.familyName && charter.familyName.length > 100) {
    errors.push({
      field: 'familyName',
      message: 'Family name must be 100 characters or less',
      code: 'FAMILY_NAME_TOO_LONG'
    });
  }
  
  if (!charter.foundingDate) {
    errors.push({
      field: 'foundingDate',
      message: 'Founding date is required',
      code: 'EMPTY_FOUNDING_DATE'
    });
  } else {
    const date = new Date(charter.foundingDate);
    if (isNaN(date.getTime())) {
      errors.push({
        field: 'foundingDate',
        message: 'Founding date must be a valid date',
        code: 'INVALID_FOUNDING_DATE'
      });
    }
  }
  
  if (!charter.coreValues || charter.coreValues.length === 0) {
    errors.push({
      field: 'coreValues',
      message: 'At least one core value is required',
      code: 'EMPTY_CORE_VALUES'
    });
  }
  
  // Validate RBAC
  if (!rbac.roles || rbac.roles.length === 0) {
    errors.push({
      field: 'roles',
      message: 'At least one role must be defined',
      code: 'EMPTY_ROLES'
    });
  } else {
    const hasGuardian = rbac.roles.some(r => r.id === 'guardian');
    if (!hasGuardian) {
      errors.push({
        field: 'roles',
        message: 'At least one guardian role must be defined',
        code: 'NO_GUARDIAN_ROLE'
      });
    }
  }
  
  return errors;
}

/**
 * Format federation creation error for display
 * 
 * @param error - Error object
 * @returns Formatted error message
 */
export function formatFederationError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  
  if (typeof error === 'object' && error !== null) {
    const err = error as Record<string, unknown>;
    if (err.message) {
      return String(err.message);
    }
  }
  
  return 'An unknown error occurred during federation creation';
}

/**
 * Hash federation data for deterministic identification
 * 
 * @param federationDuid - Federation DUID
 * @param timestamp - Optional timestamp for versioning
 * @returns Promise<string> - SHA-256 hash
 */
export async function hashFederationData(
  federationDuid: string,
  timestamp?: number
): Promise<string> {
  const data = timestamp 
    ? `${federationDuid}_${timestamp}`
    : federationDuid;
  
  return sha256Hex(data);
}

/**
 * Validate charter definition
 * 
 * @param charter - Charter to validate
 * @returns Array of validation errors
 */
export function validateCharter(charter: CharterDefinition): FederationCreationError[] {
  const errors: FederationCreationError[] = [];
  
  if (!charter.familyName?.trim()) {
    errors.push({
      field: 'familyName',
      message: 'Family name is required'
    });
  }
  
  if (!charter.foundingDate) {
    errors.push({
      field: 'foundingDate',
      message: 'Founding date is required'
    });
  }
  
  if (!charter.coreValues?.length) {
    errors.push({
      field: 'coreValues',
      message: 'At least one core value is required'
    });
  }
  
  return errors;
}

/**
 * Validate RBAC definition
 * 
 * @param rbac - RBAC to validate
 * @returns Array of validation errors
 */
export function validateRBAC(rbac: RBACDefinition): FederationCreationError[] {
  const errors: FederationCreationError[] = [];
  
  if (!rbac.roles?.length) {
    errors.push({
      field: 'roles',
      message: 'At least one role must be defined'
    });
    return errors;
  }
  
  const hasGuardian = rbac.roles.some(r => r.id === 'guardian');
  if (!hasGuardian) {
    errors.push({
      field: 'roles',
      message: 'At least one guardian role must be defined'
    });
  }
  
  return errors;
}

