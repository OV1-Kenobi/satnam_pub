/**
 * Privacy-First Authentication Login API Endpoint
 * 
 * FOLLOWS SATNAM.PUB PRIVACY PROTOCOLS:
 * - NO pubkeys/npubs stored in database
 * - Uses PBKDF2 auth hashes with 100,000 iterations
 * - Privacy-safe hashed user identifiers only
 * - NO sensitive data in responses
 */

import { createAuthHash, createHashedUserId, createPlatformId, generateToken } from '../../lib/auth.js';
import db from '../../lib/db.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { username, pubkey } = req.body;

    // PRIVACY: pubkey is used only for auth hash generation, never stored
    if (!username || !pubkey) {
      return res.status(400).json({ 
        error: 'Username and pubkey required for privacy-first authentication' 
      });
    }

    // Create privacy-safe identifiers
    const authHash = createAuthHash(pubkey);
    const hashedUserId = createHashedUserId(username + pubkey);
    const platformId = createPlatformId(pubkey);

    // Check if user exists by auth hash (NOT by pubkey)
    let user = await db.query(
      'SELECT * FROM profiles WHERE auth_hash = $1',
      [authHash.split(':')[1]] // Use only the hash part for lookup
    );

    if (user.rows.length === 0) {
      // Create new privacy-first user
      const newUser = await db.query(
        `INSERT INTO profiles (id, username, auth_hash, hashed_user_id, platform_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, username, created_at`,
        [platformId, username, authHash, hashedUserId, platformId]
      );

      user = newUser;

      // Award welcome course credits
      await db.models.courseCredits.awardCredits(hashedUserId, 1);

      console.log(`✅ New privacy-first user registered: ${username}`);
    } else {
      user = user;
      console.log(`✅ Existing user authenticated: ${username}`);
    }

    // Generate privacy-first JWT token (NO sensitive data)
    const token = generateToken({
      userId: user.rows[0].id,
      username: user.rows[0].username,
      hashedUserId: hashedUserId,
      role: 'user'
    });

    // PRIVACY: Response contains NO pubkeys, npubs, or sensitive data
    res.status(200).json({
      success: true,
      token: token,
      user: {
        id: user.rows[0].id,
        username: user.rows[0].username,
        // NO npub, pubkey, or sensitive data exposed
      }
    });

  } catch (error) {
    console.error('Privacy-First Login API error:', error);
    res.status(500).json({ 
      error: 'Authentication failed',
      // NO error details exposed in production for security
      details: process.env.NODE_ENV === 'development' ? error.message : 'Contact support'
    });
  }
}