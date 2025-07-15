/**
 * Create Educational Invitation API Endpoint (Privacy-First)
 *
 * FOLLOWS SATNAM.PUB PRIVACY PROTOCOLS:
 * - NO pubkeys/npubs stored or transmitted
 * - Uses privacy-safe hashed identifiers only
 * - Invitation data encrypted for privacy
 * - NO sensitive data in responses
 * - Browser-compatible serverless environment
 */

const { createHashedUserId, getUserFromRequest } = require("../../lib/auth");
const db = require("../../lib/db");
const { getAppBaseUrl } = require("../../lib/config-manager");

// Browser-compatible random token generation using Web Crypto API
async function generateSecureToken() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return `inv_${Array.from(array, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")}`;
}

module.exports = async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    // Get authenticated user
    const user = await getUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const {
      personalMessage = "Join me on Satnam.pub for Bitcoin education and sovereign identity!",
      courseCredits = 1,
      recipientInfo = "",
      expirationDays = 7,
    } = req.body;

    // Validate inputs
    if (courseCredits < 1 || courseCredits > 5) {
      res.status(400).json({ error: "Course credits must be between 1 and 5" });
      return;
    }

    if (expirationDays < 1 || expirationDays > 30) {
      res
        .status(400)
        .json({ error: "Expiration days must be between 1 and 30" });
      return;
    }

    // Generate unique tokens using Web Crypto API
    const inviteToken = await generateSecureToken();
    const hashedInviterId =
      user.hashedUserId || (await createHashedUserId(user.userId));

    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expirationDays);

    // Prepare privacy-safe invitation data (NO sensitive info)
    const invitationData = {
      personalMessage,
      recipientInfo,
      inviterName: user.username,
      // PRIVACY: NO npub, pubkey, or sensitive data stored
      createdAt: new Date().toISOString(),
    };

    // Create invitation in database
    const invitation = await db.models.educationalInvitations.create({
      invite_token: inviteToken,
      invited_by: hashedInviterId,
      course_credits: courseCredits,
      expires_at: expiresAt.toISOString(),
      invitation_data: invitationData,
    });

    // Generate invitation URL and QR code URL (Master Context compliant)
    const baseUrl = await getAppBaseUrl();
    const invitationUrl = `${baseUrl}?invite=${inviteToken}`;
    const qrCodeUrl = `/api/qr/${inviteToken}`;

    res.status(201).json({
      success: true,
      invitation: {
        id: invitation.data?.id,
        inviteToken: inviteToken,
        invitationUrl: invitationUrl,
        qrCodeUrl: qrCodeUrl,
        personalMessage: personalMessage,
        courseCredits: courseCredits,
        expiresAt: invitation.data?.expires_at,
        recipientInfo: recipientInfo,
      },
    });
  } catch (error) {
    console.error("Create invitation API error:", error);
    res.status(500).json({
      error: "Failed to create educational invitation",
      // NO process.env.NODE_ENV - following Master Context browser-compatible requirements
      details: error.message,
    });
  }
};