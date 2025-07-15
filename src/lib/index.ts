// Library modules export file - All lib components and services
// API Services
export * from "./api";
export * from "./api/atomic-swap";

// Authentication
export * from "./auth/auth-adapter";
// Remove export * from './auth/privacy-first-auth' to avoid AuthResult duplicate
// export * from "./auth/privacy-first-auth";

// Contexts
export * from "./contexts";

// Hooks
export * from "./hooks";

export * from "./gift-wrapped-messaging/privacy-first-service";
// Remove export * from './giftwrapped-communication-service' to avoid GiftwrappedMessageConfig duplicate
// export * from "./giftwrapped-communication-service";

// Privacy
export * from "./privacy/data-sanitizer";

// Lightning & Payments
// Note: payment-automation.ts excluded from browser build (uses node-cron)
export * from "./cross-mint-cashu-manager";
export * from "./enhanced-family-coordinator";
export * from "./enhanced-phoenixd-manager";
// Remove export * from './family-liquidity-manager' to avoid LiquidityStatus duplicate
// export * from "./family-liquidity-manager";
export * from "./family-phoenixd-manager";
export * from "./internal-lightning-bridge";
export * from "./liquidity-intelligence";
export * from "./phoenixd-client";

// Fedimint
export * from "./fedimint-client";
export * from "./fedimint/family-nostr-federation";

// Utilities
export * from "./utils";
