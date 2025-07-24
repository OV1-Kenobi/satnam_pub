// JavaScript wrapper for nostr-browser TypeScript module
// This file provides JavaScript-compatible exports for the TypeScript nostr-browser module

// Re-export everything from the TypeScript module
// The build system will handle the TypeScript compilation
export * from './nostr-browser.ts';

// Specific named exports for better IDE support
export { nip19 } from './nostr-browser.ts';
export { nip04 } from './nostr-browser.ts';
export { nip59 } from './nostr-browser.ts';
export { finalizeEvent } from './nostr-browser.ts';
export { getPublicKey } from './nostr-browser.ts';
export { SimplePool } from './nostr-browser.ts';
