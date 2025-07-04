/**
 * Citadel Academy Badge API Endpoints
 * NIP-58 badge management and award system
 */

import { NextApiRequest, NextApiResponse } from "next";
import { badgeSystem } from "../../lib/citadel/badge-system";
import { progressTracker } from "../../lib/citadel/progress-tracker";
import { verifyAuthToken } from "../../lib/middleware/auth";
import { validateInput } from "../../lib/security/input-validation";
import { rateLimiter } from "../../lib/security/rate-limiter";
import { BadgeDefinition } from "../../types/education";

/**
 * Badge API Handler
 * Handles badge-related operations: definitions, awards, queries
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Verify authentication
    const authResult = await verifyAuthToken(req);
    if (!authResult.success) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { user } = authResult;
    const { method } = req;

    // Rate limiting
    await rateLimiter.checkLimit("badge-api", user.id);

    switch (method) {
      case "GET":
        return await handleGet(req, res, user);
      case "POST":
        return await handlePost(req, res, user);
      case "PUT":
        return await handlePut(req, res, user);
      case "DELETE":
        return await handleDelete(req, res, user);
      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error) {
    console.error("Badge API error:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Handle GET requests - Query badges and awards
 */
async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const { action, category, subject, level, studentPubkey } = req.query;

  switch (action) {
    case "definitions":
      return await getBadgeDefinitions(req, res, user);
    case "available":
      return await getAvailableBadges(req, res, user);
    case "earned":
      return await getEarnedBadges(req, res, user);
    case "student-progress":
      return await getStudentProgress(req, res, user);
    default:
      return res.status(400).json({ error: "Invalid action parameter" });
  }
}

/**
 * Handle POST requests - Award badges and create definitions
 */
async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const { action } = req.query;

  switch (action) {
    case "award":
      return await awardBadge(req, res, user);
    case "create-definition":
      return await createBadgeDefinition(req, res, user);
    case "record-progress":
      return await recordProgress(req, res, user);
    default:
      return res.status(400).json({ error: "Invalid action parameter" });
  }
}

/**
 * Handle PUT requests - Update badge definitions or awards
 */
async function handlePut(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const { action } = req.query;

  switch (action) {
    case "update-definition":
      return await updateBadgeDefinition(req, res, user);
    case "update-privacy":
      return await updatePrivacySettings(req, res, user);
    default:
      return res.status(400).json({ error: "Invalid action parameter" });
  }
}

/**
 * Handle DELETE requests - Revoke badges
 */
async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const { action } = req.query;

  switch (action) {
    case "revoke":
      return await revokeBadge(req, res, user);
    default:
      return res.status(400).json({ error: "Invalid action parameter" });
  }
}

/**
 * Get badge definitions
 */
async function getBadgeDefinitions(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const { category, subject, level } = req.query;

  let badges: BadgeDefinition[] = badgeSystem.getBadgeDefinitions();

  // Filter by category
  if (category && typeof category === "string") {
    badges = badgeSystem.getBadgesByCategory(category as any);
  }

  // Filter by subject
  if (subject && typeof subject === "string") {
    badges = badgeSystem.getBadgesBySubject(subject as any);
  }

  // Filter by level
  if (level && typeof level === "string") {
    badges = badgeSystem.getBadgesByLevel(level as any);
  }

  // Apply privacy filtering based on user's relationship
  const visibleBadges = badges.filter((badge) => {
    if (badge.privacy_level === "public") return true;
    if (badge.privacy_level === "family" && user.familyId) return true;
    if (badge.privacy_level === "private" && user.role === "admin") return true;
    return false;
  });

  res.status(200).json({
    success: true,
    data: visibleBadges,
    count: visibleBadges.length,
  });
}

/**
 * Get available badges for a student
 */
async function getAvailableBadges(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const studentPubkey = user.npub || (req.query.studentPubkey as string);

  if (!studentPubkey) {
    return res.status(400).json({ error: "Student public key required" });
  }

  try {
    const availableBadges = await badgeSystem.getAvailableBadges(studentPubkey);

    res.status(200).json({
      success: true,
      data: availableBadges,
      count: availableBadges.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Get earned badges for a student
 */
async function getEarnedBadges(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const studentPubkey = user.npub || (req.query.studentPubkey as string);

  if (!studentPubkey) {
    return res.status(400).json({ error: "Student public key required" });
  }

  try {
    const earnedBadges = await badgeSystem.getStudentBadges(studentPubkey);

    res.status(200).json({
      success: true,
      data: earnedBadges,
      count: earnedBadges.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Get student progress
 */
async function getStudentProgress(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const studentPubkey = user.npub || (req.query.studentPubkey as string);

  if (!studentPubkey) {
    return res.status(400).json({ error: "Student public key required" });
  }

  try {
    const dashboardData = await progressTracker.getStudentDashboard(
      studentPubkey
    );

    if (!dashboardData) {
      return res.status(404).json({ error: "Student progress not found" });
    }

    res.status(200).json({
      success: true,
      data: dashboardData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Award a badge to a student
 */
async function awardBadge(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  // Only admins can award badges
  if (user.role !== "admin") {
    return res.status(403).json({ error: "Admin privileges required" });
  }

  const { badgeId, recipientPubkey, evidence, privacyLevel } = req.body;

  // Validate input
  if (!badgeId || !recipientPubkey || !evidence) {
    return res.status(400).json({
      error: "Badge ID, recipient public key, and evidence required",
    });
  }

  try {
    await validateInput({ badgeId, recipientPubkey, evidence }, "badge-award");

    const result = await badgeSystem.awardBadge(
      badgeId,
      recipientPubkey,
      evidence,
      privacyLevel || "public"
    );

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Create a new badge definition
 */
async function createBadgeDefinition(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  // Only admins can create badge definitions
  if (user.role !== "admin") {
    return res.status(403).json({ error: "Admin privileges required" });
  }

  const badgeData = req.body;

  try {
    await validateInput(badgeData, "badge-definition");

    const result = await badgeSystem.createBadgeDefinition(badgeData);

    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Record learning progress
 */
async function recordProgress(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const studentPubkey = user.npub;
  const { contentId, sessionType, duration, score, notes } = req.body;

  if (!studentPubkey || !contentId || !sessionType || duration === undefined) {
    return res.status(400).json({
      error: "Student pubkey, content ID, session type, and duration required",
    });
  }

  try {
    await validateInput(
      { contentId, sessionType, duration },
      "learning-session"
    );

    const session = await progressTracker.recordLearningSession(
      studentPubkey,
      contentId,
      sessionType,
      duration,
      score,
      notes
    );

    res.status(200).json({
      success: true,
      data: session,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Update badge definition
 */
async function updateBadgeDefinition(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  if (user.role !== "admin") {
    return res.status(403).json({ error: "Admin privileges required" });
  }

  // Implementation would depend on specific requirements
  res.status(501).json({ error: "Not implemented" });
}

/**
 * Update privacy settings
 */
async function updatePrivacySettings(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const studentPubkey = user.npub;
  const { privacySettings } = req.body;

  if (!studentPubkey || !privacySettings) {
    return res.status(400).json({
      error: "Student pubkey and privacy settings required",
    });
  }

  try {
    await validateInput(privacySettings, "privacy-settings");

    await progressTracker.updatePrivacySettings(studentPubkey, privacySettings);

    res.status(200).json({
      success: true,
      message: "Privacy settings updated",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Revoke a badge
 */
async function revokeBadge(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  if (user.role !== "admin") {
    return res.status(403).json({ error: "Admin privileges required" });
  }

  const { awardId, reason } = req.body;

  if (!awardId || !reason) {
    return res.status(400).json({
      error: "Award ID and reason required",
    });
  }

  try {
    await validateInput({ awardId, reason }, "badge-revocation");

    const result = await badgeSystem.revokeBadge(awardId, reason);

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
/**
 * Citadel Academy Badge API Endpoints
 * NIP-58 badge management and award system
 */

/**
 * Badge API Handler
 * Handles badge-related operations: definitions, awards, queries
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Verify authentication
    const authResult = await verifyAuthToken(req);
    if (!authResult.success) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { user } = authResult;
    const { method } = req;

    // Rate limiting
    await rateLimiter.checkLimit("badge-api", user.id);

    switch (method) {
      case "GET":
        return await handleGet(req, res, user);
      case "POST":
        return await handlePost(req, res, user);
      case "PUT":
        return await handlePut(req, res, user);
      case "DELETE":
        return await handleDelete(req, res, user);
      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error) {
    console.error("Badge API error:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Handle GET requests - Query badges and awards
 */
async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const { action, category, subject, level, studentPubkey } = req.query;

  switch (action) {
    case "definitions":
      return await getBadgeDefinitions(req, res, user);
    case "available":
      return await getAvailableBadges(req, res, user);
    case "earned":
      return await getEarnedBadges(req, res, user);
    case "student-progress":
      return await getStudentProgress(req, res, user);
    default:
      return res.status(400).json({ error: "Invalid action parameter" });
  }
}

/**
 * Handle POST requests - Award badges and create definitions
 */
async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const { action } = req.query;

  switch (action) {
    case "award":
      return await awardBadge(req, res, user);
    case "create-definition":
      return await createBadgeDefinition(req, res, user);
    case "record-progress":
      return await recordProgress(req, res, user);
    default:
      return res.status(400).json({ error: "Invalid action parameter" });
  }
}

/**
 * Handle PUT requests - Update badge definitions or awards
 */
async function handlePut(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const { action } = req.query;

  switch (action) {
    case "update-definition":
      return await updateBadgeDefinition(req, res, user);
    case "update-privacy":
      return await updatePrivacySettings(req, res, user);
    default:
      return res.status(400).json({ error: "Invalid action parameter" });
  }
}

/**
 * Handle DELETE requests - Revoke badges
 */
async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const { action } = req.query;

  switch (action) {
    case "revoke":
      return await revokeBadge(req, res, user);
    default:
      return res.status(400).json({ error: "Invalid action parameter" });
  }
}

/**
 * Get badge definitions
 */
async function getBadgeDefinitions(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const { category, subject, level } = req.query;

  let badges: BadgeDefinition[] = badgeSystem.getBadgeDefinitions();

  // Filter by category
  if (category && typeof category === "string") {
    badges = badgeSystem.getBadgesByCategory(category as any);
  }

  // Filter by subject
  if (subject && typeof subject === "string") {
    badges = badgeSystem.getBadgesBySubject(subject as any);
  }

  // Filter by level
  if (level && typeof level === "string") {
    badges = badgeSystem.getBadgesByLevel(level as any);
  }

  // Apply privacy filtering based on user's relationship
  const visibleBadges = badges.filter((badge) => {
    if (badge.privacy_level === "public") return true;
    if (badge.privacy_level === "family" && user.familyId) return true;
    if (badge.privacy_level === "private" && user.role === "admin") return true;
    return false;
  });

  res.status(200).json({
    success: true,
    data: visibleBadges,
    count: visibleBadges.length,
  });
}

/**
 * Get available badges for a student
 */
async function getAvailableBadges(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const studentPubkey = user.npub || (req.query.studentPubkey as string);

  if (!studentPubkey) {
    return res.status(400).json({ error: "Student public key required" });
  }

  try {
    const availableBadges = await badgeSystem.getAvailableBadges(studentPubkey);

    res.status(200).json({
      success: true,
      data: availableBadges,
      count: availableBadges.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Get earned badges for a student
 */
async function getEarnedBadges(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const studentPubkey = user.npub || (req.query.studentPubkey as string);

  if (!studentPubkey) {
    return res.status(400).json({ error: "Student public key required" });
  }

  try {
    const earnedBadges = await badgeSystem.getStudentBadges(studentPubkey);

    res.status(200).json({
      success: true,
      data: earnedBadges,
      count: earnedBadges.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Get student progress
 */
async function getStudentProgress(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const studentPubkey = user.npub || (req.query.studentPubkey as string);

  if (!studentPubkey) {
    return res.status(400).json({ error: "Student public key required" });
  }

  try {
    const dashboardData = await progressTracker.getStudentDashboard(
      studentPubkey
    );

    if (!dashboardData) {
      return res.status(404).json({ error: "Student progress not found" });
    }

    res.status(200).json({
      success: true,
      data: dashboardData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Award a badge to a student
 */
async function awardBadge(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  // Only admins can award badges
  if (user.role !== "admin") {
    return res.status(403).json({ error: "Admin privileges required" });
  }

  const { badgeId, recipientPubkey, evidence, privacyLevel } = req.body;

  // Validate input
  if (!badgeId || !recipientPubkey || !evidence) {
    return res.status(400).json({
      error: "Badge ID, recipient public key, and evidence required",
    });
  }

  try {
    await validateInput({ badgeId, recipientPubkey, evidence }, "badge-award");

    const result = await badgeSystem.awardBadge(
      badgeId,
      recipientPubkey,
      evidence,
      privacyLevel || "public"
    );

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Create a new badge definition
 */
async function createBadgeDefinition(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  // Only admins can create badge definitions
  if (user.role !== "admin") {
    return res.status(403).json({ error: "Admin privileges required" });
  }

  const badgeData = req.body;

  try {
    await validateInput(badgeData, "badge-definition");

    const result = await badgeSystem.createBadgeDefinition(badgeData);

    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Record learning progress
 */
async function recordProgress(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const studentPubkey = user.npub;
  const { contentId, sessionType, duration, score, notes } = req.body;

  if (!studentPubkey || !contentId || !sessionType || duration === undefined) {
    return res.status(400).json({
      error: "Student pubkey, content ID, session type, and duration required",
    });
  }

  try {
    await validateInput(
      { contentId, sessionType, duration },
      "learning-session"
    );

    const session = await progressTracker.recordLearningSession(
      studentPubkey,
      contentId,
      sessionType,
      duration,
      score,
      notes
    );

    res.status(200).json({
      success: true,
      data: session,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Update badge definition
 */
async function updateBadgeDefinition(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  if (user.role !== "admin") {
    return res.status(403).json({ error: "Admin privileges required" });
  }

  // Implementation would depend on specific requirements
  res.status(501).json({ error: "Not implemented" });
}

/**
 * Update privacy settings
 */
async function updatePrivacySettings(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const studentPubkey = user.npub;
  const { privacySettings } = req.body;

  if (!studentPubkey || !privacySettings) {
    return res.status(400).json({
      error: "Student pubkey and privacy settings required",
    });
  }

  try {
    await validateInput(privacySettings, "privacy-settings");

    await progressTracker.updatePrivacySettings(studentPubkey, privacySettings);

    res.status(200).json({
      success: true,
      message: "Privacy settings updated",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Revoke a badge
 */
async function revokeBadge(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  if (user.role !== "admin") {
    return res.status(403).json({ error: "Admin privileges required" });
  }

  const { awardId, reason } = req.body;

  if (!awardId || !reason) {
    return res.status(400).json({
      error: "Award ID and reason required",
    });
  }

  try {
    await validateInput({ awardId, reason }, "badge-revocation");

    const result = await badgeSystem.revokeBadge(awardId, reason);

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
