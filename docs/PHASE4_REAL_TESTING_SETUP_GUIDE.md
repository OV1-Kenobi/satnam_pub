# Phase 4: Real Testing Setup Guide

**Date**: November 5, 2025

**Objective**: Comprehensive guide for setting up real integration testing infrastructure (NO MOCKING)

---

## 🎯 TESTING PHILOSOPHY

**Real Testing Only**: All tests use actual implementations, real API calls, real databases, and real browser automation. Mocking is avoided except for unavoidable hardware-level APIs.

**Why Real Testing**:
- Catches integration issues that mocking hides
- Validates actual production behavior
- Ensures code works with real Netlify Functions
- Prepares for physical NFC card testing
- Reduces production bugs and regressions

---

## 🏗️ INFRASTRUCTURE SETUP

### **1. Local Netlify Functions Server**

**Start Local Server**:
```bash
# Install Netlify CLI if not already installed
npm install -g netlify-cli

# Start local development server
netlify dev

# Server runs on http://localhost:8888
# Functions available at http://localhost:8888/.netlify/functions/*
```

**Environment Variables**:
```bash
# Create .env.test file for test environment
VITE_SUPABASE_URL=https://test-project.supabase.co
VITE_SUPABASE_KEY=test-anon-key
VITE_TAPSIGNER_ENABLED=true
VITE_TAPSIGNER_DEBUG=true
VITE_LNBITS_INTEGRATION_ENABLED=true
VITE_PLATFORM_LIGHTNING_DOMAIN=test.satnam.pub
```

**Load Test Environment**:
```bash
# In test files
import dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });
```

### **2. Test Database Setup**

**Create Test Database**:
```bash
# Use separate Supabase project for testing
# Project URL: https://test-project.supabase.co
# Anon Key: test-anon-key
# Service Role Key: test-service-role-key
```

**Database Initialization**:
```typescript
// tests/setup/database.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_KEY!
);

export async function setupTestDatabase() {
  // Run migrations
  // Clear test data
  // Initialize test fixtures
}

export async function cleanupTestDatabase() {
  // Delete test data
  // Reset sequences
  // Clean up transactions
}
```

**Test Isolation**:
```typescript
// Use transactions for test isolation
beforeEach(async () => {
  await setupTestDatabase();
});

afterEach(async () => {
  await cleanupTestDatabase();
});
```

### **3. Real API Testing**

**Test Netlify Functions**:
```typescript
// tests/integration/tapsigner-api.test.ts
describe('Tapsigner API', () => {
  it('should register card via real API', async () => {
    const response = await fetch(
      'http://localhost:8888/.netlify/functions/tapsigner-unified',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testJWT}`,
        },
        body: JSON.stringify({
          action: 'register',
          cardId: 'test-card-123',
          publicKey: 'test-pubkey',
        }),
      }
    );

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.cardId).toBe('test-card-123');
  });
});
```

**JWT Token Generation**:
```typescript
// tests/utils/jwt.ts
import jwt from 'jsonwebtoken';

export function generateTestJWT(userId: string) {
  return jwt.sign(
    { sub: userId, iat: Date.now() / 1000 },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' }
  );
}
```

---

## 🌐 WEB NFC API TESTING

### **Automated Testing with Browser Automation**

**Playwright Setup**:
```typescript
// tests/e2e/nfc-reader.spec.ts
import { test, expect } from '@playwright/test';

test('should detect NFC card', async ({ page }) => {
  // Navigate to app
  await page.goto('http://localhost:5173');

  // Simulate NFC detection
  await page.evaluate(() => {
    // Trigger NFC reader
    const event = new NDEFReadingEvent('reading', {
      serialNumber: 'test-serial',
      message: [
        {
          records: [
            {
              recordType: 'text',
              data: 'test-card-data',
            },
          ],
        },
      ],
    });
    navigator.nfc?.dispatchEvent(event);
  });

  // Verify card detected
  await expect(page.locator('[data-testid="card-detected"]')).toBeVisible();
});
```

**NFC Simulation**:
```typescript
// tests/utils/nfc-simulator.ts
export class NFCSimulator {
  static async simulateCardRead(cardData: CardData) {
    const event = new NDEFReadingEvent('reading', {
      serialNumber: cardData.cardId,
      message: [
        {
          records: [
            {
              recordType: 'text',
              data: JSON.stringify(cardData),
            },
          ],
        },
      ],
    });
    navigator.nfc?.dispatchEvent(event);
  }

  static async simulateTimeout() {
    const event = new Event('readingerror');
    navigator.nfc?.dispatchEvent(event);
  }
}
```

### **Manual Physical Testing**

**Test Procedure**:
1. **Device**: Android/iOS with NFC capability
2. **Browser**: Chrome (Android), Safari (iOS)
3. **Test Card**: Real Tapsigner card
4. **Steps**:
   - Open app in browser
   - Navigate to sign-in page
   - Tap Tapsigner card to device
   - Verify card detected
   - Enter PIN
   - Verify authentication successful

**Test Scenarios**:
- ✅ Successful card read
- ✅ Timeout (no card detected)
- ✅ Wrong PIN (3 attempts)
- ✅ Card locked (after 3 failed attempts)
- ✅ Invalid card data
- ✅ Network error during verification

---

## 🧪 TEST EXECUTION

### **Unit Tests**:
```bash
npm run test:unit

# With coverage
npm run test:unit -- --coverage
```

### **Integration Tests**:
```bash
# Start local Netlify Functions first
netlify dev &

# Run integration tests
npm run test:integration

# Wait for server to start
sleep 5 && npm run test:integration
```

### **E2E Tests**:
```bash
# Start app and Netlify Functions
npm run dev &
netlify dev &

# Run E2E tests
npm run test:e2e

# With headed browser
npm run test:e2e -- --headed
```

### **All Tests**:
```bash
npm run test

# With coverage report
npm run test -- --coverage
```

---

## 📊 COVERAGE REQUIREMENTS

**Target**: >80% code coverage

**Coverage by Component**:
- Libraries (nfc-reader, card-protocol): 85%+
- Hooks (useTapsigner, useTapsignerLnbits): 80%+
- Components (TapsignerAuthModal, etc.): 80%+
- API endpoints: 85%+

**Generate Coverage Report**:
```bash
npm run test -- --coverage

# View HTML report
open coverage/index.html
```

---

## 🔍 DEBUGGING TESTS

**Enable Debug Logging**:
```bash
# Set debug environment variable
DEBUG=* npm run test:integration

# Or in test file
process.env.DEBUG = '*';
```

**Inspect Network Requests**:
```typescript
// Intercept fetch calls
global.fetch = jest.fn((url, options) => {
  console.log('API Call:', url, options);
  return originalFetch(url, options);
});
```

**Browser DevTools**:
```bash
# Run E2E tests with headed browser
npm run test:e2e -- --headed

# Pause on breakpoint
await page.pause();
```

---

## ✅ QUALITY GATES

Before merging code:
1. ✅ All unit tests pass (100%)
2. ✅ All integration tests pass (100%)
3. ✅ All E2E tests pass (100%)
4. ✅ Code coverage >80%
5. ✅ 0 TypeScript errors
6. ✅ 0 security vulnerabilities

---

## 🚀 CI/CD INTEGRATION

**GitHub Actions Workflow**:
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run test:unit
      - run: npm run test:integration
      - run: npm run test:e2e
      - uses: codecov/codecov-action@v3
```

---

**Status**: ✅ READY FOR IMPLEMENTATION

**Next**: Begin Phase 4 Task 4.1 (Unit Tests) with real testing infrastructure

