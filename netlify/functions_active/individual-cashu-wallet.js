// Netlify (active) Function: /api/individual/cashu/wallet
// Delegates to API implementation at api/individual/cashu/wallet.js

export const handler = async (event, context) => {
  try {
    const mod = await import('../../api/individual/cashu/wallet.js');
    const fn = (mod && (mod.default || mod.handler));
    if (typeof fn !== 'function') {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, error: 'Cashu wallet handler not available' }) };
    }

    // The cashu wallet handler expects Netlify event/context format directly
    return await fn(event, context);
  } catch (e) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, error: 'Server error', details: e instanceof Error ? e.message : String(e) }) };
  }
};
