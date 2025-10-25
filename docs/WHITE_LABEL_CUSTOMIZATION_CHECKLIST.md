# White-Label Customization Checklist
**Step-by-Step Guide to Fork and Rebrand Satnam.pub**

**Estimated Time:** 4-8 hours (with AI assistance)  
**Difficulty:** Intermediate  
**Prerequisites:** Git, Node.js 22+, npm, basic command line skills

---

## Phase 1: Fork & Setup (30 minutes)

### Step 1.1: Fork the Repository
```bash
# Fork on GitHub (click "Fork" button)
# Then clone your fork
git clone https://github.com/YOUR_USERNAME/YOUR_FORK_NAME.git
cd YOUR_FORK_NAME

# Install dependencies
npm ci --legacy-peer-deps
```

### Step 1.2: Create Environment Files
```bash
# Copy example files
cp .env.example .env
cp .env.example .env.local

# Edit .env.local with your values (see Phase 3 for details)
```

### Step 1.3: Test the Build
```bash
# Verify everything works before making changes
npm run build
npm run preview
```

**✅ Checkpoint:** Build succeeds, preview server runs at http://localhost:4173

---

## Phase 2: Branding Changes (50 minutes)

### Step 2.1: App Name & Metadata (10 minutes)

**File:** `package.json`
```json
{
  "name": "your-app-name",  // Change from "sovereign-bitcoin-identity-forge"
  "version": "0.1.0",
  ...
}
```

**File:** `public/manifest.webmanifest`
```json
{
  "name": "YourApp.com",           // Change from "Satnam.pub"
  "short_name": "YourApp",         // Change from "Satnam"
  "description": "Your description", // Customize
  ...
}
```

**File:** `capacitor.config.ts`
```typescript
const config: CapacitorConfig = {
  appId: 'app.yourdomain.com',  // Change from 'app.satnam.pub'
  appName: 'YourApp',           // Change from 'Satnam'
  ...
};
```

**File:** `mobile/android/app/src/main/res/values/strings.xml`
```xml
<string name="app_name">YourApp</string>
<string name="package_name">app.yourdomain.com</string>
<string name="custom_url_scheme">app.yourdomain.com</string>
```

**File:** `mobile/android/app/build.gradle`
```gradle
android {
    namespace "app.yourdomain.com"  // Change from "app.satnam.pub"
    defaultConfig {
        applicationId "app.yourdomain.com"  // Change from "app.satnam.pub"
        ...
    }
}
```

---

### Step 2.2: Logo Assets (5 minutes)

Replace these files with your own logos:
- `/public/SatNam-logo.png` (main logo)
- `/public/SatNam-logo-192.png` (PWA icon 192x192)
- `/public/SatNam-logo-512.png` (PWA icon 512x512)
- `/public/favicon.png` (browser favicon 64x64)

**Tip:** Keep the same filenames to avoid updating references, or use find-replace to update all references.

---

### Step 2.3: Domain Configuration (15 minutes)

**File:** `src/config/env.client.ts` (line 280)
```typescript
platformLightning:
  getEnvVar("VITE_PLATFORM_LIGHTNING_DOMAIN") || "my.yourdomain.com",  // Change fallback
```

**File:** `src/config/domain.client.ts` (line 15)
```typescript
export const resolvePlatformLightningDomain = (): string =>
  clientConfig.domains.platformLightning || 'my.yourdomain.com';  // Change fallback
```

**File:** `config/index.ts` (line 589)
```typescript
export const nip05Config: Nip05Config = {
  domain: getEnvVar("NIP05_DOMAIN") || "yourdomain.com",  // Change fallback
  allowedDomains: (getEnvVar("NIP05_ALLOWED_DOMAINS") || "yourdomain.com")  // Change fallback
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};
```

**File:** `config/index.ts` (line 599)
```typescript
export const familyConfig: FamilyConfig = {
  domain: getEnvVar("FAMILY_DOMAIN") || "yourdomain.com",  // Change fallback
  ...
};
```

**File:** `config/index.ts` (line 1178)
```typescript
export const app = { baseUrl: "https://yourdomain.com" };  // Change from "https://satnam.pub"
```

**File:** `api/lnurl/[username].js` (lines 13, 17)
```javascript
return "https://api.yourdomain.com";  // Change from "https://api.satnam.pub"
...
return getEnvVar("LIGHTNING_ADDRESS_DOMAIN") || "yourdomain.com";  // Change fallback
```

**File:** `config/config.js` (lines 72, 78, 82)
```javascript
baseUrl: getEnvVar("VITE_API_BASE_URL", "https://api.yourdomain.com"),  // Change fallback
...
verificationEndpoint: getEnvVar(
  "VITE_NIP05_VERIFICATION_ENDPOINT",
  "https://api.yourdomain.com/.well-known/nostr.json"  // Change fallback
),
allowedDomains: getEnvVar(
  "VITE_NIP05_ALLOWED_DOMAINS",
  "yourdomain.com"  // Change fallback
).split(","),
```

---

### Step 2.4: Auth Token Key (5 minutes)

**File:** `config/index.ts` (line 498)
```typescript
export const authConfig: AuthConfig = {
  tokenStorageKey: "yourapp_auth_token",  // Change from "satnam_auth_token"
  ...
};
```

**File:** `src/lib/browser-config.ts` (line 35)
```typescript
export const authConfig = {
  tokenStorageKey: "yourapp_auth_token",  // Change from "satnam_auth_token"
  ...
};
```

**File:** `src/lib/auth/client-session-vault.ts` (line 44)
```typescript
localStorage.setItem("yourapp.vault.config", JSON.stringify(persisted));  // Change from "satnam.vault.config"
```

**File:** `src/lib/auth/client-session-vault.ts` (line 51)
```typescript
const raw = localStorage.getItem("yourapp.vault.config");  // Change from "satnam.vault.config"
```

---

### Step 2.5: Support Contact (5 minutes)

**Find and replace across all files:**
```bash
# Use your IDE's find-replace feature
Find: support@satnam.pub
Replace: support@yourdomain.com
```

**Files to check:**
- `docs/PKARR_USER_GUIDE.md` (line 332)
- `README.md` (line 864)
- Any error messages or help text

---

### Step 2.6: UI Text & Branding (10 minutes)

**File:** `src/components/shared/Navigation.tsx` (line 97)
```tsx
<span className="text-white text-xl font-bold">YourApp.com</span>  // Change from "Satnam.pub"
```

**File:** `src/components/SignInModal.tsx` (line 591)
```tsx
<h2 className="text-3xl font-bold text-white mb-2">Welcome to YourApp.com</h2>  // Change from "Welcome to Satnam.pub"
```

**Find and replace across all files:**
```bash
# Use your IDE's find-replace feature
Find: Satnam.pub
Replace: YourApp.com

Find: SatNam.Pub
Replace: YourApp

Find: satnam.pub
Replace: yourdomain.com
```

**⚠️ Warning:** Review each replacement to avoid breaking code (e.g., don't replace in comments or URLs you don't control).

---

## Phase 3: Infrastructure Setup (3 hours)

### Step 3.1: Netlify Deployment (20 minutes)

1. **Create Netlify Site**
   - Go to https://app.netlify.com
   - Click "Add new site" → "Import an existing project"
   - Connect your GitHub fork
   - Build settings:
     - Build command: `npm ci --legacy-peer-deps --include=dev && npm run build`
     - Publish directory: `dist`
     - Node version: `22.16.0`

2. **Set Environment Variables**
   - Go to Site settings → Environment variables
   - Add all variables from `.env.example` (see Step 3.5 below)

3. **Configure Custom Domain**
   - Go to Domain management → Add custom domain
   - Follow DNS setup instructions

---

### Step 3.2: Supabase Setup (30 minutes)

1. **Create Supabase Project**
   - Go to https://supabase.com
   - Click "New project"
   - Choose region, set database password

2. **Run Migrations**
   - Go to SQL Editor
   - Copy contents of `database/migrations/` files (in order)
   - Execute each migration

3. **Enable RLS Policies**
   - Verify Row Level Security is enabled on all tables
   - Check policies in SQL Editor

4. **Get API Keys**
   - Go to Project Settings → API
   - Copy `URL` and `anon public` key
   - Add to Netlify environment variables:
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`
     - `SUPABASE_URL`
     - `SUPABASE_ANON_KEY`

---

### Step 3.3: LNbits Setup (45 minutes) - OPTIONAL

**Option A: Self-Hosted (VPS)**
1. Rent a VPS (Lunanode, Digital Ocean, etc.)
2. Install LNbits: https://github.com/lnbits/lnbits
3. Configure Phoenixd backend
4. Get admin key from LNbits UI

**Option B: Voltage.cloud**
1. Sign up at https://voltage.cloud
2. Create LNbits instance
3. Get admin key from dashboard

**Environment Variables:**
- `LNBITS_BASE_URL` (e.g., `https://lnbits.yourdomain.com`)
- `LNBITS_ADMIN_KEY` (from LNbits admin panel)
- `VITE_LNBITS_BASE_URL` (same as `LNBITS_BASE_URL`)
- `VITE_LNBITS_INTEGRATION_ENABLED=true`

---

### Step 3.4: Phoenixd Setup (60 minutes) - OPTIONAL

1. **Rent a VPS** (2GB RAM minimum)
2. **Install Phoenixd:**
   ```bash
   # Follow official guide: https://phoenix.acinq.co/server
   wget https://github.com/ACINQ/phoenixd/releases/latest/download/phoenixd-linux-x64
   chmod +x phoenixd-linux-x64
   ./phoenixd-linux-x64 --chain=mainnet
   ```

3. **Get API Credentials:**
   - API URL: `http://YOUR_VPS_IP:9740`
   - API Password: Found in `~/.phoenix/phoenix.conf`

4. **Environment Variables:**
   - `PHOENIXD_API_URL`
   - `PHOENIXD_API_PASSWORD`

---

### Step 3.5: Environment Variables Checklist (15 minutes)

**Required (Minimum Viable Deployment):**
```bash
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Security
DUID_SERVER_SECRET=your-random-64-char-hex-string
JWT_SECRET=your-random-secret-key

# Domains
VITE_PLATFORM_LIGHTNING_DOMAIN=my.yourdomain.com
NIP05_DOMAIN=yourdomain.com
NIP05_ALLOWED_DOMAINS=yourdomain.com
FAMILY_DOMAIN=yourdomain.com

# Nostr
NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol
VITE_NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol
VITE_NOSTR_RELAY_URL=wss://relay.damus.io
```

**Optional (Feature-Specific):**
```bash
# LNbits (if using)
LNBITS_BASE_URL=https://lnbits.yourdomain.com
LNBITS_ADMIN_KEY=your-admin-key
VITE_LNBITS_BASE_URL=https://lnbits.yourdomain.com
VITE_LNBITS_INTEGRATION_ENABLED=true

# Phoenixd (if using)
PHOENIXD_API_URL=http://your-vps-ip:9740
PHOENIXD_API_PASSWORD=your-phoenixd-password

# Feature Flags (enable as needed)
VITE_PKARR_ENABLED=false
VITE_HYBRID_IDENTITY_ENABLED=false
VITE_ENABLE_AMBER_SIGNING=false
VITE_WEBAUTHN_ENABLED=false
VITE_ENABLE_NFC_MFA=false
VITE_PAYMENT_AUTOMATION_ENABLED=false
VITE_FROST_SIGNING_ENABLED=false
VITE_FAMILY_FEDERATION_ENABLED=true
```

---

## Phase 4: Testing & Verification (1 hour)

### Step 4.1: Local Testing
```bash
# Build and preview
npm run build
npm run preview

# Test in browser at http://localhost:4173
# Verify:
# - Logo appears correctly
# - App name is correct
# - Sign-in flow works
# - No console errors
```

### Step 4.2: Netlify Preview
```bash
# Push to GitHub
git add .
git commit -m "White-label customization for YourApp"
git push origin main

# Netlify will auto-deploy
# Check deploy logs for errors
# Test preview URL
```

### Step 4.3: Production Deployment
```bash
# If preview looks good, promote to production
# In Netlify UI: Deploys → Click preview → "Publish deploy"

# Test production URL
# Verify:
# - HTTPS works
# - Custom domain resolves
# - All features work
# - No mixed content warnings
```

---

## Phase 5: Documentation Updates (2 hours) - OPTIONAL

### Step 5.1: Update README.md
- Replace all "Satnam.pub" references
- Update screenshots (if any)
- Update support contact
- Update repository links

### Step 5.2: Update docs/ Directory
```bash
# Find and replace across all docs
Find: satnam.pub
Replace: yourdomain.com

Find: Satnam.pub
Replace: YourApp.com

Find: support@satnam.pub
Replace: support@yourdomain.com
```

---

## Troubleshooting

### Build Fails
- Check Node.js version: `node -v` (should be 22.16.0+)
- Clear cache: `rm -rf node_modules/.vite && npm run build`
- Check for TypeScript errors: `npm run type-check`

### White Screen in Production
- Check browser console for errors
- Verify all `VITE_*` environment variables are set in Netlify
- Check Netlify function logs for errors

### Authentication Not Working
- Verify `DUID_SERVER_SECRET` and `JWT_SECRET` are set
- Check Supabase RLS policies are enabled
- Verify `SUPABASE_SERVICE_ROLE_KEY` is correct

### Lightning Payments Not Working
- Verify LNbits/Phoenixd is running and accessible
- Check API keys are correct
- Test API endpoints manually with curl

---

## Success Checklist

- [ ] App builds without errors
- [ ] Logo and branding are correct
- [ ] Custom domain works
- [ ] Sign-in/sign-up flow works
- [ ] NIP-05 verification works (`username@yourdomain.com`)
- [ ] Messaging works (send/receive DMs)
- [ ] Lightning payments work (if enabled)
- [ ] All feature flags work as expected
- [ ] No console errors in production
- [ ] Documentation updated (if applicable)

---

## Next Steps

1. **Test with real users** - Invite a small group to test
2. **Monitor errors** - Set up error tracking (Sentry, etc.)
3. **Backup database** - Schedule regular Supabase backups
4. **Plan updates** - Watch upstream repo for security patches

**Questions?** See `docs/WHITE_LABEL_REUSABILITY_ASSESSMENT.md` for technical details.


