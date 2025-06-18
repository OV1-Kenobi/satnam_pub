# Backend File Reference for Bolt.new

## 🔥 Critical Files to Understand

### Core API Routes

```
lib/api/
├── routes.ts                    # Main API router
├── identity-endpoints.ts        # User identity management
├── register-identity.ts         # Registration logic
├── federated-signing.ts         # Multi-signature coordination
├── privacy-auth.ts              # Privacy-enhanced authentication
└── fedimint-api.ts             # Ecash wallet integration
```

### Lightning Network

```
lib/lightning/
├── client.ts                   # Main Lightning client
├── privacy-client.ts           # Privacy-enhanced Lightning
├── address-manager.ts          # Lightning address management
└── lnproxy-client.ts          # Payment privacy proxy
```

### Family & Nostr

```
lib/
├── family-api.ts              # Family management API
├── family-nostr-federation.ts # Nostr family coordination
├── enhanced-family-nostr-federation.ts # Advanced features
└── family-nostr-protection.ts # Privacy protection
```

### Security & Privacy

```
lib/crypto/
├── key-management.ts          # Cryptographic key handling
├── shamir-secret-sharing.ts   # Secret sharing for recovery
└── encryption.ts              # End-to-end encryption

lib/privacy/
├── lnproxy-integration.ts     # Payment privacy
├── enhanced-auth.ts           # Secure authentication
└── family-protection.ts      # Family privacy features
```

### Database & Storage

```
lib/
├── supabase.ts               # Database client
├── secure-storage.ts         # Secure data storage
├── pubky-enhanced-client.ts  # Enhanced Pubky integration
└── index.ts                  # Main exports
```

### Services (Business Logic)

```
services/
├── auth-bridge.ts           # Authentication service
├── control-board.ts         # Dashboard service
├── privacy-auth.ts          # Privacy authentication
└── index.ts                 # Service exports
```

## 📋 Database Schema Files

### Migrations

```
migrations/
├── 006_atomic_lightning_setup.sql    # Lightning Network setup
├── 007_custom_lightning_options.sql  # Custom Lightning features
└── 008_control_board_schema.sql      # Dashboard schema

lib/migrations/
├── 003_add_pubkey_column_secure.sql  # Security enhancements
└── 004_privacy_first_schema.sql      # Privacy features
```

### Scripts

```
scripts/
├── run-control-board-migration.ts    # Setup dashboard
├── run-federated-signing-migration.ts # Setup federation
├── run-privacy-migration.ts          # Setup privacy
└── test-integration.ts               # Integration testing
```

## 🧪 Test Files (Reference for Expected Behavior)

### API Tests

```
api/__tests__/
├── lnurl-endpoints.test.ts    # Lightning URL testing
└── privacy-auth.test.ts       # Privacy authentication tests

lib/__tests__/
├── lightning-client.test.ts   # Lightning client tests
├── family-api.test.ts         # Family API tests
├── privacy-lnproxy.test.ts    # Privacy proxy tests
└── secure-storage.test.ts     # Storage security tests
```

## 📚 Documentation Files

### Setup & Configuration

```
docs/
├── SETUP-GUIDE.md             # Complete setup instructions
├── LIGHTNING_SETUP_SECURITY.md # Lightning security
├── PRIVACY-PROTECTION.md       # Privacy features
└── CONTROL_BOARD.md           # Dashboard documentation
```

### API Documentation

```
docs/
├── LIGHTNING_ADDRESSES.md     # Lightning address API
├── FEDERATION_API_VALIDATION.md # Nostr federation API
├── USERNAME_SYSTEM.md         # User management
└── SHAMIR-SECRET-SHARING.md   # Secret sharing recovery
```

## 🔧 Configuration Files

### Environment & Config

```
├── .env.example              # Environment variables template
├── .env.test                 # Test environment
├── config.ts                 # Main configuration
├── config/index.ts           # Configuration exports
└── vitest.config.ts          # Test configuration
```

### Package Management

```
├── package.json              # Dependencies & scripts
├── package-lock.json         # Locked dependencies
├── tsconfig.json             # TypeScript configuration
└── jest.config.mjs           # Jest testing configuration
```

## 🎯 Key Integration Points for Frontend

### 1. Authentication Flow

**Start with**: `lib/api/privacy-auth.ts`

- Handles user registration/login
- Privacy-enhanced authentication
- Session management

### 2. Family Management

**Start with**: `lib/family-api.ts`

- Family creation/management
- Member coordination
- Governance features

### 3. Lightning Integration

**Start with**: `lib/lightning/client.ts`

- Payment processing
- Address management
- Balance tracking

### 4. Nostr Integration

**Start with**: `lib/family-nostr-federation.ts`

- Event creation/management
- Federated signing
- Privacy-enhanced messaging

### 5. Privacy Features

**Start with**: `lib/privacy/enhanced-auth.ts`

- Privacy settings
- Data protection
- Security features

## 📞 Quick Start for Bolt.new

1. **Copy these environment variables** from `.env.example`
2. **Import the main API** from `lib/api/routes.ts`
3. **Use the services** from `services/index.ts`
4. **Reference the tests** for expected behavior
5. **Check the docs** for detailed API specifications

## 💡 Pro Tips

1. **Type Safety**: All APIs are fully typed in TypeScript
2. **Error Handling**: Comprehensive error handling built-in
3. **Privacy Aware**: All functions respect privacy settings
4. **Family Scoped**: Most operations are family-context aware
5. **Lightning Ready**: Full Lightning Network integration
6. **Nostr Native**: Built-in Nostr protocol support

The backend is production-ready and waiting for your frontend integration! 🚀# Backend File Reference for Bolt.new

## 🔥 Critical Files to Understand

### Core API Routes

```
lib/api/
├── routes.ts                    # Main API router
├── identity-endpoints.ts        # User identity management
├── register-identity.ts         # Registration logic
├── federated-signing.ts         # Multi-signature coordination
├── privacy-auth.ts              # Privacy-enhanced authentication
└── fedimint-api.ts             # Ecash wallet integration
```

### Lightning Network

```
lib/lightning/
├── client.ts                   # Main Lightning client
├── privacy-client.ts           # Privacy-enhanced Lightning
├── address-manager.ts          # Lightning address management
└── lnproxy-client.ts          # Payment privacy proxy
```

### Family & Nostr

```
lib/
├── family-api.ts              # Family management API
├── family-nostr-federation.ts # Nostr family coordination
├── enhanced-family-nostr-federation.ts # Advanced features
└── family-nostr-protection.ts # Privacy protection
```

### Security & Privacy

```
lib/crypto/
├── key-management.ts          # Cryptographic key handling
├── shamir-secret-sharing.ts   # Secret sharing for recovery
└── encryption.ts              # End-to-end encryption

lib/privacy/
├── lnproxy-integration.ts     # Payment privacy
├── enhanced-auth.ts           # Secure authentication
└── family-protection.ts      # Family privacy features
```

### Database & Storage

```
lib/
├── supabase.ts               # Database client
├── secure-storage.ts         # Secure data storage
├── pubky-enhanced-client.ts  # Enhanced Pubky integration
└── index.ts                  # Main exports
```

### Services (Business Logic)

```
services/
├── auth-bridge.ts           # Authentication service
├── control-board.ts         # Dashboard service
├── privacy-auth.ts          # Privacy authentication
└── index.ts                 # Service exports
```

## 📋 Database Schema Files

### Migrations

```
migrations/
├── 006_atomic_lightning_setup.sql    # Lightning Network setup
├── 007_custom_lightning_options.sql  # Custom Lightning features
└── 008_control_board_schema.sql      # Dashboard schema

lib/migrations/
├── 003_add_pubkey_column_secure.sql  # Security enhancements
└── 004_privacy_first_schema.sql      # Privacy features
```

### Scripts

```
scripts/
├── run-control-board-migration.ts    # Setup dashboard
├── run-federated-signing-migration.ts # Setup federation
├── run-privacy-migration.ts          # Setup privacy
└── test-integration.ts               # Integration testing
```

## 🧪 Test Files (Reference for Expected Behavior)

### API Tests

```
api/__tests__/
├── lnurl-endpoints.test.ts    # Lightning URL testing
└── privacy-auth.test.ts       # Privacy authentication tests

lib/__tests__/
├── lightning-client.test.ts   # Lightning client tests
├── family-api.test.ts         # Family API tests
├── privacy-lnproxy.test.ts    # Privacy proxy tests
└── secure-storage.test.ts     # Storage security tests
```

## 📚 Documentation Files

### Setup & Configuration

```
docs/
├── SETUP-GUIDE.md             # Complete setup instructions
├── LIGHTNING_SETUP_SECURITY.md # Lightning security
├── PRIVACY-PROTECTION.md       # Privacy features
└── CONTROL_BOARD.md           # Dashboard documentation
```

### API Documentation

```
docs/
├── LIGHTNING_ADDRESSES.md     # Lightning address API
├── FEDERATION_API_VALIDATION.md # Nostr federation API
├── USERNAME_SYSTEM.md         # User management
└── SHAMIR-SECRET-SHARING.md   # Secret sharing recovery
```

## 🔧 Configuration Files

### Environment & Config

```
├── .env.example              # Environment variables template
├── .env.test                 # Test environment
├── config.ts                 # Main configuration
├── config/index.ts           # Configuration exports
└── vitest.config.ts          # Test configuration
```

### Package Management

```
├── package.json              # Dependencies & scripts
├── package-lock.json         # Locked dependencies
├── tsconfig.json             # TypeScript configuration
└── jest.config.mjs           # Jest testing configuration
```

## 🎯 Key Integration Points for Frontend

### 1. Authentication Flow

**Start with**: `lib/api/privacy-auth.ts`

- Handles user registration/login
- Privacy-enhanced authentication
- Session management

### 2. Family Management

**Start with**: `lib/family-api.ts`

- Family creation/management
- Member coordination
- Governance features

### 3. Lightning Integration

**Start with**: `lib/lightning/client.ts`

- Payment processing
- Address management
- Balance tracking

### 4. Nostr Integration

**Start with**: `lib/family-nostr-federation.ts`

- Event creation/management
- Federated signing
- Privacy-enhanced messaging

### 5. Privacy Features

**Start with**: `lib/privacy/enhanced-auth.ts`

- Privacy settings
- Data protection
- Security features

## 📞 Quick Start for Bolt.new

1. **Copy these environment variables** from `.env.example`
2. **Import the main API** from `lib/api/routes.ts`
3. **Use the services** from `services/index.ts`
4. **Reference the tests** for expected behavior
5. **Check the docs** for detailed API specifications

## 💡 Pro Tips

1. **Type Safety**: All APIs are fully typed in TypeScript
2. **Error Handling**: Comprehensive error handling built-in
3. **Privacy Aware**: All functions respect privacy settings
4. **Family Scoped**: Most operations are family-context aware
5. **Lightning Ready**: Full Lightning Network integration
6. **Nostr Native**: Built-in Nostr protocol support

The backend is production-ready and waiting for your frontend integration! 🚀
