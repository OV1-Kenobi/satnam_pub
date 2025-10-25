# PKARR Manual Testing Guide
**Phase 2A - Day 9: Manual Testing & Bug Fixes**

## Overview
This guide provides step-by-step instructions for manually testing all PKARR workflows implemented in Phase 2A (Days 1-8).

---

## Prerequisites

### Environment Setup
1. **Feature Flags Enabled:**
   ```bash
   VITE_PKARR_ENABLED=true
   VITE_PKARR_AUTO_VERIFY_ON_ADD=false  # Test both true/false
   VITE_HYBRID_IDENTITY_ENABLED=true
   ```

2. **Database Access:**
   - Supabase dashboard access for verifying database changes
   - SQL editor access for running verification queries

3. **Test Accounts:**
   - At least 2 test user accounts (for contact verification testing)
   - Test NIP-05 identifiers (e.g., `testuser1@my.satnam.pub`, `testuser2@my.satnam.pub`)

---

## Test Suite 1: Contact Verification Workflow

### Test 1.1: Manual PKARR Verification via UI
**Objective:** Verify that the "Verify via PKARR" button works correctly

**Steps:**
1. Log in to the application
2. Navigate to Contacts page
3. Add a new contact with valid NIP-05 and pubkey
4. Locate the contact in the list
5. Click on the contact to view details
6. Observe the `ContactVerificationBadge` component
7. Click the "Verify via PKARR" button

**Expected Results:**
- ✅ Button shows "Verifying..." loading state
- ✅ After completion, PKARR indicator shows "✓" (verified)
- ✅ Verification level badge updates from "unverified" to "basic"
- ✅ Badge color changes from gray to blue
- ✅ No errors in browser console

**Database Verification:**
```sql
-- Check pkarr_verified flag and verification_level
SELECT 
  contact_hash,
  pkarr_verified,
  verification_level,
  updated_at
FROM encrypted_contacts
WHERE owner_hash = 'YOUR_OWNER_HASH'
ORDER BY updated_at DESC
LIMIT 5;
```

**Expected Database State:**
- `pkarr_verified` = `true`
- `verification_level` = `'basic'`
- `updated_at` timestamp is recent

**Bug Tracking:**
- [ ] Bug found? (Yes/No)
- Bug description: _______________
- Severity: (Critical/High/Medium/Low)
- Steps to reproduce: _______________

---

### Test 1.2: Automatic PKARR Verification on Contact Creation
**Objective:** Verify automatic verification when `VITE_PKARR_AUTO_VERIFY_ON_ADD=true`

**Steps:**
1. Set `VITE_PKARR_AUTO_VERIFY_ON_ADD=true` in environment
2. Restart the application
3. Log in and navigate to Contacts page
4. Add a new contact with valid NIP-05 and pubkey
5. Immediately check the contact's verification status

**Expected Results:**
- ✅ Contact is created successfully
- ✅ PKARR verification happens in background (non-blocking)
- ✅ After a few seconds, `pkarr_verified` flag is set to `true`
- ✅ Verification level auto-updates to "basic"
- ✅ No errors in browser console or network tab

**Network Tab Verification:**
- Check for POST request to `/.netlify/functions/verify-contact-pkarr`
- Verify request includes `contact_hash`, `nip05`, `pubkey`
- Verify response status is 200 OK

**Bug Tracking:**
- [ ] Bug found? (Yes/No)
- Bug description: _______________

---

### Test 1.3: Rate Limiting Enforcement
**Objective:** Verify rate limiting (60 requests/hour per IP)

**Steps:**
1. Open browser developer tools (Network tab)
2. Create a script to trigger 61 verification requests rapidly:
   ```javascript
   // Run in browser console
   for (let i = 0; i < 61; i++) {
     fetch('/.netlify/functions/verify-contact-pkarr', {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'Authorization': 'Bearer YOUR_SESSION_TOKEN'
       },
       body: JSON.stringify({
         contact_hash: 'test-hash',
         nip05: 'test@example.com',
         pubkey: 'test-pubkey'
       })
     }).then(r => console.log(`Request ${i+1}: ${r.status}`));
   }
   ```

**Expected Results:**
- ✅ First 60 requests return 200 OK
- ✅ 61st request returns 429 Too Many Requests
- ✅ Error message indicates rate limit exceeded

**Bug Tracking:**
- [ ] Bug found? (Yes/No)
- Bug description: _______________

---

### Test 1.4: RLS Policy Enforcement
**Objective:** Verify owner_hash matching prevents unauthorized access

**Steps:**
1. Log in as User A
2. Create a contact
3. Note the `contact_hash` from database
4. Log out and log in as User B
5. Attempt to verify User A's contact using User B's session token

**Expected Results:**
- ✅ Request returns 404 Not Found or 403 Forbidden
- ✅ Error message indicates contact not found
- ✅ Database query returns no results (RLS blocks access)

**Bug Tracking:**
- [ ] Bug found? (Yes/No)
- Bug description: _______________

---

### Test 1.5: Verification Level Auto-Calculation
**Objective:** Verify `auto_update_verification_level()` trigger works correctly

**Test Cases:**

| Test Case | Flags Set | Expected Level |
|-----------|-----------|----------------|
| 1.5.1 | All false | `unverified` |
| 1.5.2 | `pkarr_verified=true` only | `basic` |
| 1.5.3 | `physical_mfa_verified=true` only | `verified` |
| 1.5.4 | `simpleproof_verified=true` AND `kind0_verified=true` | `verified` |
| 1.5.5 | `physical_mfa_verified=true` AND `simpleproof_verified=true` | `trusted` |

**Steps for each test case:**
1. Create a test contact
2. Update verification flags via SQL:
   ```sql
   UPDATE encrypted_contacts
   SET pkarr_verified = true  -- Adjust flags per test case
   WHERE contact_hash = 'YOUR_CONTACT_HASH';
   ```
3. Query the contact to verify `verification_level`:
   ```sql
   SELECT verification_level FROM encrypted_contacts
   WHERE contact_hash = 'YOUR_CONTACT_HASH';
   ```

**Bug Tracking:**
- [ ] Test 1.5.1 passed? (Yes/No)
- [ ] Test 1.5.2 passed? (Yes/No)
- [ ] Test 1.5.3 passed? (Yes/No)
- [ ] Test 1.5.4 passed? (Yes/No)
- [ ] Test 1.5.5 passed? (Yes/No)

---

## Test Suite 2: PKARR Publishing Workflow

### Test 2.1: PKARR Publishing During Identity Creation
**Objective:** Verify PKARR publishing in IdentityForge flow

**Steps:**
1. Log out (or use incognito mode)
2. Navigate to Identity Forge (registration page)
3. Fill in all required fields (username, password, etc.)
4. Complete the identity creation process
5. Observe the "PKARR Attestation" status indicator

**Expected Results:**
- ✅ Identity creation completes successfully
- ✅ PKARR status shows "✓ Published" or "⚠ Optional" (if failed)
- ✅ Registration succeeds even if PKARR publishing fails (non-blocking)
- ✅ No errors block the registration flow

**Database Verification:**
```sql
-- Check pkarr_records table
SELECT 
  public_key,
  records,
  sequence,
  last_published_at,
  relay_urls
FROM pkarr_records
WHERE public_key = 'YOUR_PUBLIC_KEY_HEX'
ORDER BY last_published_at DESC
LIMIT 1;
```

**Expected Database State:**
- Record exists in `pkarr_records` table
- `sequence` = `1` (first publish)
- `last_published_at` is recent timestamp
- `records` contains `_nostr` and `_nip05` TXT records

**Bug Tracking:**
- [ ] Bug found? (Yes/No)
- Bug description: _______________

---

### Test 2.2: PKARR Publishing in register-identity Endpoint
**Objective:** Verify server-side PKARR publishing after registration

**Steps:**
1. Monitor network tab during registration
2. Look for POST request to `/.netlify/functions/register-identity`
3. Check response for PKARR publishing status

**Expected Results:**
- ✅ Registration endpoint returns 200 OK
- ✅ Response includes user identity data
- ✅ PKARR publishing happens asynchronously (doesn't block response)

**Bug Tracking:**
- [ ] Bug found? (Yes/No)
- Bug description: _______________

---

### Test 2.3: Non-Blocking Behavior
**Objective:** Verify registration succeeds even if PKARR publishing fails

**Steps:**
1. Temporarily disable PKARR relays (modify code to use invalid relay URLs)
2. Complete identity creation process
3. Verify registration still succeeds

**Expected Results:**
- ✅ Registration completes successfully
- ✅ User identity is created in database
- ✅ PKARR status shows "⚠ Optional" (failed but non-blocking)
- ✅ Console shows warning: "⚠️ PKARR publishing failed (non-blocking)"

**Bug Tracking:**
- [ ] Bug found? (Yes/No)
- Bug description: _______________

---

## Test Suite 3: Scheduled Republishing

### Test 3.1: Manual Trigger of Scheduled Republishing
**Objective:** Test scheduled-pkarr-republish function manually

**Steps:**
1. Create a test PKARR record with old `last_published_at` timestamp:
   ```sql
   INSERT INTO pkarr_records (public_key, records, timestamp, sequence, signature, relay_urls, last_published_at)
   VALUES (
     'test-public-key-123',
     '[{"name":"_nostr","type":"TXT","value":"test"}]',
     EXTRACT(EPOCH FROM NOW() - INTERVAL '25 hours')::INTEGER,
     1,
     '',
     '{}',
     NOW() - INTERVAL '25 hours'
   );
   ```

2. Trigger the scheduled function manually:
   ```bash
   curl -X POST https://YOUR_NETLIFY_SITE/.netlify/functions/scheduled-pkarr-republish
   ```

**Expected Results:**
- ✅ Function returns 200 OK
- ✅ Response indicates number of records republished
- ✅ `sequence` number increments to 2
- ✅ `last_published_at` timestamp updates to current time
- ✅ `pkarr_publish_history` table logs the publish attempt

**Database Verification:**
```sql
-- Check updated record
SELECT sequence, last_published_at, relay_urls
FROM pkarr_records
WHERE public_key = 'test-public-key-123';

-- Check publish history
SELECT * FROM pkarr_publish_history
WHERE public_key = 'test-public-key-123'
ORDER BY published_at DESC
LIMIT 5;
```

**Bug Tracking:**
- [ ] Bug found? (Yes/No)
- Bug description: _______________

---

### Test 3.2: Sequence Number Incrementation
**Objective:** Verify sequence number increments correctly on republish

**Steps:**
1. Create a record with `sequence = 5`
2. Trigger republishing
3. Verify sequence increments to 6

**Expected Results:**
- ✅ Sequence number increments by 1
- ✅ Old sequence number is preserved in publish history

**Bug Tracking:**
- [ ] Bug found? (Yes/No)
- Bug description: _______________

---

## Test Suite 4: UI Component Testing

### Test 4.1: ContactVerificationBadge Rendering
**Objective:** Test badge rendering in browser

**Steps:**
1. Navigate to Contacts page
2. View contacts with different verification levels
3. Test both compact and detailed badge views

**Expected Results:**
- ✅ Compact badge shows correct color (gray/blue/green/gold)
- ✅ Detailed badge shows all 5 verification methods
- ✅ Tooltip displays verification details on hover
- ✅ Badge updates in real-time after verification

**Bug Tracking:**
- [ ] Bug found? (Yes/No)
- Bug description: _______________

---

### Test 4.2: AttestationsTab in Settings
**Objective:** Test PKARR management UI in Settings

**Steps:**
1. Navigate to Settings page
2. Locate the "PKARR Attestations" section
3. Verify current record status is displayed
4. Click "Republish Now" button

**Expected Results:**
- ✅ Current PKARR record details are displayed (public key, sequence, last published)
- ✅ Next republish time is calculated correctly (24 hours from last publish)
- ✅ "Republish Now" button triggers republishing
- ✅ Button shows "Republishing..." loading state
- ✅ After completion, sequence number increments
- ✅ Publish history table shows last 10 attempts

**Bug Tracking:**
- [ ] Bug found? (Yes/No)
- Bug description: _______________

---

### Test 4.3: Feature Flag Gating
**Objective:** Verify `VITE_PKARR_ENABLED` feature flag works correctly

**Steps:**
1. Set `VITE_PKARR_ENABLED=false`
2. Restart application
3. Navigate to Settings page
4. Navigate to Contacts page

**Expected Results:**
- ✅ AttestationsTab is hidden in Settings
- ✅ PKARR verification button is hidden in ContactVerificationBadge
- ✅ No PKARR-related API calls are made
- ✅ Application functions normally without PKARR features

**Bug Tracking:**
- [ ] Bug found? (Yes/No)
- Bug description: _______________

---

## Bug Summary Template

### Bugs Discovered During Manual Testing

| Bug ID | Severity | Component | Description | Steps to Reproduce | Status |
|--------|----------|-----------|-------------|-------------------|--------|
| BUG-001 | | | | | |
| BUG-002 | | | | | |
| BUG-003 | | | | | |

**Severity Levels:**
- **Critical:** Blocks core functionality, data loss, security vulnerability
- **High:** Major feature broken, workaround exists
- **Medium:** Minor feature broken, cosmetic issues
- **Low:** Nice-to-have, edge case

---

## Testing Completion Checklist

- [ ] Test Suite 1: Contact Verification Workflow (5 tests)
- [ ] Test Suite 2: PKARR Publishing Workflow (3 tests)
- [ ] Test Suite 3: Scheduled Republishing (2 tests)
- [ ] Test Suite 4: UI Component Testing (3 tests)
- [ ] All bugs documented and prioritized
- [ ] Critical/High bugs fixed and re-tested
- [ ] Day 9 marked as COMPLETE

**Total Tests:** 13 manual test cases  
**Tests Passed:** _____ / 13  
**Tests Failed:** _____ / 13  
**Bugs Found:** _____  
**Bugs Fixed:** _____

---

## Next Steps

After completing manual testing and bug fixes:
1. Mark Day 9 as COMPLETE
2. Proceed to Day 10: Documentation & Deployment Prep
3. Create API documentation
4. Create user guide
5. Complete deployment checklist

