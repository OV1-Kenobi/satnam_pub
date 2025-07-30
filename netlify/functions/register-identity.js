/**
 * Identity Registration Netlify Function
 * POST /.netlify/functions/register-identity - Register new user identity
 * Accessible via /api/register-identity through netlify.toml redirects
 * @compliance Master Context - Privacy-first, browser-compatible, Bitcoin-only
 *
 * CONSOLIDATED VERSION - Complete database schema support with comprehensive error handling
 */

import { supabase } from "./supabase.js";

export const handler = async (event) => {
  console.log("🔍 REGISTER IDENTITY: Function called", {
    method: event.httpMethod,
    hasBody: !!event.body,
    bodyType: typeof event.body,
    timestamp: new Date().toISOString()
  });

  // CORS headers following established codebase pattern
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
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

    // Generate proper UUID for user ID using established pattern
    const userId = crypto.randomUUID();

    console.log('🔐 Generated user ID:', {
      userId,
      timestamp: new Date().toISOString()
    });

    // Store user data in existing user_identities table
    const { error: userError } = await supabase
      .from('user_identities')
      .insert({
        // Standard UUID primary key
        id: userId,

        // Identity data
        username: userData.username,
        npub: userData.npub,
        encrypted_nsec: userData.encryptedNsec,

        // Network integration
        nip05: userData.nip05 || `${userData.username}@satnam.pub`,
        lightning_address: userData.lightningAddress || (userData.lightningEnabled ? `${userData.username}@satnam.pub` : null),

        // User sovereignty
        role: 'private', // Default role for individual users
        spending_limits: {
          daily_limit: -1, // Unlimited for private users
          requires_approval: false
        },
        privacy_settings: {
          privacy_level: 'enhanced',
          zero_knowledge_enabled: true
        },

        // Access control
        is_active: true,

        // Timestamps
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (userError) {
      console.error('Failed to store user identity data:', userError);
      throw new Error('Failed to store user identity data');
    }

    console.log('✅ Successfully stored user identity data:', {
      userId: userId,
      username: userData.username,
      npub: userData.npub,
      timestamp: new Date().toISOString()
    });

    // 4. Create NIP-05 record for verification
    const { error: nip05Error } = await supabase
      .from('nip05_records')
      .insert({
        name: userData.username,
        pubkey: userData.npub,
        domain: 'satnam.pub', // NEW COLUMN - now supported
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (nip05Error) {
      console.error('Failed to create NIP-05 record:', nip05Error);

      // Cleanup: Remove user identity record if NIP-05 creation failed
      await supabase.from('user_identities').delete().eq('id', userId);

      throw new Error('Failed to create NIP-05 record');
    }

    console.log('✅ User registered successfully in user_identities table:', {
      userId: userId,
      username: userData.username,
      npub: userData.npub,
      table: 'user_identities',
      timestamp: new Date().toISOString()
    });

    // Success response with user_identities architecture data
    const responseData = {
      success: true,
      message: "Identity registered successfully in user_identities table",
      user: {
        id: userId, // Standard UUID identifier
        username: userData.username,
        npub: userData.npub,
        nip05: userData.nip05 || `${userData.username}@satnam.pub`,
        lightningAddress: userData.lightningAddress || (userData.lightningEnabled ? `${userData.username}@satnam.pub` : null),
        registeredAt: new Date().toISOString(),
        role: 'private', // Individual user role
        privacyLevel: 'enhanced',
        zeroKnowledgeEnabled: true
      },
      meta: {
        timestamp: new Date().toISOString(),
        architecture: 'user_identities', // Existing table architecture
        tablesUpdated: ['user_identities', 'nip05_records'] // Established architecture
      }
    };

    // Check if this is a family federation invitation scenario
    if (userData.invitationCode || userData.familyId) {
      responseData.postAuthAction = "show_invitation_modal";
    }

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify(responseData),
    };

  } catch (error) {
    console.error("Error registering identity:", error);
    
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
