# Phase 4: Tapsigner NFC Card Manual Testing Guide

**Document Version**: 1.0  
**Last Updated**: November 6, 2025  
**Status**: Complete  
**Scope**: Physical NFC card testing procedures for Tapsigner integration

---

## Overview

This guide provides comprehensive step-by-step procedures for manual testing of Tapsigner NFC card workflows. These procedures are designed for non-technical testers and cover all critical user journeys with physical Tapsigner hardware.

**Note**: Automated E2E tests cover UI workflows without physical hardware. This guide focuses on real hardware testing scenarios.

---

## Prerequisites

### Hardware Requirements
- **Tapsigner NFC Card**: Coinkite Tapsigner with 6-digit PIN configured
- **NFC-Capable Device**: Android phone or iOS device with NFC support
- **Browser**: Chrome or Edge (Web NFC API support required)
- **HTTPS Connection**: Required for Web NFC API access

### Software Requirements
- Satnam.pub application running on HTTPS
- Feature flags enabled:
  - `VITE_TAPSIGNER_ENABLED=true`
  - `VITE_TAPSIGNER_LNBITS_ENABLED=true` (for wallet linking tests)
  - `VITE_TAPSIGNER_DEBUG=true` (for troubleshooting)

### Browser Compatibility
| Browser | Platform | NFC Support | Status |
|---------|----------|-------------|--------|
| Chrome | Android | ✅ Yes | Fully Supported |
| Edge | Android | ✅ Yes | Fully Supported |
| Safari | iOS | ⚠️ Limited | Partial Support |
| Firefox | Android | ❌ No | Not Supported |

---

## Test Scenario 1: Card Registration Flow

### Objective
Verify that a new Tapsigner card can be registered with the system and stored securely.

### Prerequisites
- Tapsigner card with known PIN (e.g., 123456)
- User logged into Satnam.pub
- Card not previously registered

### Steps

1. **Navigate to Setup**
   - Click "Settings" → "Security" → "Add Tapsigner Card"
   - Verify "Tapsigner Setup" modal appears
   - Expected: Modal shows "Scan Card" button

2. **Initiate Card Scan**
   - Click "Scan Card" button
   - Browser should request NFC permission
   - Expected: Permission dialog appears

3. **Grant NFC Permission**
   - Tap "Allow" on permission dialog
   - Expected: Scanning starts, UI shows "Waiting for card..."

4. **Tap Card to Device**
   - Hold Tapsigner card near NFC reader
   - Keep card steady for 2-3 seconds
   - Expected: Card detected within 10 seconds

5. **Verify Card Data**
   - Card ID should appear (e.g., "a1b2c3d4e5f6a7b8")
   - Public key should display (64-character hex)
   - Expected: No plaintext card UID visible in logs

6. **Enter PIN**
   - Modal prompts for 6-digit PIN
   - Enter card's PIN (e.g., 123456)
   - Expected: PIN field shows dots, not actual digits

7. **Verify PIN**
   - Click "Verify PIN" button
   - Expected: Success message appears

8. **Confirm Registration**
   - Review card details
   - Click "Register Card" button
   - Expected: Success notification, card added to list

### Validation Checklist
- [ ] Card ID is hashed in database (not plaintext)
- [ ] Public key stored correctly
- [ ] PIN not stored in database
- [ ] Operation logged in tapsigner_operations_log
- [ ] User receives confirmation notification
- [ ] No sensitive data in browser console logs

---

## Test Scenario 2: Card Verification with Challenge-Response

### Objective
Verify that challenge-response authentication works correctly for card verification.

### Prerequisites
- Registered Tapsigner card
- User logged in
- Card available for tapping

### Steps

1. **Navigate to Card Verification**
   - Go to Settings → Security → Registered Cards
   - Click "Verify" on registered card
   - Expected: Verification modal appears

2. **Initiate Challenge**
   - Click "Start Verification" button
   - System generates random challenge nonce
   - Expected: Challenge displayed (64-character hex)

3. **Tap Card for Signature**
   - Click "Tap Card to Sign Challenge"
   - Hold card near NFC reader
   - Expected: Card detected, signature generated

4. **Verify Signature**
   - System verifies ECDSA signature
   - Expected: "Verification Successful" message

5. **Check Audit Log**
   - Navigate to Settings → Security → Audit Log
   - Find verification entry
   - Expected: Entry shows timestamp, operation type, success status

### Validation Checklist
- [ ] Challenge nonce is random and unique
- [ ] Challenge expires after 5 minutes
- [ ] Signature verified using Web Crypto API
- [ ] Constant-time comparison used (no timing attacks)
- [ ] Audit log entry created
- [ ] No plaintext signature in logs

---

## Test Scenario 3: Event Signing with Physical Card

### Objective
Verify that Nostr events can be signed using the Tapsigner card.

### Prerequisites
- Registered Tapsigner card
- User logged in
- Card available for tapping

### Steps

1. **Navigate to Event Signing**
   - Go to Messages or Post creation
   - Click "Sign with Tapsigner"
   - Expected: Signing modal appears

2. **Review Event Details**
   - Event content displayed
   - Expected: Event hash shown (SHA-256)

3. **Tap Card to Sign**
   - Click "Tap Card to Sign Event"
   - Hold card near NFC reader
   - Expected: Card detected, signature generated

4. **Verify Signature**
   - System verifies ECDSA signature
   - Expected: "Event Signed Successfully" message

5. **Publish Event**
   - Click "Publish Event"
   - Expected: Event published to Nostr relays

### Validation Checklist
- [ ] Event hash calculated correctly
- [ ] ECDSA signature generated
- [ ] Signature verified before publishing
- [ ] Event published with correct signature
- [ ] Audit log entry created

---

## Test Scenario 4: Wallet Linking and Tap-to-Spend

### Objective
Verify that Tapsigner card can be linked to LNbits wallet for tap-to-spend functionality.

### Prerequisites
- Registered Tapsigner card
- LNbits wallet configured
- User logged in

### Steps

1. **Navigate to Wallet Linking**
   - Go to Settings → Payments → Link Tapsigner
   - Expected: Wallet linking modal appears

2. **Select Wallet**
   - Choose LNbits wallet from dropdown
   - Expected: Wallet details displayed

3. **Set Spend Limit**
   - Enter spend limit (e.g., 100,000 sats)
   - Expected: Input validated, amount displayed

4. **Enable Tap-to-Spend**
   - Toggle "Enable Tap-to-Spend" option
   - Expected: Option enabled

5. **Tap Card to Confirm**
   - Click "Tap Card to Confirm"
   - Hold card near NFC reader
   - Expected: Card detected, signature generated

6. **Verify Linking**
   - Success message appears
   - Expected: Card linked to wallet

### Validation Checklist
- [ ] Spend limit stored securely
- [ ] Tap-to-spend flag set correctly
- [ ] Card linked to wallet in database
- [ ] Audit log entry created
- [ ] User receives confirmation notification

---

## Test Scenario 5: Error Handling - Card Removed During Operation

### Objective
Verify graceful error handling when card is removed mid-operation.

### Prerequisites
- Registered Tapsigner card
- User logged in

### Steps

1. **Initiate Card Operation**
   - Start card verification or signing
   - Click "Tap Card"
   - Expected: Scanning starts

2. **Remove Card Prematurely**
   - Hold card near reader for 1 second
   - Remove card before operation completes
   - Expected: Error message appears

3. **Verify Error Message**
   - Error should be user-friendly
   - Expected: "Card removed - please try again"

4. **Retry Operation**
   - Click "Retry" button
   - Expected: Can retry without restarting flow

### Validation Checklist
- [ ] Error message is clear and actionable
- [ ] No sensitive data in error message
- [ ] Retry mechanism works
- [ ] Operation can be retried without data loss

---

## Test Scenario 6: Error Handling - PIN Failures

### Objective
Verify PIN rate limiting and lockout mechanism.

### Prerequisites
- Registered Tapsigner card
- User logged in

### Steps

1. **Initiate Card Operation**
   - Start card registration or verification
   - Expected: PIN entry modal appears

2. **Enter Wrong PIN**
   - Enter incorrect PIN (e.g., 000000)
   - Click "Verify PIN"
   - Expected: "Invalid PIN" error

3. **Attempt 2 and 3**
   - Repeat with different wrong PINs
   - Expected: Error count increases

4. **Verify Lockout**
   - After 3 failed attempts
   - Expected: "Card locked - try again in 15 minutes"

5. **Check Audit Log**
   - Navigate to audit log
   - Expected: Failed PIN attempts logged

### Validation Checklist
- [ ] PIN attempts tracked correctly
- [ ] Lockout enforced after 3 attempts
- [ ] Lockout duration is 15 minutes
- [ ] Failed attempts logged
- [ ] No plaintext PIN in logs

---

## Test Scenario 7: Error Handling - Timeout

### Objective
Verify timeout handling when card is not detected within time limit.

### Prerequisites
- User logged in
- Card not available

### Steps

1. **Initiate Card Scan**
   - Click "Scan Card"
   - Expected: Scanning starts

2. **Wait for Timeout**
   - Do not tap card
   - Wait 10+ seconds
   - Expected: Timeout error appears

3. **Verify Error Message**
   - Expected: "Card detection timeout - please try again"

4. **Retry**
   - Click "Retry" button
   - Expected: Can retry operation

### Validation Checklist
- [ ] Timeout occurs after 10 seconds
- [ ] Error message is clear
- [ ] Retry mechanism works
- [ ] No hanging requests

---

## Test Scenario 8: Browser Compatibility Detection

### Objective
Verify that browser compatibility is detected and appropriate messages shown.

### Prerequisites
- Satnam.pub application loaded

### Steps

1. **Test on Chrome/Edge (Android)**
   - Load application
   - Navigate to Tapsigner settings
   - Expected: Full functionality available

2. **Test on Safari (iOS)**
   - Load application
   - Navigate to Tapsigner settings
   - Expected: Warning message shown

3. **Test on Firefox (Android)**
   - Load application
   - Navigate to Tapsigner settings
   - Expected: "Not supported" message shown

4. **Verify Warning Content**
   - Warning should explain limitation
   - Expected: Suggestion to use Chrome/Edge

### Validation Checklist
- [ ] Browser detection works correctly
- [ ] Appropriate messages shown
- [ ] No errors on unsupported browsers
- [ ] User can still view card information

---

## Test Scenario 9: Feature Flag Behavior

### Objective
Verify that feature flags control Tapsigner functionality.

### Prerequisites
- Access to environment variables

### Steps

1. **Test with VITE_TAPSIGNER_ENABLED=true**
   - Tapsigner options visible
   - Expected: Full functionality

2. **Test with VITE_TAPSIGNER_ENABLED=false**
   - Tapsigner options hidden
   - Expected: "Feature not available" message

3. **Test with VITE_TAPSIGNER_LNBITS_ENABLED=false**
   - Wallet linking disabled
   - Expected: Wallet linking option hidden

### Validation Checklist
- [ ] Feature flags control visibility
- [ ] No errors when disabled
- [ ] Graceful degradation

---

## Test Scenario 10: Status Display and Card Management

### Objective
Verify that card status is displayed correctly and cards can be managed.

### Prerequisites
- One or more registered cards

### Steps

1. **View Card List**
   - Navigate to Settings → Security → Registered Cards
   - Expected: All cards listed with status

2. **Check Card Status**
   - Status should show: "Active", "Locked", or "Inactive"
   - Expected: Correct status displayed

3. **View Card Details**
   - Click card to view details
   - Expected: Card ID (hashed), public key, registration date

4. **Deregister Card**
   - Click "Remove Card" button
   - Confirm removal
   - Expected: Card removed from list

5. **Verify Removal**
   - Card no longer appears in list
   - Expected: Audit log entry created

### Validation Checklist
- [ ] Card status displayed correctly
- [ ] Card details shown securely
- [ ] Deregistration works
- [ ] Audit log entry created

---

## Troubleshooting Guide

### Issue: "Web NFC API not supported"
**Cause**: Browser doesn't support Web NFC API  
**Solution**: Use Chrome or Edge on Android

### Issue: "Card detection timeout"
**Cause**: Card not detected within 10 seconds  
**Solution**: Ensure card is NFC-enabled, try again

### Issue: "Invalid PIN"
**Cause**: Wrong PIN entered  
**Solution**: Verify PIN with card holder, try again

### Issue: "Card already registered"
**Cause**: Card already registered to user  
**Solution**: Use different card or deregister existing card

### Issue: "Permission denied"
**Cause**: NFC permission not granted  
**Solution**: Grant NFC permission in browser settings

---

## Security Validation Checklist

- [ ] No plaintext card UIDs in logs or database
- [ ] No plaintext PINs stored anywhere
- [ ] All card IDs hashed with per-user salt
- [ ] ECDSA signatures verified using Web Crypto API
- [ ] Constant-time comparison used for sensitive data
- [ ] Rate limiting enforced for PIN attempts
- [ ] All operations logged to audit trail
- [ ] Feature flags properly gated
- [ ] Error messages don't leak sensitive data
- [ ] HTTPS enforced for all operations

---

## Sign-Off

**Tested By**: ___________________  
**Date**: ___________________  
**Result**: ✅ Pass / ❌ Fail  
**Notes**: ___________________


