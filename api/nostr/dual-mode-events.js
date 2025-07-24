/**
 * Nostr Dual Mode Events API - Netlify Function
 * Handle both public and private Nostr events for family coordination
 */

/**
 * Process Nostr event
 * @param {Object} event - Nostr event
 * @returns {Promise<Object>} Processing result
 */
async function processNostrEvent(event) {
  const { kind, content, tags, pubkey } = event;
  
  return {
    success: true,
    eventId: `event_${Math.random().toString(36).substr(2, 16)}`,
    kind,
    pubkey,
    processed: true,
    timestamp: new Date().toISOString(),
    relays: ['wss://relay.satnam.pub', 'wss://nos.lol']
  };
}

/**
 * Generate gift wrapped event
 * @param {Object} params - Event parameters
 * @returns {Promise<Object>} Gift wrapped event
 */
async function generateGiftWrappedEvent(params) {
  const { content, recipientPubkey, senderPrivkey } = params;
  
  return {
    kind: 1059,
    content: `encrypted_${Math.random().toString(36).substr(2, 32)}`,
    tags: [['p', recipientPubkey]],
    created_at: Math.floor(Date.now() / 1000),
    pubkey: `temp_${Math.random().toString(36).substr(2, 16)}`,
    id: `event_${Math.random().toString(36).substr(2, 16)}`,
    sig: `sig_${Math.random().toString(36).substr(2, 32)}`
  };
}

/**
 * Main Netlify Function handler
 */
export const handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const method = event.httpMethod;
    const path = event.path;

    if (path.endsWith('/publish') && method === 'POST') {
      const requestData = JSON.parse(event.body);
      const { nostrEvent, mode = 'public' } = requestData;

      if (!nostrEvent) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Nostr event required',
            timestamp: new Date().toISOString(),
          }),
        };
      }

      let processedEvent;
      if (mode === 'private') {
        processedEvent = await generateGiftWrappedEvent({
          content: nostrEvent.content,
          recipientPubkey: nostrEvent.tags?.find(tag => tag[0] === 'p')?.[1],
          senderPrivkey: 'mock_privkey'
        });
      } else {
        processedEvent = await processNostrEvent(nostrEvent);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          data: {
            event: processedEvent,
            mode,
            published: true
          },
          timestamp: new Date().toISOString(),
        }),
      };
    }

    if (path.endsWith('/events') && method === 'GET') {
      const { pubkey, kinds, limit = 20 } = event.queryStringParameters || {};

      const mockEvents = Array.from({ length: Math.min(limit, 20) }, (_, i) => ({
        id: `event_${i}_${Math.random().toString(36).substr(2, 8)}`,
        kind: kinds ? parseInt(kinds.split(',')[0]) : 1,
        pubkey: pubkey || `pubkey_${Math.random().toString(36).substr(2, 16)}`,
        content: `Mock event content ${i}`,
        created_at: Math.floor(Date.now() / 1000) - i * 3600,
        tags: [],
        sig: `sig_${Math.random().toString(36).substr(2, 32)}`
      }));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          data: mockEvents,
          timestamp: new Date().toISOString(),
        }),
      };
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Endpoint not found',
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Internal server error',
        timestamp: new Date().toISOString(),
      }),
    };
  }
};