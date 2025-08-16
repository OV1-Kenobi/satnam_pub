// Netlify (active) Function: /api/auth/nip07-signin
// Switch to direct delegate import to avoid bundling/import resolution issues

export const handler = async (event, context) => {
  const mod = await import('../functions/auth-nip07-signin.js').catch(async () => {
    // Fallback to API path if functions copy not present
    return await import('../../api/auth/nip07-signin.js');
  });
  const fn = mod && (mod.handler || mod.default);
  if (typeof fn !== 'function') {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success:false, error:'Signin handler not available' }) };
  }
  return fn(event, context);
};

