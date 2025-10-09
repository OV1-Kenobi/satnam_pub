## NFC Multi-Function Programming Flow (Option B - Web NFC)

### Overview

This document outlines the Android Web NFC-based approach for programming multi-function NTAG424 DNA cards in Satnam. Payment and SDM are still provisioned via the Boltcard Programming app. Satnam programs additional functions (Auth, FROST signing pointer, Nostr metadata) via Web NFC on Android and validates server-side using JWT and RLS.

- Web NFC: Chrome/Edge on Android only
- PIN: Stored server-side (PBKDF2/SHA-512 + AES-256-GCM), not written to tag
- Identity & Security: Zero-knowledge; no plaintext secrets on card or logs

### File Allocation Summary

- File 01 (32B): Payment reference (16B) + HMAC-SHA256 signature (16B) — written by Satnam when needed
- File 02 (32B): Auth token hash SHA-256(authKeyHash + cardUid) — Satnam Web NFC
- File 03 (32B): FROST share pointer UUID(16B) + nonce(16B) — Satnam Web NFC
- File 04 (32B): NIP-05 identifier (plaintext, up to 28B) + reserved (4B) — Satnam Web NFC

### Programming Sequence (example)

```ts
// Step 1: User sets PIN (server-side storage)
await fetch("/.netlify/functions/lnbits-set-boltcard-pin", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ cardId, pin: "123456" }),
});

// Step 2: Enable signing (server-side DB updates)
await fetch("/.netlify/functions/nfc-enable-signing", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    cardId,
    shareType: "individual",
    signingType: "both",
    encryptedShard: {
      /* ... */
    },
    nip05: "alice@satnam.pub",
  }),
});

// Step 3: Program card via Web NFC (client-side)
const result = await programMultiFunctionCard(
  userId,
  cardUid,
  ["payment", "auth", "signing"],
  {
    boltcardId: String(cardId),
    authKeyHash: derivedAuthHash,
    frostShareId: shareUuid,
    nip05: "alice@satnam.pub",
    pin: "123456",
  }
);
```

### Tap-to-Add Contact Flow

```ts
import { useNFCContactVerification } from "@/hooks/useNFCContactVerification";

const { verifyAndAddContact } = useNFCContactVerification();
const res = await verifyAndAddContact({ token });
if (res.success) {
  console.log("Added", res.contactNip05, "duid", res.contactDuid);
}
```

### Security Considerations

- Plaintext NIP-05 in File 04 is for UX only. Server binds the physical card UID to the claimed identity by recomputing `card_uid_hash = SHA-256(cardUid || user_salt)` for the identity resolved by NIP-05; it then verifies this hash against `lnbits_boltcards.card_uid_hash`.
- This design mitigates trivial spoofing (writing someone else’s NIP-05 to a random tag) without storing raw UIDs.
- Residual risk: UID cloning; Mitigation option: require SUN/SDM verification where available.
- No plaintext secrets (nsec or FROST shares) are written to the card.

### Error Handling & Edge Cases

- Card UID not registered to claimed NIP-05 → 400 from `nfc-verify-contact`
- NIP-05 mismatch for authenticated user in `nfc-enable-signing` → 400
- Web NFC unsupported (iOS/desktop) → show UI guidance to use Boltcard app for payment; additional features pending hardware bridge
- Concurrent programming attempts: functions return structured errors; callers should serialize writes

### Platform Compatibility Matrix

### SUN Verification Flow (Optional Enhanced Security)

```ts
// Example: Client extracts SDM parameters from tap (SDM URL carries p & c)
import { useNFCContactVerification } from "@/hooks/useNFCContactVerification";

const { verifyAndAddContact } = useNFCContactVerification();
const res = await verifyAndAddContact({ token });
if (res.success && res.sunVerified) {
  console.log("Contact verified with cryptographic SUN proof");
} else if (res.success) {
  console.log("Contact verified with UID-hash only (no SUN)");
}
```

Security comparison:

- Without SUN: Vulnerable to UID cloning (attacker could clone card UID and write fake NIP-05)
- With SUN: LNbits validates NTAG424 SDM CMAC using per-card secrets; cryptographic proof of authenticity

- Android (Chrome/Edge):
  - Write: Web NFC supports NDEF; low-level NTAG file ops require a bridge (planned)
  - Read: Web NFC reads NDEF reliably; reading custom files is limited in-browser
- iOS (Safari / Core NFC):
  - Write: Not supported from web; use Boltcard app for payment (File 01) provisioning
  - Read: Core NFC can read NDEF Text records; if NIP-05 is also mirrored as an NDEF Text record, tap-to-add verification works by sending nip05 + cardUid to the server
- Desktop (Future hardware bridge):
  - Write: Planned via PC/SC (nfc-pcsc) to program Files 02/03/04 consistently
  - Read: Planned; tags programmed on desktop remain readable by Android and, for NDEF, by iOS

Notes:

- For cross-platform reading, mirror NIP-05 into an NDEF Text record in addition to File 04. iOS can then participate in tap-to-add verification even if it cannot write Files 02/03/04.
- SUN/SDM verification: requires server access to card SDM keys (via LNbits). If provided at tap time, server performs cryptographic check and marks `sunVerified: true`.
