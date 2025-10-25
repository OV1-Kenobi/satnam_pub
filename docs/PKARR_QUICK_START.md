# PKARR Quick Start Guide
**Get started with PKARR attestations in 5 minutes**

## For Developers: Enable PKARR Features

### 1. Set Environment Variables
```bash
# In your .env file or Netlify dashboard:
VITE_PKARR_ENABLED=true
VITE_PKARR_AUTO_VERIFY_ON_ADD=false  # Optional: auto-verify contacts
VITE_HYBRID_IDENTITY_ENABLED=true    # Required for PKARR
```

### 2. Restart Application
```bash
npm run dev
# or redeploy on Netlify
```

### 3. Verify Features Are Enabled
- Navigate to Settings page
- Look for "PKARR Attestations" section
- If visible, PKARR is enabled ✅

---

## For Users: Verify a Contact

### Quick Steps
1. **Go to Contacts** → Click on a contact
2. **Find the verification badge** (shows current level)
3. **Click "Verify via PKARR"** button
4. **Wait 2-5 seconds** for verification
5. **Check the badge** - should update to "Basic" (blue) if successful

### What You'll See
- **Before:** Gray badge, "Unverified"
- **After:** Blue badge, "Basic", PKARR indicator shows "✓"

---

## For Users: Manage Your PKARR Record

### Quick Steps
1. **Go to Settings** → Scroll to "PKARR Attestations"
2. **View your record status:**
   - Public Key: Your Nostr public key
   - Sequence: Number of times published
   - Last Published: When it was last updated
   - Next Republish: When it will auto-update (24 hours)
3. **Click "Republish Now"** to manually update your record

### When to Republish
- After changing your NIP-05 identifier
- If "Next Republish" shows "Overdue"
- Before important identity verification

---

## For Developers: Test the System

### Quick Test Script
```javascript
// Run in browser console (after logging in)

// 1. Get your session token
const token = localStorage.getItem('session_token');

// 2. Test verify-contact-pkarr endpoint
fetch('/.netlify/functions/verify-contact-pkarr', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    contact_hash: 'test-hash',
    nip05: 'test@my.satnam.pub',
    pubkey: 'npub1...'
  })
})
.then(r => r.json())
.then(data => console.log('Verification result:', data));

// 3. Test scheduled republishing (manual trigger)
fetch('/.netlify/functions/scheduled-pkarr-republish', {
  method: 'POST'
})
.then(r => r.json())
.then(data => console.log('Republish result:', data));
```

### Quick Database Check
```sql
-- Check your PKARR record
SELECT * FROM pkarr_records 
WHERE public_key = 'YOUR_PUBLIC_KEY_HEX'
LIMIT 1;

-- Check publish history
SELECT * FROM pkarr_publish_history
WHERE public_key = 'YOUR_PUBLIC_KEY_HEX'
ORDER BY published_at DESC
LIMIT 5;

-- Check contact verification
SELECT contact_hash, pkarr_verified, verification_level
FROM encrypted_contacts
WHERE owner_hash = 'YOUR_OWNER_HASH'
ORDER BY updated_at DESC
LIMIT 10;
```

---

## Troubleshooting

### PKARR Features Not Visible
**Problem:** Can't see "PKARR Attestations" in Settings  
**Solution:** Check `VITE_PKARR_ENABLED=true` and restart app

### Verification Always Fails
**Problem:** "Verify via PKARR" button always fails  
**Solution:** 
1. Check `VITE_HYBRID_IDENTITY_ENABLED=true`
2. Verify contact has valid NIP-05 and pubkey
3. Check browser console for errors

### Rate Limit Exceeded
**Problem:** Getting 429 error  
**Solution:** Wait 1 hour (60 requests/hour limit)

### Scheduled Function Not Running
**Problem:** Records not republishing automatically  
**Solution:** 
1. Check Netlify dashboard → Functions → Scheduled
2. Verify cron schedule: `0 */6 * * *`
3. Check function logs for errors

---

## Quick Reference

### Verification Levels
- 🔘 **Unverified** (Gray): No verification
- 🔵 **Basic** (Blue): 1+ verification method
- 🟢 **Verified** (Green): Physical MFA OR (SimpleProof + kind:0)
- 🟡 **Trusted** (Gold): Physical MFA + (SimpleProof OR kind:0)

### API Endpoints
- `POST /.netlify/functions/verify-contact-pkarr` - Verify a contact
- `POST /.netlify/functions/scheduled-pkarr-republish` - Republish records
- `POST /.netlify/functions/pkarr-publish` - Publish new record

### Database Tables
- `encrypted_contacts` - Contact verification flags
- `pkarr_records` - PKARR DNS records
- `pkarr_publish_history` - Publish audit trail

### Feature Flags
- `VITE_PKARR_ENABLED` - Master switch (default: false)
- `VITE_PKARR_AUTO_VERIFY_ON_ADD` - Auto-verify contacts (default: false)
- `VITE_HYBRID_IDENTITY_ENABLED` - Required for PKARR (default: false)

---

## Next Steps

1. **Read the full documentation:**
   - `docs/PKARR_USER_GUIDE.md` - For users
   - `docs/PKARR_API_DOCUMENTATION.md` - For developers
   - `docs/PKARR_MANUAL_TESTING_GUIDE.md` - For testing

2. **Run manual tests:**
   - Follow `docs/PKARR_MANUAL_TESTING_GUIDE.md`
   - Complete all 13 test cases
   - Document any bugs found

3. **Deploy to production:**
   - Follow `docs/PKARR_DEPLOYMENT_CHECKLIST.md`
   - Complete all pre-deployment checks
   - Monitor for 24 hours after deployment

---

**Need Help?**
- 📚 Full Documentation: `docs/` directory
- 🐛 Report Issues: GitHub Issues
- 💬 Community: Nostr Community

**Last Updated:** 2025-10-24

