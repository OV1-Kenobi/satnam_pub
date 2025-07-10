import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client with service role for vault access
const supabaseUrl = 'https://rhfqfftkizyengcuhuvq.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoZnFmZnRraXp5ZW5nY3VodXZxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0OTc2MDU4NCwiZXhwIjoyMDY1MzM2NTg0fQ.Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

interface NIP05Record {
  name: string;
  pubkey: string;
  created_at: string;
  updated_at: string;
}

interface NIP05Response {
  names: Record<string, string>;
  relays?: Record<string, string[]>;
}

export const handler: Handler = async (event) => {
  try {
    // Set CORS headers
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, OPTIONS'
    };

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers,
        body: ''
      };
    }

    // Only allow GET requests
    if (event.httpMethod !== 'GET') {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }

    // Get Rebuilding Camelot npub from vault
    const { data: rebuildingCamelotNpub, error: npubError } = await supabase
      .rpc('get_rebuilding_camelot_npub');

    if (npubError || !rebuildingCamelotNpub) {
      console.error('Failed to get Rebuilding Camelot npub:', npubError);
      // Fallback to static data if vault access fails
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          names: {
            'admin': 'npub1rebuilding_camelot_public_key_here',
            'RebuildingCamelot': 'npub1rebuilding_camelot_public_key_here',
            'bitcoin_mentor': 'npub1mentorbitcoinexample123456789abcdef',
            'lightning_mentor': 'npub1mentorligthningexample123456789abcdef',
            'family_mentor': 'npub1mentorfamilyexample123456789abcdef',
            'support': 'npub1satnamsupport123456789abcdef',
            'info': 'npub1satnaminfo123456789abcdef'
          },
          relays: {
            'npub1rebuilding_camelot_public_key_here': ['wss://relay.satnam.pub'],
            'npub1mentorbitcoinexample123456789abcdef': ['wss://relay.satnam.pub'],
            'npub1mentorligthningexample123456789abcdef': ['wss://relay.satnam.pub'],
            'npub1mentorfamilyexample123456789abcdef': ['wss://relay.satnam.pub'],
            'npub1satnamsupport123456789abcdef': ['wss://relay.satnam.pub'],
            'npub1satnaminfo123456789abcdef': ['wss://relay.satnam.pub']
          }
        })
      };
    }

    // Query the nip05_records table
    const { data: nip05Records, error: queryError } = await supabase
      .from('nip05_records')
      .select('name, pubkey, created_at, updated_at')
      .order('name');

    if (queryError) {
      console.error('Database query error:', queryError);
      // Fallback to static data if database query fails
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          names: {
            'admin': rebuildingCamelotNpub,
            'RebuildingCamelot': rebuildingCamelotNpub,
            'bitcoin_mentor': 'npub1mentorbitcoinexample123456789abcdef',
            'lightning_mentor': 'npub1mentorligthningexample123456789abcdef',
            'family_mentor': 'npub1mentorfamilyexample123456789abcdef',
            'support': 'npub1satnamsupport123456789abcdef',
            'info': 'npub1satnaminfo123456789abcdef'
          },
          relays: {
            [rebuildingCamelotNpub]: ['wss://relay.satnam.pub'],
            'npub1mentorbitcoinexample123456789abcdef': ['wss://relay.satnam.pub'],
            'npub1mentorligthningexample123456789abcdef': ['wss://relay.satnam.pub'],
            'npub1mentorfamilyexample123456789abcdef': ['wss://relay.satnam.pub'],
            'npub1satnamsupport123456789abcdef': ['wss://relay.satnam.pub'],
            'npub1satnaminfo123456789abcdef': ['wss://relay.satnam.pub']
          }
        })
      };
    }

    // Build the response from database records
    const names: Record<string, string> = {};
    const relays: Record<string, string[]> = {};

    // Add Rebuilding Camelot as admin (using real npub from vault)
    names['admin'] = rebuildingCamelotNpub;
    names['RebuildingCamelot'] = rebuildingCamelotNpub;
    relays[rebuildingCamelotNpub] = ['wss://relay.satnam.pub'];

    // Add database records (excluding admin and RebuildingCamelot which we handle above)
    if (nip05Records && nip05Records.length > 0) {
      nip05Records.forEach((record: NIP05Record) => {
        // Skip admin and RebuildingCamelot records from database since we use vault npub
        if (record.name !== 'admin' && record.name !== 'RebuildingCamelot') {
          names[record.name] = record.pubkey;
          relays[record.pubkey] = ['wss://relay.satnam.pub'];
        }
      });
    }

    // Add fallback records if database is empty
    if (Object.keys(names).length <= 2) { // Only admin and RebuildingCamelot
      const fallbackRecords = {
        'bitcoin_mentor': 'npub1mentorbitcoinexample123456789abcdef',
        'lightning_mentor': 'npub1mentorligthningexample123456789abcdef',
        'family_mentor': 'npub1mentorfamilyexample123456789abcdef',
        'support': 'npub1satnamsupport123456789abcdef',
        'info': 'npub1satnaminfo123456789abcdef'
      };

      Object.entries(fallbackRecords).forEach(([name, pubkey]) => {
        names[name] = pubkey;
        relays[pubkey] = ['wss://relay.satnam.pub'];
      });
    }

    const response: NIP05Response = {
      names,
      relays
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response)
    };

  } catch (error) {
    console.error('NIP-05 verification error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: 'Failed to serve NIP-05 verification data'
      })
    };
  }
}; 