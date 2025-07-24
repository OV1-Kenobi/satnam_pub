/**
 * Identity Registration Netlify Function
 * POST /.netlify/functions/register-identity - Register new user identity
 * Accessible via /api/auth/register-identity through netlify.toml redirects
 */

// Handle CORS
function setCorsHeaders(req, res) {
  const allowedOrigins = process.env.NODE_ENV === "production"
    ? [process.env.FRONTEND_URL || "https://satnam.pub"]
    : ["http://localhost:3000", "http://localhost:5173", "http://localhost:3002", "http://127.0.0.1:3003", "http://127.0.0.1:8888"];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
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
    // Extract user data from request body
    const userData = req.body;
    
    // Basic validation
    if (!userData) {
      return res.status(400).json({
        success: false,
        error: "User data is required",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Log registration attempt (without sensitive data)
    console.log('🔐 Identity registration attempt:', {
      username: userData.username || 'unknown',
      hasPublicKey: !!userData.publicKey,
      timestamp: new Date().toISOString()
    });

    // For now, return success response
    // TODO: Implement actual database storage and validation
    const responseData = {
      success: true,
      message: "Identity registered successfully",
      user: {
        id: `user_${Date.now()}`, // Temporary ID generation
        username: userData.username,
        publicKey: userData.publicKey,
        registeredAt: new Date().toISOString()
      },
      meta: {
        timestamp: new Date().toISOString(),
      }
    };

    // Check if this is a family federation invitation scenario
    if (userData.invitationCode || userData.familyId) {
      responseData.postAuthAction = "show_invitation_modal";
    }

    return res.status(201).json(responseData);
  } catch (error) {
    console.error("Error registering identity:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error during registration",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }
}
