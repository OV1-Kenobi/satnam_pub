// Netlify Functions wrapper for username availability checking
// Pure ESM module for Netlify Functions compatibility

export const handler = async (event, context) => {
  try {
    const mod = await import('../../api/auth/check-username-availability.js');
    const fn = (mod && (mod.default || mod.handler));
    if (typeof fn !== 'function') {
      return { 
        statusCode: 500, 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ 
          success: false, 
          error: 'Username availability check handler not available' 
        }) 
      };
    }

    // The handler expects Netlify event/context format directly
    return await fn(event, context);
  } catch (e) {
    return { 
      statusCode: 500, 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ 
        success: false, 
        error: 'Server error', 
        details: e instanceof Error ? e.message : String(e) 
      }) 
    };
  }
};
