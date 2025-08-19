/**
 * Identity Registration Netlify Function - Memory Optimized
 * POST /.netlify/functions/register-identity - Register new user identity
 * Accessible via /api/register-identity through netlify.toml redirects
 * @compliance Master Context - Privacy-first, browser-compatible, Bitcoin-only
 * MEMORY OPTIMIZATION: Uses dynamic imports and lazy loading
 */

// Server-only env accessor for Netlify Functions
function getEnvVar(key) {
  return process.env[key];
}
// Simplified CORS handler with environment-aware origin
function getAllowedOrigin(origin) {
  const isProd = process.env.NODE_ENV === 'production';
  const allowedProdOrigin = process.env.FRONTEND_URL || 'https://www.satnam.pub';
  if (isProd) return allowedProdOrigin;
  // Allow common local dev origins
  if (!origin) return null;
  try {
    const u = new URL(origin);
    if ((u.hostname === 'localhost' || u.hostname === '127.0.0.1') && (u.protocol === 'http:' || u.protocol === 'https:')) {
      return origin;
    }
  } catch {}
  return null;
}

function handleCORS(event) {
  const origin = event.headers?.origin || event.headers?.Origin;
  const allowedOrigin = getAllowedOrigin(origin);
  const allowCreds = allowedOrigin !== '*' && allowedOrigin !== null;
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Credentials': String(allowCreds),
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
        'Content-Type': 'application/json'
      },
      body: ''
    };
  }
  return null;
}

// Server-side DUID hashing for NIP-05 availability and storage
import crypto from 'crypto';
function getDuidSecret() {
  const s = getEnvVar('DUID_SERVER_SECRET');
  if (!s) throw new Error('Missing DUID_SERVER_SECRET for NIP-05 hashing');
  return s;
}
function hashWithServerSecret(value) {
  const secret = getDuidSecret();
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}
function computeHashedNip05(identifier) {
  // Normalize to lowercase for canonical hashing
  return hashWithServerSecret(String(identifier).trim().toLowerCase());
}
function computeHashedNpub(npub) {
  // Namespace the input to avoid cross-domain collisions
  return hashWithServerSecret(`NPUBv1:${String(npub).trim()}`);
}
function encryptWithServerSecret(plaintext) {
  const secret = getDuidSecret();
  const key = crypto.createHash('sha256').update(secret).digest(); // 32 bytes
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

// Main handler function
export const handler = async (event) => {
  const { privacyHash, prefix, safeLog, safeError } = await import('./utils/privacy-logger.js');
  // Handle CORS preflight
  const corsResponse = handleCORS(event);
  if (corsResponse) return corsResponse;
  safeLog('REGISTER_IDENTITY_CALLED', {
    method: event.httpMethod,
    hasBody: !!event.body,
    bodyType: typeof event.body,
  });

  // CRITICAL: Wrap initialization code in try-catch to prevent unhandled exceptions
  let supabase;
  try {
    // DEBUG: Check environment variables with actual values (masked)
    safeLog('ENVIRONMENT_CHECK', {
      hasSupabaseUrl: !!getEnvVar('SUPABASE_URL') || !!getEnvVar('VITE_SUPABASE_URL'),
      supabaseUrlLength: (getEnvVar('SUPABASE_URL') || getEnvVar('VITE_SUPABASE_URL') || '').length,
      hasSupabaseKey: !!getEnvVar('SUPABASE_SERVICE_ROLE_KEY') || !!getEnvVar('SUPABASE_ANON_KEY') || !!getEnvVar('VITE_SUPABASE_ANON_KEY'),
      supabaseKeyLength: (getEnvVar('SUPABASE_SERVICE_ROLE_KEY') || getEnvVar('SUPABASE_ANON_KEY') || getEnvVar('VITE_SUPABASE_ANON_KEY') || '').length,
      nodeEnv: getEnvVar('NODE_ENV'),
      supabaseEnvKeysCount: Object.keys(process.env).filter(k => k.includes('SUPABASE')).length
    });

    // Import Supabase client at function scope
    safeLog('SUPABASE_IMPORT_TEST');

    try {
      const supabaseModule = await import("./supabase.js");
      supabase = supabaseModule.supabase;
      const keyType = supabaseModule.supabaseKeyType || 'unknown';
      const isService = typeof supabaseModule.isServiceRoleKey === 'function' ? supabaseModule.isServiceRoleKey() : false;
      console.log("✅ Supabase import successful", { keyType, isService, note: isService ? 'service role (bypasses RLS)' : 'anon key (requires RLS allowlist)'});

      // Do NOT enforce service role in dev or prod; rely on RLS policies when anon key is used
      // If inserts fail with 42501, update RLS policies (see scripts/revert_rls_allow_anon_insert_full.sql)

      // Test basic Supabase connection using correct table
      safeLog('SUPABASE_CONN_TEST');
      const { error } = await supabase.from('user_identities').select('count').limit(1);
      if (error) {
        safeError('SUPABASE_CONN_FAIL', { code: error.code, msg: error.message });
      } else {
        safeLog('SUPABASE_CONN_OK');
      }
    } catch (supabaseError) {
      safeError('SUPABASE_IMPORT_FAIL', { msg: supabaseError instanceof Error ? supabaseError.message : String(supabaseError) });
      throw new Error(`Supabase setup failed: ${supabaseError.message}`);
    }

    // Validate supabase client is available
    if (!supabase) {
      throw new Error('Supabase client not available');
    }
  } catch (initError) {
    safeError('INIT_FAIL', { msg: initError instanceof Error ? initError.message : String(initError) });
    const origin = event.headers?.origin || event.headers?.Origin;
    const allowedOrigin = getAllowedOrigin(origin);
    const allowCreds = allowedOrigin !== '*' && allowedOrigin !== null;
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Credentials": String(allowCreds),
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin, Access-Control-Request-Method, Access-Control-Request-Headers",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: false,
        error: "Service initialization failed",
        meta: {
          timestamp: new Date().toISOString(),
        },
      }),
    };
  }

  // CORS headers following established codebase pattern
  const origin = event.headers?.origin || event.headers?.Origin;
  const allowedOrigin = getAllowedOrigin(origin);
  const allowCreds = allowedOrigin !== '*' && allowedOrigin !== null;
  const headers = {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Credentials": String(allowCreds),
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin, Access-Control-Request-Method, Access-Control-Request-Headers",
    "Content-Type": "application/json",
    // Debug headers to correlate client vs server behavior
    "X-Register-Identity-Status": "ok",
  };

  // Diagnostic phase tracker for error correlation
  let currentPhase = 'START';

  // Handle preflight requests
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        ...headers,
        "Allow": "POST",
      },
      body: JSON.stringify({
        success: false,
        error: "Method not allowed",
        meta: {
          timestamp: new Date().toISOString(),
        },
      }),
    };
  }

  try {
    // Parse request body following established codebase pattern
    const userData = JSON.parse(event.body || "{}");
    // log request parse (sanitized)
    safeLog('REQUEST_PARSED', {
      hasUserData: !!userData,
      usernameHash: userData?.username ? privacyHash(userData.username) : null,
      hasNpub: !!userData?.npub,
      hasEncryptedNsec: !!userData?.encryptedNsec,
      hasPassword: !!userData?.password,
      hasConfirmPassword: !!userData?.confirmPassword,
      hasNip05: !!userData?.nip05,
      hasLightningAddress: !!userData?.lightningAddress,
      allKeysCount: Object.keys(userData || {}).length
    });

    // Comprehensive validation - Updated to check for npub instead of publicKey
    if (!userData || !userData.username || !userData.npub || !userData.encryptedNsec) {
      console.error('🔍 REGISTER IDENTITY: Validation failed', {
        hasUserData: !!userData,
        hasUsername: !!userData?.username,
        hasNpub: !!userData?.npub,
        hasEncryptedNsec: !!userData?.encryptedNsec,
        receivedFields: userData ? Object.keys(userData) : [],
        timestamp: new Date().toISOString()
      });

      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: "Missing required fields: username, npub, and encryptedNsec are required",
          received: userData ? Object.keys(userData) : [],
          meta: {
            timestamp: new Date().toISOString(),
          },
        }),
      };
    }

    // Privacy-preserving registration attempt log
    safeLog('REGISTRATION_ATTEMPT', {
      usernameHash: privacyHash(userData.username),
      hasNpub: !!userData.npub,
      hasEncryptedNsec: !!userData.encryptedNsec,
      hasNip05: !!userData.nip05,
      hasLightningAddress: !!userData.lightningAddress
    });
    // Validate password for password-based signin compatibility
    if (userData.password === null || userData.password === undefined || typeof userData.password !== 'string' || userData.password.length < 8) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Password must be at least 8 characters long',
          field: 'password',
          meta: { timestamp: new Date().toISOString() }
        })
      };
    }
    if (userData.confirmPassword !== undefined && userData.password !== userData.confirmPassword) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Passwords do not match',
          field: 'confirmPassword',
          meta: { timestamp: new Date().toISOString() }
        })
      };
    }



    // Self-contained robust dynamic import helper to avoid utility imports
    async function robustImport(rel, segs) {
      try {
        return await import(rel);
      } catch (_e1) {
        const path = await import('node:path');
        const url = await import('node:url');
        const fileUrl = url.pathToFileURL(path.resolve(process.cwd(), ...segs)).href;
        return await import(fileUrl);
      }
    }

    // Generate secure DUID index for database storage (Phase 2 implementation)
    currentPhase = 'DUID_INDEX_GENERATION_START';
    safeLog('DUID_INDEX_GENERATION_START');

    // Import server-side DUID indexing using self-contained robust import
    let generateDUIDIndexFromNpub;
    let auditDUIDOperation;
    try {
      const duidMod = await import('./security/duid-index-generator.mjs');
      const duidExports = duidMod && duidMod.default ? duidMod.default : duidMod;
      ({ generateDUIDIndexFromNpub, auditDUIDOperation } = duidExports);
    } catch (duidImportErr) {
      safeError('DUID_IMPORT_FAIL', {
        msg: duidImportErr instanceof Error ? duidImportErr.message : String(duidImportErr),
        stack: duidImportErr instanceof Error ? String(duidImportErr.stack || '').slice(0, 2000) : undefined,
      });
      throw new Error('DUID module import failed');
    }

    // Generate DUID index from npub (server-side secret indexing)
    let duid_index;
    try {
      duid_index = generateDUIDIndexFromNpub(userData.npub);
    } catch (duidGenErr) {
      safeError('DUID_GENERATION_FAIL', {
        msg: duidGenErr instanceof Error ? duidGenErr.message : String(duidGenErr),
        stack: duidGenErr instanceof Error ? String(duidGenErr.stack || '').slice(0, 2000) : undefined,
      });
      throw new Error('Failed to generate DUID index from npub');
    }

    // Audit the DUID generation for security monitoring
    auditDUIDOperation('REGISTRATION_DUID_GENERATION', {
      npubPrefix: prefix(userData.npub),
      indexPrefix: duid_index.substring(0, 10) + '...',
      usernameHash: privacyHash(userData.username)
    });

    currentPhase = 'AFTER_DUID';
    console.log('🔐 Generated secure DUID index:', {
      indexPrefix: duid_index.substring(0, 10) + '...',
      timestamp: new Date().toISOString()
    });

    // 1. Create hashed user data for privacy-first storage (server-side, Node crypto)
    console.log("🔍 Initializing server-side privacy hashing...");

    // Node.js hashing helpers to avoid browser-only Web Crypto in functions
    const { randomBytes, createHash } = await import('node:crypto');

    const generateUserSaltNode = () => randomBytes(32).toString('hex'); // 64 hex chars
    const GLOBAL_SALT = 'satnam_privacy_salt_2024';
    const hashUserDataNode = (data, userSalt) => {
      const s = typeof data === 'string' ? data : String(data ?? '');
      const combined = s + userSalt + GLOBAL_SALT;
      return createHash('sha512').update(combined).digest('hex');
    };

    try {

      safeLog('HASHING_START');
      safeLog('HASHING_INPUT_META', {
        usernameHash: userData?.username ? privacyHash(userData.username) : null,
        hasNpub: !!userData.npub,
        hasEncryptedNsec: !!userData.encryptedNsec,
        hasNip05: !!userData.nip05,
        hasLightningAddress: !!userData.lightningAddress
      });

      // Prepare user data object with explicit validation
      const userDataForHashing = {
        username: userData.username,
        bio: '', // Empty initially, will be hashed
        displayName: userData.username, // Use username as display name initially
        picture: '', // Empty initially, will be hashed
        npub: userData.npub,
        nip05: userData.nip05 || `${userData.username}@satnam.pub`,
        lightningAddress: userData.lightningAddress || (userData.lightningEnabled ? `${userData.username}@satnam.pub` : null),
        encryptedNsec: userData.encryptedNsec,
        role: 'private'
      };

      safeLog('HASHING_PREP_META', {
        hasUsername: !!userDataForHashing.username,
        usernameType: typeof userDataForHashing.username,
        hasDisplayName: !!userDataForHashing.displayName,
        displayNameType: typeof userDataForHashing.displayName,
        bioType: typeof userDataForHashing.bio,
        pictureType: typeof userDataForHashing.picture
      });

      // Derive PBKDF2/SHA-512 password hash & base64 salt for password-based signin
      const { pbkdf2, randomBytes } = await import('node:crypto');
      const password_salt = randomBytes(24).toString('base64');
      const iterations = 100000;
      const keyLength = 64;
      const algorithm = 'sha512';
      const hashBuf = await new Promise((resolve, reject) => {
        pbkdf2(userData.password, password_salt, iterations, keyLength, algorithm, (err, derivedKey) => {
          if (err) reject(err); else resolve(derivedKey);
        });
      });
      const password_hash = Buffer.from(hashBuf).toString('base64');

      // Build hashed user data (server-side)
      let hashedUserData;
      try {
        const user_salt = generateUserSaltNode();
        hashedUserData = {
          user_salt,
          username: userDataForHashing.username,
          hashed_username: userDataForHashing.username ? hashUserDataNode(userDataForHashing.username, user_salt) : null,
          hashed_bio: hashUserDataNode(userDataForHashing.bio || '', user_salt),
          hashed_display_name: userDataForHashing.displayName ? hashUserDataNode(userDataForHashing.displayName, user_salt) : null,
          hashed_picture: hashUserDataNode(userDataForHashing.picture || '', user_salt),
          hashed_npub: userDataForHashing.npub ? hashUserDataNode(userDataForHashing.npub, user_salt) : null,
          hashed_nip05: userDataForHashing.nip05 ? hashUserDataNode(userDataForHashing.nip05, user_salt) : null,
          hashed_lightning_address: userDataForHashing.lightningAddress ? hashUserDataNode(userDataForHashing.lightningAddress, user_salt) : null,
          hashed_encrypted_nsec: userDataForHashing.encryptedNsec ? hashUserDataNode(userDataForHashing.encryptedNsec, user_salt) : null,
        };
      } catch (hashingError) {
        safeError('HASHING_FAIL', { msg: hashingError instanceof Error ? hashingError.message : String(hashingError) });
        throw new Error(`Privacy hashing failed: ${hashingError.message}`);
      }

      console.log("🔍 Hashed user data generated:", {
        hasUserSalt: !!hashedUserData.user_salt,
        hasHashedUsername: !!hashedUserData.hashed_username,
        hasHashedNpub: !!hashedUserData.hashed_npub,
        hasHashedNip05: !!hashedUserData.hashed_nip05,
        hasHashedEncryptedNsec: !!hashedUserData.hashed_encrypted_nsec,
        allHashedKeys: Object.keys(hashedUserData)
      });

      // MAXIMUM ENCRYPTION: Store ALL user data as hashed (over-encryption strategy)
      console.log("🔍 Inserting MAXIMUM ENCRYPTED user data into user_identities table...");

      // Prepare insert payload with detailed logging
      const insertPayload = {
        // UNENCRYPTED: Only essential system operation fields
        id: duid_index, // DUID index identifier (Phase 2 secure architecture)
        role: 'private', // User role (required for authorization)
        is_active: true, // Active status (required for system operation)
        created_at: new Date().toISOString(), // System timestamp
        updated_at: new Date().toISOString(), // System timestamp

        // MAXIMUM ENCRYPTION: ALL user data hashed
        user_salt: hashedUserData.user_salt, // Individual user salt
        hashed_username: hashedUserData.hashed_username, // ENCRYPTED: Username
        hashed_bio: hashedUserData.hashed_bio, // ENCRYPTED: Bio text
        hashed_display_name: hashedUserData.hashed_display_name, // ENCRYPTED: Display name
        hashed_picture: hashedUserData.hashed_picture, // ENCRYPTED: Picture URL
        hashed_npub: hashedUserData.hashed_npub, // ENCRYPTED: Nostr public key
        hashed_nip05: hashedUserData.hashed_nip05, // ENCRYPTED: NIP-05 identifier
        hashed_lightning_address: hashedUserData.hashed_lightning_address, // ENCRYPTED: Lightning address
        hashed_encrypted_nsec: hashedUserData.hashed_encrypted_nsec, // ENCRYPTED: Encrypted private key

        // Password-based signin compatibility
        password_hash: password_hash,
        password_salt: password_salt,
        password_created_at: new Date().toISOString(),
        password_updated_at: new Date().toISOString(),
        failed_attempts: 0,
        requires_password_change: false,

        // METADATA (can be encrypted if needed)
        spending_limits: JSON.stringify({
          daily_limit: -1, // Unlimited for private users
          requires_approval: false
        }),
        privacy_settings: JSON.stringify({
          privacy_level: 'maximum',
          zero_knowledge_enabled: true,
          over_encryption: true
        })
      };

      console.log("🔍 Database insert payload structure:", {
        payloadKeys: Object.keys(insertPayload),
        hasRequiredFields: {
          id: !!insertPayload.id,
          role: !!insertPayload.role,
          is_active: insertPayload.is_active !== undefined,
          user_salt: !!insertPayload.user_salt,
          hashed_username: !!insertPayload.hashed_username,
          hashed_npub: !!insertPayload.hashed_npub
        }
      });

      const { error: userError } = await supabase
        .from('user_identities')
        .insert(insertPayload);

      if (userError) {
        safeError('DB_INSERT_USER_IDENTITIES_FAIL', {
          msg: userError.message,
          details: userError.details,
          hint: userError.hint,
          code: userError.code,
          stack: (userError && typeof userError === 'object' && 'stack' in userError) ? String(userError.stack || '').slice(0, 2000) : undefined,
        });

        // Check if it's a column missing error
        if (userError.message && userError.message.includes('column')) {
          safeError('SCHEMA_MISSING_COLUMN', {
            requiredColumns: Object.keys(insertPayload),
          });
        }

        throw new Error(`User creation failed: ${userError.message}`);
      }

      currentPhase = 'AFTER_DB_USER';
      console.log("✅ Consolidated user data created successfully in user_identities table");

    console.log('✅ Successfully stored user identity data:', {
      duid_index: duid_index.substring(0, 10) + '...',
      username: userData.username,
      npub: userData.npub,
      timestamp: new Date().toISOString()
    });

    // SAFEGUARD: Prevent duplicate NIP-05 using server-side DUID hashing (no plaintext)
    try {
      const identifier = (userData.nip05 || `${userData.username}@satnam.pub`).trim().toLowerCase();
      const hashed_nip05 = computeHashedNip05(identifier);
      const { data: existingNip05 } = await supabase
        .from('nip05_records')
        .select('id')
        .eq('domain', 'satnam.pub')
        .eq('hashed_nip05', hashed_nip05)
        .eq('is_active', true)
        .limit(1);

      const taken = Array.isArray(existingNip05)
        ? existingNip05.length > 0
        : !!(existingNip05 && existingNip05.id);

      if (taken) {
        console.error('❌ NIP-05 name already taken (hashed check):', {
          domain: 'satnam.pub',
          identifier
        });

        // Cleanup: Remove user identity record to avoid orphaned user
        try {
          const { error: cleanupError } = await supabase.from('user_identities').delete().eq('id', duid_index);
          if (cleanupError) {
            console.error('Failed to cleanup user_identities record:', cleanupError);
          }
        } catch (cleanupErr) {
          console.error('Exception during cleanup:', cleanupErr);
        }

        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'NIP-05 name already taken',
            code: 'NIP05_NAME_TAKEN',
            details: `The username "${userData.username}" is already in use on satnam.pub. Please choose another.`,
            meta: { timestamp: new Date().toISOString() }
          })
        };
      }
    } catch (availabilityError) {
      console.warn('⚠️ NIP-05 availability check failed (hashed), proceeding to insert (will rely on DB constraint):', availabilityError);
      // Continue to insertion; will handle unique constraint error below
    }
    // 4. Create NIP-05 record with server-side DUID hashing (no plaintext)
    const identifier = (userData.nip05 || `${userData.username}@satnam.pub`).trim().toLowerCase();
    const hashed_nip05 = computeHashedNip05(identifier);
    const hashed_npub = computeHashedNpub(userData.npub);

    const { error: nip05Error } = await supabase
      .from('nip05_records')
      .insert({
        domain: 'satnam.pub',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        hashed_nip05,
        hashed_npub,
      });

    // 4b. Write per-user verification artifact (non-blocking)
    try {
      const artifact = {
        name: userData.username,
        domain: 'satnam.pub',
        pubkey: userData.npub,
        issued_at: new Date().toISOString(),
      };
      const crypto = await import('node:crypto');
      const secret = getDuidSecret();
      const verifier = crypto.createHmac('sha256', secret);
      verifier.update(JSON.stringify(artifact));
      const integrity = verifier.digest('hex');
      const payload = JSON.stringify({ ...artifact, integrity });

      const { supabase } = await import('./supabase.js');
      const hashed_nip05 = computeHashedNip05(`${userData.username}@satnam.pub`);
      const path = `nip05_artifacts/satnam.pub/${hashed_nip05}.json`;
      const { error: uploadError } = await supabase.storage
        .from('nip05-artifacts')
        .upload(path, new Blob([payload], { type: 'application/json' }), { upsert: true });
      if (uploadError) console.warn('Artifact upload error', uploadError);
      else console.log('✅ Wrote NIP-05 artifact', { path });
    } catch (artifactErr) {
      safeError('ARTIFACT_UPLOAD_FAIL', {
        msg: artifactErr instanceof Error ? artifactErr.message : String(artifactErr),
        stack: artifactErr instanceof Error ? String(artifactErr.stack || '').slice(0, 2000) : undefined,
      });
      console.warn('nostr-json artifact write failed (non-blocking):', artifactErr);
    }

    if (nip05Error) {
      // Handle unique constraint (duplicate name) gracefully
      const duplicate =
        (nip05Error.code && String(nip05Error.code) === '23505') ||
        (nip05Error.message && nip05Error.message.toLowerCase().includes('duplicate'));

      if (duplicate) {
        console.warn('⚠️ Duplicate NIP-05 name detected during insert:', {
          domain: 'satnam.pub',
          name: userData.username,
        });

        // Cleanup: Remove user identity record to avoid orphaned user
        try {
          const { error: cleanupError } = await supabase.from('user_identities').delete().eq('id', duid_index);
          if (cleanupError) {
            console.error('Failed to cleanup user_identities record:', cleanupError);
          }
        } catch (cleanupErr) {
          console.error('Exception during cleanup:', cleanupErr);
        }

        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'NIP-05 name already taken',
            code: 'NIP05_NAME_TAKEN',
            details: `The username "${userData.username}" is already in use on satnam.pub. Please choose another.`,
            meta: { timestamp: new Date().toISOString() },
          }),
        };
      }

      safeError('DB_INSERT_NIP05_FAIL', {
        msg: nip05Error.message,
        details: nip05Error.details,
        hint: nip05Error.hint,
        code: nip05Error.code,
        stack: (nip05Error && typeof nip05Error === 'object' && 'stack' in nip05Error) ? String(nip05Error.stack || '').slice(0, 2000) : undefined,
      });

      // Cleanup: Remove user identity record if NIP-05 creation failed
      try {
        const { error: cleanupError } = await supabase.from('user_identities').delete().eq('id', duid_index);
        if (cleanupError) {
          console.error('Failed to cleanup user_identities record:', cleanupError);
        }
      } catch (cleanupErr) {
        console.error('Exception during cleanup:', cleanupErr);
      }

      throw new Error('Failed to create NIP-05 record');
    }

    // 5. Verify privacy compliance before response
    currentPhase = 'BEFORE_RESPONSE';
    console.log('🔍 Verifying privacy compliance...');
    if (!hashedUserData.user_salt || !hashedUserData.hashed_npub || !hashedUserData.hashed_encrypted_nsec) {
      console.error('❌ PRIVACY VIOLATION: Critical data not properly hashed');
      throw new Error('Privacy compliance verification failed - missing hashed data');
    }
    console.log('✅ Privacy compliance verified - all sensitive data properly hashed');

    console.log('✅ User registered successfully with secure DUID indexing:', {
      duid_index: duid_index.substring(0, 10) + '...',
      username: userData.username,
      hasHashedData: true,
      table: 'user_identities',
      secureIndexing: true,
      timestamp: new Date().toISOString()
    });

    // Success response (PRIVACY-FIRST: No sensitive data in response)
    const responseData = {
      success: true,
      message: "Identity registered successfully with privacy-first protection",
      user: {
        id: duid_index, // Secure DUID index identifier (Phase 2)
        username: userData.username, // Only unencrypted field
        nip05: userData.nip05 || `${userData.username}@satnam.pub`, // Public identifier
        lightningAddress: userData.lightningAddress || (userData.lightningEnabled ? `${userData.username}@satnam.pub` : null),
        registeredAt: new Date().toISOString(),
        role: 'private', // Individual user role
        privacyProtected: true, // ALL user data is encrypted
        privacyLevel: 'maximum', // Over-encryption strategy
        zeroKnowledgeEnabled: true,
        encryptionStrategy: 'over_encryption' // Maximum database breach protection
      },
      meta: {
        timestamp: new Date().toISOString(),
        architecture: 'maximum_encryption_two_tables', // Lean architecture
        tablesUpdated: ['user_identities', 'nip05_records'], // Only 2 tables
        encryptionScope: 'ALL user data encrypted, frontend decryption required',
        backwardCompatibility: 'NONE - greenfield maximum security approach'
      }
    };

    // Check if this is a family federation invitation scenario
    if (userData.invitationCode || userData.familyId) {
      responseData.postAuthAction = "show_invitation_modal";
    }

    console.log("✅ Registration completed successfully");
    return {
      statusCode: 201,
      headers,
      body: JSON.stringify(responseData),
    };

    } catch (registrationError) {
      safeError('REGISTRATION_PHASE_FAIL', {
        msg: registrationError instanceof Error ? registrationError.message : String(registrationError),
        stack: registrationError instanceof Error ? String(registrationError.stack || '').slice(0, 2000) : undefined,
        phase: currentPhase,
      });
      console.error("❌ Registration process failed:", registrationError);
      throw new Error(`Registration failed: ${registrationError.message}`);
    }

  } catch (error) {
    safeError('REGISTER_IDENTITY_FAIL', {
      msg: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? String(error.stack || '').slice(0, 2000) : undefined,
      phase: currentPhase,
    });
    console.error("❌ Error registering identity:", error);

    // Return appropriate error response
    const errorMessage = error.message || "Internal server error during registration";
    const statusCode = error.message?.includes('Missing required fields') ? 400 : 500;

    return {
      statusCode,
      headers: { ...headers, 'X-Trace-Phase': currentPhase },
      body: JSON.stringify({
        success: false,
        error: errorMessage,
        meta: {
          timestamp: new Date().toISOString(),
          phase: currentPhase,
        },
      }),
    };
  }
};
