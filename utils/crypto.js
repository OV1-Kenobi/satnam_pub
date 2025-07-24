// JavaScript wrapper for crypto TypeScript module
// This file provides JavaScript-compatible exports for the TypeScript crypto module

// Re-export everything from the TypeScript module
export * from './crypto.ts';

// Specific named exports for better IDE support
export { generateSecureToken } from './crypto.ts';
