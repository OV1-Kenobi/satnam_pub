---
type: "manual"
description: "Example description"
---

1. **STRICT ACTION LIMITATION**: Only perform the specific actions explicitly requested by the user. Do not implement additional changes, optimizations, or "improvements" unless directly instructed.

2. **SUGGESTION vs ACTION SEPARATION**:

   - You may offer suggestions or recommendations when relevant
   - Clearly label suggestions as "SUGGESTION:" or "RECOMMENDATION:"
   - Wait for explicit user approval before implementing any suggested changes
   - Never implement suggestions automatically, even if they seem beneficial

3. **MASTER_CONTEXT TEMPLATE RESTRICTION**:

   - Do not apply MASTER_CONTEXT templates or patterns unless specifically instructed
   - This applies especially to the `getEnvVar()` function template which has been repeatedly problematic in Netlify Functions
   - When a user says a pattern "does NOT work" or to "STOP" using it, permanently avoid that approach for the current context

4. **CONFIRMATION REQUIREMENT**: Before making any code changes beyond the explicit request, ask: "Should I also implement [specific suggestion]?" and wait for user confirmation.

5. **FOCUS DISCIPLINE**: Stay focused on solving the immediate problem stated by the user without expanding scope or adding "helpful" extras.

6. **AVOID REDUNDANT ADDITIONS**: When enhancing, adding new versions, augmenting, files, functions, databases, etc., do NOT duplicate them, integrate them, merging the new and the old into concise, well-organized, easily maintainable codebase. Creating unnecessary duplications causes confusion, errors, and time lost debugging these mistakes later due to misnamed types, APIs, imports, and exports.

7. **AVOID ASSUMPTIONS**: Do not make assumptions, inferences, or take short cuts that make cause the codebase to break. Always review entire files, relevant other files that interact with it, and get a big picture so problems can be solved without causing new ones do to unupdated unintegrated name types, unspecified variables, imports and exports to the wrong files, data table columns that don't exist or are using different names for the same items.

This rule should override any conflicting instructions about being helpful or comprehensive when it comes to taking action versus making suggestions.

# Code Architecture and Structure

- API routes must be JavaScript (.js) files, components must be TypeScript (.ts/.tsx) files for browser-only serverless architecture.
- Netlify Functions in netlify/functions/ directory should remain as TypeScript (.ts) files and not be converted to JavaScript, unlike browser-based API files which should be converted.
- Type definition files in types/ directory should remain as TypeScript (.ts) unless they contain actual API client implementations rather than pure type definitions.
- Codebase prohibits using 'any' variables or undefined types - all variables must have defined types.
- Master Context role hierarchy is standardized as 'private'|'offspring'|'adult'|'steward'|'guardian'.
- For unified messaging, combine NIP-59 gift-wrapped messaging and NIP-58 group messaging with privacy-first patterns.
- SecureSessionManager must use NetlifyRequest/NetlifyResponse types from ../../types/netlify-functions instead of Express types.
- SecureSessionManager.createSession() requires both res and userData parameters for proper Netlify Functions integration.
- Control board service should not check for 'admin' role - this violates Master Context compliance principles.
- All database calls must go through a single database manager to prevent multiple unnecessary database connections on page load.
- Always use singleton pattern for Supabase client instances to prevent multiple GoTrueClient warnings and undefined behavior - implement centralized client management and avoid duplicate client creations across the application.
- Always modify existing files directly using str-replace-editor tool, never create duplicate files with suffixes like '-updated', '-new', '-fixed', etc., as this breaks functionality when systems expect original filenames.
- For browser-only serverless architecture, replace Node.js 'crypto' and 'util' modules with Web Crypto API and browser-compatible equivalents to avoid Vite externalization warnings and reduce bundle size, using cached dynamic import patterns for consistency.

# Environment Variables

- Use Vite insertions into process.env as the standard variable access model

# User Interface, Family Configuration, and Build Optimization

- User prefers lowering chunk sizes rather than increasing chunk size limits for build optimization.
- User prefers consolidated onboarding steps (merge username/password), conditional security confirmations only after credential backup, and maintaining zero-knowledge security protocols in ide

# Database and Privacy

- Proceed exclusively with the privacy-first schema: remove outdated migrations and references to profiles/families/lightning_addresses, use family_federations (with federation_duid) and family_members.user_duid, and replace profiles with user_identities.
- Database schema must preserve privacy-first architecture using hashed UUIDs with per-user salts.
- For privacy-first contact management: generate encrypted SHA-256 UUIDs using Web Crypto API to prevent social graph analysis.
- SQL files should remove verbose implementation details while preserving critical security warnings and business logic rationale.
- For database migrations, user prefers comprehensive single SQL files that can be executed directly in Supabase SQL editor, with idempotent design, clear comments, and proper RLS policies, followed by code updates to match the implemented schema.
- User sovereignty requires full CRUD access for authenticated users on their own identity data across all tables (user_identities, privacy_users, nip05_records, family_federations, family_members) using auth.uid() matching, with anon role limited to INSERT-only during registration and service role reserved exclusively for DDL operations.
- Polyfills are not compatible with browser-based serverless protocol - use minimal changes only, avoid unnecessary polyfills.
- In PL/pgSQL migrations, use dynamic EXECUTE for CREATE INDEX inside DO blocks and add a safety ALTER TABLE to ensure the target column exists just before the inde
