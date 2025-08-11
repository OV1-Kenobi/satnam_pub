# DATABASE MIGRATION INVENTORY

## Core Identity System Migrations

### 1. **complete-identity-system-migration-fixed.sql** (COMPREHENSIVE)
- **Purpose**: Complete identity system with all tables
- **Tables**: profiles, user_identities, privacy_users, families, nip05_records, nostr_backups, lightning_addresses, reward_redemptions
- **Features**: RLS policies, indexes, triggers, default data
- **Dependencies**: None (creates everything)
- **Status**: Most comprehensive migration

### 2. **minimal-register-identity-migration.sql** (MINIMAL)
- **Purpose**: Minimal tables for register-identity function
- **Tables**: profiles, user_identities, privacy_users, nip05_records
- **Features**: Basic RLS, essential indexes
- **Dependencies**: None
- **Status**: Lightweight alternative

### 3. **register-identity-tables-migration.sql** (TARGETED)
- **Purpose**: Specific tables for register-identity.js function
- **Tables**: profiles, user_identities, privacy_users, nip05_records
- **Features**: RLS policies, performance indexes
- **Dependencies**: None
- **Status**: Function-specific

## Specialized Feature Migrations

### 4. **unified-user-rls-policies.sql** (SECURITY)
- **Purpose**: Comprehensive RLS policies for all user tables
- **Tables**: All user-related tables
- **Features**: User sovereignty, anon registration, authenticated access
- **Dependencies**: Tables must exist first
- **Status**: Security-focused

### 5. **nostr-key-recovery-rotation-migration.sql** (NOSTR)
- **Purpose**: Nostr key recovery and rotation system
- **Tables**: nostr_key_recovery, key_rotation_logs
- **Features**: Family federation recovery, private individual recovery
- **Dependencies**: user_identities, families tables
- **Status**: Nostr-specific

### 6. **nwc-wallet-integration-schema.sql** (LIGHTNING)
- **Purpose**: Nostr Wallet Connect integration
- **Tables**: nwc_connections, nwc_permissions, nwc_transactions
- **Features**: Lightning wallet management
- **Dependencies**: user_identities table
- **Status**: Lightning-specific

### 7. **otp-secrets-schema.sql** (OTP)
- **Purpose**: OTP authentication system
- **Tables**: otp_secrets, otp_sessions
- **Features**: TOTP with privacy-first design
- **Dependencies**: user_identities table
- **Status**: OTP-specific

## Data Fixes and Patches

### 8. **fix-nip05-domain-column.sql** (PATCH)
- **Purpose**: Add missing domain column to nip05_records
- **Tables**: nip05_records
- **Features**: Adds domain VARCHAR(255) with 'satnam.pub' default
- **Dependencies**: nip05_records table must exist
- **Status**: Patch for missing column

### 9. **restore-nip05-functionality.sql** (REPAIR)
- **Purpose**: Restore NIP-05 verification after security fixes
- **Tables**: nip05_records
- **Features**: Recreate views, fix RLS policies
- **Dependencies**: nip05_records table
- **Status**: Repair script

### 10. **nip05-preserving-security-fixes.sql** (SECURITY)
- **Purpose**: Security fixes while preserving NIP-05 functionality
- **Tables**: Multiple tables with security updates
- **Features**: Remove SECURITY DEFINER, fix RLS
- **Dependencies**: Existing schema
- **Status**: Security patch

## Numbered Migration Series

### 11. **migrations/021_create_nip05_records_table.sql**
- **Purpose**: Create NIP-05 records table with proper RLS
- **Tables**: nip05_records
- **Features**: Public read access, user ownership policies
- **Dependencies**: None
- **Status**: Part of numbered series

### 12. **migrations/020_nip05_verification_system.sql**
- **Purpose**: Complete NIP-05 verification system
- **Tables**: nip05_records, mentor_registrations
- **Features**: Verification functions, mentor system
- **Dependencies**: None
- **Status**: Part of numbered series

### 13. **migrations/019_family_foundry_tables.sql**
- **Purpose**: Family creation and management system
- **Tables**: families, family_members, family_invitations
- **Features**: Family federation support
- **Dependencies**: user_identities table
- **Status**: Part of numbered series

## Specialized Systems

### 14. **migrations/012_rebuilding_camelot_otp_system.sql**
- **Purpose**: OTP system for Rebuilding Camelot
- **Tables**: otp_sessions, otp_rate_limits
- **Features**: Gift-wrapped messaging, rate limiting
- **Dependencies**: user_identities table
- **Status**: OTP-specific

### 15. **migrations/009_phoenixd_integration.sql**
- **Purpose**: PhoenixD Lightning node integration
- **Tables**: phoenixd_channels, phoenixd_transactions
- **Features**: Channel management, family banking
- **Dependencies**: families table
- **Status**: PhoenixD-specific

## Debug and Testing Scripts

### 16. **debug-step-3-nuclear-option.sql** (RESET)
- **Purpose**: Complete database reset and recreation
- **Tables**: Drops and recreates everything
- **Features**: Nuclear option for corrupted state
- **Dependencies**: None (destructive)
- **Status**: Emergency use only

### 17. **verify-migration-success.sql** (VERIFICATION)
- **Purpose**: Verify migration completion
- **Tables**: All tables (read-only verification)
- **Features**: Comprehensive status check
- **Dependencies**: Migrations completed
- **Status**: Verification tool
