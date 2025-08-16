// Netlify (active) Function: /api/auth/register-identity
// Switch from re-export to direct delegate import to avoid bundling issues

export const handler = async (event, context) => {
  const mod = await import('../functions/register-identity.js');
  const fn = mod && (mod.handler || mod.default);
  if (typeof fn !== 'function') {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success:false, error:'Registration handler not available' }) };
  }
  return fn(event, context);
};

