/**
 * Store Secret API Endpoint - Uses Supabase Vault
 * POST /api/vault/store-secret - Store secret in Vault
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

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
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
    const { secretName, secretValue } = req.body;

    if (!secretName || !secretValue) {
      res.status(400).json({
        success: false,
        error: "Both secretName and secretValue are required",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Use secure Vault client to get service role key (never from environment)  
    const { getSecureSupabaseClient } = await import('../../lib/secure-vault-client.js');
    const supabase = await getSecureSupabaseClient();

    // Store secret in Supabase Vault
    const { error } = await supabase
      .rpc('vault_write', { 
        secret_name: secretName,
        secret_value: secretValue 
      });
    
    if (error) {
      console.error(`Failed to store secret ${secretName}:`, error.message);
      res.status(500).json({
        success: false,
        error: "Failed to store secret in Vault",
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        meta: {
          timestamp: new Date().toISOString(),
          secretName,
        },
      });
      return;
    }

    console.log(`Successfully stored secret: ${secretName}`);

    res.status(200).json({
      success: true,
      data: { stored: true },
      meta: {
        timestamp: new Date().toISOString(),
        source: 'supabase_vault',
        secretName
      },
    });
  } catch (error) {
    console.error("Vault secret storage error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to store secret in Vault",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      meta: {
        timestamp: new Date().toISOString(),
        source: 'supabase_vault',
      },
    });
  }
}