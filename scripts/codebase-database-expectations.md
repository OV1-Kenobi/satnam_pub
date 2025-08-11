# CODEBASE DATABASE EXPECTATIONS ANALYSIS

## Tables Expected by Netlify Functions

### 1. **netlify/functions/nostr.ts**
**Expected Tables:**
- `nip05_records` (name, pubkey, created_at, updated_at)
**Operations:** SELECT with anonymous access
**RLS Requirements:** Public read access for active records

### 2. **netlify/functions/educational-api.ts**
**Expected Tables:**
- `courses` (id, title, description, category, provider, duration, difficulty, prerequisites, badges, cost, enrollmentType, maxStudents, currentEnrollment, startDate, instructor, syllabus, learningOutcomes, certificateType, externalUrl, registrationDeadline, is_active)
- `course_registrations` (id, course_id, user_pubkey, family_id, enrollment_type, provider, cost, metadata, status, registered_at)
- `course_progress` (id, course_id, user_pubkey, module_id, progress, time_spent, quiz_score, completed_at, created_at, updated_at)
- `cognitive_capital_metrics` (userPubkey, familyId, totalCourses, completedCourses, totalTimeSpent, averageQuizScore, badgesEarned, certificatesEarned, cognitiveCapitalScore, learningStreak, weeklyProgress, monthlyProgress, lastUpdated)
- `learning_pathways` (id, title, description, courses, difficulty_level, estimated_duration, prerequisites, target_audience, is_active)
**Operations:** SELECT, INSERT, UPDATE with authenticated access
**RLS Requirements:** User-owned data access

### 3. **netlify/functions/secure-storage.ts**
**Expected Tables:**
- `privacy_users` (hashed_uuid, encrypted_nsec, nsec_salt, nsec_iv, nsec_tag, privacy_level, zero_knowledge_enabled)
- `vault_credentials` (user_hash, credential_type, encrypted_data, salt, iv, tag)
**Operations:** SELECT, UPDATE with authenticated access
**RLS Requirements:** User sovereignty (auth.uid() matching)

### 4. **netlify/functions/nostr-otp-service.js**
**Expected Tables:**
- `otp_secrets` (user_hash, encrypted_secret, secret_salt, secret_iv, secret_tag, algorithm, digits, period)
- `otp_sessions` (session_id, user_hash, encrypted_otp, otp_salt, otp_iv, otp_tag, attempts, max_attempts, expires_at, verified)
**Operations:** SELECT, INSERT, UPDATE with authenticated access
**RLS Requirements:** User-owned OTP data access

## Tables Expected by Services

### 5. **services/nip05.ts**
**Expected Tables:**
- `nip05_records` (id, name, pubkey, user_id, created_at, updated_at)
**Operations:** INSERT, SELECT, UPDATE, DELETE via direct SQL
**RLS Requirements:** User ownership + public read access

### 6. **services/user-service.ts**
**Expected Tables:**
- `profiles` (id, username, npub_hash, nip05_hash, federation_role, auth_method, is_whitelisted, voting_power, guardian_approved, family_id, created_at, updated_at)
**Operations:** SELECT, INSERT, UPDATE via direct SQL
**RLS Requirements:** User sovereignty

## Core Identity System Tables (Required by Multiple Functions)

### 7. **user_identities** (Referenced by multiple services)
**Expected Columns:**
- id (UUID, primary key)
- npub (TEXT, Nostr public key)
- username (TEXT)
- nip05 (TEXT, optional)
- family_id (UUID, optional)
- created_at, updated_at (TIMESTAMP)
**RLS Requirements:** User sovereignty (auth.uid() = id)

### 8. **profiles** (Referenced by multiple services)
**Expected Columns:**
- id (UUID, references auth.users)
- username (TEXT)
- npub (TEXT)
- nip05 (TEXT, optional)
- lightning_address (TEXT, optional)
- family_id (UUID, optional)
- federation_role (TEXT: 'private'|'offspring'|'adult'|'steward'|'guardian')
- auth_method (TEXT: 'otp'|'nwc')
- is_whitelisted (BOOLEAN)
- voting_power (INTEGER)
- guardian_approved (BOOLEAN)
- is_active (BOOLEAN)
- created_at, updated_at (TIMESTAMP)
**RLS Requirements:** User sovereignty

### 9. **privacy_users** (Privacy-first user data)
**Expected Columns:**
- hashed_uuid (TEXT, primary key)
- encrypted_nsec (TEXT)
- nsec_salt, nsec_iv, nsec_tag (TEXT)
- privacy_level (TEXT: 'standard'|'enhanced'|'maximum')
- zero_knowledge_enabled (BOOLEAN)
- created_at, updated_at (TIMESTAMP)
**RLS Requirements:** User sovereignty via hashed UUID matching

### 10. **families** (Family federation system)
**Expected Columns:**
- id (UUID, primary key)
- family_name (TEXT)
- domain (TEXT, optional)
- relay_url (TEXT, optional)
- federation_id (TEXT, optional)
- created_at (TIMESTAMP)
**RLS Requirements:** Family member access

## Authentication and Security Tables

### 11. **vault_credentials** (Secure credential storage)
**Expected Columns:**
- user_hash (TEXT, references privacy_users)
- credential_type (TEXT)
- encrypted_data (TEXT)
- salt, iv, tag (TEXT)
- created_at, updated_at (TIMESTAMP)
**RLS Requirements:** User sovereignty

### 12. **otp_secrets** (OTP authentication)
**Expected Columns:**
- user_hash (TEXT, references privacy_users)
- encrypted_secret (TEXT)
- secret_salt, secret_iv, secret_tag (TEXT)
- algorithm (TEXT: 'SHA1'|'SHA256')
- digits (INTEGER: 6|8)
- period (INTEGER, default 120)
- backup_codes (TEXT[])
- created_at, updated_at (TIMESTAMP)
**RLS Requirements:** User sovereignty

### 13. **otp_sessions** (OTP session management)
**Expected Columns:**
- session_id (TEXT, primary key)
- user_hash (TEXT, references privacy_users)
- encrypted_otp (TEXT)
- otp_salt, otp_iv, otp_tag (TEXT)
- attempts (INTEGER)
- max_attempts (INTEGER, default 3)
- expires_at (TIMESTAMP)
- verified (BOOLEAN)
- created_at (TIMESTAMP)
**RLS Requirements:** Session-based access

## Educational System Tables

### 14. **courses** (Course catalog)
**Expected Columns:**
- id (TEXT, primary key)
- title, description (TEXT)
- category (TEXT: 'basic'|'advanced'|'specialized')
- provider (TEXT: 'satnam'|'citadel-academy')
- duration (INTEGER, minutes)
- difficulty (TEXT: 'beginner'|'intermediate'|'advanced')
- prerequisites (TEXT[])
- badges (TEXT[])
- cost (INTEGER, sats)
- enrollmentType (TEXT: 'immediate'|'approval-required'|'external')
- maxStudents, currentEnrollment (INTEGER)
- startDate (TIMESTAMP)
- instructor (TEXT)
- syllabus, learningOutcomes (TEXT[])
- certificateType (TEXT: 'completion'|'certification'|'badge')
- externalUrl (TEXT, optional)
- registrationDeadline (TIMESTAMP, optional)
- is_active (BOOLEAN)
**RLS Requirements:** Public read access

### 15. **course_registrations** (Student enrollments)
**Expected Columns:**
- id (UUID, primary key)
- course_id (TEXT, references courses)
- user_pubkey (TEXT)
- family_id (UUID, optional)
- enrollment_type (TEXT)
- provider (TEXT)
- cost (INTEGER)
- metadata (JSONB)
- status (TEXT: 'pending'|'approved'|'active'|'completed'|'cancelled')
- registered_at (TIMESTAMP)
**RLS Requirements:** User-owned data access

## Missing Table Analysis

Based on codebase expectations, these tables are likely missing or incomplete:
1. **courses** - Educational course catalog
2. **course_registrations** - Student enrollment tracking
3. **course_progress** - Learning progress tracking
4. **cognitive_capital_metrics** - Learning analytics
5. **learning_pathways** - Structured learning paths
6. **otp_secrets** - OTP authentication system
7. **otp_sessions** - OTP session management
8. **vault_credentials** - Secure credential storage

## Critical Dependencies

1. **auth.users** - Supabase Auth table (should exist)
2. **profiles** - Core user profiles (references auth.users)
3. **user_identities** - Nostr identity mapping
4. **privacy_users** - Privacy-first user data
5. **families** - Family federation system
6. **nip05_records** - NIP-05 verification (public access required)
