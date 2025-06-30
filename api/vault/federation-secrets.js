/**
 * Federation Secrets API Endpoint - Uses Supabase Vault
 * GET /api/vault/federation-secrets - Get federation secrets from Vault
 */


// Handle CORS
function setCorsHeaders(req, res) {
  const allowedOrigins = process.env.NODE_ENV === "production"
    ? [process.env.FRONTEND_URL || "https://satnam.pub"]
    : [process.env.DEV_FRONTEND_URL || "http://localhost:3000"];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export default async function handler(req, res) {
  // Set CORS headers
  setCorsHeaders(req, res);

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // Require authentication for sensitive federation secrets
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: "Authentication required",
      meta: { timestamp: new Date().toISOString() }
    });
    return;
  }

  // Verify the token and check permissions
  try {
    const token = authHeader.split(' ')[1];
    const { getSecureSupabaseClient } = await import('../../lib/secure-vault-client.js');
    const supabase = await getSecureSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({
        success: false,
        error: "Invalid authentication token",
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(401).json({
      success: false,
      error: "Authentication failed",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      meta: { timestamp: new Date().toISOString() }
    });
    return;
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    res.status(405).json({
      success: false,
      error: "Method not allowed",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  try {
    // Use secure Vault client to get service role key (never from environment)
    const { getSecureSupabaseClient } = await import('../../lib/secure-vault-client.js');
    const supabase = await getSecureSupabaseClient();

    // Get federation secrets from Supabase Vault
    const secrets = {};
    
    // Retrieve each secret from Vault
    const secretNames = [
      'fedimint_family_federation_id',
      'fedimint_family_ecash_mint', 
      'fedimint_guardian_nodes',
      'fedimint_guardian_consensus_api',
      'fedimint_family_invite_code'
    ];

    for (const secretName of secretNames) {
      try {
        const { data, error } = await supabase
          .rpc('vault_read', { secret_name: secretName });
        
        if (error) {
          console.warn(`Warning: Could not read secret ${secretName}:`, error.message);
          continue;
        }
        
        if (data) {
          // Map vault secrets to federation structure
          switch (secretName) {
            case 'fedimint_family_federation_id':
              secrets.federationId = data;
              break;
            case 'fedimint_family_ecash_mint':
              secrets.ecashMint = data;
              break;
            case 'fedimint_guardian_nodes':
              secrets.guardianNodes = data.split(',');
              break;
            case 'fedimint_guardian_consensus_api':
              secrets.consensusAPI = data;
              break;
            case 'fedimint_family_invite_code':
              secrets.inviteCode = data;
              break;
          }
        }
      } catch (error) {
        console.warn(`Warning: Failed to read secret ${secretName}:`, error.message);
      }
    }

    // Provide fallback values for development if secrets are missing
    const federationSecrets = {
      federationId: secrets.federationId || 'demo-federation',
      ecashMint: secrets.ecashMint || 'demo-ecash-mint',
      guardianNodes: secrets.guardianNodes || ['demo-node1', 'demo-node2', 'demo-node3'],
      consensusAPI: secrets.consensusAPI || 'https://demo-consensus.local',
      inviteCode: secrets.inviteCode || 'demo-invite-code',
      guardianKeys: ['vault-managed-key1', 'vault-managed-key2', 'vault-managed-key3']
    };

    console.log('Retrieved federation secrets from Supabase Vault');

    res.status(200).json({
      success: true,
      data: federationSecrets,
      meta: {
        timestamp: new Date().toISOString(),
        source: 'supabase_vault',
        secretsLoaded: Object.keys(secrets).length
      },
    });
  } catch (error) {
    console.error("Vault federation secrets error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to retrieve federation secrets from Vault",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      meta: {
        timestamp: new Date().toISOString(),
        source: 'supabase_vault',
      },
    });
  }
}