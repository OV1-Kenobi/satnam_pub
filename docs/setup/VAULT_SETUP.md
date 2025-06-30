# 🔐 Supabase Vault Setup Guide

This guide will help you set up secure credential management using Supabase Vault for production-ready deployments.

## Why Use Supabase Vault?

- **🔒 Encrypted at Rest**: All secrets are encrypted using industry-standard encryption
- **🛡️ Access Control**: Only service role can access secrets
- **📝 Audit Trail**: All secret access is logged
- **🚀 Production Ready**: No hardcoded secrets in environment files
- **🔄 Easy Rotation**: Secrets can be updated without code changes

## Prerequisites

1. **Supabase Project**: You need an active Supabase project
2. **Project Unpaused**: Make sure your Supabase project is not paused
3. **Vault Extension**: The `supabase_vault` extension must be enabled

## Step-by-Step Setup

### 1. Unpause Your Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Find your project and click **"Resume"** if it's paused
3. Wait for the project to fully start (status should be green)

### 2. Enable Vault Extension

1. In your Supabase dashboard, go to **Database** → **Extensions**
2. Search for "supabase_vault" and enable it
3. Or run this SQL in your SQL Editor:
   ```sql
   CREATE EXTENSION IF NOT EXISTS supabase_vault;
   ```

### 3. Get Your Supabase Credentials

1. In Supabase dashboard, go to **Settings** → **API**
2. Copy these values:
   - **Project URL** (e.g., `https://abcdefgh.supabase.co`)
   - **anon public key** (starts with `eyJ`)
   - **service_role secret key** (starts with `eyJ`)

### 4. Update Your Environment File

Edit your `.env.local` file and replace the placeholder values:

```env
# Replace these with your actual Supabase credentials
SUPABASE_URL=https://your-actual-project-id.supabase.co
SUPABASE_ANON_KEY=your_actual_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_actual_service_role_key_here

# Frontend config (same values)
NEXT_PUBLIC_SUPABASE_URL=https://your-actual-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_actual_anon_key_here
```

### 5. Run the Vault Setup Script

```bash
npm run vault:setup
```

This interactive script will:

- ✅ Check your Supabase connection
- ✅ Verify Vault extension is enabled
- 🔐 Generate secure random secrets for production
- 📦 Store all secrets in encrypted Vault
- 🧹 Guide you to clean up environment variables

### 6. Update Your Server Code (Optional)

The server will automatically use Vault secrets when available. You can also use the Vault utilities directly:

```typescript
import { getJwtSecret, getPrivacyMasterKey } from "../lib/vault-config.js";

// Secrets are automatically retrieved from Vault with fallback to env vars
const jwtSecret = await getJwtSecret();
const masterKey = await getPrivacyMasterKey();
```

## What Gets Stored in Vault

The setup script stores these critical secrets:

| Secret Name             | Description            | Used For                  |
| ----------------------- | ---------------------- | ------------------------- |
| `jwt_secret`            | JWT signing key        | Authentication tokens     |
| `privacy_master_key`    | Privacy encryption key | Sensitive data encryption |
| `csrf_secret`           | CSRF protection        | Request validation        |
| `master_encryption_key` | Master encryption key  | General encryption        |

## Security Benefits

### Before (Environment Variables)

```env
# ❌ Visible in plain text
JWT_SECRET=dev-jwt-secret-key-change-in-production-32-chars-minimum
PRIVACY_MASTER_KEY=dev-privacy-master-key-change-in-production-32-chars-minimum
```

### After (Vault)

```env
# ✅ Only connection info needed
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
# Secrets are encrypted in Vault
```

## Production Deployment

### Environment Variables Needed

```env
# Only these are needed in production
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NODE_ENV=production
```

### Deployment Platforms

**Vercel:**

```bash
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_ROLE_KEY
```

**Railway:**

```bash
railway variables set SUPABASE_URL=https://your-project.supabase.co
railway variables set SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

**Docker:**

```dockerfile
ENV SUPABASE_URL=https://your-project.supabase.co
ENV SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## Troubleshooting

### "Vault extension not enabled"

```sql
-- Run this in your Supabase SQL Editor
CREATE EXTENSION IF NOT EXISTS supabase_vault;
```

### "Connection timeout"

- Make sure your Supabase project is unpaused
- Check your internet connection
- Verify the SUPABASE_URL is correct

### "Permission denied"

- Make sure you're using the SERVICE_ROLE_KEY, not the anon key
- The service role key should start with `eyJ` and be much longer

### "Secret not found"

- Run `npm run vault:setup` to initialize secrets
- Check that the Vault extension is properly enabled

## Advanced Usage

### Custom Secrets

```typescript
import { vaultConfig } from "../lib/vault-config.js";

// Store a custom secret
await vaultConfig.storeSecret("my_api_key", "secret-value");

// Retrieve it
const apiKey = await vaultConfig.getSecret("my_api_key");
```

### Health Check

```typescript
import { vaultConfig } from "../lib/vault-config.js";

const isHealthy = await vaultConfig.healthCheck();
console.log("Vault status:", isHealthy ? "OK" : "Error");
```

## Security Best Practices

1. **🔄 Rotate Secrets Regularly**: Update secrets in Vault periodically
2. **📝 Audit Access**: Monitor who accesses secrets in Supabase logs
3. **🚫 Never Log Secrets**: Secrets should never appear in application logs
4. **🔒 Limit Access**: Only service role should access Vault
5. **💾 Backup Strategy**: Ensure you have a way to recover secrets

## Next Steps

After setting up Vault:

1. ✅ Test your application with `npm run server:dev`
2. ✅ Verify secrets are loaded from Vault (check logs)
3. ✅ Remove placeholder values from `.env.local`
4. ✅ Deploy to production with minimal environment variables
5. ✅ Set up secret rotation schedule

---

**🎉 Congratulations!** Your application now uses enterprise-grade secret management with Supabase Vault.
