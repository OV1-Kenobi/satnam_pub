# Sovereign Bitcoin Identity Forge Information

## Summary

Satnam.pub is a sovereign Bitcoin identity platform that empowers families and individuals to create and manage decentralized digital identities without relying on custodial services. Built on Bitcoin and Nostr protocols, it provides tools for identity forging, education, family coordination, and account recovery while maintaining user control over private keys and identity data.

## Structure

- **src/**: React frontend components, hooks, services, and utilities
- **api/**: API endpoints for authentication, identity, family, and payments
- **lib/**: Core business logic, crypto utilities, and database interactions
- **types/**: TypeScript type definitions for the entire application
- **utils/**: Shared utility functions for crypto, validation, and API clients
- **scripts/**: Deployment, migration, and testing scripts
- **tests/**: Integration and unit tests
- **database/**: Database schema and migration files
- **public/**: Static assets and public API endpoints

## Language & Runtime

**Language**: TypeScript/JavaScript
**Version**: ES2022 target with Node.js 20.x
**Build System**: Vite
**Package Manager**: npm

## Dependencies

**Main Dependencies**:

- React 18.2.0 with React Router 6.8.0
- @noble/secp256k1 1.7.1 for cryptographic operations
- @supabase/supabase-js 2.50.2 for database interactions
- nostr-tools 1.17.0 for Nostr protocol implementation
- Tailwind CSS 4.1.11 for styling

**Development Dependencies**:

- TypeScript 4.9.3
- Vite 4.1.0 for frontend building
- Vitest 3.2.4 for testing
- tsx 4.20.3 for TypeScript execution

## Build & Installation

```bash
# Install dependencies
npm install

# Development mode
npm run dev  # Frontend
npm run server:dev  # Backend

# Production build
npm run build
npm run server
```

## Testing

**Framework**: Vitest
**Test Location**: `**/__tests__/**/*.test.{ts,tsx}` and `**/*.test.{ts,tsx}`
**Configuration**: vitest.config.ts, vitest.api.config.ts
**Run Command**:

```bash
npm test  # Run all tests
npm run test:coverage  # Run with coverage
npm run test:ui  # Run with UI
```

## Frontend Architecture

**Framework**: React with TypeScript
**Routing**: React Router
**State Management**: React hooks and context
**UI Components**: Custom components with Tailwind CSS
**Entry Point**: src/main.tsx → src/App.tsx

## Backend Architecture

**API Structure**: API routes in /api directory
**Authentication**: Nostr-based authentication with JWT tokens
**Database**: PostgreSQL via Supabase
**Core Services**: Identity management, family coordination, Lightning Network integration
**Privacy Features**: Encrypted storage, zero-knowledge authentication

## Bitcoin & Nostr Integration

**Cryptography**: secp256k1 for key operations
**Nostr Protocol**: NIP-05 verification, DM-based OTP
**Lightning Network**: Support for multiple LN implementations
**Family Features**: Multi-user coordination, shared wallets

## Security Model

- Zero-knowledge authentication using cryptographic signatures
- No server-side password storage
- Private key management under user control
- Encrypted backups for recovery
- Rate limiting and input validation
