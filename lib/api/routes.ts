/**
 * @fileoverview API Routes for Satnam.pub - Sovereign Bitcoin Identity Platform
 * @description Express router containing all API endpoints for authentication,
 * identity management, family coordination, and privacy-first operations.
 */

import { NetlifyHandler } from "../../types/netlify-functions";
import { NostrShamirSecretSharing } from "../crypto/shamir-secret-sharing";
import { FamilyGuardianManager } from "../family/guardian-management";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth";
import {
  generateCSRFToken,
  validateCSRFToken,
} from "../security/csrf-protection";
import { createValidator } from "../security/input-validation";
import { apiRateLimit, authRateLimit } from "../security/rate-limiter";
import { AuthAPI } from "./auth-endpoints";
import { FederatedSigningAPI } from "./federated-signing-simple";
import { IdentityAPI } from "./identity-endpoints";
import { PrivacyAuth } from "./privacy-auth";
import { PrivacyFederatedSigningAPI } from "./privacy-federated-signing";
import { IdentityRegistration } from "./register-identity";
import { SSSFederatedSigningAPI } from "./sss-federated-signing";

const router = express.Router();

// ===========================================
// PUBLIC ENDPOINTS (No CSRF required for GET requests)
// ===========================================

/**
 * Health check endpoint
 * @route GET /api/health
 * @description Returns server health status
 */
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Identity Forge API is healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

/**
 * Get current session status
 * @route GET /api/auth/session
 * @description Returns current authentication session status
 */
router.get("/auth/session", async (req, res) => {
  try {
    const result = await AuthAPI.getSession(req);
    const statusCode = result.success ? 200 : 401;

    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

// SECURITY FIX: Apply security middleware to all routes (except public GET endpoints)
router.use(generateCSRFToken); // Generate CSRF token for all requests
router.use(apiRateLimit); // General API rate limiting

/**
 * Safely extracts error message from unknown error types
 * @param error - The error object to extract message from
 * @returns User-safe error message string
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // SECURITY: Don't expose internal error details in production
    if (process.env.NODE_ENV === "production") {
      // Return generic error for security
      return "An error occurred while processing your request";
    }
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "An unknown error occurred";
}

/**
 * Input validation middleware factory
 */
function validateInput(schema: Record<string, (value: unknown) => any>) {
  return (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const validator = createValidator(schema);
    const result = validator(req.body);

    if (!result.isValid) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: result.errors,
      });
    }

    // Replace request body with sanitized data
    req.body = result.sanitized;
    next();
  };
}

// ===========================================
// AUTHENTICATION ROUTES
// ===========================================

/**
 * Direct Nostr authentication endpoint
 * @route POST /auth/nostr
 * @description Authenticates users with signed Nostr events
 */
router.post(
  "/auth/nostr",
  authRateLimit, // SECURITY: Rate limit authentication attempts
  validateCSRFToken, // SECURITY: CSRF protection
  validateInput({
    signedEvent: (value) => {
      if (!value || typeof value !== "object") {
        return { isValid: false, error: "signedEvent must be an object" };
      }
      return { isValid: true, sanitized: value };
    },
  }),
  async (req, res) => {
    try {
      const { signedEvent } = req.body;

      if (!signedEvent) {
        return res.status(400).json({
          success: false,
          error: "signedEvent is required",
        });
      }

      const result = await AuthAPI.authenticateNostr(signedEvent);
      const statusCode = result.success ? 200 : 400;

      res.status(statusCode).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }
);

/**
 * Nostr Wallet Connect authentication endpoint
 * @route POST /auth/nwc
 * @description Authenticates users with NWC connection URI
 */
router.post("/auth/nwc", async (req, res) => {
  try {
    const { nwcUri } = req.body;

    if (!nwcUri) {
      return res.status(400).json({
        success: false,
        error: "nwcUri is required",
      });
    }

    const result = await AuthAPI.authenticateNWC(nwcUri);
    const statusCode = result.success ? 200 : 400;

    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

/**
 * Initiate OTP authentication via Nostr DM
 * @route POST /auth/otp/initiate
 * @description Sends OTP code to user via Nostr direct message
 */
router.post("/auth/otp/initiate", async (req, res) => {
  try {
    const { npub, pubkey } = req.body;
    const identifier = npub || pubkey;

    if (!identifier) {
      return res.status(400).json({
        success: false,
        error: "npub or pubkey is required",
      });
    }

    const result = await AuthAPI.initiateOTP(identifier);
    const statusCode = result.success ? 200 : 400;

    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

/**
 * Verify OTP authentication code
 * @route POST /auth/otp/verify
 * @description Verifies OTP code received via Nostr DM
 */
router.post("/auth/otp/verify", async (req, res) => {
  try {
    const { pubkey, otp_code } = req.body;

    if (!pubkey || !otp_code) {
      return res.status(400).json({
        success: false,
        error: "pubkey and otp_code are required",
      });
    }

    const result = await AuthAPI.verifyOTP(pubkey, otp_code, res);

    const statusCode = result.success ? 200 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

// Logout
router.post("/auth/logout", async (req, res) => {
  try {
    const result = await AuthAPI.logout(res);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

// Refresh session
router.post("/auth/refresh", async (req, res) => {
  try {
    const result = await AuthAPI.refreshSession(req, res);
    const statusCode = result.success ? 200 : 401;

    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

// ===========================================
// IDENTITY REGISTRATION ROUTES
// ===========================================

/**
 * Register new identity with encrypted nsec backup
 * @route POST /identity/register
 * @description Creates new Nostr identity with secure backup system
 */
router.post("/identity/register", async (req, res) => {
  try {
    const { username, password, nip05, lightning_address } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: "Username and password are required",
      });
    }

    const result = await IdentityAPI.registerNewAccount({
      username,
      password,
      nip05,
      lightning_address,
    });

    const statusCode = result.success ? 201 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

// Recover nsec with password
router.post("/identity/recover-nsec", async (req, res) => {
  try {
    const { npub, password } = req.body;

    if (!npub || !password) {
      return res.status(400).json({
        success: false,
        error: "NPub and password are required",
      });
    }

    const result = await IdentityAPI.recoverNsec({ npub, password });
    const statusCode = result.success ? 200 : 400;

    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

// PRIVACY-FIRST Identity Registration - requires authentication
router.post(
  "/register",
  authMiddleware(async (req: AuthenticatedRequest, res) => {
    try {
      const {
        username,
        userEncryptionKey,
        optionalData,
        makeDiscoverable,
        familyId,
        relayUrl,
      } = req.body;

      // Ensure user is authenticated
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
        });
        return;
      }

      if (!userEncryptionKey) {
        res.status(400).json({
          success: false,
          error: "User encryption key is required for privacy protection",
        });
        return;
      }

      // Create privacy-first registration request
      const registrationData = {
        userId: req.user.id, // ✅ SECURE: from JWT token
        username, // Optional - will generate anonymous if not provided
        usernameChoice: username
          ? ("user_provided" as const)
          : ("generate_suggestion" as const), // Required field for username handling
        userEncryptionKey, // User controls their own encryption
        optionalData, // Will be encrypted with user's key
        makeDiscoverable: makeDiscoverable || false,
        familyId,
        relayUrl,
      };

      const result =
        await IdentityRegistration.registerIdentity(registrationData);

      const statusCode = result.success ? 201 : 400;
      res.status(statusCode).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  })
);

// SECURE Family Registration - requires authentication
router.post(
  "/register/family",
  authMiddleware(async (req: AuthenticatedRequest, res) => {
    try {
      const { family_name, domain, relay_url, members } = req.body;

      // Ensure user is authenticated
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
        });
        return;
      }

      if (!family_name || !Array.isArray(members) || members.length === 0) {
        res.status(400).json({
          success: false,
          error: "Family name and members are required",
        });
        return;
      }

      // Validate each member has required properties
      for (const member of members) {
        if (!member.usernameChoice || !member.userEncryptionKey) {
          res.status(400).json({
            success: false,
            error: "Each member must have usernameChoice and userEncryptionKey",
          });
          return;
        }
      }

      // Add authenticated userId to each member registration
      const membersWithAuth = members.map(
        (member: {
          usernameChoice: "user_provided" | "generate_suggestion";
          userEncryptionKey: string;
          username?: string;
          optionalData?: {
            displayName?: string;
            bio?: string;
            customFields?: Record<string, any>;
          };
          makeDiscoverable?: boolean;
          familyId?: string;
          relayUrl?: string;
          [key: string]: any;
        }) => ({
          ...member,
          userId: req.user!.id, // ✅ SECURE: Each member gets the authenticated user ID
        })
      );

      const familyData = {
        family_name,
        domain,
        relay_url,
        members: membersWithAuth,
      };

      const result = await IdentityRegistration.registerFamily(familyData);
      const statusCode = result.success ? 201 : 400;

      res.status(statusCode).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  })
);

// Export to sovereign infrastructure
router.post("/migrate/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const result =
      await IdentityRegistration.exportToSovereignInfrastructure(userId);

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

// ===========================================
// IDENTITY MANAGEMENT ROUTES
// ===========================================

// Get user profile
router.get("/identity/profile", async (req, res) => {
  try {
    const result = await IdentityAPI.getProfile();
    const statusCode = result.success ? 200 : 401;

    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

// Update user profile
router.put("/identity/profile", async (req, res) => {
  try {
    const updates = req.body;
    const result = await IdentityAPI.updateProfile(updates);
    const statusCode = result.success ? 200 : 400;

    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

// Create family
router.post("/identity/family/create", async (req, res) => {
  try {
    const familyData = req.body;
    const result = await IdentityAPI.createFamily(familyData);
    const statusCode = result.success ? 201 : 400;

    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

// Join family
router.post("/identity/family/join", async (req, res) => {
  try {
    const { familyId } = req.body;

    if (!familyId) {
      return res.status(400).json({
        success: false,
        error: "familyId is required",
      });
    }

    const result = await IdentityAPI.joinFamily(familyId);
    const statusCode = result.success ? 200 : 400;

    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

// Get family members
router.get("/identity/family/members", async (req, res) => {
  try {
    const result = await IdentityAPI.getFamilyMembers();
    const statusCode = result.success ? 200 : 400;

    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

// Setup lightning address
router.post("/identity/lightning/setup", async (req, res) => {
  try {
    const addressData = req.body;
    const result = await IdentityAPI.setupLightning(addressData);
    const statusCode = result.success ? 201 : 400;

    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

// Store backup reference
router.post("/identity/backup", async (req, res) => {
  try {
    const { eventId } = req.body;

    if (!eventId) {
      return res.status(400).json({
        success: false,
        error: "eventId is required",
      });
    }

    const result = await IdentityAPI.storeBackup(eventId);
    const statusCode = result.success ? 201 : 400;

    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

// Get backup history
router.get("/identity/backups", async (req, res) => {
  try {
    const result = await IdentityAPI.getBackups();
    const statusCode = result.success ? 200 : 401;

    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

// Username suggestions endpoint - now secured with authentication
router.get(
  "/username-suggestions",
  authMiddleware(async (req: AuthenticatedRequest, res) => {
    try {
      // Ensure user is authenticated
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
        });
        return;
      }

      // Validate and cap the count parameter to prevent DoS attacks
      const countRaw = Number(req.query.count ?? 5);
      const count =
        isFinite(countRaw) && countRaw > 0 ? Math.min(countRaw, 20) : 5; // cap at 20 to prevent abuse

      const suggestions =
        await IdentityRegistration.generateUsernameSuggestions({
          userId: req.user.id, // ✅ SECURE: from authenticated JWT token
          count,
        });

      res.status(200).json(suggestions);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  })
);

// ===========================================
// FEDERATED FAMILY NOSTR SIGNING ROUTES
// ===========================================

// Create a new federated event requiring multiple signatures
router.post(
  "/federated-signing/create-event",
  authMiddleware(async (req: AuthenticatedRequest, res) => {
    try {
      const { familyId, eventType, content, requiredSigners } = req.body;

      if (!familyId || !eventType || !content) {
        return res.status(400).json({
          success: false,
          error: "familyId, eventType, and content are required",
        });
      }

      const result = await FederatedSigningAPI.createFederatedEvent({
        familyId,
        eventType,
        content,
        authorId: req.user!.id,
        authorPubkey: req.user!.nostr_pubkey || "", // Assuming user has nostr pubkey
        requiredSigners,
      });

      const statusCode = result.success ? 201 : 400;
      res.status(statusCode).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to create federated event",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

// Sign a federated event
router.post(
  "/federated-signing/sign-event",
  authMiddleware(async (req: AuthenticatedRequest, res) => {
    try {
      const { eventId, memberPrivateKey, deviceInfo } = req.body;

      if (!eventId || !memberPrivateKey) {
        return res.status(400).json({
          success: false,
          error: "eventId and memberPrivateKey are required",
        });
      }

      const result = await FederatedSigningAPI.signFederatedEvent({
        eventId,
        memberId: req.user!.id,
        memberPubkey: req.user!.nostr_pubkey || "",
        memberPrivateKey,
        deviceInfo,
      });

      const statusCode = result.success ? 200 : 400;
      res.status(statusCode).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to sign federated event",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

// Get pending events for the authenticated user
router.get(
  "/federated-signing/pending-events/:familyId",
  authMiddleware(async (req: AuthenticatedRequest, res) => {
    try {
      const { familyId } = req.params;

      if (!familyId) {
        return res.status(400).json({
          success: false,
          error: "familyId parameter is required",
        });
      }

      const result = await FederatedSigningAPI.getPendingEvents({
        familyId,
        memberId: req.user!.id,
      });

      const statusCode = result.success ? 200 : 400;
      res.status(statusCode).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to get pending events",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

// Get active signing sessions for a family
router.get(
  "/federated-signing/active-sessions/:familyId",
  authMiddleware(async (req: AuthenticatedRequest, res) => {
    try {
      const { familyId } = req.params;

      if (!familyId) {
        return res.status(400).json({
          success: false,
          error: "familyId parameter is required",
        });
      }

      const result = await FederatedSigningAPI.getActiveSessions(familyId);

      const statusCode = result.success ? 200 : 400;
      res.status(statusCode).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to get active sessions",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

// ===========================================
// PRIVACY-ENHANCED FEDERATED SIGNING ROUTES
// ===========================================

// Create a new secure federated event with full encryption
router.post(
  "/secure-federated-signing/create-event",
  authMiddleware(async (req: AuthenticatedRequest, res) => {
    try {
      const { familyId, eventType, content, requiredSigners, privacyLevel } =
        req.body;

      if (!familyId || !eventType || !content) {
        return res.status(400).json({
          success: false,
          error: "familyId, eventType, and content are required",
        });
      }

      const result =
        await PrivacyFederatedSigningAPI.createSecureFederatedEvent({
          familyId,
          eventType,
          content,
          authorId: req.user!.id,
          authorPubkey: req.user!.nostr_pubkey || "",
          requiredSigners,
          privacyLevel: privacyLevel || 3, // Default to maximum privacy
        });

      const statusCode = result.success ? 201 : 400;
      res.status(statusCode).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to create secure federated event",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

// Sign a secure federated event with privacy protection
router.post(
  "/secure-federated-signing/sign-event",
  authMiddleware(async (req: AuthenticatedRequest, res) => {
    try {
      const { eventId, memberPrivateKey, deviceInfo, privacyConsent } =
        req.body;

      if (!eventId || !memberPrivateKey) {
        return res.status(400).json({
          success: false,
          error: "eventId and memberPrivateKey are required",
        });
      }

      if (privacyConsent !== true) {
        return res.status(400).json({
          success: false,
          error: "Privacy consent must be explicitly granted",
        });
      }

      const result = await PrivacyFederatedSigningAPI.signSecureFederatedEvent({
        eventId,
        memberId: req.user!.id,
        memberPubkey: req.user!.nostr_pubkey || "",
        memberPrivateKey,
        deviceInfo: {
          userAgent: req.headers["user-agent"] || "",
          ipAddress: req.ip || req.connection.remoteAddress || "",
          ...deviceInfo,
        },
        privacyConsent,
      });

      const statusCode = result.success ? 200 : 400;
      res.status(statusCode).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to sign secure federated event",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

// Get secure pending events with privacy protection
router.get(
  "/secure-federated-signing/pending-events/:familyId",
  authMiddleware(async (req: AuthenticatedRequest, res) => {
    try {
      const { familyId } = req.params;
      const { includeAuditId } = req.query;

      if (!familyId) {
        return res.status(400).json({
          success: false,
          error: "familyId parameter is required",
        });
      }

      const result = await PrivacyFederatedSigningAPI.getSecurePendingEvents({
        familyId,
        memberId: req.user!.id,
        includeAuditId: includeAuditId === "true",
      });

      const statusCode = result.success ? 200 : 400;
      res.status(statusCode).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to get secure pending events",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

// Privacy audit endpoint for transparency
router.get(
  "/privacy/audit-log/:userId",
  authMiddleware(async (req: AuthenticatedRequest, res) => {
    try {
      const { userId } = req.params;
      const { days = 30 } = req.query;

      // Only allow users to access their own audit logs
      if (userId !== req.user!.id && !req.user!.is_admin) {
        return res.status(403).json({
          success: false,
          error: "Access denied to audit logs",
        });
      }

      const result = await db.query(
        `SELECT id, audit_timestamp, action, data_type, success, error_message
         FROM privacy_audit_log 
         WHERE encrypted_user_id = $1 AND audit_timestamp > $2
         ORDER BY audit_timestamp DESC
         LIMIT 100`,
        [
          userId,
          new Date(Date.now() - parseInt(days as string) * 24 * 60 * 60 * 1000),
        ]
      );

      res.json({
        success: true,
        data: {
          auditEntries: result.rows,
          count: result.rows.length,
          daysRequested: days,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to retrieve audit log",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

// Privacy settings endpoint
router.post(
  "/privacy/settings",
  authMiddleware(async (req: AuthenticatedRequest, res) => {
    try {
      const { privacyLevel, zeroKnowledgeEnabled, dataRetentionDays } =
        req.body;

      if (privacyLevel && ![1, 2, 3].includes(privacyLevel)) {
        return res.status(400).json({
          success: false,
          error: "Privacy level must be 1, 2, or 3",
        });
      }

      // Update user privacy settings
      const updates = [];
      const values = [];
      let paramCount = 0;

      if (privacyLevel !== undefined) {
        updates.push(`privacy_level = $${++paramCount}`);
        values.push(privacyLevel);
      }

      if (zeroKnowledgeEnabled !== undefined) {
        updates.push(`zero_knowledge_enabled = $${++paramCount}`);
        values.push(zeroKnowledgeEnabled);
      }

      if (updates.length > 0) {
        values.push(req.user!.id);
        await db.query(
          `UPDATE secure_profiles SET ${updates.join(", ")}, updated_at = NOW() WHERE user_uuid = $${paramCount + 1}`,
          values
        );
      }

      res.json({
        success: true,
        data: {
          privacyLevel,
          zeroKnowledgeEnabled,
          dataRetentionDays,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to update privacy settings",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

// ===========================================
// SHAMIR SECRET SHARING FAMILY FEDERATION ROUTES
// ===========================================

// Initialize family with SSS configuration (2-of-2 to 5-of-7)
router.post(
  "/family/initialize-sss",
  authMiddleware(async (req: AuthenticatedRequest, res) => {
    try {
      const {
        familyId,
        familyName,
        guardians,
        threshold,
        totalShares,
        privacyLevel,
      } = req.body;

      if (!familyId || !familyName || !guardians || !Array.isArray(guardians)) {
        return res.status(400).json({
          success: false,
          error: "familyId, familyName, and guardians array are required",
        });
      }

      if (guardians.length < 2 || guardians.length > 7) {
        return res.status(400).json({
          success: false,
          error: "Family must have between 2 and 7 guardians",
        });
      }

      const result = await FamilyGuardianManager.initializeFamilySSS({
        familyId,
        familyName,
        guardians,
        threshold,
        totalShares,
        privacyLevel: privacyLevel || 3,
      });

      const statusCode = result.success ? 201 : 400;
      res.status(statusCode).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to initialize family SSS",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

// Create federated event requiring guardian consensus (no private key exposure)
router.post(
  "/sss-federated/create-event",
  authMiddleware(async (req: AuthenticatedRequest, res) => {
    try {
      const {
        familyId,
        eventType,
        content,
        requiredGuardianApprovals,
        privacyLevel,
      } = req.body;

      if (!familyId || !eventType || !content) {
        return res.status(400).json({
          success: false,
          error: "familyId, eventType, and content are required",
        });
      }

      const result = await SSSFederatedSigningAPI.createFederatedEvent({
        familyId,
        eventType,
        content,
        authorId: req.user!.id,
        requiredGuardianApprovals,
        privacyLevel: privacyLevel || 3,
      });

      const statusCode = result.success ? 201 : 400;
      res.status(statusCode).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to create SSS federated event",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

// Guardian approves/rejects a federated event
router.post(
  "/sss-federated/guardian-approval",
  authMiddleware(async (req: AuthenticatedRequest, res) => {
    try {
      const { eventId, approved, reason } = req.body;

      if (!eventId || typeof approved !== "boolean") {
        return res.status(400).json({
          success: false,
          error: "eventId and approved (boolean) are required",
        });
      }

      const result = await SSSFederatedSigningAPI.guardianApproval({
        eventId,
        guardianId: req.user!.id,
        approved,
        reason,
        deviceInfo: {
          userAgent: req.headers["user-agent"] || "",
          ipAddress: req.ip || req.connection.remoteAddress || "",
        },
      });

      const statusCode = result.success ? 200 : 400;
      res.status(statusCode).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to process guardian approval",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

// Guardian provides share for event signing (threshold-based key reconstruction)
router.post(
  "/sss-federated/provide-share",
  authMiddleware(async (req: AuthenticatedRequest, res) => {
    try {
      const { eventId } = req.body;

      if (!eventId) {
        return res.status(400).json({
          success: false,
          error: "eventId is required",
        });
      }

      const result = await SSSFederatedSigningAPI.provideShareForSigning({
        eventId,
        guardianId: req.user!.id,
        deviceInfo: {
          userAgent: req.headers["user-agent"] || "",
          ipAddress: req.ip || req.connection.remoteAddress || "",
        },
      });

      const statusCode = result.success ? 200 : 400;
      res.status(statusCode).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to provide share for signing",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

// Get pending events requiring guardian approval or share provision
router.get(
  "/sss-federated/pending/:familyId",
  authMiddleware(async (req: AuthenticatedRequest, res) => {
    try {
      const { familyId } = req.params;

      if (!familyId) {
        return res.status(400).json({
          success: false,
          error: "familyId parameter is required",
        });
      }

      const result = await SSSFederatedSigningAPI.getPendingApprovals({
        guardianId: req.user!.id,
        familyId,
      });

      const statusCode = result.success ? 200 : 400;
      res.status(statusCode).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to get pending approvals",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

// Request key reconstruction for specific purposes (emergency, inheritance, etc.)
router.post(
  "/sss-federated/request-key-reconstruction",
  authMiddleware(async (req: AuthenticatedRequest, res) => {
    try {
      const { familyId, reason, expiresInHours } = req.body;

      if (!familyId || !reason) {
        return res.status(400).json({
          success: false,
          error: "familyId and reason are required",
        });
      }

      const validReasons = [
        "key_rotation",
        "recovery",
        "inheritance",
        "emergency",
        "signing",
      ];
      if (!validReasons.includes(reason)) {
        return res.status(400).json({
          success: false,
          error: `Invalid reason. Must be one of: ${validReasons.join(", ")}`,
        });
      }

      const result = await FamilyGuardianManager.requestKeyReconstruction({
        familyId,
        requesterId: req.user!.id,
        reason,
        expiresInHours: expiresInHours || 24,
      });

      const statusCode = result.success ? 201 : 400;
      res.status(statusCode).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to request key reconstruction",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

// Guardian provides share for key reconstruction request
router.post(
  "/sss-federated/provide-reconstruction-share",
  authMiddleware(async (req: AuthenticatedRequest, res) => {
    try {
      const { requestId, shareIndices } = req.body;

      if (!requestId || !Array.isArray(shareIndices)) {
        return res.status(400).json({
          success: false,
          error: "requestId and shareIndices array are required",
        });
      }

      const result = await FamilyGuardianManager.provideGuardianShare({
        requestId,
        guardianId: req.user!.id,
        shareIndices,
        deviceInfo: {
          userAgent: req.headers["user-agent"] || "",
          ipAddress: req.ip || req.connection.remoteAddress || "",
        },
      });

      const statusCode = result.success ? 200 : 400;
      res.status(statusCode).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to provide reconstruction share",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

// Get SSS configuration recommendations based on family size
router.get("/sss-federated/recommendations/:familySize", (req, res) => {
  try {
    const familySize = parseInt(req.params.familySize);

    if (isNaN(familySize) || familySize < 2 || familySize > 10) {
      return res.status(400).json({
        success: false,
        error: "Family size must be between 2 and 10",
      });
    }

    const recommendation =
      NostrShamirSecretSharing.recommendShareDistribution(familySize);

    res.json({
      success: true,
      data: {
        familySize,
        recommendation,
        emergencyConfig: NostrShamirSecretSharing.createEmergencyConfig(
          recommendation.threshold,
          Array(Math.min(familySize, 3))
            .fill(0)
            .map((_, i) => `emergency_guardian_${i + 1}`)
        ),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to get SSS recommendations",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// ===========================================
// FAMILY NOSTR PROTECTION ROUTES
// ===========================================

// Protect family member's nsec using Fedimint federation
router.post(
  "/family-nostr-protection/protect-nsec",
  authMiddleware(async (req: AuthenticatedRequest, res) => {
    try {
      const { familyMemberId, nsec, guardians, threshold, federationId } =
        req.body;

      if (
        !familyMemberId ||
        !nsec ||
        !guardians ||
        !threshold ||
        !federationId
      ) {
        return res.status(400).json({
          success: false,
          error:
            "All fields are required: familyMemberId, nsec, guardians, threshold, federationId",
        });
      }

      // Validate guardians array
      if (!Array.isArray(guardians) || guardians.length < threshold) {
        return res.status(400).json({
          success: false,
          error: "Invalid guardians array or threshold too high",
        });
      }

      // Import family nostr protection functionality
      const { FamilyNostrProtection } = await import(
        "../family-nostr-protection"
      );

      // Shard the nsec among guardians using Fedimint
      const shardingResult =
        await FamilyNostrProtection.shardNsecAmongGuardians(
          nsec,
          guardians,
          threshold,
          federationId
        );

      if (!shardingResult.success) {
        return res.status(400).json({
          success: false,
          error: "Failed to shard nsec among guardians",
          details: shardingResult.error,
        });
      }

      // Store protection metadata in database
      const { data: protection, error: dbError } = await FederatedSigningAPI[
        "db"
      ]
        .from("family_nostr_protection")
        .insert({
          family_member_id: familyMemberId,
          user_id: req.user!.id, // Link to authenticated user
          federation_id: federationId,
          guardian_count: guardians.length,
          threshold_required: threshold,
          protection_active: true,
          nsec_shards_stored: true,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (dbError) {
        return res.status(500).json({
          success: false,
          error: "Failed to store protection metadata",
          details: dbError,
        });
      }

      // Notify guardians of new protection setup
      const notificationResult =
        await FamilyNostrProtection.notifyGuardiansOfProtection(
          guardians,
          familyMemberId,
          protection.id
        );

      res.status(201).json({
        success: true,
        protectionId: protection.id,
        guardiansNotified: guardians.length,
        thresholdSet: threshold,
        recoveryAvailable: true,
        shardingResult,
        notificationResult,
      });
    } catch (error) {
      console.error("Nsec protection error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to protect nsec",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

// Recover family member's nsec using guardian consensus
router.post(
  "/family-nostr-protection/recover-nsec",
  authMiddleware(async (req: AuthenticatedRequest, res) => {
    try {
      const { protectionId, guardianSignatures, familyMemberId } = req.body;

      if (!protectionId || !guardianSignatures || !familyMemberId) {
        return res.status(400).json({
          success: false,
          error:
            "protectionId, guardianSignatures, and familyMemberId are required",
        });
      }

      // Get protection metadata
      const { data: protection, error: fetchError } = await FederatedSigningAPI[
        "db"
      ]
        .from("family_nostr_protection")
        .select("*")
        .eq("id", protectionId)
        .eq("family_member_id", familyMemberId)
        .single();

      if (fetchError || !protection) {
        return res.status(404).json({
          success: false,
          error: "Protection record not found",
        });
      }

      if (!protection.protection_active) {
        return res.status(400).json({
          success: false,
          error: "Protection is not active",
        });
      }

      // Validate guardian signatures meet threshold
      if (guardianSignatures.length < protection.threshold_required) {
        return res.status(400).json({
          success: false,
          error: `Insufficient guardian signatures. Need ${protection.threshold_required}, got ${guardianSignatures.length}`,
        });
      }

      const { FamilyNostrProtection } = await import(
        "../family-nostr-protection"
      );

      // Reconstruct nsec from guardian shards
      const recoveryResult =
        await FamilyNostrProtection.reconstructNsecFromShards(
          protectionId,
          guardianSignatures,
          protection.federation_id
        );

      if (!recoveryResult.success) {
        return res.status(400).json({
          success: false,
          error: "Failed to recover nsec",
          details: recoveryResult.error,
        });
      }

      // Update protection metadata with recovery event
      await FederatedSigningAPI["db"]
        .from("family_nostr_protection")
        .update({
          last_recovery_at: new Date().toISOString(),
          recovery_count: (protection.recovery_count || 0) + 1,
        })
        .eq("id", protectionId);

      res.json({
        success: true,
        nsec: recoveryResult.nsec,
        recoveredAt: new Date().toISOString(),
        guardiansUsed: guardianSignatures.length,
      });
    } catch (error) {
      console.error("Nsec recovery error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to recover nsec",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

// Get protection status for family member
router.get(
  "/family-nostr-protection/status/:familyMemberId",
  authMiddleware(async (req: AuthenticatedRequest, res) => {
    try {
      const { familyMemberId } = req.params;

      const { data: protections, error } = await FederatedSigningAPI["db"]
        .from("family_nostr_protection")
        .select("*")
        .eq("family_member_id", familyMemberId)
        .eq("user_id", req.user!.id) // Ensure user owns this protection
        .eq("protection_active", true)
        .order("created_at", { ascending: false });

      if (error) {
        return res.status(500).json({
          success: false,
          error: "Failed to fetch protection status",
          details: error,
        });
      }

      const activeProtection = protections?.[0];

      res.json({
        success: true,
        hasProtection: !!activeProtection,
        protection: activeProtection
          ? {
              id: activeProtection.id,
              federationId: activeProtection.federation_id,
              guardianCount: activeProtection.guardian_count,
              thresholdRequired: activeProtection.threshold_required,
              createdAt: activeProtection.created_at,
              lastRecoveryAt: activeProtection.last_recovery_at,
              recoveryCount: activeProtection.recovery_count || 0,
            }
          : null,
      });
    } catch (error) {
      console.error("Protection status error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get protection status",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

// ===========================================
// FEDIMINT ROUTES
// ===========================================

// Fedimint E-cash operations
router.post("/fedimint/ecash", async (req, res) => {
  try {
    const { federationId } = req.body;

    if (!federationId) {
      return res.status(400).json({
        success: false,
        error: "Federation ID required",
      });
    }

    // Note: You'll need to import FederationManager when it's available
    // const federationManager = new FederationManager();
    // const client = federationManager.getClient(federationId);

    // For now, return a placeholder response
    res.status(501).json({
      success: false,
      error: "Fedimint integration not yet implemented in Express routes",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

// Fedimint Federation management
router.get("/fedimint/federation", async (req, res) => {
  try {
    // Note: federationId extraction removed as it's not used in current implementation

    // Note: You'll need to import FederationManager when it's available
    // const federationManager = new FederationManager();

    // For now, return a placeholder response
    res.status(501).json({
      success: false,
      error:
        "Fedimint federation management not yet implemented in Express routes",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

router.post("/fedimint/federation", async (req, res) => {
  try {
    // Note: action and data extraction removed as they're not used in current implementation

    // Note: You'll need to import FederationManager when it's available
    // const federationManager = new FederationManager();

    // For now, return a placeholder response
    res.status(501).json({
      success: false,
      error:
        "Fedimint federation operations not yet implemented in Express routes",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

// ===========================================
// PRIVACY-FIRST ROUTES
// ===========================================

// Check username availability (no identity exposure)
router.post("/privacy/check-username", async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: "Username is required",
      });
    }

    const result = await PrivacyAuth.isUsernameAvailable(username);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

// Get user's encrypted data (only they can decrypt)
router.get(
  "/privacy/encrypted-data",
  authMiddleware(async (req: AuthenticatedRequest, res) => {
    try {
      // Ensure user is authenticated
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
        });
        return;
      }

      const result = await PrivacyAuth.getUserEncryptedData(req.user.id);
      const statusCode = result.success ? 200 : 404;
      res.status(statusCode).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  })
);

// Update discoverability setting
router.post(
  "/privacy/discoverability",
  authMiddleware(async (req: AuthenticatedRequest, res) => {
    try {
      const { isDiscoverable, encryptedDisplayData } = req.body;

      // Ensure user is authenticated
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
        });
        return;
      }

      if (typeof isDiscoverable !== "boolean") {
        res.status(400).json({
          success: false,
          error: "isDiscoverable must be a boolean",
        });
        return;
      }

      const result = await PrivacyAuth.updateDiscoverability(
        req.user.id,
        isDiscoverable,
        encryptedDisplayData
      );

      const statusCode = result.success ? 200 : 400;
      res.status(statusCode).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  })
);

// ===========================================
// PHOENIXD LIGHTNING NODE ROUTES
// ===========================================

/**
 * Get PhoenixD Lightning node status
 * @route GET /api/phoenixd/status
 * @description Returns comprehensive PhoenixD node status including connection health,
 * balance information, channel status, and automated liquidity management status
 */
router.get("/phoenixd/status", async (req, res) => {
  try {
    // Import the status handler dynamically to avoid circular dependencies
    const statusHandler = await import("../../api/phoenixd/status");

    // Create a Request object from Express request
    const request = new Request(
      `${req.protocol}://${req.get("host")}${req.originalUrl}`,
      {
        method: req.method,
        headers: req.headers as HeadersInit,
      }
    );

    // Call the handler
    const response = await statusHandler.default(request);

    // Convert Response to Express response
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
      timestamp: new Date().toISOString(),
    });
  }
});

// ===========================================
// INDIVIDUAL WALLET API ENDPOINTS
// ===========================================

// Import individual wallet handlers
import individualCashuBearer from "../../api/individual/cashu/bearer";
import individualCashuWallet from "../../api/individual/cashu/wallet";
import individualLightningWallet from "../../api/individual/lightning/wallet";
import individualLightningZap from "../../api/individual/lightning/zap";
import individualWallet from "../../api/individual/wallet";

// Individual wallet main endpoint
router.get("/individual/wallet", async (req, res) => {
  try {
    await individualWallet(req, res);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

// Lightning wallet data endpoint
router.get("/individual/lightning/wallet", async (req, res) => {
  try {
    await individualLightningWallet(req, res);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

// Lightning zap endpoint
router.post("/individual/lightning/zap", async (req, res) => {
  try {
    await individualLightningZap(req, res);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

// Cashu wallet data endpoint
router.get("/individual/cashu/wallet", async (req, res) => {
  try {
    await individualCashuWallet(req, res);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

// Cashu bearer note creation endpoint
router.post("/individual/cashu/bearer", async (req, res) => {
  try {
    await individualCashuBearer(req, res);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

export default router;
