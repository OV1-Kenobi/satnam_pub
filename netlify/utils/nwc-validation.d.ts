/**
 * Type declarations for netlify/utils/nwc-validation.js
 * CRITICAL: NWC validation utilities type definitions
 */

export interface NWCData {
  uri: string;
  pubkey: string;
  relay: string;
  secret: string;
  permissions?: string[];
}

export function sanitizeNWCData(data: any): Partial<NWCData>;
export function validateNWCUri(uri: string): boolean;
export function extractNWCComponents(uri: string): NWCData | null;
export function validateNWCPermissions(permissions: string[]): boolean;
