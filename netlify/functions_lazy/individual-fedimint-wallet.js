// Lazy-loaded Individual Fedimint Wallet Function
// This function is only loaded when actually called to reduce build memory usage

export const handler = async (event, context) => {
  try {
    const mod = await import('../../api/individual/fedimint/wallet.js');
    const fn = (mod && (mod.default || mod.handler));
    if (typeof fn !== 'function') {
      return { 
        statusCode: 500, 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ 
          success: false, 
          error: 'Individual Fedimint wallet handler not available' 
        }) 
      };
    }

    // The individual fedimint wallet handler expects Netlify event/context format directly
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
