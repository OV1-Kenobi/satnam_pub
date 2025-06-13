# Supabase Schema Integration with PostgreSQL

This document explains how the Supabase identity forge schema has been integrated with your existing PostgreSQL setup.

## 🗃️ Database Schema Overview

The integrated schema includes four main tables:

### 1. **profiles** - User identity management

- Links to Supabase `auth.users` table
- Stores username, npub (Nostr public key), NIP-05 identifier
- Optional lightning address and family association

### 2. **families** - Family/group management

- Family name, domain, relay URL
- Federation ID for coordinated family operations

### 3. **lightning_addresses** - Payment coordination

- Multiple lightning addresses per user
- Integration with BTCPay Server and Voltage nodes
- Active/inactive status management

### 4. **nostr_backups** - Encrypted backup references

- Points to encrypted backups on Citadel Relay
- Event IDs and backup hashes for verification

## 🚀 Getting Started

### 1. Run Database Migrations

```bash
# Install dependencies (already done)
npm install @supabase/supabase-js

# Run the migration to create all tables
npm run migrate
```

### 2. Environment Setup

Add these to your `.env` file if using Supabase:

```env
# Your existing DATABASE_URL works for direct PostgreSQL
DATABASE_URL=postgres://localhost:5432/identity_forge

# If you want to use Supabase later:
# SUPABASE_URL=your_supabase_project_url
# SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 📚 Usage Examples

### Basic Profile Operations

```typescript
import { IdentityService } from "./services/identity";

// Create profile after Supabase auth
const profile = await IdentityService.createProfile({
  id: "uuid-from-supabase-auth",
  username: "satoshi",
  npub: "npub1...",
  nip05: "satoshi@domain.com",
});

// Get complete user identity
const identity = await IdentityService.getUserIdentity(userId);
```

### Family Management

```typescript
// Create a family
const family = await IdentityService.createFamily(
  {
    family_name: "The Nakamoto Family",
    domain: "nakamoto.family",
    relay_url: "wss://relay.nakamoto.family",
  },
  creatorUserId,
);

// Join existing family
await IdentityService.joinFamily(userId, familyId);
```

### Lightning Integration

```typescript
// Set up lightning address
await IdentityService.setupLightningAddress({
  user_id: userId,
  address: "user@voltage.cloud",
  voltage_node_id: "node_123456",
});
```

## 🗂️ File Structure

```
lib/
├── db.ts                     # Enhanced database interface
├── migrations/
│   └── 001_identity_forge_schema.sql  # Schema migration
│
services/
├── identity.ts               # Identity service using new models
│
types/
├── database.ts               # TypeScript interfaces
│
scripts/
├── migrate.ts                # Migration runner
│
examples/
├── identity-usage.ts         # Usage examples
```

## 🔧 Database Interface Enhancements

Your `lib/db.ts` now includes:

### Migration Support

```typescript
// Run all pending migrations
await db.migrations.runMigrations();

// Get executed migrations
const migrations = await db.migrations.getExecutedMigrations();
```

### Model Operations

```typescript
// Profile operations
const profile = await db.models.profiles.create(profileData);
const profile = await db.models.profiles.getById(userId);
const profile = await db.models.profiles.getByUsername("satoshi");

// Family operations
const family = await db.models.families.create(familyData);
const members = await db.models.families.getMembers(familyId);

// Lightning addresses
const address = await db.models.lightningAddresses.create(addressData);
const addresses = await db.models.lightningAddresses.getByUserId(userId);

// Nostr backups
const backup = await db.models.nostrBackups.create(backupData);
const backups = await db.models.nostrBackups.getByUserId(userId);
```

### Transaction Support

```typescript
// Execute multiple operations in a transaction
const result = await db.transaction(async (client) => {
  const family = await client.query("INSERT INTO families...");
  await client.query("UPDATE profiles SET family_id...");
  return family.rows[0];
});
```

## 🔒 Row Level Security (RLS)

The schema includes RLS policies:

- **profiles**: Users can only access their own profile
- **families**: Family members can view their family
- **lightning_addresses**: Users can manage their own addresses
- **nostr_backups**: Users can manage their own backups

## 🔄 Migration to Supabase (Optional)

If you want to move to Supabase later:

1. Create a Supabase project
2. Copy the migration SQL to Supabase SQL editor
3. Update environment variables
4. The same code will work with both setups!

## ⚡ Performance Considerations

The schema includes optimized indexes:

- Username and npub lookups
- Family member queries
- Lightning address searches
- User-specific data filtering

## 🧪 Testing

Run the example usage:

```bash
npm run tsx examples/identity-usage.ts
```

## 🚨 Important Notes

1. **User IDs**: Profile IDs should match Supabase auth.users IDs
2. **Transactions**: Use `db.transaction()` for multi-table operations
3. **Error Handling**: All database operations include proper error handling
4. **Connection Pooling**: Existing connection pool configuration is preserved

## 🤝 Integration with Existing Code

Your existing services in `services/` directory can now use:

```typescript
import db from "../lib/db";
import { IdentityService } from "./identity";

// Use the enhanced database interface
const result = await db.query("SELECT * FROM profiles WHERE username = $1", [
  "satoshi",
]);

// Or use the high-level service
const identity = await IdentityService.getUserIdentity(userId);
```

This integration maintains backward compatibility while adding powerful new capabilities for your identity forge application!
