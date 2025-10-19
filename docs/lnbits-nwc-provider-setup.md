## LNbits NWC Provider — One-time Setup Checklist

Use this checklist to configure your LNbits instance to issue Nostr Wallet Connect (NWC, NIP‑47) connection URIs that Satnam can manage from the UI via lnbits-proxy.

1. Enable the extension

- Log in to your LNbits server as admin
- Go to Extensions → enable “Nostr Wallet Connect” (a.k.a. nwcprovider)

2. Configure relay used by the provider

- Open the NWC Provider extension settings
- Set the default relay to your private relay:
  - wss://relay.satnam.pub
- Save and restart extension if required
- Note: Satnam currently expects a single relay in the URI query string. If your provider supports multiple relays, configure only one for now

3. Wallet prerequisites

- Ensure each Satnam user has a wallet provisioned in your LNbits instance (our lnbits-proxy provisions on demand)
- Confirm the wallet Admin API Key is retrievable for server‑side calls (we use per‑user secure resolution in lnbits-proxy; do not store admin keys in DB if not necessary)

4. Connection permissions and budgets

- The UI will request permissions typically: get_balance, make_invoice, pay_invoice, lookup_invoice, list_transactions
- For Offspring role, apply daily spend budget (e.g., 100k sats) with refresh_window=86400
- For Adult/Steward/Guardian roles, you may allow unlimited or higher budgets per policy

5. Test a pairing URL

- From the extension UI, create a test connection and verify it produces:
  nostr+walletconnect://<provider_pubkey>?relay=wss://relay.satnam.pub&secret=<client_secret>
- Do a quick NIP‑47 get_balance call using a test client to validate relay reachability

6. Security notes

- Treat the client_secret as a bearer credential; never store it in plaintext server‑side
- Satnam encrypts the full NWC URI using AES‑256‑GCM with a per‑user key derived via PBKDF2‑SHA256 (600k). Only the user can decrypt it client‑side
- The full URI is shown to the user once, then only metadata is visible thereafter

7. Troubleshooting

- If pairing returns a string not starting with nostr+walletconnect://, check the extension version
- If relay connection fails, verify firewall/TLS on wss://relay.satnam.pub and that the provider uses this exact URL
- If the provider complains the pubkey already exists, revoke the old connection in LNbits first (the Satnam UI supports delete + recreate)

That’s it. Once configured, Satnam’s lnbits-proxy can fully manage user NWC connections without giving users access to your LNbits admin UI.
