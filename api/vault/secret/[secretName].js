/**
 * Individual Secret API Endpoint - Uses Supabase Vault
 * GET /api/vault/secret/[secretName] - Get individual secret from Vault
 */


// Handle CORS
function setCorsHeaders(req, res) {
  const allowedOrigins = process.env.NODE_ENV === "production"
    ? [process.env.FRONTEND_URL || "https://satnam.pub"]
    : ["http://localhost:3000", "http://localhost:5173", "http://localhost:3002"];

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
    const { secretName } = req.query;

    if (!secretName) {
      res.status(400).json({
        success: false,
        error: "Secret name is required",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Use secure Vault client to get service role key (never from environment)
    const { getSecureSupabaseClient } = await import('../../../lib/secure-vault-client.js');
    const supabase = await getSecureSupabaseClient();

    // Get secret from Supabase Vault
    const { data, error } = await supabase
      .rpc('vault_read', { secret_name: secretName });
    
    if (error) {
      console.warn(`Could not read secret ${secretName}:`, error.message);
      res.status(404).json({
        success: false,
        error: "Secret not found",
        meta: {
          timestamp: new Date().toISOString(),
          secretName,
        },
      });
      return;
    }

    if (!data) {
      res.status(404).json({
        success: false,
        error: "Secret not found",
        meta: {
          timestamp: new Date().toISOString(),
          secretName,
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: data,
      meta: {
        timestamp: new Date().toISOString(),
        source: 'supabase_vault',
        secretName
      },
    });
  } catch (error) {
    console.error("Vault secret retrieval error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to retrieve secret from Vault",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      meta: {
        timestamp: new Date().toISOString(),
        source: 'supabase_vault',
      },
    });
  }
}