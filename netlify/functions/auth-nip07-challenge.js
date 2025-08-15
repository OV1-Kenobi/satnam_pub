// Lightweight Netlify Function wrapper for the NIP-07 challenge API
// Ensures /api/auth/nip07-challenge resolves in production via netlify.toml redirects

export const handler = async (event, context) => {
  // Delegate to the existing API handler for consistency
  const mod = await import('../../api/auth/nip07-challenge.js');
  const fn = (mod && (mod.default || mod.handler));
  if (typeof fn !== 'function') {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'Challenge handler not available' }),
    };
  }
  return fn(event, context);
};

