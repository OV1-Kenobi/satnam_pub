/**
 * Cleanup Expired Credentials Background Function
 * Runs on a schedule to automatically clean up expired nsec credentials
 * Background functions have relaxed limits and reduce build-time constraints.
 */

import { supabase } from '../../src/lib/supabase';

export default async function handler(event: any) {
  // Netlify scheduled background functions will call this with POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    console.log('🧹 [BG] Starting expired credentials cleanup...');

    const { data, error } = await supabase.rpc('cleanup_expired_nostr_credentials');

    if (error) {
      console.error('❌ [BG] Cleanup failed:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Cleanup failed', details: error.message }),
      };
    }

    console.log('✅ [BG] Expired credentials cleanup completed successfully');

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Expired credentials cleanup completed',
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    console.error('❌ [BG] Unexpected error during cleanup:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
}

