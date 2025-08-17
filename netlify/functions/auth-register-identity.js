// Wrapper Netlify Function for canonical /api/auth/register-identity route
// netlify.toml maps /api/auth/register-identity -> /.netlify/functions/auth-register-identity
// Delegate to the existing register-identity function to avoid duplicate logic

exports.handler = async (event, context) => {
  const mod = await import('./register-identity.js');
  const fn = (mod && (mod.handler || mod.default));
  if (typeof fn !== 'function') {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'Registration handler not available' })
    };
  }
  return fn(event, context);
};

