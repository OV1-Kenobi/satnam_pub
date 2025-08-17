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
import { db } from '../../lib/db.js';
import { ApiErrorHandler } from '../../lib/error-handler.js';

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
      return ApiErrorHandler.handleError(
        new Error('Username and pubkey required for privacy-first authentication'),
        res,
        'validate login request',
        400
      );
    }

    // Create privacy-safe identifiers
    const authHash = await createAuthHash(pubkey);
    const hashedUserId = await createHashedUserId(username + pubkey);
    const platformId = createPlatformId(pubkey);

    // Check if user exists by auth hash (NOT by pubkey)
    const client = await db.getClient();
    const { data: userData, error: userError } = await client
      .from('profiles')
      .select('*')
      .eq('auth_hash', authHash.split(':')[1]); // Use only the hash part for lookup

    let user;
    if (!userData || userData.length === 0) {
      // Create new privacy-first user
      const { data: newUserData, error: createError } = await client
        .from('profiles')
        .insert([{
          id: platformId,
          username: username,
          auth_hash: authHash,
          hashed_user_id: hashedUserId,
          platform_id: platformId
        }])
        .select('id, username, created_at')
        .single();

      if (createError) {
        return ApiErrorHandler.handleApiError(
          createError,
          res,
          'create new user',
          undefined,
          hashedUserId
        );
      }

      user = newUserData;

      // Award welcome course credits
      await db.models.courseCredits.awardCredits(hashedUserId, 1);

      // PRIVACY: Avoid logging usernames; log hashed identifier only
      console.log(`✅ New privacy-first user registered: ${hashedUserId.substring(0,8)}...`);
    } else {
      user = userData[0];
      // PRIVACY: Avoid logging usernames; log hashed identifier only
      console.log(`✅ Existing user authenticated: ${hashedUserId.substring(0,8)}...`);
    }

    // Generate privacy-first JWT token (NO sensitive data)
    const token = await generateToken({
      userId: user.id,
      username: user.username,
      hashedUserId: hashedUserId,
      role: 'user'
    });

    // PRIVACY-FIRST: Standardized SessionData response with minimal PII
    res.status(200).json({
      success: true,
      data: {
        user: {
          id: hashedUserId, // Hashed DUID only
          npub: '', // Not tracked in legacy login
          username: user.username || undefined, // Optional
          nip05: undefined, // Not available here
          role: 'private', // Default role for legacy login
          is_active: true,
        },
        authenticated: true,
        sessionToken: token,
        expiresAt: undefined,
      },
    });

  } catch (error) {
    ApiErrorHandler.handleApiError(
      error,
      res,
      'authenticate user',
      undefined,
      undefined
    );
  }
}