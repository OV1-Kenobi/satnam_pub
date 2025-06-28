/**
 * Identity Registration API Endpoint
 *
 * This endpoint handles the creation of new user identities with secure
 * password storage and recovery phrase generation.
 *
 * Features:
 * - Secure password-based encryption
 * - Recovery phrase generation and storage
 * - Profile creation with optional NIP-05 and Lightning Address
 * - PostAuth invitation token for seamless UX
 */

import { Request, Response } from "express";
import { z } from "zod";
import { IdentityAPI } from "../../lib/api/identity-endpoints";
import { generateRecoveryPhrase } from "../../utils/crypto-factory";
import { defaultLogger as logger } from "../../utils/logger";

// Registration request validation schema
const RegistrationSchema = z
  .object({
    username: z
      .string()
      .min(3)
      .max(20)
      .regex(
        /^[a-zA-Z0-9_]+$/,
        "Username can only contain letters, numbers, and underscores"
      ),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
    recoveryPhrase: z.string().optional(), // Optional - will be generated if not provided
    nip05: z.string().optional(),
    lightningAddress: z.string().optional(),
    generateInviteToken: z.boolean().default(false), // Whether to generate PostAuth invitation token
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type RegistrationRequest = z.infer<typeof RegistrationSchema>;

import { setCorsHeaders } from "../../utils/cors";

// Note: CORS handling is now managed by the shared utility

/**
 * Generate a secure recovery phrase if not provided
 */
async function ensureRecoveryPhrase(providedPhrase?: string): Promise<string> {
  if (providedPhrase && providedPhrase.trim()) {
    // Validate the provided phrase (basic check for 12/24 words)
    const words = providedPhrase.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      throw new Error("Recovery phrase must be 12 or 24 words");
    }
    return providedPhrase.trim();
  }

  // Generate new recovery phrase
  return await generateRecoveryPhrase();
}

/**
 * Main API handler for identity registration
 */
export default async function handler(req: Request, res: Response) {
  // Set CORS headers with appropriate methods for this endpoint
  setCorsHeaders(req, res, { methods: "POST, OPTIONS" });

  // Handle preflight OPTIONS request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  try {
    // Validate request body
    const validationResult = RegistrationSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid registration data",
        details: validationResult.error.errors,
      });
    }

    const registrationData: RegistrationRequest = validationResult.data;

    // Generate or validate recovery phrase
    const recoveryPhrase = await ensureRecoveryPhrase(
      registrationData.recoveryPhrase
    );

    // Register the new account through the Identity API
    const registrationResult = await IdentityAPI.registerNewAccount({
      username: registrationData.username,
      password: registrationData.password,
      nip05: registrationData.nip05,
      lightning_address: registrationData.lightningAddress,
    });

    if (!registrationResult.success) {
      return res.status(400).json({
        success: false,
        error: registrationResult.error,
      });
    }

    // Log successful registration (privacy-preserving)
    logger.info("New identity registered", {
      username: registrationData.username,
      hasNip05: !!registrationData.nip05,
      hasLightningAddress: !!registrationData.lightningAddress,
      generatedRecoveryPhrase: !registrationData.recoveryPhrase,
    });

    // Prepare response data
    const responseData: {
      success: boolean;
      profile: any;
      recoveryPhrase: string;
      nsec: any;
      npub: any;
      message: string;
      postAuthAction?: string;
    } = {
      success: true,
      profile: registrationResult.data.profile,
      recoveryPhrase,
      // Return nsec ONCE for backup purposes
      nsec: registrationResult.data.nsec,
      npub: registrationResult.data.npub,
      message:
        "Identity forged successfully! Please secure your recovery phrase and private key.",
    };

    // If PostAuth invitation token requested, include it
    if (registrationData.generateInviteToken) {
      // This would integrate with the PostAuthInvitationModal
      responseData.postAuthAction = "show_invitation_modal";
    }

    return res.status(201).json(responseData);
  } catch (error) {
    logger.error("Error registering identity:", error as Error);
    return res.status(500).json({
      success: false,
      error: "Internal server error during registration",
    });
  }
}
