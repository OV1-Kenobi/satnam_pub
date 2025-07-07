import { getNip05RecordByName } from '../services/nip05';

/**
 * NIP-05 Verification Endpoint
 * Serves dynamic NIP-05 verification data at /.well-known/nostr.json
 * 
 * Usage:
 * - GET /.well-known/nostr.json (returns all names)
 * - GET /.well-known/nostr.json?name=username (returns specific user)
 */
export default async function handler(req, res) {
  try {
    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Content-Type", "application/json");

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    // Only allow GET requests
    if (req.method !== 'GET') {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { name } = req.query;

    // If no name parameter, return all NIP-05 records
    if (!name) {
      try {
        const { generateNip05Json } = await import('../services/nip05');
        const nip05Data = await generateNip05Json();
        
        return res.status(200).json(nip05Data);
      } catch (error) {
        console.error('Error generating NIP-05 JSON:', error);
        return res.status(500).json({ error: "Failed to generate NIP-05 data" });
      }
    }

    // If name parameter provided, return specific user
    try {
      const user = await getNip05RecordByName(name);
      
      if (!user) {
        return res.status(404).json({ 
          error: "User not found",
          names: {}
        });
      }

      return res.status(200).json({
        names: {
          [name]: user.pubkey
        }
      });
    } catch (error) {
      console.error('Error fetching NIP-05 record:', error);
      return res.status(500).json({ 
        error: "Failed to fetch user data",
        names: {}
      });
    }

  } catch (error) {
    console.error('NIP-05 endpoint error:', error);
    return res.status(500).json({ 
      error: "Internal server error",
      names: {}
    });
  }
} 