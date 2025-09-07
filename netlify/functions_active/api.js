// Generic API router function for Netlify Dev compatibility
// Purpose: handle calls like 
//   /.netlify/functions/api/individual/wallet
//   /.netlify/functions/api/user/nwc-connections
// by delegating to the unified individual wallet handler.
// This avoids adding duplicate logic and fixes 404s from dev calls that bypass /api/* redirects.

export { handler } from './individual-wallet-unified.js';

