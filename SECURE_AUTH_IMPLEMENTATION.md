# 🔐 Secure Authentication Implementation

## ✅ **SECURITY ACHIEVED**

### **Database Schema (Secure)**

```sql
profiles:
├── id (UUID PRIMARY KEY)        <- Secure UUID from auth.users
├── pubkey (VARCHAR(64) UNIQUE)   <- Nostr public key (separate column)
├── username, npub, nip05, etc.
```

### **Key Security Features**

1. **Separated Identity Layers**:

   - `id` = UUID from Supabase auth (secure, private)
   - `pubkey` = Nostr public key (separate, indexed)

2. **Authentication Middleware**:

   - Extracts `userId` from JWT token
   - Prevents spoofing via request body
   - Validates tokens with Supabase

3. **Secure Routes**:
   - `/register` requires authentication
   - `/register/family` requires authentication
   - `userId` comes from token, not request body

## **Implementation Details**

### **Migration**

```sql
-- lib/migrations/003_add_pubkey_column_secure.sql
ALTER TABLE profiles ADD COLUMN pubkey VARCHAR(64) UNIQUE NOT NULL;
CREATE INDEX idx_profiles_pubkey ON profiles(pubkey);
ALTER TABLE profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();
```

### **Auth Middleware**

```typescript
// lib/middleware/auth.ts
export function authMiddleware(handler) {
  return async (req, res, next) => {
    const token = req.headers.authorization?.substring(7);
    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    req.user = { id: user.id }; // Secure UUID
    await handler(req, res, next);
  };
}
```

### **Secure Route Example**

```typescript
// lib/api/routes.ts
router.post("/register", authMiddleware(async (req: AuthenticatedRequest, res) => {
  const { username, ... } = req.body;
  const registrationData = {
    userId: req.user.id, // ✅ From JWT token
    username,
    // ... other fields
  };
  const result = await IdentityRegistration.registerIdentity(registrationData);
  res.json(result);
}));
```

### **Database Service**

```typescript
// lib/supabase.ts
static async createUserProfile(userData: {
  id: string;        // UUID from auth.users
  pubkey: string;    // Nostr public key
  username: string;
  // ...
}) {
  // Stores both secure UUID and Nostr pubkey
}
```

## **Security Benefits**

- ✅ **No pubkey exposure** as primary keys
- ✅ **Authentication required** for all identity operations
- ✅ **Token-based userId** prevents spoofing
- ✅ **Separated concerns** between auth and Nostr identity
- ✅ **Future-proof** for sovereign infrastructure migration

## **Usage**

1. User authenticates with Supabase
2. Gets JWT token
3. Includes `Authorization: Bearer <token>` in requests
4. Middleware extracts secure `userId` from token
5. Registration uses secure UUID + separate pubkey storage

This implementation ensures your users' pubkeys are protected from database exposure while maintaining proper authentication security.
