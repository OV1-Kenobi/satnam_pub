/**
 * Identity Registration API Endpoint - Production Ready
 * POST /api/auth/register-identity - Register new user identity with sovereignty enforcement
 *
 * MASTER CONTEXT COMPLIANCE:
 * ✅ JavaScript API route per browser-only serverless architecture
 * ✅ JWT token-based authentication with PBKDF2 + SHA-512 hashing
 * ✅ Privacy-first architecture with zero-knowledge patterns
 * ✅ Individual Wallet Sovereignty principle enforcement
 * ✅ Standardized role hierarchy with proper legacy mappings
 * ✅ Vault-based credential management integration
 * ✅ Web Crypto API for browser compatibility
 * ✅ Production-ready error handling and security validations
 * ✅ Rate limiting and input validation
 * ✅ Real database operations with Supabase integration
 */

import crypto from 'crypto';
import { promisify } from 'util';
import { vault } from '../../lib/vault.js';
import { SecureSessionManager } from '../../netlify/functions/security/session-manager.js';
import { supabase } from '../../src/lib/supabase.js';
import { generateSessionToken } from '../../utils/auth-crypto.js';
import { OTPStorageService } from '../../utils/otp-storage.js';

// REMOVED: Deprecated getEnvVar() function
// Now using direct process.env access as per new Vite-injected pattern

/**
 * SECURITY: Password hashing utilities with PBKDF2/SHA-512
 * Implements secure password storage with unique salts per user
 */

/**
 * Generate cryptographically secure salt for password hashing
 * @returns {string} Base64-encoded salt
 */
function generatePasswordSalt() {
  return crypto.randomBytes(24).toString('base64');
}

/**
 * Hash password using PBKDF2 with SHA-512
 * @param {string} password - Plain text password
 * @param {string} salt - Base64-encoded salt
 * @returns {Promise<string>} Base64-encoded password hash
 */
async function hashPassword(password, salt) {
  const iterations = 100000; // PBKDF2 iterations (minimum recommended)
  const keyLength = 64; // SHA-512 output length
  const algorithm = 'sha512';

  const pbkdf2 = promisify(crypto.pbkdf2);
  const hash = await pbkdf2(password, salt, iterations, keyLength, algorithm);
  return hash.toString('base64');
}

/**
 * Verify password against stored hash using timing-safe comparison
 * @param {string} password - Plain text password to verify
 * @param {string} storedHash - Stored password hash
 * @param {string} salt - Password salt
 * @returns {Promise<boolean>} True if password matches
 */
async function verifyPassword(password, storedHash, salt) {
  try {
    const computedHash = await hashPassword(password, salt);

    // Timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(computedHash, 'base64'),
      Buffer.from(storedHash, 'base64')
    );
  } catch (error) {
    console.error('Password verification failed:', error);
    return false;
  }
}

// Rate limiting configuration
const RATE_LIMITS = {
  REGISTRATION_PER_IP_PER_HOUR: 5,
  REGISTRATION_PER_IP_PER_DAY: 10
};

/**
 * Validate role from Identity Forge component
 * @param {string} role - Role from Identity Forge
 * @returns {'private'|'offspring'|'adult'|'steward'|'guardian'} Validated role
 */
function validateRole(role) {
  const validRoles = ['private', 'offspring', 'adult', 'steward', 'guardian'];
  return /** @type {'private'|'offspring'|'adult'|'steward'|'guardian'} */ (
    validRoles.includes(role) ? role : 'private'
  );
}

/**
 * Generate Individual Wallet Sovereignty spending limits based on role
 * MASTER CONTEXT COMPLIANCE: Private/Adults/Stewards/Guardians have unlimited authority (-1)
 * @param {'private'|'offspring'|'adult'|'steward'|'guardian'} role - Standardized role
 * @returns {Object} Spending limits configuration
 */
function generateSovereigntySpendingLimits(role) {
  switch (role) {
    case 'private':
    case 'adult':
    case 'steward':
    case 'guardian':
      return {
        daily: -1,    // Unlimited sovereignty
        weekly: -1,   // Unlimited sovereignty
        requiresApproval: -1  // No approval required
      };
    case 'offspring':
      return {
        daily: 50000,     // 50k sats daily limit
        weekly: 200000,   // 200k sats weekly limit
        requiresApproval: 100000  // Requires approval above 100k sats
      };
    default:
      // Fallback to offspring limits for unknown roles
      return {
        daily: 50000,
        weekly: 200000,
        requiresApproval: 100000
      };
  }
}

/**
 * Generate privacy-preserving user hash using Web Crypto API
 * @param {string} userData - User data to hash
 * @returns {Promise<string>} Privacy-preserving hash
 */
async function generatePrivacyPreservingHash(userData) {
  const encoder = new TextEncoder();
  const data = encoder.encode(`registration_${userData}_${Date.now()}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

/**
 * Extract client information for security logging
 * @param {Object} event - Netlify Functions event object
 * @returns {Object} Client information
 */
function extractClientInfo(event) {
  return {
    userAgent: event.headers['user-agent'],
    ipAddress: event.headers['x-forwarded-for'] || 
               event.headers['x-real-ip'] || 
               event.headers['client-ip']
  };
}

/**
 * Validate registration request data
 * @param {Object} userData - User registration data
 * @returns {Object} Validation result
 */
function validateRegistrationData(userData) {
  const errors = [];

  if (!userData || typeof userData !== 'object') {
    errors.push({ field: 'body', message: 'Request body must be an object' });
    return { success: false, errors };
  }

  // Required fields validation
  if (!userData.username || typeof userData.username !== 'string' || userData.username.trim().length < 3) {
    errors.push({ field: 'username', message: 'Username must be at least 3 characters long' });
  }

  if (!userData.password || typeof userData.password !== 'string' || userData.password.length < 8) {
    errors.push({ field: 'password', message: 'Password must be at least 8 characters long' });
  }

  if (userData.password !== userData.confirmPassword) {
    errors.push({ field: 'confirmPassword', message: 'Passwords do not match' });
  }

  // Validate npub (new format from Identity Forge)
  if (!userData.npub || typeof userData.npub !== 'string' || !userData.npub.startsWith('npub1')) {
    errors.push({ field: 'npub', message: 'Valid npub is required' });
  }

  // Validate encrypted nsec (should be present for both generated and imported accounts)
  if (!userData.encryptedNsec || typeof userData.encryptedNsec !== 'string') {
    errors.push({ field: 'encryptedNsec', message: 'Encrypted private key is required' });
  }

  // Username format validation
  if (userData.username && !/^[a-zA-Z0-9_-]+$/.test(userData.username)) {
    errors.push({ field: 'username', message: 'Username can only contain letters, numbers, underscores, and hyphens' });
  }

  // NIP-05 validation (should match username@satnam.pub)
  if (userData.nip05 && userData.nip05 !== `${userData.username}@satnam.pub`) {
    errors.push({ field: 'nip05', message: 'NIP-05 must match username@satnam.pub format' });
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      username: userData.username.trim().toLowerCase(),
      password: userData.password,
      npub: userData.npub.trim(),
      encryptedNsec: userData.encryptedNsec,
      nip05: userData.nip05 || `${userData.username.trim().toLowerCase()}@satnam.pub`,
      lightningAddress: userData.lightningAddress,
      role: userData.role || 'private',
      displayName: userData.displayName?.trim(),
      bio: userData.bio?.trim(),
      generateInviteToken: userData.generateInviteToken || false,
      invitationToken: userData.invitationToken || null,
      // Support for imported accounts
      isImportedAccount: userData.isImportedAccount || false,
      detectedProfile: userData.detectedProfile || null,
      // DUID Integration: Include pre-generated DUID from Identity Forge
      deterministicUserId: userData.deterministicUserId || null
    }
  };
}

/**
 * Check rate limiting for registration attempts
 * @param {string} ipAddress - Client IP address
 * @returns {Promise<Object>} Rate limit check result
 */
async function checkRateLimit(ipAddress) {
  const hourlyKey = `registration_rate_${ipAddress}_${Math.floor(Date.now() / (60 * 60 * 1000))}`;
  const dailyKey = `registration_rate_${ipAddress}_${Math.floor(Date.now() / (24 * 60 * 60 * 1000))}`;
  
  try {
    // Check hourly rate limit
    const hourlyLimit = await OTPStorageService.checkRateLimit(
      hourlyKey,
      RATE_LIMITS.REGISTRATION_PER_IP_PER_HOUR,
      1
    );
    
    if (!hourlyLimit.allowed) {
      return {
        allowed: false,
        error: 'Too many registration attempts this hour',
        retryAfter: Math.ceil((hourlyLimit.resetTime.getTime() - Date.now()) / 1000)
      };
    }
    
    // Check daily rate limit
    const dailyLimit = await OTPStorageService.checkRateLimit(
      dailyKey,
      RATE_LIMITS.REGISTRATION_PER_IP_PER_DAY,
      1
    );
    
    if (!dailyLimit.allowed) {
      return {
        allowed: false,
        error: 'Too many registration attempts today',
        retryAfter: Math.ceil((dailyLimit.resetTime.getTime() - Date.now()) / 1000)
      };
    }
    
    return { allowed: true };
  } catch (error) {
    console.error('Rate limit check failed:', error);
    return { allowed: true }; // Allow on error to prevent blocking legitimate users
  }
}

/**
 * Check username availability using secure DUID architecture
 * Uses direct database lookup with proper NIP-05 format validation
 * @param {string} username - Username to check
 * @returns {Promise<boolean>} True if available
 */
async function checkUsernameAvailability(username) {
  try {
    const domain = 'satnam.pub';
    const local = (username || '').trim().toLowerCase();
    if (!local) return false;

    // Server-side DUID hashing for availability check (no plaintext lookup)
    const crypto = await import('node:crypto');
    const secret = process.env.DUID_SECRET_KEY || process.env.DUID_SERVER_SECRET || process.env.VITE_DUID_SERVER_SECRET;
    if (!secret) {
      console.warn('DUID server secret not configured; availability check may be inaccurate');
      return false;
    }
    const identifier = `${local}@${domain}`;
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(identifier);
    const hashed_nip05 = hmac.digest('hex');

    const { data, error } = await supabase
      .from('nip05_records')
      .select('id')
      .eq('domain', domain)
      .eq('hashed_nip05', hashed_nip05)
      .eq('is_active', true)
      .limit(1);

    if (error) {
      console.error('Username availability check failed:', error);
      return false; // Conservative: assume not available on error
    }

    const isAvailable = !data || data.length === 0;
    console.log(`Username availability: ${username} -> ${isAvailable ? 'available' : 'taken'}`);
    return isAvailable;

  } catch (error) {
    console.error('Username availability check error:', error);
    return false; // Conservative: assume not available on error
  }
}

/**
 * Create user identity in database with maximum encryption and DUID
 * MAXIMUM ENCRYPTION: Stores all sensitive data in hashed columns only
 * DETERMINISTIC USER ID: Uses DUID for O(1) authentication performance
 * @param {Object} userData - Validated user data
 * @param {Object} spendingLimits - Sovereignty spending limits
 * @returns {Promise<Object>} Database operation result
 */
async function createUserIdentity(userData, spendingLimits) {
  // CORS headers for error responses
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  try {
    // CRITICAL SECURITY: Import privacy-first hashing utilities
    const { generateUserSalt, createHashedUserData } = await import('../../lib/security/privacy-hashing.js');

    // FAIL-SAFE: Require pre-generated DUID from Identity Forge - NO FALLBACK GENERATION
    const deterministicUserId = userData.deterministicUserId;

    if (!deterministicUserId) {
      // FAIL-SAFE ERROR: No fallback DUID generation to prevent inconsistency
      console.error('❌ DUID generation failed: No pre-generated DUID provided by Identity Forge');
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "DUID generation failed",
          details: "Deterministic User ID must be generated during Identity Forge process. Please retry account creation.",
          code: "DUID_GENERATION_FAILED",
          meta: {
            timestamp: new Date().toISOString(),
            requiresRetry: true
          }
        })
      };
    }

    console.log('✅ Using pre-generated DUID from Identity Forge:', {
      duidPrefix: deterministicUserId.substring(0, 10) + '...',
      timestamp: new Date().toISOString()
    });

    // Generate unique user salt for maximum encryption (still needed for sensitive data)
    const userSalt = await generateUserSalt();

    // Generate secure password salt and hash
    const passwordSalt = generatePasswordSalt();
    const passwordHash = await hashPassword(userData.password, passwordSalt);

    // MAXIMUM ENCRYPTION: Hash all sensitive user data with unique salt
    let hashedUserData;
    let hashedUsername;
    let hashedLightningAddress;
    try {
      hashedUserData = await createHashedUserData({
        npub: userData.npub,
        nip05: userData.nip05,
        encryptedNsec: userData.encryptedNsec,
        password: userData.password
      }, userSalt);

      // Hash additional fields manually using hashUserData
      const { hashUserData } = await import('../../lib/security/privacy-hashing.js');
      hashedUsername = await hashUserData(userData.username, userSalt);
      hashedLightningAddress = userData.lightningAddress ?
        await hashUserData(userData.lightningAddress, userSalt) : null;
    } catch (hashError) {
      console.error('Failed to hash user data:', hashError);
      throw new Error('Failed to encrypt user data securely');
    }

    // Create profile data with DUID as primary key for O(1) authentication lookups
    const profileData = {
      id: deterministicUserId, // Use DUID as primary key for O(1) database lookups
      user_salt: userSalt, // Store user salt for future hashing operations

      // HASHED COLUMNS ONLY - MAXIMUM ENCRYPTION COMPLIANCE
      hashed_username: hashedUsername,
      hashed_npub: hashedUserData.hashed_npub,
      hashed_encrypted_nsec: hashedUserData.hashed_encrypted_nsec,
      hashed_nip05: hashedUserData.hashed_nip05,
      hashed_lightning_address: hashedLightningAddress,

      // Metadata (non-sensitive)
      role: userData.role,
      spending_limits: spendingLimits,
      privacy_settings: {
        privacy_level: 'maximum', // Upgraded to maximum for hashed storage
        zero_knowledge_enabled: true,
        over_encryption: true, // Flag indicating hashed storage
        is_imported_account: userData.isImportedAccount || false,
        detected_profile_data: userData.detectedProfile || null
      },

      // Secure password storage
      password_hash: passwordHash,
      password_salt: passwordSalt,
      password_created_at: new Date().toISOString(),
      password_updated_at: new Date().toISOString(),
      failed_attempts: 0,
      requires_password_change: false,
      is_active: true, // New users are active by default
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Insert into user_identities table (the correct table for Identity Forge)
    const { data, error } = await supabase
      .from('user_identities')
      .insert([profileData])
      .select()
      .single();

    if (error) {
      console.error('User identity creation failed:', error);
      return { success: false, error: 'Failed to create user identity' };
    }

    // REMOVED: profiles table insertion (table does not exist)
    // The user_identities table is the single source of truth for user data
    // Maximum encryption architecture enforced through hashed columns only

    return { success: true, data };
  } catch (error) {
    console.error('User profile creation error:', error);
    return { success: false, error: 'Database operation failed' };
  }
}

/**
 * Identity Registration API Handler - Production Ready
 * @param {Object} event - Netlify Functions event object
 * @param {Object} context - Netlify Functions context object
 * @returns {Promise<Object>} Netlify Functions response object
 */
export default async function handler(event, context) {
  // CORS headers for browser compatibility (env-aware)
  function getAllowedOrigin(origin) {
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) return 'https://satnam.pub';
    if (!origin) return '*';
    try {
      const u = new URL(origin);
      if ((u.hostname === 'localhost' || u.hostname === '127.0.0.1') && (u.protocol === 'http:')) {
        return origin;
      }
    } catch {}
    return '*';
  }
  const requestOrigin = event.headers?.origin || event.headers?.Origin;
  const corsHeaders = {
    'Access-Control-Allow-Origin': getAllowedOrigin(requestOrigin),
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Handle preflight requests
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        ...corsHeaders,
        'Allow': 'POST'
      },
      body: JSON.stringify({
        success: false,
        error: "Method not allowed",
        meta: {
          timestamp: new Date().toISOString(),
        },
      })
    };
  }

  try {
    // Parse request body
    let userData;
    try {
      userData = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Invalid JSON in request body',
          meta: {
            timestamp: new Date().toISOString()
          }
        })
      };
    }

    // Extract client information for security
    const clientInfo = extractClientInfo(event);

    // Rate limiting check
    const rateLimitResult = await checkRateLimit(clientInfo.ipAddress || 'unknown');
    if (!rateLimitResult.allowed) {
      return {
        statusCode: 429,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: rateLimitResult.error,
          retryAfter: rateLimitResult.retryAfter,
          meta: {
            timestamp: new Date().toISOString()
          }
        })
      };
    }

    // Validate request data
    const validationResult = validateRegistrationData(userData);
    if (!validationResult.success) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Invalid registration data',
          details: validationResult.errors,
          meta: {
            timestamp: new Date().toISOString()
          }
        })
      };
    }

    const validatedData = validationResult.data;

    // Check username availability
    const isUsernameAvailable = await checkUsernameAvailability(validatedData.username);
    if (!isUsernameAvailable) {
      return {
        statusCode: 409,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Username is already taken',
          field: 'username',
          meta: {
            timestamp: new Date().toISOString()
          }
        })
      };
    }

    // Generate privacy-preserving identifier
    const hashedIdentifier = await generatePrivacyPreservingHash(validatedData.username);

    // Validate role from Identity Forge (accept as-is, no legacy mapping)
    const standardizedRole = validateRole(validatedData.role);

    // Generate Individual Wallet Sovereignty spending limits
    const spendingLimits = generateSovereigntySpendingLimits(standardizedRole);

    // Create user identity in database with maximum encryption and DUID
    const profileResult = await createUserIdentity(
      { ...validatedData, role: standardizedRole },
      spendingLimits
    );

    if (!profileResult.success) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: profileResult.error,
          meta: {
            timestamp: new Date().toISOString()
          }
        })
      };
    }

    // Get registration salt from Vault for PBKDF2 + SHA-512 compliance
    let registrationSalt;
    try {
      registrationSalt = await vault.getCredentials("registration_salt");
      if (!registrationSalt) {
        console.error('Registration salt not found in Vault');
        registrationSalt = await generateSessionToken(32); // Fallback
      }
    } catch (vaultError) {
      console.error('Vault access failed:', vaultError);
      registrationSalt = await generateSessionToken(32); // Fallback
    }

    // Create secure session with JWT token
    const sessionUserData = {
      npub: `npub_${hashedIdentifier.slice(0, 8)}`, // Privacy-preserving npub reference
      nip05: `${validatedData.username}@satnam.pub`,
      federationRole: standardizedRole,
      authMethod: /** @type {"otp"} */ ('otp'), // Use otp as closest match for registration
      isWhitelisted: true,
      votingPower: standardizedRole === 'guardian' ? 2 : 1,
      guardianApproved: true,
      stewardApproved: ['steward', 'guardian'].includes(standardizedRole),
      sessionToken: '' // Will be set by SecureSessionManager
    };

    // Create secure JWT session
    // Note: First parameter is reserved for future response header setting (currently unused)
    const jwtToken = await SecureSessionManager.createSession(undefined, sessionUserData);

    const responseData = {
      success: true,
      message: "Identity registered successfully with sovereignty enforcement",
      user: {
        id: hashedIdentifier,
        username: validatedData.username,
        displayName: validatedData.displayName || validatedData.username,
        role: standardizedRole,
        spendingLimits,
        registeredAt: new Date().toISOString()
      },
      session: {
        token: jwtToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      },
      meta: {
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'production'
      }
    };

    // Process peer invitation if provided
    if (userData.invitationToken) {
      try {
        // Process the invitation and award credits
        const invitationResponse = await fetch(`${process.env.FRONTEND_URL || 'https://satnam.pub'}/api/authenticated/process-invitation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwtToken}`
          },
          body: JSON.stringify({
            inviteToken: userData.invitationToken
          })
        });

        if (invitationResponse.ok) {
          const invitationResult = await invitationResponse.json();
          if (invitationResult.success) {
            responseData.invitationProcessed = {
              creditsAwarded: invitationResult.creditsAwarded,
              welcomeMessage: invitationResult.welcomeMessage,
              personalMessage: invitationResult.personalMessage
            };
            console.log('Invitation processed successfully during registration');
          }
        }
      } catch (invitationError) {
        console.warn('Failed to process invitation during registration:', invitationError);
        // Don't fail registration if invitation processing fails
      }
    }

    // Family federation invitation handling
    if (validatedData.invitationCode || validatedData.familyId) {
      responseData.postAuthAction = "show_invitation_modal";
    }

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify(responseData)
    };

  } catch (error) {
    console.error('Registration error:', error);

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: "Registration failed",
        meta: {
          timestamp: new Date().toISOString(),
        },
      })
    };
  }
}
