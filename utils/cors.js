// JavaScript wrapper for cors TypeScript module
// This file provides JavaScript-compatible exports for the TypeScript cors module

// Re-export everything from the TypeScript module
export * from './cors.ts';

// Specific named exports for better IDE support
export { 
  ALLOWED_ORIGINS,
  getAllowedOrigins,
  setCorsHeaders,
  setCorsHeadersFromShared,
  setCorsHeadersForCustomAPI,
  getCorsHeadersForAnyAPI
} from './cors.ts';
