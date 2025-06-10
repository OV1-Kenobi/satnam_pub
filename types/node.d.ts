// Type definitions for Node.js globals
// This file ensures TypeScript recognizes Node.js globals like 'process'

declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: "development" | "production" | "test";
    API_BASE_URL?: string;
    JWT_SECRET?: string;
    JWT_EXPIRES_IN?: string;
    DATABASE_URL?: string;
    DATABASE_SSL?: string;
    REDIS_URL?: string;
    NOSTR_RELAY_URL?: string;
    NOSTR_PRIVATE_KEY?: string;
    LIGHTNING_NODE_URL?: string;
    LIGHTNING_MACAROON?: string;
    LIGHTNING_CERT_PATH?: string;
    NIP05_DOMAIN?: string;
    PORT?: string;
    [key: string]: string | undefined;
  }
}
