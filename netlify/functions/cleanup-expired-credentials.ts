/**
 * Cleanup Expired Credentials Edge Function
 * 
 * Runs on a schedule to automatically clean up expired nsec credentials
 * Scheduled via Netlify's cron functionality
 */

import { supabase } from '../../src/lib/supabase';

export default async function handler(event: any) {
  // Verify this is a scheduled event
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    console.log('🧹 Starting expired credentials cleanup...');

    // Call the cleanup function
    const { data, error } = await supabase.rpc('cleanup_expired_nostr_credentials');

    if (error) {
      console.error('❌ Cleanup failed:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'Cleanup failed',
          details: error.message 
        }),
      };
    }

    console.log('✅ Expired credentials cleanup completed successfully');

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true,
        message: 'Expired credentials cleanup completed',
        timestamp: new Date().toISOString()
      }),
    };
  } catch (error) {
    console.error('❌ Unexpected error during cleanup:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
    };
  }
} 