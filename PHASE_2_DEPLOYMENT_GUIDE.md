# Phase 2: FIDO2/WebAuthn - Deployment Guide

## 🚀 Quick Deployment (5 Steps)

### Step 1: Execute Database Migration (2 minutes)

1. Open [Supabase SQL Editor](https://app.supabase.com/project/_/sql/new)
2. Copy the entire contents of `database/migrations/036_fido2_webauthn_support.sql`
3. Paste into the SQL Editor
4. Click "Run"
5. Verify success message

**Expected Output:**
```
✓ Created table: webauthn_credentials
✓ Created table: webauthn_challenges
✓ Created table: webauthn_audit_log
✓ Created RLS policies
✓ Created indexes
✓ Created triggers
```

### Step 2: Enable Feature Flags (1 minute)

Set these environment variables in Netlify:

```bash
# Required
VITE_WEBAUTHN_ENABLED=true

# Optional (set to true to allow Windows Hello, Touch ID, Face ID)
VITE_WEBAUTHN_PLATFORM_AUTHENTICATOR_ENABLED=false
```

**Steps:**
1. Go to Netlify Dashboard
2. Select your site
3. Go to Site Settings → Build & Deploy → Environment
4. Add the environment variables above
5. Trigger a new deploy

### Step 3: Verify Deployment (2 minutes)

1. Check that the site builds successfully
2. Open browser console (F12)
3. Check for any errors related to WebAuthn
4. Verify feature flags are loaded:
   ```javascript
   // In browser console
   console.log(clientConfig.flags.webauthnEnabled)  // Should be true
   ```

### Step 4: Test Registration (5 minutes)

1. Navigate to the registration page
2. Look for "Register Security Key" option
3. Click to start registration
4. Select device type (hardware key or platform authenticator)
5. Enter device name (e.g., "My YubiKey")
6. Click "Register Key"
7. Follow hardware key prompts
8. Verify success message

**Expected Result:**
- Credential stored in `webauthn_credentials` table
- Entry in `webauthn_audit_log` with action "credential_registered"

### Step 5: Test Authentication (5 minutes)

1. Sign out
2. Navigate to login page
3. Look for "Authenticate with Security Key" option
4. Enter your NIP-05 address
5. Click "Authenticate with Security Key"
6. Follow hardware key prompts
7. Verify successful authentication

**Expected Result:**
- Session token generated
- Entry in `webauthn_audit_log` with action "credential_authenticated"
- Counter incremented in `webauthn_credentials` table

---

## 🔍 Verification Checklist

### Database
- [ ] `webauthn_credentials` table exists
- [ ] `webauthn_challenges` table exists
- [ ] `webauthn_audit_log` table exists
- [ ] RLS policies are enabled
- [ ] Indexes are created
- [ ] Triggers are working

### Feature Flags
- [ ] `VITE_WEBAUTHN_ENABLED=true` in Netlify
- [ ] Feature flag loads in browser
- [ ] Components are visible when flag is true

### Registration
- [ ] Can start registration
- [ ] Can select device type
- [ ] Can enter device name
- [ ] Can complete registration
- [ ] Credential stored in database
- [ ] Audit log entry created

### Authentication
- [ ] Can start authentication
- [ ] Can complete authentication
- [ ] Counter increments
- [ ] Session token generated
- [ ] Audit log entry created

### Security
- [ ] Rate limiting works (test with rapid requests)
- [ ] Cloning detection works (test with counter anomaly)
- [ ] RLS policies enforce privacy (test cross-user access)
- [ ] Audit logs are immutable

---

## 🛠️ Troubleshooting

### "Feature flag not found"
**Solution**: Ensure `VITE_WEBAUTHN_ENABLED=true` is set in Netlify environment and site is redeployed.

### "Rate limit exceeded"
**Solution**: Wait 60 seconds before retrying. This is expected behavior.

### "Credential not found"
**Solution**: Ensure credential is registered first. Check `webauthn_credentials` table.

### "Cloning detected"
**Solution**: This is expected if counter doesn't increment. Credential is automatically disabled. User should register a new credential.

### "Challenge expired"
**Solution**: Challenges expire after 10 minutes. Restart the registration/authentication flow.

### "Database migration failed"
**Solution**: 
1. Check for syntax errors in SQL
2. Verify Supabase connection
3. Check for existing tables (migration is idempotent)
4. Review error message in Supabase SQL Editor

---

## 📊 Monitoring

### Check Registration Activity
```sql
SELECT * FROM webauthn_audit_log
WHERE action = 'credential_registered'
ORDER BY created_at DESC
LIMIT 10;
```

### Check Authentication Activity
```sql
SELECT * FROM webauthn_audit_log
WHERE action = 'credential_authenticated'
ORDER BY created_at DESC
LIMIT 10;
```

### Check Cloning Detection
```sql
SELECT * FROM webauthn_audit_log
WHERE action = 'cloning_detected'
ORDER BY created_at DESC;
```

### View Active Credentials
```sql
SELECT 
  id,
  user_duid,
  device_name,
  device_type,
  counter,
  last_used_at,
  is_active
FROM webauthn_credentials
WHERE is_active = true
ORDER BY last_used_at DESC;
```

### Check Failed Attempts
```sql
SELECT * FROM webauthn_audit_log
WHERE action IN ('registration_failed', 'authentication_failed')
ORDER BY created_at DESC
LIMIT 10;
```

---

## 🔐 Security Checklist

- [ ] Rate limiting is working (30 requests/60 seconds)
- [ ] Counter validation is working (cloning detection)
- [ ] RLS policies are enforced (user isolation)
- [ ] Audit logging is enabled (all operations logged)
- [ ] Challenges expire after 10 minutes
- [ ] JWT tokens are validated
- [ ] CORS headers are configured
- [ ] Error messages don't leak sensitive info

---

## 📱 Device Testing

### Hardware Keys
- [ ] YubiKey 5 (USB)
- [ ] YubiKey 5 (NFC)
- [ ] Google Titan (USB)
- [ ] Feitian ePass (USB)

### Platform Authenticators
- [ ] Windows Hello
- [ ] Touch ID (macOS)
- [ ] Face ID (iOS)

---

## 🎯 Success Criteria

✅ **Phase 2 is successfully deployed when:**

1. Database migration executes without errors
2. Feature flags are enabled in Netlify
3. WebAuthn components are visible in UI
4. Registration works with hardware key
5. Authentication works with counter validation
6. Cloning detection works
7. Audit logs show all operations
8. No TypeScript errors in console
9. Rate limiting prevents brute force
10. RLS policies enforce privacy

---

## 📞 Support Resources

1. **WEBAUTHN_QUICK_START.md** - API reference and troubleshooting
2. **PHASE_2_IMPLEMENTATION_COMPLETE.md** - Technical details
3. **PHASE_2_VERIFICATION_REPORT.md** - Quality assurance report
4. **Database Schema** - See WEBAUTHN_QUICK_START.md

---

## 🔄 Rollback Plan

If issues occur:

1. **Disable Feature Flag**
   ```bash
   VITE_WEBAUTHN_ENABLED=false
   ```

2. **Disable Platform Authenticators**
   ```bash
   VITE_WEBAUTHN_PLATFORM_AUTHENTICATOR_ENABLED=false
   ```

3. **Revert Database** (if needed)
   - Drop tables: `webauthn_credentials`, `webauthn_challenges`, `webauthn_audit_log`
   - Remove migration from `database/migrations/`

4. **Redeploy Site**
   - Trigger new deploy in Netlify

---

## 📈 Performance Metrics

**Expected Performance:**
- Registration: < 2 seconds
- Authentication: < 2 seconds
- Database queries: < 100ms
- API response time: < 500ms

**Monitor with:**
```javascript
// In browser console
performance.measure('webauthn-registration', 'navigationStart', 'loadEventEnd');
```

---

## 🎓 User Documentation

### For Users: How to Register a Security Key

1. Go to Settings → Security
2. Click "Add Security Key"
3. Select device type (hardware key recommended)
4. Enter device name
5. Click "Register Key"
6. Follow hardware key prompts
7. Done! Your security key is now registered

### For Users: How to Authenticate with Security Key

1. Go to login page
2. Enter your NIP-05 address
3. Click "Authenticate with Security Key"
4. Follow hardware key prompts
5. Done! You're logged in

---

**Deployment Guide Complete. Ready to deploy Phase 2! 🚀**

