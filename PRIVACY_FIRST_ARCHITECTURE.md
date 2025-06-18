# 🔒 Privacy-First Architecture

## 🎯 **ZERO-HONEYPOT DESIGN**

### **Core Privacy Principles**

- ❌ **NO pubkey storage** - Not even in separate columns
- ❌ **NO npub storage** - Zero Nostr identity exposure
- ❌ **NO nip05 storage** - No discoverable identifiers by default
- ✅ **Hash-based auth** - Non-reversible verification only
- ✅ **User-controlled encryption** - Platform cannot decrypt user data
- ✅ **Opt-in discoverability** - Users choose to be found
- ✅ **Anonymous by default** - Generated usernames, no identity links

## 🏗️ **Database Schema (Zero-Honeypot)**

```sql
profiles:
├── id (UUID PRIMARY KEY)              <- Secure auth UUID
├── username (VARCHAR UNIQUE)          <- Platform username (not Nostr)
├── auth_hash (VARCHAR UNIQUE)         <- Non-reversible pubkey hash
├── encrypted_profile (TEXT)           <- User-encrypted data
├── encryption_hint (VARCHAR)          <- Encryption method hint
├── is_discoverable (BOOLEAN)          <- Opt-in flag
├── family_id (UUID FK)                <- Optional family grouping

discoverable_profiles: (opt-in only)
├── user_id (UUID FK)                  <- Reference to profiles
├── encrypted_display_data (TEXT)      <- User-encrypted discoverable info
├── visibility_level (ENUM)            <- 'users_only', 'public'
```

## 🔐 **Privacy Protection Layers**

### **1. Authentication Hash**

```typescript
// Create non-reversible hash for verification
const authHash = PrivacyManager.createAuthHash(pubkey);
// Store: "salt:hash" - pubkey cannot be recovered

// Later verify without storing pubkey
const isValid = PrivacyManager.verifyAuthHash(pubkey, storedHash);
```

### **2. User-Controlled Encryption**

```typescript
// User encrypts their own data
const encryptedData = PrivacyManager.encryptUserData(userData, userKey);
// Platform stores encrypted blob - cannot decrypt without user's key

// Only user can decrypt
const userData = PrivacyManager.decryptUserData(encryptedData, userKey);
```

### **3. Anonymous Usernames**

```typescript
// Generate random, non-identifying usernames
const username = PrivacyManager.generateAnonymousUsername();
// Result: "SwiftEagle7423" - no connection to Nostr identity
```

## 🛡️ **Security Benefits**

### **Attack Resistance**

- **Database Breach**: No pubkeys, npubs, or identifiable data exposed
- **Admin Access**: Even platform admins cannot see user identities
- **Correlation Attacks**: No stored data to correlate with other platforms
- **Honeypot Elimination**: Nothing valuable for attackers to target

### **Privacy Guarantees**

- **Zero Identity Exposure**: Nostr identities never stored
- **User Data Control**: Only users can decrypt their information
- **Optional Discoverability**: Users choose when to be found
- **Platform Agnostic**: Easy migration to sovereign infrastructure

## 🚀 **Implementation Details**

### **Registration Flow**

```typescript
const registrationData = {
  userId: req.user.id, // From auth token
  username: "SwiftEagle7423", // Generated or chosen
  userEncryptionKey: userProvidedKey, // Never stored
  optionalData: {
    // User-encrypted
    displayName: "Alice",
    bio: "Bitcoin educator",
    lightningAddress: "alice@domain.com",
  },
  makeDiscoverable: false, // Default: private
};
```

### **Authentication Flow**

```typescript
// 1. User proves pubkey ownership (NIP-98 or similar)
// 2. Create auth hash from pubkey
// 3. Verify hash against stored hash
// 4. No pubkey ever stored or transmitted
```

### **Data Access Flow**

```typescript
// 1. User authenticates
// 2. Retrieve encrypted data blob
// 3. User decrypts on client-side with their key
// 4. Platform never sees decrypted data
```

## 📋 **API Endpoints**

### **Privacy-First Registration**

```
POST /register
Headers: Authorization: Bearer <jwt>
Body: {
  "username": "optional",
  "userEncryptionKey": "user-provided-key",
  "optionalData": { "displayName": "Alice" },
  "makeDiscoverable": false
}
```

### **Privacy Controls**

```
POST /privacy/check-username        # Check availability
GET /privacy/encrypted-data         # Get user's encrypted data
POST /privacy/discoverability       # Update privacy settings
```

## 🔄 **Migration Benefits**

### **To Sovereign Infrastructure**

- No sensitive data to migrate
- Users control their own encryption keys
- Platform becomes pure service layer
- No custody of user identity data

### **Zero-Trust Architecture**

- Platform cannot see user data
- Users verify their own identities
- Minimal attack surface
- Maximum user control

## 🎭 **User Experience**

### **For Privacy-Conscious Users**

- Anonymous by default
- No identity exposure
- Full data control
- Optional discoverability

### **For Social Users**

- Can opt-in to discoverability
- Encrypted profile data
- User-controlled visibility
- Easy privacy setting changes

## ⚡ **Performance**

### **Database Benefits**

- Smaller database size (no identity data)
- Faster queries (no complex privacy filtering)
- Reduced backup complexity
- Lower compliance burden

### **Security Benefits**

- No honeypot target
- Reduced attack surface
- Simplified threat model
- Enhanced user trust

---

**This architecture ensures your platform is not a honeypot and cannot be used to identify or track Nostr users, even if the database is compromised or you're compelled to provide data.**
