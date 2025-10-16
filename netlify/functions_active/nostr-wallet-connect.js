// Netlify Functions wrapper for NWC API (pure ESM)
// Exposes the browser API route at /.netlify/functions/nostr-wallet-connect
// IMPORTANT: package.json has "type":"module" so .js is ESM; include .js extensions

export { default as handler } from "../../api/wallet/nostr-wallet-connect.js";

