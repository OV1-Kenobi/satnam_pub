# Development Tools and Test Components

This directory contains components that are **ONLY** for development and testing purposes.

## Feature Flag Gating

All components in this directory are gated behind the `VITE_ENABLE_DEV_TOOLS` feature flag.

**Production:** `VITE_ENABLE_DEV_TOOLS=false` (default)  
**Development:** `VITE_ENABLE_DEV_TOOLS=true`

## Components

### Test Components
- `NFCAuthTest.tsx` - NFC authentication testing interface
- `EmergencyRecoveryTest.tsx` - Emergency recovery workflow testing
- `PaymentAutomationTest.tsx` - Payment automation testing
- `NWCIntegrationTest.tsx` - NWC integration testing
- `AuthTestingPanel.tsx` - Authentication testing panel
- `ApiTestPage.tsx` - API endpoint testing
- `ApiDebug.tsx` - API debugging interface

### Demo Components
- `PrivacyFirstAuthDemo.tsx` - Privacy-first authentication demo
- `SmartPaymentModalDemo.tsx` - Smart payment modal demo
- `FamilyWalletDemo.tsx` - Family wallet demo

## Usage

These components should NEVER be imported in production code without feature flag checks.

Example:
```typescript
if (import.meta.env.VITE_ENABLE_DEV_TOOLS === 'true') {
  const { NFCAuthTest } = await import('./__dev__/NFCAuthTest');
  // Use component
}
```

## Deployment

The `.netlifyignore` file should exclude this directory from production builds.

