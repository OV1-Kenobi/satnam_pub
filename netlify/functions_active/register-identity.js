// Wrapper to ensure Netlify bundles the registration handler with the auth router
// Pure ESM; export both default and handler for router compatibility
export { default, default as handler } from '../../api/auth/register-identity.js';

