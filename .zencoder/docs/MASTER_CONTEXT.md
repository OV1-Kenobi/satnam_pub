# Satnam.pub Bitcoin-Only Family Banking Platform

## 🚨 CRITICAL: READ BEFORE MAKING ANY CHANGES

This document serves as the master context for all development work on the Satnam.pub sovereign family banking platform. **NEVER deviate from these protocols without explicit approval.**

---

## Architecture Requirements

### Browser-Based Serverless Environment

- **ONLY** use browser-compatible APIs - Web Crypto API, fetch, localStorage
- **NO** Node.js modules: crypto, events, fs, path, stream, util
- **NO** polyfills or Node.js compatibility layers
- All code must run in Bolt.new's serverless browser environment
- Use TypeScript (.ts/.tsx) for components, JavaScript (.js) for API routes

### File Structure Compliance

```
src/
├── components/           # React components (.tsx)
├── lib/                 # Utility functions (.ts)
├── types/               # TypeScript definitions (.ts)
├── hooks/               # React hooks (.ts)
api/                     # Serverless functions (.js)
```

---

## Security & Privacy Protocols

### Privacy-First Architecture

- **NEVER** log user data, transaction details, or family information
- **NO** external logging services or third-party analytics
- Use Supabase Vault for all sensitive credentials
- Implement data minimization - collect only essential information
- All communications must use NIP-59 Gift Wrapped messaging

### Encryption Standards

- Use Web Crypto API for all cryptographic operations
- AES-256-GCM for data encryption
- Store secrets in Supabase Vault, **NOT** .env files
- Implement end-to-end encryption for all family communications

### Authentication Layers

1. **NIP-07** Browser extension signing
2. **NFC + PIN** Physical device authentication (future)
3. **Nostr nsec** Direct key signing
4. **OTP System** Existing backup authentication

---

## Bitcoin-Only Requirements

### Lightning Network Stack

- **Voltage** - Enterprise Lightning infrastructure
- **PhoenixD** - Mobile wallet integration
- **LNProxy** - Privacy routing for all payments
- **Breez** - SDK integration (development)

### Fedimint Integration

- Family federation with 2-of-3 guardian approval
- eCash issuance for child allowances
- Guardian consensus for large transactions
- **Currently in demo mode** - production implementation pending

### Cashu eCash Implementation

- **Bearer Instruments**: Tokens, Nuts, Proofs
- Multi-nut payments for privacy
- Nut swapping for denomination optimization
- Integration with Fedimint for family treasury

---

## Nostr Protocol Implementation

### Required NIPs

- **NIP-01** Basic protocol
- **NIP-04** Encrypted direct messages (fallback)
- **NIP-05** DNS-based verification (username@satnam.pub)
- **NIP-07** Browser extension signing
- **NIP-59** Gift Wrapped messages (primary)
- **NIP-65** Relay list metadata

### Custom Family Banking NIPs

- Family member roles and permissions
- Guardian approval workflows
- Lightning payment coordination
- Treasury management events

---

## Development Protocols

### TypeScript Standards

- Always define proper interfaces for all data structures
- Use strict type checking
- Export types from `src/types/` directory
- Handle undefined/null states explicitly

### Error Prevention

```typescript
// ✅ CORRECT: Proper type definitions
interface FamilyMember {
  id: string;
  npub: string;
  username: string;
  role: 'parent' | 'child' | 'guardian';
  spendingLimits?: {
    daily: number;
    weekly: number;
    requiresApproval: number;
  };
}

// ❌ WRONG: Any types or missing definitions
const member: any = {...}
```

### API Route Structure

```javascript
// ✅ CORRECT: Browser-compatible API route
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    // Use fetch for external APIs
    const response = await fetch("https://api.voltage.cloud/...");
    const data = await response.json();

    res.status(200).json({ success: true, data });
  } catch (error) {
    // Log only non-sensitive error info
    console.error("API error:", error.message);
    res.status(500).json({ success: false, error: "Internal error" });
  }
}
```

---

## Change Management Rules

### ❌ NEVER Do These Without Explicit Approval

- Delete existing components or files
- Change authentication flows
- Modify database schemas
- Add external dependencies
- Change API endpoint structures
- Remove existing functionality

### ✅ Always Do These

- Verify TypeScript compilation with `npm run type-check`
- Test components render without errors
- Maintain existing styling and UI patterns
- Preserve all Bitcoin-only integrations
- Keep privacy-first protocols intact

### Before Making Changes

1. Ask for clarification if requirements are unclear
2. Propose the change before implementing
3. Show code examples for complex modifications
4. Verify compatibility with existing systems

---

## Testing Requirements

### Verification Steps

```bash
# Always run these after changes
npm run type-check    # TypeScript compilation
npm run build        # Production build test
npm run dev          # Development server test
```

### Component Testing

- Verify all imports resolve correctly
- Test with mock data for demo functionality
- Ensure responsive design works
- Validate form inputs and error states

---

## Integration Points

### Existing Systems to Preserve

- Supabase database and authentication
- Voltage Lightning node integration
- Gift Wrapped messaging system
- Family dashboard components
- NIP-05 identity verification
- Guardian approval workflows

### Mock vs Production States

- **Currently Mock**: Fedimint federation, PhoenixD wallets
- **Production Ready**: Nostr messaging, Lightning addresses, Voltage integration
- **Future Implementation**: NFC authentication, full Cashu integration

---

## Emergency Protocols

### If Something Breaks

1. **Stop immediately** - don't make additional changes
2. Report the specific error with code context
3. Wait for approval before attempting fixes
4. Use git rollback if necessary: `git checkout HEAD~1`

### Rollback Commands

```bash
# Verify current state
git log --oneline -5

# Check differences before merge
git diff --name-only

# Safe rollback to previous commit
git checkout HEAD~1

# Verify rollback worked
ls -la src/components/
```

---

## Success Metrics

### Code Quality Standards

- ✅ Zero TypeScript compilation errors
- ✅ All components render without console errors
- ✅ Responsive design works on mobile/desktop
- ✅ Privacy protocols maintained throughout
- ✅ Bitcoin-only architecture preserved

### Security Compliance

- ✅ No sensitive data in logs or console
- ✅ All API calls use proper authentication
- ✅ Encryption implemented for sensitive data
- ✅ User data sovereignty maintained
- ✅ Self-custody principles upheld

---

## 🎯 Remember

> This platform represents months of sophisticated development. Every change must enhance the existing Bitcoin-only family banking infrastructure while maintaining uncompromising privacy standards and browser compatibility.

**When in doubt, ASK before implementing. Preservation of existing functionality is more important than adding new features.**

---

_Last Updated: December 2024_
_Document Version: 1.0_
