# PKARR Attestations User Guide
**Satnam.pub - Decentralized Identity Verification**

## What are PKARR Attestations?

**PKARR** (Public Key Addressable Resource Records) is a decentralized DNS system built on the BitTorrent DHT (Distributed Hash Table). It allows you to publish and verify identity information without relying on centralized servers.

### Why PKARR Matters

✅ **Decentralized:** No single point of failure or control  
✅ **Privacy-First:** Your identity data is cryptographically secured  
✅ **Censorship-Resistant:** Cannot be taken down by any authority  
✅ **Self-Sovereign:** You control your own identity attestations  
✅ **Interoperable:** Works across different platforms and services  

---

## Understanding Verification Levels

Satnam.pub uses a 4-tier verification system to help you assess the trustworthiness of contacts:

### 🔘 Unverified (Gray Badge)
- **Meaning:** No verification methods have been completed
- **Trust Level:** Unknown
- **Recommendation:** Verify before sharing sensitive information

### 🔵 Basic (Blue Badge)
- **Meaning:** At least one verification method completed
- **Methods:** PKARR, SimpleProof, kind:0, Physical MFA, or Iroh DHT
- **Trust Level:** Low to Medium
- **Recommendation:** Suitable for casual interactions

### 🟢 Verified (Green Badge)
- **Meaning:** Multiple verification methods completed
- **Requirements:**
  - Physical MFA verified, OR
  - Both SimpleProof AND kind:0 verified
- **Trust Level:** Medium to High
- **Recommendation:** Suitable for important transactions

### 🟡 Trusted (Gold Badge)
- **Meaning:** Highest level of verification
- **Requirements:**
  - Physical MFA verified, AND
  - Either SimpleProof OR kind:0 verified
- **Trust Level:** High
- **Recommendation:** Suitable for sensitive operations and high-value transactions

---

## How to Verify Contacts via PKARR

### Method 1: Manual Verification

1. **Navigate to Contacts:**
   - Open the Satnam.pub application
   - Click on "Contacts" in the navigation menu

2. **Select a Contact:**
   - Find the contact you want to verify
   - Click on their name to view details

3. **Verify via PKARR:**
   - Locate the verification badge (shows current verification level)
   - Click the "Verify via PKARR" button
   - Wait for verification to complete (usually 2-5 seconds)

4. **Check Results:**
   - ✅ **Success:** PKARR indicator shows "✓" (verified)
   - ✅ **Level Updated:** Badge color changes (e.g., gray → blue)
   - ❌ **Failed:** Error message explains why verification failed

**Note:** PKARR verification requires the contact to have:
- A valid NIP-05 identifier (e.g., `alice@my.satnam.pub`)
- A published PKARR record on the DHT
- Matching public key in the PKARR record

---

### Method 2: Automatic Verification

If your administrator has enabled automatic verification (`VITE_PKARR_AUTO_VERIFY_ON_ADD=true`):

1. **Add a New Contact:**
   - Click "Add Contact" button
   - Fill in contact details (name, NIP-05, public key)
   - Click "Save"

2. **Automatic Verification:**
   - PKARR verification happens automatically in the background
   - Contact is created immediately (non-blocking)
   - Verification status updates within a few seconds

3. **Check Status:**
   - Refresh the contact list
   - Verification badge shows updated status

---

## Managing Your PKARR Attestations

### Accessing PKARR Settings

1. **Navigate to Settings:**
   - Click on your profile icon
   - Select "Settings" from the dropdown menu

2. **Locate PKARR Attestations:**
   - Scroll to the "PKARR Attestations" section
   - (Only visible if `VITE_PKARR_ENABLED=true`)

### Understanding Your PKARR Record

Your PKARR attestation settings page displays:

**Current Status:**
- **Public Key:** Your Nostr public key (hex format)
- **Sequence Number:** Increments each time you republish (starts at 1)
- **Last Published:** Timestamp of last successful publish
- **Next Republish:** Calculated time for next automatic republish (24 hours from last publish)
- **DHT Relays:** Number of active relays hosting your record

**Publish History:**
- Table showing last 10 publish attempts
- Success/failure status for each attempt
- Error messages (if any)

---

### Manual Republishing

**Why Republish?**
- PKARR records have a 24-hour TTL (Time To Live)
- Automatic republishing happens every 6 hours
- Manual republishing ensures your record stays fresh

**How to Republish:**

1. **Click "Republish Now" Button:**
   - Located in the PKARR Attestations section
   - Button shows "Republishing..." while processing

2. **Wait for Completion:**
   - Usually takes 2-5 seconds
   - Sequence number increments by 1
   - "Last Published" timestamp updates

3. **Verify Success:**
   - Check publish history table
   - Latest entry should show "Success: ✓"
   - If failed, error message explains why

**When to Republish Manually:**
- After changing your NIP-05 identifier
- After updating your profile information
- If automatic republishing failed
- Before important identity verification

---

## PKARR Record Contents

Your PKARR record contains the following DNS TXT records:

### _nostr Record
```
_nostr.your-pubkey-hash  TXT  "nostr=npub1..."
```
- **Purpose:** Links your public key to your PKARR record
- **TTL:** 3600 seconds (1 hour)
- **Privacy:** Public key is already public information

### _nip05 Record
```
_nip05.your-pubkey-hash  TXT  "username@my.satnam.pub"
```
- **Purpose:** Links your NIP-05 identifier to your PKARR record
- **TTL:** 3600 seconds (1 hour)
- **Privacy:** NIP-05 is public information (like an email address)

**Important:** Your PKARR record does NOT contain:
- ❌ Private keys (nsec)
- ❌ Passwords
- ❌ Personal information (real name, address, etc.)
- ❌ Contact lists
- ❌ Message history

---

## Troubleshooting

### PKARR Verification Fails

**Possible Causes:**
1. **Contact hasn't published a PKARR record:**
   - Ask them to enable PKARR attestations
   - They need to complete identity creation with PKARR enabled

2. **PKARR record expired:**
   - Records expire after 24 hours if not republished
   - Ask contact to republish their PKARR record

3. **Public key mismatch:**
   - Verify you have the correct public key for the contact
   - Check for typos in NIP-05 or public key

4. **DHT relay connectivity issues:**
   - Check your internet connection
   - Try again in a few minutes
   - Contact support if issue persists

---

### "Rate Limit Exceeded" Error

**Cause:** You've made more than 60 verification requests in the past hour

**Solution:**
- Wait 1 hour before trying again
- Avoid bulk verification operations
- Contact administrator to adjust rate limits if needed

---

### PKARR Attestations Section Not Visible

**Cause:** PKARR feature is disabled

**Solution:**
- Contact your administrator to enable `VITE_PKARR_ENABLED=true`
- Check if you're using the latest version of Satnam.pub

---

### Automatic Republishing Not Working

**Symptoms:**
- "Last Published" timestamp is older than 24 hours
- "Next Republish" shows "Overdue"

**Solution:**
1. **Manual Republish:**
   - Click "Republish Now" button
   - Check publish history for errors

2. **Check Scheduled Function:**
   - Contact administrator to verify Netlify scheduled functions are enabled
   - Check function logs for errors

3. **Verify Environment:**
   - Ensure `VITE_PKARR_ENABLED=true`
   - Check Netlify dashboard for function status

---

## Privacy & Security

### What Information is Public?

**Public Information (in PKARR record):**
- ✅ Nostr public key (npub)
- ✅ NIP-05 identifier (username@domain)

**Private Information (NEVER in PKARR record):**
- ❌ Private key (nsec)
- ❌ Passwords
- ❌ Real name (unless you choose to share it)
- ❌ Contact lists
- ❌ Messages

### Zero-Knowledge Architecture

Satnam.pub maintains a **zero-knowledge architecture**:
- Your private key (nsec) is NEVER sent to servers
- PKARR records are signed client-side with Ed25519
- All sensitive data is encrypted with Noble V2 encryption
- Server cannot decrypt your private information

### Best Practices

1. **Verify Before Trusting:**
   - Always verify contacts before sharing sensitive information
   - Aim for "Verified" or "Trusted" level for important contacts

2. **Keep Records Fresh:**
   - Republish regularly (automatic republishing handles this)
   - Manual republish after profile changes

3. **Monitor Verification Status:**
   - Check verification badges regularly
   - Re-verify contacts if their status changes

4. **Report Suspicious Activity:**
   - If a contact's verification fails unexpectedly, investigate
   - Contact support if you suspect impersonation

---

## Frequently Asked Questions

### Q: Do I need PKARR attestations?
**A:** No, PKARR is optional. However, it provides an additional layer of decentralized identity verification that enhances trust and security.

### Q: Can I disable PKARR attestations?
**A:** Yes, contact your administrator to set `VITE_PKARR_ENABLED=false`. Your existing PKARR records will remain on the DHT but won't be updated.

### Q: How long do PKARR records last?
**A:** PKARR records have a 24-hour TTL. Automatic republishing every 6 hours ensures they stay active.

### Q: Can I delete my PKARR record?
**A:** PKARR records on the DHT cannot be deleted, but they will expire after 24 hours if not republished. Stop republishing to let your record expire.

### Q: What happens if PKARR publishing fails during registration?
**A:** Registration still succeeds! PKARR publishing is non-blocking, so failures don't prevent account creation. You can republish manually later.

### Q: Can others see my PKARR record?
**A:** Yes, PKARR records are public (like DNS records). They only contain your public key and NIP-05 identifier, which are already public information.

### Q: How is PKARR different from NIP-05?
**A:** NIP-05 relies on centralized DNS servers. PKARR uses the decentralized BitTorrent DHT, making it censorship-resistant and more privacy-preserving.

### Q: What are the DHT relays?
**A:** DHT relays are servers that host PKARR records on the BitTorrent DHT. Satnam.pub uses:
- `https://pkarr.relay.pubky.tech`
- `https://pkarr.relay.synonym.to`

---

## Support

**Need Help?**
- 📧 Email: support@satnam.pub
- 💬 Community: [Nostr Community](nostr:...)
- 📚 Documentation: https://docs.satnam.pub
- 🐛 Report Bugs: https://github.com/satnam-pub/issues

---

**Last Updated:** 2025-10-24  
**Version:** Phase 2A Production Implementation

