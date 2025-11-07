# Recover Your Encrypted Nostr Key Backup Without Satnam.pub

This guide shows how to recover your encrypted backup using only: your npub, your password or WebAuthn authenticator, and generic Nostr tools. Satnam servers are not required.

Applies to backups published per RELAY_BACKUP_DESIGN.md (kind 30078 + `d` tag).

## What you need
- Your npub
- Your recovery password/passphrase (PBKDF2), or your WebAuthn authenticator (security key/biometric device tied to your browser/OS)
- Any Nostr client/CLI capable of fetching events by author/kind/tags (e.g., Nostr Army Knife (nak), Gossip, or a simple script)
- An offline decrypter (Node script or a local HTML file) to decrypt the backup envelope

## Fetch the backup event
Example using Nostr Army Knife (nak). If not available, use any client that supports equivalent filters.

1) Add a few relays (one is enough if it has your event):
```
nak relay add wss://relay.satnam.pub
nak relay add wss://nostr-pub.wellorder.net
```
2) Query your backup (replace with your hex pubkey or npub converted to hex):
```
nak fetch --author <hex-pubkey> --kind 30078 --tag d satnam:backup:v1 --limit 1 > backup-event.json
```
If you used the dual-wrap pattern, try `satnam:backup:v1:pw` or `satnam:backup:v1:wa`.

Open `backup-event.json` and note the `content` field (JSON string). Save that into `ebe.json` (the Encrypted Backup Envelope).

## Decrypt with password (PBKDF2)
Below is a minimal Node script that uses the Web Crypto API. It assumes the EBE content JSON contains the `kdf`, `nonce`, and `ct` fields described in the design.

Create `decrypt-pbkdf2.mjs`:
```
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
const { subtle } = webcrypto;

function b64ToBytes(b64) {
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}
function bytesToUtf8(bytes) {
  return new TextDecoder().decode(bytes);
}

async function deriveKey(password, saltB64, iterations) {
  const enc = new TextEncoder();
  const pwKey = await subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-512', salt: b64ToBytes(saltB64), iterations },
    pwKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
}

async function decrypt() {
  const ebe = JSON.parse(readFileSync('ebe.json', 'utf8'));
  if (ebe.alg !== 'noble-v2') throw new Error('Unsupported alg');
  if (ebe.wrap !== 'pbkdf2') throw new Error('This EBE is not PBKDF2-wrapped');
  const password = process.env.BACKUP_PASSWORD;
  if (!password) throw new Error('Set BACKUP_PASSWORD env var');

  const key = await deriveKey(password, ebe.kdf.salt, ebe.kdf.iterations);
  const ptBytes = await subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(ebe.nonce) },
    key,
    b64ToBytes(ebe.ct)
  );
  const plaintext = bytesToUtf8(new Uint8Array(ptBytes));
  console.log(plaintext);
}

decrypt().catch(e => {
  console.error(e instanceof Error ? e.message : 'Unknown error');
  process.exit(1);
});
```
Run:
```
BACKUP_PASSWORD='<your password>' node decrypt-pbkdf2.mjs
```
The output is the decrypted JSON payload containing your `encrypted_nsec`, `npub`, etc. Follow your clients documented steps to import/decrypt `encrypted_nsec` with Noble V2 and restore to your local vault.

## Decrypt with WebAuthn (hardware key/biometric)
Manual recovery with WebAuthn requires a browser to talk to your authenticator. Create a local HTML file `webauthn-decrypt.html` and open it in a modern browser (no internet needed).

Skeleton (you still need your EBE JSON pasted into the page):
```
<!doctype html>
<meta charset="utf-8" />
<title>WebAuthn Backup Decrypt (Offline)</title>
<script>
async function b64ToBytes(b64){return Uint8Array.from(atob(b64),c=>c.charCodeAt(0));}
function bytesToUtf8(b){return new TextDecoder().decode(b)}
async function run(){
  const ebe = JSON.parse(document.getElementById('ebe').value);
  if(ebe.wrap!=='webauthn') throw new Error('Not WebAuthn-wrapped');
  // Application-specific get() params must match how the credential was created
  const cred = await navigator.credentials.get({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    allowCredentials: [{ id: await b64ToBytes(ebe.wrapInfo.credentialId), type: 'public-key' }],
    rpId: ebe.wrapInfo.rpId
  }});
  // From your implementation: derive the unwrap key from assertion (app-specific)
  // Then AES-GCM decrypt using ebe.nonce/ebe.ct
  // Display plaintext JSON
}
</script>
<textarea id="ebe" rows="16" cols="80" placeholder="Paste EBE JSON here..."></textarea>
<button onclick="run()">Decrypt</button>
<pre id="out"></pre>
```
Notes:
- WebAuthn exact unwrap logic must match how you wrapped `backupKey` during backup (your implementation defines CBOR/COSE details). This page is a minimal scaffold to demonstrate that offline WebAuthn recovery is feasible without Satnam servers

## If you enabled sharded key wrap (optional, advanced)
- Fetch all shard events by `d` tags (e.g., `satnam:backup:v1:shard:<i>`)
- Reconstruct the wrapped `backupKey` with the required threshold (e.g., 3-of-5)
- Proceed to decrypt the main ciphertext (`ct`) as above
- Any reputable Shamirs Secret Sharing library can be used offline for reconstruction

## Validate success
- The decrypted payload includes `npub` and an `encrypted_nsec` compatible with Satnams Noble V2
- Verify `npub` matches your identity before restoring

## Privacy and safety
- Do not paste secrets into networked websites; use offline tools
- Keep your password and/or authenticator safe; do not rely on screenshots or cloud notes
- Consider backing up to multiple relays; rotate/republish backups after major key changes

## Troubleshooting
- No event found: try more relays, ensure correct `d` tag, and confirm author pubkey
- Wrong password: decryption will fail; try again and respect case; ensure correct iterations
- WebAuthn failure: ensure youre on the same RP ID (domain) context you used during wrapping, or generate a portable WebAuthn-agnostic wrapping design in implementation

