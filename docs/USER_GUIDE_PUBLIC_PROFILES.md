# User Guide: Public Profile URL System

**Last Updated:** October 24, 2025  
**Feature:** Public Profile URL System (Phase 3)  
**Status:** Production Ready

---

## Table of Contents

1. [Introduction](#introduction)
2. [Setting Profile Visibility](#setting-profile-visibility)
3. [Sharing Profile URLs](#sharing-profile-urls)
4. [Privacy Implications](#privacy-implications)
5. [Verification Badges](#verification-badges)
6. [Best Practices](#best-practices)
7. [FAQ](#faq)

---

## Introduction

The Public Profile URL System enables you to share your Satnam.pub identity with others through shareable URLs while maintaining complete control over your privacy. This feature is built on **privacy-first principles** with zero-knowledge architecture.

### Key Features

- ✅ **4 Visibility Modes**: Control who can see your profile (public, contacts only, trusted contacts only, private)
- ✅ **Shareable URLs**: Generate clean URLs like `https://www.satnam.pub/profile/yourname`
- ✅ **QR Code Generation**: Create QR codes for easy sharing in person
- ✅ **Privacy-First Analytics**: Track profile views without storing personal information
- ✅ **Verification Badges**: Display trust levels based on verification methods
- ✅ **Zero-Knowledge Security**: Your private keys never leave your device

### Privacy-First Principles

1. **No Personal Information Storage**: Analytics use hashed viewer identities (no IP addresses, no tracking cookies)
2. **User Sovereignty**: You control visibility, discoverability, and analytics settings
3. **Encrypted Contacts**: Contact relationships are stored using privacy-preserving hashes
4. **Opt-In Analytics**: Analytics are disabled by default and require explicit consent

---

## Setting Profile Visibility

Navigate to **Settings → Profile Visibility** to configure your profile visibility settings.

### Visibility Modes

#### 1. **Public** 🌍
**Who can see:** Everyone (including anonymous visitors)

**Use cases:**
- Content creators building a public presence
- Businesses accepting Lightning payments
- Community leaders and educators
- Public figures and influencers

**What's visible:**
- Username, display name, bio
- Profile picture and banner
- NIP-05 identifier and Lightning Address
- Website and social links
- Verification badges

**How to enable:**
1. Go to Settings → Profile Visibility
2. Select "Public" from the visibility dropdown
3. Toggle "Make profile discoverable in search" (optional)
4. Toggle "Enable analytics" to track profile views (optional)
5. Click "Save Changes"

---

#### 2. **Contacts Only** 👥
**Who can see:** Only people in your encrypted contacts list

**Use cases:**
- Sharing profile with friends and family
- Private communities and groups
- Selective professional networking
- Family federation members

**What's visible:**
- Same as Public mode, but only to your contacts
- Contact relationship is verified via encrypted_contacts table

**How to enable:**
1. Go to Settings → Profile Visibility
2. Select "Contacts Only" from the visibility dropdown
3. Ensure you've added contacts via the Contacts page
4. Click "Save Changes"

**Note:** Visitors not in your contacts list will see "Profile is private" message.

---

#### 3. **Trusted Contacts Only** 🔒
**Who can see:** Only contacts with verification level "verified" or "trusted"

**Use cases:**
- High-security scenarios requiring verified identities
- Financial transactions with trusted parties
- Family federation guardians and stewards
- Enterprise collaboration with verified partners

**What's visible:**
- Same as Contacts Only mode, but restricted to trusted contacts
- Requires verification flags: physical_mfa_verified, simpleproof_verified, or kind0_verified

**How to enable:**
1. Go to Settings → Profile Visibility
2. Select "Trusted Contacts Only" from the visibility dropdown
3. Ensure your trusted contacts have completed verification
4. Click "Save Changes"

**Verification Requirements:**
- **Verified**: Physical MFA OR (SimpleProof + Kind:0)
- **Trusted**: Physical MFA AND (SimpleProof OR Kind:0)

---

#### 4. **Private** 🚫
**Who can see:** Only you (default setting)

**Use cases:**
- New users exploring the platform
- Privacy-conscious individuals
- Testing profile changes before going public
- Temporary privacy during sensitive periods

**What's visible:**
- Nothing (profile is completely hidden from others)
- You can still view your own profile

**How to enable:**
1. Go to Settings → Profile Visibility
2. Select "Private" from the visibility dropdown
3. Click "Save Changes"

**Note:** This is the default setting for all new accounts.

---

### Additional Settings

#### **Make Profile Discoverable in Search**
- **Enabled**: Your profile appears in public search results (requires Public visibility)
- **Disabled**: Your profile is only accessible via direct URL
- **Default**: Disabled (privacy-first)

#### **Enable Analytics**
- **Enabled**: Track profile views with privacy-first hashed viewer identities
- **Disabled**: No analytics data collected
- **Default**: Disabled (opt-in required)

**Analytics Data Collected:**
- Total view count
- View timestamps
- Referrer domain (no full URLs)
- Hashed viewer identity (first 50 chars of SHA-256 hash, no PII)

---

## Sharing Profile URLs

### ProfileURLDisplay Component

The ProfileURLDisplay component (available in Settings → Profile Visibility) provides three ways to share your profile:

#### 1. **Copy URL to Clipboard**

**Available Formats:**
- **Username**: `https://www.satnam.pub/profile/yourname`
- **Short URL**: `https://www.satnam.pub/p/yourname`
- **Npub**: `https://www.satnam.pub/profile/npub/npub1abc123...`

**How to use:**
1. Select your preferred URL format from the dropdown
2. Click the "Copy" button
3. Paste the URL anywhere (social media, email, messaging apps)

---

#### 2. **Generate QR Code**

**How to use:**
1. Click "Show QR Code" button
2. QR code appears with your profile URL embedded
3. Share the QR code image:
   - Screenshot and share digitally
   - Print for business cards or flyers
   - Display at events or conferences

**QR Code Features:**
- High-contrast black/white for easy scanning
- Embedded profile URL (username format by default)
- Works with any QR code scanner app

---

#### 3. **Direct Link Sharing**

**How to use:**
1. Copy your profile URL
2. Share via:
   - Email signatures
   - Social media bios (Twitter, GitHub, LinkedIn)
   - Website footer or contact page
   - Nostr profile metadata (NIP-05)
   - Lightning Address invoices

---

### URL Format Reference

| Format | Example | Use Case |
|--------|---------|----------|
| **Username** | `https://www.satnam.pub/profile/alice` | Clean, memorable, professional |
| **Short URL** | `https://www.satnam.pub/p/alice` | Social media character limits |
| **Npub** | `https://www.satnam.pub/profile/npub/npub1abc...` | Nostr-native sharing, key verification |

---

## Privacy Implications

### What Data is Visible?

| Data Field | Public | Contacts Only | Trusted Contacts Only | Private |
|------------|--------|---------------|----------------------|---------|
| Username | ✅ | ✅ | ✅ | ❌ |
| Display Name | ✅ | ✅ | ✅ | ❌ |
| Bio | ✅ | ✅ | ✅ | ❌ |
| Profile Picture | ✅ | ✅ | ✅ | ❌ |
| Banner Image | ✅ | ✅ | ✅ | ❌ |
| NIP-05 Identifier | ✅ | ✅ | ✅ | ❌ |
| Lightning Address | ✅ | ✅ | ✅ | ❌ |
| Website | ✅ | ✅ | ✅ | ❌ |
| Social Links | ✅ | ✅ | ✅ | ❌ |
| Verification Badges | ✅ | ✅ | ✅ | ❌ |
| Profile Views Count | ✅ (if analytics enabled) | ✅ (if analytics enabled) | ✅ (if analytics enabled) | ❌ |

### What Data is NEVER Visible?

The following data is **NEVER** exposed in public profiles, regardless of visibility mode:

- ❌ Private keys (nsec) - stored encrypted, never transmitted
- ❌ Password hashes and salts
- ❌ Session tokens and authentication credentials
- ❌ Encrypted contacts list (only you can decrypt)
- ❌ Private messages and DMs
- ❌ Payment history and transaction details
- ❌ Family federation internal data
- ❌ Viewer IP addresses or tracking cookies

---

### Analytics Privacy

When analytics are enabled, the following privacy protections apply:

1. **Hashed Viewer Identity**: Viewer identities are hashed using SHA-256 (first 50 chars only)
2. **No PII Storage**: No IP addresses, cookies, or personally identifiable information
3. **Aggregated Data Only**: View counts and timestamps, no individual tracking
4. **Referrer Domain Only**: Only the domain is stored (e.g., "twitter.com"), not full URLs
5. **Owner-Only Access**: Only you can view your analytics data

**Example Analytics Data:**
```json
{
  "total_views": 42,
  "recent_views": [
    {
      "viewed_at": "2025-10-24T12:34:56Z",
      "referrer": "twitter.com"
    }
  ]
}
```

---

## Verification Badges

Verification badges display your trust level based on completed verification methods.

### Verification Levels

#### 🔵 **Unverified**
- **Requirements**: No verification methods completed
- **Badge**: None displayed
- **Trust Level**: Lowest

#### 🟢 **Basic**
- **Requirements**: Any single verification method completed
- **Badge**: Green checkmark
- **Trust Level**: Low
- **Examples**:
  - Physical MFA verified
  - SimpleProof verified
  - Kind:0 verified
  - PKARR verified
  - Iroh DHT verified

#### 🟡 **Verified**
- **Requirements**: Physical MFA OR (SimpleProof + Kind:0)
- **Badge**: Yellow shield
- **Trust Level**: Medium
- **Examples**:
  - Physical MFA verified (NFC Name Tag)
  - SimpleProof + Kind:0 verified

#### 🟠 **Trusted**
- **Requirements**: Physical MFA AND (SimpleProof OR Kind:0)
- **Badge**: Orange star
- **Trust Level**: Highest
- **Examples**:
  - Physical MFA + SimpleProof verified
  - Physical MFA + Kind:0 verified
  - Physical MFA + SimpleProof + Kind:0 verified

### How Verification Levels are Derived

Verification levels are **automatically calculated** based on your verification flags using the following logic:

```typescript
if (physical_mfa_verified && (simpleproof_verified || kind0_verified)) {
  return "trusted";
} else if (physical_mfa_verified || (simpleproof_verified && kind0_verified)) {
  return "verified";
} else if (any_verification_flag_is_true) {
  return "basic";
} else {
  return "unverified";
}
```

### Completing Verification Methods

1. **Physical MFA**: Complete NFC Name Tag setup in Identity Forge
2. **SimpleProof**: Complete timestamping verification (Phase 1 feature)
3. **Kind:0**: Publish Nostr Kind:0 metadata event via CEPS
4. **PKARR**: Complete PKARR DHT verification (Phase 1 Week 1 feature)
5. **Iroh DHT**: Complete Iroh DHT verification (future feature)

---

## Best Practices

### For Privacy-Conscious Users

1. ✅ **Start with Private**: Keep profile private until you're ready to share
2. ✅ **Use Contacts Only**: Share with trusted contacts before going public
3. ✅ **Disable Analytics**: Opt out of analytics if you don't need view tracking
4. ✅ **Disable Discoverability**: Prevent search indexing for more privacy
5. ✅ **Review Contacts Regularly**: Audit your contacts list and remove untrusted entries
6. ✅ **Use Trusted Contacts Only**: For high-security scenarios, require verification

### For Content Creators

1. ✅ **Use Public Visibility**: Maximize reach and discoverability
2. ✅ **Enable Analytics**: Track profile views to measure engagement
3. ✅ **Enable Discoverability**: Allow search engines to index your profile
4. ✅ **Complete Verifications**: Build trust with verification badges
5. ✅ **Use Short URLs**: Share `satnam.pub/p/yourname` on social media
6. ✅ **Generate QR Codes**: Use QR codes for in-person events

### Security Tips

1. 🔒 **Never Share Your nsec**: Your private key should never be shared or stored unencrypted
2. 🔒 **Use Strong Passwords**: Protect your NIP-05/password authentication
3. 🔒 **Enable Physical MFA**: Use NFC Name Tag for highest security
4. 🔒 **Verify Contacts**: Only add trusted contacts to your encrypted_contacts list
5. 🔒 **Monitor Analytics**: Check for suspicious view patterns if analytics are enabled
6. 🔒 **Review Visibility Settings**: Periodically audit your visibility mode

---

## FAQ

### Q: Can I change my visibility mode at any time?
**A:** Yes, you can change your visibility mode instantly in Settings → Profile Visibility.

### Q: What happens to my profile URL if I change my username?
**A:** Your profile URL will update to reflect your new username. Old URLs will return a "Profile not found" error.

### Q: Can I see who viewed my profile?
**A:** No. Analytics only show hashed viewer identities (no PII) and aggregated view counts. Individual viewer identities are not stored.

### Q: How do I add contacts to my encrypted_contacts list?
**A:** Navigate to Contacts page and use the "Add Contact" feature. Contacts are stored using privacy-preserving hashes.

### Q: What's the difference between "Contacts Only" and "Trusted Contacts Only"?
**A:** "Contacts Only" allows all contacts to view your profile. "Trusted Contacts Only" requires contacts to have verification level "verified" or "trusted".

### Q: Can I disable analytics after enabling them?
**A:** Yes, you can disable analytics at any time. Existing analytics data will be preserved but no new views will be tracked.

### Q: Are QR codes stored on Satnam.pub servers?
**A:** No, QR codes are generated client-side in your browser. They are not uploaded or stored on our servers.

### Q: Can I use a custom domain for my profile URL?
**A:** Not currently. All profile URLs use the `satnam.pub` domain. Custom domains may be supported in future releases.

### Q: What happens if I delete my account?
**A:** All profile data, analytics, and view history are permanently deleted via CASCADE constraints. This action cannot be undone.

---

## Support

For questions, issues, or feature requests:
- **GitHub Issues**: https://github.com/OV1-Kenobi/satnam_pub/issues
- **Nostr DM**: Contact via NIP-17 encrypted messaging
- **Email**: support@satnam.pub

---

**Privacy-First. User-Sovereign. Zero-Knowledge.**

