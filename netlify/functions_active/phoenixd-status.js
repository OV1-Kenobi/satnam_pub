// Lightweight Proxy Function: /api/phoenixd/status
// Dynamically loads the actual implementation only when called to reduce build memory usage

export const handler = async (event, context) => {
  try {
    // Lazy load the actual implementation
    const lazyMod = await import('../functions_lazy/phoenixd-status.js');
    const lazyHandler = lazyMod.handler;

    if (typeof lazyHandler !== 'function') {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'PhoenixD status handler not available'
        })
      };
    }

    // Delegate to the lazy-loaded handler
    return await lazyHandler(event, context);
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: 'Failed to load PhoenixD status function',
        details: e instanceof Error ? e.message : String(e)
      })
    };
  }
};
