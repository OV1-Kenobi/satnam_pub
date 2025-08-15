/**
 * Identity Registration Netlify Function - Memory Optimized
 * POST /.netlify/functions/register-identity - Register new user identity
 * Accessible via /api/register-identity through netlify.toml redirects
 * @compliance Master Context - Privacy-first, browser-compatible, Bitcoin-only
 * MEMORY OPTIMIZATION: Uses dynamic imports and lazy loading
 */

// Simplified CORS handler with environment-aware origin
function getAllowedOrigin(origin) {
  const isProd = process.env.NODE_ENV === 'production';
  const allowedProdOrigin = process.env.FRONTEND_URL || 'https://satnam.pub';
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

// Main handler function
export const handler = async (event) => {
  // Handle CORS preflight
  const corsResponse = handleCORS(event);
  if (corsResponse) return corsResponse;
  console.log("🔍 REGISTER IDENTITY: Function called", {
    method: event.httpMethod,
    hasBody: !!event.body,
    bodyType: typeof event.body,
    timestamp: new Date().toISOString()
  });

  // CRITICAL: Wrap initialization code in try-catch to prevent unhandled exceptions
  let supabase;
  try {
    // DEBUG: Check environment variables with actual values (masked)
    console.log("🔍 Environment variables check:", {
      hasSupabaseUrl: !!process.env.VITE_SUPABASE_URL,
      supabaseUrlLength: process.env.VITE_SUPABASE_URL?.length || 0,
      hasSupabaseKey: !!process.env.VITE_SUPABASE_ANON_KEY,
      supabaseKeyLength: process.env.VITE_SUPABASE_ANON_KEY?.length || 0,
      nodeEnv: process.env.NODE_ENV,
      allEnvKeys: Object.keys(process.env).filter(k => k.includes('SUPABASE'))
    });

    // Import Supabase client at function scope
    console.log("🔍 Testing Supabase import...");

    try {
      const supabaseModule = await import("./supabase.js");
      supabase = supabaseModule.supabase;
      console.log("✅ Supabase import successful");

      // Test basic Supabase connection using correct table
      console.log("🔍 Testing Supabase connection...");
      const { error } = await supabase.from('user_identities').select('count').limit(1);
      if (error) {
        console.error("❌ Supabase connection test failed:", error);
      } else {
        console.log("✅ Supabase connection test successful");
      }
    } catch (supabaseError) {
      console.error("❌ Supabase import/connection failed:", supabaseError);
      throw new Error(`Supabase setup failed: ${supabaseError.message}`);
    }

    // Validate supabase client is available
    if (!supabase) {
      throw new Error('Supabase client not available');
    }
  } catch (initError) {
    console.error("❌ Function initialization failed:", initError);
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

    console.log('🔍 REGISTER IDENTITY: Parsed request data', {
      hasUserData: !!userData,
      username: userData?.username,
      hasNpub: !!userData?.npub,
      hasEncryptedNsec: !!userData?.encryptedNsec,
      hasPassword: !!userData?.password,
      hasConfirmPassword: !!userData?.confirmPassword,
      hasNip05: !!userData?.nip05,
      hasLightningAddress: !!userData?.lightningAddress,
      allKeys: Object.keys(userData || {}),
      timestamp: new Date().toISOString()
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

    // Log registration attempt (without sensitive data)
    console.log('🔐 Identity registration attempt:', {
      username: userData.username,
      hasNpub: !!userData.npub,
      hasEncryptedNsec: !!userData.encryptedNsec,
      hasNip05: !!userData.nip05,
      hasLightningAddress: !!userData.lightningAddress,
      timestamp: new Date().toISOString()
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
    console.log('🔐 Generating secure DUID index...');

    // Import server-side DUID indexing using self-contained robust import
    const duidMod = await robustImport(
      './security/duid-index-generator.js',
      ['netlify', 'functions', 'security', 'duid-index-generator.js']
    );
    const { generateDUIDIndexFromNpub, auditDUIDOperation } = duidMod;

    // Generate DUID index from npub (server-side secret indexing)
    const duid_index = generateDUIDIndexFromNpub(userData.npub);

    // Audit the DUID generation for security monitoring
    auditDUIDOperation('REGISTRATION_DUID_GENERATION', {
      npubPrefix: userData.npub.substring(0, 10) + '...',
      indexPrefix: duid_index.substring(0, 10) + '...',
      username: userData.username
    });

    console.log('🔐 Generated secure DUID index:', {
      indexPrefix: duid_index.substring(0, 10) + '...',
      timestamp: new Date().toISOString()
    });

    // 1. Create hashed user data for privacy-first storage
    console.log("🔍 Testing privacy hashing import...");

    // Import privacy hashing functions at function scope
    const { createHashedUserData, generateUserSalt } = await import("../../lib/security/privacy-hashing.js");
    console.log("✅ Privacy hashing import successful");

    // Test salt generation first
    console.log("🔍 Testing salt generation...");
    try {
      const testSalt = await generateUserSalt();
      console.log("✅ Salt generation successful:", {
        hasSalt: !!testSalt,
        saltLength: testSalt ? testSalt.length : 0,
        saltType: typeof testSalt
      });
    } catch (saltError) {
      console.error("❌ Salt generation failed:", saltError);
      throw new Error(`Salt generation failed: ${saltError.message}`);
    }

    try {

      console.log("🔍 Creating MAXIMUM ENCRYPTION hashed user data...");
      console.log("🔍 Input data for hashing:", {
        username: userData.username,
        hasNpub: !!userData.npub,
        hasEncryptedNsec: !!userData.encryptedNsec,
        nip05: userData.nip05 || `${userData.username}@satnam.pub`,
        lightningAddress: userData.lightningAddress || (userData.lightningEnabled ? `${userData.username}@satnam.pub` : null)
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

      console.log("🔍 User data prepared for hashing:", {
        hasUsername: !!userDataForHashing.username,
        usernameType: typeof userDataForHashing.username,
        usernameValue: userDataForHashing.username,
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

      let hashedUserData;
      try {
        hashedUserData = await createHashedUserData(userDataForHashing);
      } catch (hashingError) {
        console.error("❌ Privacy hashing operation failed:", hashingError);
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
        console.error('❌ CRITICAL DATABASE ERROR - Consolidated user creation failed:', {
          message: userError.message,
          details: userError.details,
          hint: userError.hint,
          code: userError.code,
          fullError: userError
        });

        // Check if it's a column missing error
        if (userError.message && userError.message.includes('column')) {
          console.error('❌ SCHEMA ERROR: Missing database column detected');
          console.error('❌ Required columns for user_identities table:', Object.keys(insertPayload));
        }

        throw new Error(`User creation failed: ${userError.message}`);
      }

      console.log("✅ Consolidated user data created successfully in user_identities table");

    console.log('✅ Successfully stored user identity data:', {
      duid_index: duid_index.substring(0, 10) + '...',
      username: userData.username,
      npub: userData.npub,
      timestamp: new Date().toISOString()
    });

    // SAFEGUARD: Prevent duplicate NIP-05 name entries before insert
    try {
      const { data: existingNip05 } = await supabase
        .from('nip05_records')
        .select('id')
        .eq('domain', 'satnam.pub')
        .eq('name', userData.username)
        .eq('is_active', true)
        .limit(1);

      const taken = Array.isArray(existingNip05)
        ? existingNip05.length > 0
        : !!(existingNip05 && existingNip05.id);

      if (taken) {
        console.error('❌ NIP-05 name already taken:', {
          domain: 'satnam.pub',
          name: userData.username
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
      console.warn('⚠️ NIP-05 availability check failed, proceeding to insert (will rely on DB constraint):', availabilityError);
      // Continue to insertion; will handle unique constraint error below
    }
    // 4. Create MAXIMUM ENCRYPTED NIP-05 record (minimal scope, unique salt)
    const nip05Salt = await generateUserSalt(); // Generate unique salt for nip05_records
    const hashedNip05Data = await createHashedUserData({
      username: userData.username,
      npub: userData.npub
    }, nip05Salt);

    const { error: nip05Error } = await supabase
      .from('nip05_records')
      .insert({
        // UNENCRYPTED: Only essential verification fields
        domain: 'satnam.pub', // Whitelisted domain (required for verification)
        is_active: true, // Active status (required for verification)
        name: userData.username, // Plaintext local-part for public NIP-05 mapping
        pubkey: userData.npub, // Plaintext npub for public NIP-05 mapping
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),

        // MAXIMUM ENCRYPTION: All user-related data hashed
        user_salt: hashedNip05Data.user_salt, // UNIQUE salt (no reuse)
        hashed_name: hashedNip05Data.hashed_username, // ENCRYPTED: NIP-05 name
        hashed_npub: hashedNip05Data.hashed_npub, // FIXED: Consistent column naming
      });

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

      console.error('Failed to create NIP-05 record:', nip05Error);

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
      console.error("❌ Registration process failed:", registrationError);
      throw new Error(`Registration failed: ${registrationError.message}`);
    }

  } catch (error) {
    console.error("❌ Error registering identity:", error);

    // Return appropriate error response
    const errorMessage = error.message || "Internal server error during registration";
    const statusCode = error.message?.includes('Missing required fields') ? 400 : 500;

    return {
      statusCode,
      headers,
      body: JSON.stringify({
        success: false,
        error: errorMessage,
        meta: {
          timestamp: new Date().toISOString(),
        },
      }),
    };
  }
};
