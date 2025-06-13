// lib/api/routes.ts
import express from "express";
import { AuthAPI } from "./auth-endpoints";
import { IdentityAPI } from "./identity-endpoints";
import { IdentityRegistration } from "./register-identity";

const router = express.Router();

// Helper function to safely extract error message
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "An unknown error occurred";
}

// ===========================================
// AUTHENTICATION ROUTES
// ===========================================

// Direct Nostr authentication
router.post("/auth/nostr", async (req, res) => {
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
});

// Nostr Wallet Connect authentication
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

// Initiate OTP via Nostr DM
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

// Verify OTP code
router.post("/auth/otp/verify", async (req, res) => {
  try {
    const { pubkey, otp_code } = req.body;

    if (!pubkey || !otp_code) {
      return res.status(400).json({
        success: false,
        error: "pubkey and otp_code are required",
      });
    }

    const result = await AuthAPI.verifyOTP(pubkey, otp_code);
    const statusCode = result.success ? 200 : 400;

    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

// Get current session
router.get("/auth/session", async (req, res) => {
  try {
    const result = await AuthAPI.getSession();
    const statusCode = result.success ? 200 : 401;

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
    const result = await AuthAPI.logout();
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
    const result = await AuthAPI.refreshSession();
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

// Register new account with encrypted nsec backup
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

// Complete identity registration (legacy)
router.post("/register", async (req, res) => {
  try {
    const registrationData = req.body;
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
});

// Register entire family
router.post("/register/family", async (req, res) => {
  try {
    const familyData = req.body;
    const result = await IdentityRegistration.registerFamily(familyData);
    const statusCode = result.success ? 201 : 400;

    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

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

// Verify NIP-05
router.post("/identity/verify/nip05", async (req, res) => {
  try {
    const { nip05 } = req.body;

    if (!nip05) {
      return res.status(400).json({
        success: false,
        error: "nip05 is required",
      });
    }

    const result = await IdentityAPI.verifyNIP05(nip05);
    const statusCode = result.success ? 200 : 400;

    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

export default router;
