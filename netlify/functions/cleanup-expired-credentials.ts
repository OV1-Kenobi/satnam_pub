/**
 * Cleanup Expired Credentials Function (scheduled)
 * Reverted from background function to standard function for Netlify free plan
 */

import { supabase } from '../../src/lib/supabase';

export async function handler(event: any) {
  // Netlify scheduled functions call with POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    console.log('🧹 Starting expired credentials cleanup...');

    const { data, error } = await supabase.rpc('cleanup_expired_nostr_credentials');

    if (error) {
      console.error('❌ Cleanup failed:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Cleanup failed', details: error.message }),
      };
    }

    console.log('✅ Expired credentials cleanup completed successfully');

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Expired credentials cleanup completed',
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    console.error('❌ Unexpected error during cleanup:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
}

