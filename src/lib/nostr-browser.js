/**
 * Browser-compatible Nostr utilities
 * MASTER CONTEXT COMPLIANCE: Direct JavaScript implementation for browser-only serverless architecture
 *
 * This file provides the actual implementations instead of re-exporting from TypeScript
 * to avoid circular dependencies and MIME type issues in development.
 */

// Import from nostr-tools directly
import {
    nip04,
    nip19,
    nip59,
    finalizeEvent as nostrFinalizeEvent,
    generateSecretKey as nostrGenerateSecretKey,
    getPublicKey as nostrGetPublicKey,
    verifyEvent as nostrVerifyEvent,
    SimplePool
} from 'nostr-tools';

// Re-export all the functions with consistent naming
export { nip04, nip19, nip59, SimplePool };

// Export with consistent function names
export const finalizeEvent = nostrFinalizeEvent;
export const generateSecretKey = nostrGenerateSecretKey;
export const getPublicKey = nostrGetPublicKey;
export const verifyEvent = nostrVerifyEvent;

// Export everything for wildcard imports
export * from 'nostr-tools';

