// Redirect function to handle /.netlify/functions/auth/* requests
// Routes to the appropriate auth-router or specific handlers

export const handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
  };

  // CORS preflight
  if ((event.httpMethod || 'GET').toUpperCase() === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  try {
    const path = event.path || '';
    const method = (event.httpMethod || 'GET').toUpperCase();

    // Route register-identity to the consolidated handler
    if (path.includes('/register-identity') && method === 'POST') {
      const { handler: registerHandler } = await import('./auth-register-identity.js');
      const result = await registerHandler(event);
      return { ...result, headers: { ...(result.headers || {}), ...cors } };
    }

    // Route signin to the signin handler  
    if (path.includes('/signin') && method === 'POST') {
      const { handler: signinHandler } = await import('./auth-signin.js');
      const result = await signinHandler(event);
      return { ...result, headers: { ...(result.headers || {}), ...cors } };
    }

    // For other auth requests, delegate to auth-router
    const { handler: routerHandler } = await import('./auth-router.js');
    const result = await routerHandler(event);
    return { ...result, headers: { ...(result.headers || {}), ...cors } };

  } catch (error) {
    console.error('Auth redirect error:', error);
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: 'Server error' })
    };
  }
};
