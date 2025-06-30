# 🔒 Secure Vault-Based Architecture

## ✅ **CORRECT IMPLEMENTATION - CREDENTIALS NEVER EXPOSED**

### 🏗️ **Architecture Overview**

```
┌─────────────────────────────────────────────────────────────┐
│                    SECURE ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  CLIENT-SIDE (Browser)                                      │
│  ├── VITE_SUPABASE_URL (public)                            │
│  ├── VITE_SUPABASE_ANON_KEY (public, limited permissions)  │
│  └── ❌ NO service role access                             │
│                                                             │
│  SERVER-SIDE (API Routes)                                   │
│  ├── Retrieves service role key from Supabase Vault        │
│  ├── Creates service-role enabled Supabase client          │
│  ├── Performs admin operations securely                    │
│  └── ✅ Never exposes service role key to client           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 🚨 **CRITICAL SECURITY RULES**

### ❌ **NEVER DO THIS:**

```env
# ❌ SECURITY VIOLATION - Service role key in environment file
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### ✅ **CORRECT APPROACH:**

```env
# ✅ Client-side only (safe for browser)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ✅ Service role key retrieved from Vault at runtime
# No sensitive credentials in environment files!
```

## 🛠️ **Setup Instructions**

### 1. **Initial Vault Setup (One-time)**

```bash
# Run the secure setup script
node scripts/setup-vault-credentials.js
```

This will:

- ✅ Store service role key securely in Supabase Vault
- ✅ Verify Vault access works
- ✅ Never expose credentials in files

### 2. **Environment Configuration**

#### **Development (.env)**

```env
# Client-side Supabase (safe for browser)
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here

# Service role key stored in Vault - NOT HERE!
```

#### **Production Deployment**

```env
# Only these variables needed for production
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here

# For Vault fallback (if needed)
SUPABASE_SERVICE_ROLE_KEY_VAULT_FALLBACK=your_service_role_key
```

## 🔐 **How It Works**

### **Client-Side Operations**

```typescript
// ✅ Client uses anon key only
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Limited to anon permissions only
```

### **Server-Side Operations**

```typescript
// ✅ Server retrieves service role key from Vault
import { getSecureSupabaseClient } from "../lib/secure-vault-client";

export default async function handler(req, res) {
  // Service role key retrieved securely from Vault
  const supabase = await getSecureSupabaseClient();

  // Full admin permissions available
  const { data } = await supabase.rpc("vault_read", {
    secret_name: "federation_id",
  });
}
```

## 🛡️ **Security Benefits**

### ✅ **What This Prevents:**

- **Credential Exposure**: Service role keys never in environment files
- **Client-Side Access**: Browser can't access admin functions
- **Code Repository Leaks**: No sensitive data in version control
- **Environment File Theft**: Attackers can't get service role access

### ✅ **What This Enables:**

- **Secure Federation Management**: Admin operations protected
- **Vault-Based Secrets**: All sensitive data encrypted at rest
- **Audit Trail**: All Vault access logged in Supabase
- **Production Ready**: No hardcoded credentials anywhere

## 🚀 **Deployment Checklist**

### **Before Deployment:**

- [ ] Run `node scripts/setup-vault-credentials.js`
- [ ] Verify API endpoints work with Vault
- [ ] Remove any service role keys from environment files
- [ ] Test client-side operations (should work with anon key)
- [ ] Test server-side operations (should work with Vault)

### **Production Environment:**

- [ ] Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- [ ] Optionally set `SUPABASE_SERVICE_ROLE_KEY_VAULT_FALLBACK`
- [ ] Verify Vault access works in production
- [ ] Monitor logs for any credential access attempts

## 📝 **API Endpoints Using Vault**

All these endpoints now use secure Vault access:

- `GET /api/vault/federation-secrets` - Gets federation config from Vault
- `GET /api/vault/secret/[secretName]` - Gets individual secrets
- `POST /api/vault/store-secret` - Stores secrets in Vault

## 🔍 **Troubleshooting**

### **"Service role key unavailable"**

- Run the setup script: `node scripts/setup-vault-credentials.js`
- Check Supabase Vault extension is enabled
- Verify service role key is stored in Vault

### **"SECURITY VIOLATION: secure-vault-client must not be used on client-side"**

- ✅ This is correct! The error prevents client-side misuse
- Only use `getSecureSupabaseClient()` in API routes

### **Vault access denied**

- Check your service role key has Vault permissions
- Ensure Vault extension is properly configured
- Verify RLS policies allow service role access

---

## 🎉 **Result: Zero-Credential Exposure Architecture**

Your application now has:

- ✅ **Client-side**: Limited anon key access only
- ✅ **Server-side**: Secure Vault-retrieved service role access
- ✅ **Environment files**: No sensitive credentials exposed
- ✅ **Version control**: No secrets in code repository
- ✅ **Production**: Fully secure credential management
