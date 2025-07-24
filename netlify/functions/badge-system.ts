/**
 * Badge System API
 * NIP-58 badges with WoT mentor notarization and cognitive capital tracking
 * @compliance Master Context - Privacy-first, browser-compatible, Bitcoin-only
 */

import { Handler } from "@netlify/functions";
import { supabase } from "../db";
import { validateInput } from "../security/input-validation";
import { rateLimiter } from "../security/rate-limiter";

// Rate limiting configuration
const BADGE_RATE_LIMITS = {
  award: { maxRequests: 5, windowMs: 60 * 1000 }, // 5 awards per minute
  verification: { maxRequests: 10, windowMs: 60 * 1000 }, // 10 verifications per minute
  progress: { maxRequests: 20, windowMs: 60 * 1000 }, // 20 progress checks per minute
  mentor: { maxRequests: 15, windowMs: 60 * 1000 }, // 15 mentor operations per minute
};

// Input validation schemas
const badgeAwardSchema = {
  badgeId: { type: "string", required: true, minLength: 1, maxLength: 100 },
  recipientPubkey: {
    type: "string",
    required: true,
    minLength: 64,
    maxLength: 64,
  },
  evidence: {
    type: "object",
    required: true,
    properties: {
      lessons_completed: { type: "array", items: { type: "string" } },
      quiz_scores: {
        type: "array",
        items: {
          type: "object",
          properties: {
            quiz_id: { type: "string" },
            score: { type: "number", min: 0, max: 100 },
            max_score: { type: "number", min: 1 },
          },
        },
      },
      practical_work: { type: "array", items: { type: "string" } },
    },
  },
  privacyLevel: {
    type: "string",
    enum: ["public", "family", "private"],
    required: true,
  },
  mentorVerification: {
    type: "object",
    optional: true,
    properties: {
      mentor_pubkey: { type: "string", minLength: 64, maxLength: 64 },
      mentor_nip05: { type: "string" },
      verification_notes: { type: "string", maxLength: 1000 },
      mentor_signature: { type: "string" },
    },
  },
};

const wotNotarizationSchema = {
  badgeId: { type: "string", required: true },
  studentPubkey: {
    type: "string",
    required: true,
    minLength: 64,
    maxLength: 64,
  },
  mentorPubkey: {
    type: "string",
    required: true,
    minLength: 64,
    maxLength: 64,
  },
  verificationNotes: { type: "string", maxLength: 1000 },
  privacyLevel: {
    type: "string",
    enum: ["public", "family", "private"],
    required: true,
  },
  guardianApproval: { type: "string", optional: true },
};

const mentorRegistrationSchema = {
  mentorPubkey: {
    type: "string",
    required: true,
    minLength: 64,
    maxLength: 64,
  },
  nip05: { type: "string", required: true },
  competencyAreas: { type: "array", items: { type: "string" }, required: true },
  verificationLevel: {
    type: "string",
    enum: ["basic", "intermediate", "advanced"],
    required: true,
  },
  bio: { type: "string", maxLength: 2000 },
  institutionAffiliation: { type: "string", maxLength: 200 },
  yearsExperience: { type: "number", min: 0, max: 100 },
};

// Anti-gaming measures
interface AntiGamingChecks {
  rapidSubmission: boolean;
  timeBetweenActions: boolean;
  browserFingerprint: boolean;
  familyFederation: boolean;
  invitationQuality: boolean;
}

const performAntiGamingChecks = async (
  studentPubkey: string,
  action: string,
  fingerprint?: string
): Promise<AntiGamingChecks> => {
  const now = Date.now();
  const checks: AntiGamingChecks = {
    rapidSubmission: false,
    timeBetweenActions: false,
    browserFingerprint: false,
    familyFederation: false,
    invitationQuality: false,
  };

  try {
    // Check for rapid submissions
    const { data: recentActions } = await supabase
      .from("badge_actions")
      .select("created_at")
      .eq("student_pubkey_hash", await hashPubkey(studentPubkey))
      .eq("action_type", action)
      .gte("created_at", new Date(now - 5 * 60 * 1000).toISOString()) // Last 5 minutes
      .order("created_at", { ascending: false })
      .limit(10);

    if (recentActions && recentActions.length >= 5) {
      checks.rapidSubmission = true;
    }

    // Check time between actions
    if (recentActions && recentActions.length > 0) {
      const lastAction = recentActions[0];
      const timeSinceLastAction =
        now - new Date(lastAction.created_at).getTime();
      if (timeSinceLastAction < 30 * 1000) {
        // 30 seconds minimum
        checks.timeBetweenActions = true;
      }
    }

    // Browser fingerprint validation
    if (fingerprint) {
      const { data: existingFingerprints } = await supabase
        .from("browser_fingerprints")
        .select("fingerprint_hash, created_at")
        .eq("student_pubkey_hash", await hashPubkey(studentPubkey))
        .order("created_at", { ascending: false })
        .limit(5);

      if (existingFingerprints && existingFingerprints.length > 0) {
        const fingerprintHash = await hashString(fingerprint);
        const hasMatchingFingerprint = existingFingerprints.some(
          (fp) => fp.fingerprint_hash === fingerprintHash
        );
        checks.browserFingerprint = hasMatchingFingerprint;
      }
    }

    // Family federation membership check
    const { data: familyMembership } = await supabase
      .from("family_members")
      .select("family_id, role, verified")
      .eq("member_pubkey_hash", await hashPubkey(studentPubkey))
      .eq("verified", true)
      .single();

    checks.familyFederation = !!familyMembership;

    // Invitation quality scoring (for new users)
    const { data: userProfile } = await supabase
      .from("user_profiles")
      .select("created_at, invitation_source, invitation_quality_score")
      .eq("pubkey_hash", await hashPubkey(studentPubkey))
      .single();

    if (userProfile) {
      const daysSinceRegistration =
        (now - new Date(userProfile.created_at).getTime()) /
        (1000 * 60 * 60 * 24);
      if (daysSinceRegistration < 7) {
        // New user within 7 days
        const qualityScore = userProfile.invitation_quality_score || 0;
        checks.invitationQuality = qualityScore >= 0.7; // Require 70% quality score
      } else {
        checks.invitationQuality = true; // Established users
      }
    }
  } catch (error) {
    console.error("Anti-gaming check error:", error);
  }

  return checks;
};

// Utility functions
const hashPubkey = async (pubkey: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(pubkey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

const hashString = async (str: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

const encryptEvidence = async (evidence: any): Promise<string> => {
  // Simple encryption for demo - in production use proper encryption
  return btoa(JSON.stringify(evidence));
};

// API Handler
export const handler: Handler = async (event) => {
  try {
    // CORS headers
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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

    // Rate limiting
    const clientIp =
      event.headers["client-ip"] ||
      event.headers["x-forwarded-for"] ||
      "unknown";
    const rateLimitKey = `badge-system:${clientIp}`;

    const rateLimitResult = await rateLimiter.checkLimit(
      rateLimitKey,
      BADGE_RATE_LIMITS.award
    );
    if (!rateLimitResult.allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({
          success: false,
          error: "Rate limit exceeded",
          retryAfter: rateLimitResult.retryAfter,
        }),
      };
    }

    // Parse request
    const { action, ...data } = JSON.parse(event.body || "{}");

    if (!action) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: "Action is required",
        }),
      };
    }

    // Route to appropriate handler
    switch (action) {
      case "award-badge":
        return await handleAwardBadge(data, headers);

      case "get-available-badges":
        return await handleGetAvailableBadges(data, headers);

      case "get-student-progress":
        return await handleGetStudentProgress(data, headers);

      case "get-student-dashboard":
        return await handleGetStudentDashboard(data, headers);

      case "credentialization":
        return await handleWoTNotarization(data, headers);

      case "mentor-registration":
        return await handleMentorRegistration(data, headers);

      case "get-mentor-dashboard":
        return await handleGetMentorDashboard(data, headers);

      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: "Invalid action",
          }),
        };
    }
  } catch (error) {
    console.error("Badge system API error:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: false,
        error: "Internal server error",
      }),
    };
  }
};

// Handler functions
const handleAwardBadge = async (data: any, headers: any) => {
  // Validate input
  const validation = validateInput(data, badgeAwardSchema);
  if (!validation.valid) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Invalid input",
        details: validation.errors,
      }),
    };
  }

  const {
    badgeId,
    recipientPubkey,
    evidence,
    privacyLevel,
    mentorVerification,
  } = data;

  // Anti-gaming checks
  const antiGamingChecks = await performAntiGamingChecks(
    recipientPubkey,
    "award-badge",
    data.browserFingerprint
  );

  if (antiGamingChecks.rapidSubmission) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Too many badge awards in a short time",
      }),
    };
  }

  if (antiGamingChecks.timeBetweenActions) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Please wait before requesting another badge",
      }),
    };
  }

  try {
    // Check if badge exists and is enabled
    const { data: badge, error: badgeError } = await supabase
      .from("badge_definitions")
      .select("*")
      .eq("badge_id", badgeId)
      .eq("enabled", true)
      .single();

    if (badgeError || !badge) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          success: false,
          error: "Badge not found or disabled",
        }),
      };
    }

    // Check if user already has this badge
    const { data: existingAward } = await supabase
      .from("badge_awards")
      .select("id")
      .eq("badge_id", badgeId)
      .eq("recipient_pubkey_hash", await hashPubkey(recipientPubkey))
      .single();

    if (existingAward) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({
          success: false,
          error: "Badge already awarded",
        }),
      };
    }

    // Create badge award
    const award = {
      id: crypto.randomUUID(),
      award_id: crypto.randomUUID(),
      badge_id: badgeId,
      recipient_pubkey_hash: await hashPubkey(recipientPubkey),
      issuer_pubkey: badge.issuer_pubkey,
      awarded_at: Math.floor(Date.now() / 1000),
      encrypted_evidence: await encryptEvidence(evidence),
      verification_status: "pending",
      privacy_encrypted: privacyLevel === "private",
      wot_verified: false,
      institutional_cosigned: false,
      evidence: {
        lessons_completed: evidence.lessons_completed,
        quiz_scores: evidence.quiz_scores.map((qs: any) => ({
          ...qs,
          completion_date: Math.floor(Date.now() / 1000),
        })),
        practical_work: evidence.practical_work || [],
        guardian_approvals: [],
        mentor_verification: mentorVerification
          ? {
              mentor_pubkey: mentorVerification.mentor_pubkey,
              mentor_nip05: mentorVerification.mentor_nip05,
              verification_timestamp: Math.floor(Date.now() / 1000),
              verification_notes: mentorVerification.verification_notes,
              verification_level: "basic",
              competency_verified: [badge.subject],
              mentor_signature: mentorVerification.mentor_signature,
            }
          : undefined,
      },
      created_at: Math.floor(Date.now() / 1000),
    };

    // Save badge award
    const { error: saveError } = await supabase
      .from("badge_awards")
      .insert([award]);

    if (saveError) {
      throw new Error("Failed to save badge award");
    }

    // Log action for anti-gaming
    await supabase.from("badge_actions").insert([
      {
        id: crypto.randomUUID(),
        student_pubkey_hash: await hashPubkey(recipientPubkey),
        action_type: "award-badge",
        badge_id: badgeId,
        created_at: new Date().toISOString(),
      },
    ]);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: award,
      }),
    };
  } catch (error) {
    console.error("Award badge error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Failed to award badge",
      }),
    };
  }
};

const handleGetAvailableBadges = async (data: any, headers: any) => {
  const { studentPubkey, familyId } = data;

  if (!studentPubkey) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Student pubkey is required",
      }),
    };
  }

  try {
    // Get student progress
    const { data: progress } = await supabase
      .from("student_progress")
      .select("*")
      .eq("student_pubkey_hash", await hashPubkey(studentPubkey))
      .single();

    // Get all enabled badges
    const { data: badges, error: badgesError } = await supabase
      .from("badge_definitions")
      .select("*")
      .eq("enabled", true);

    if (badgesError) {
      throw new Error("Failed to fetch badges");
    }

    // Filter badges based on eligibility
    const availableBadges =
      badges?.filter((badge) => {
        // Check prerequisites
        if (badge.prerequisites?.length > 0 && progress) {
          const earnedBadges =
            progress.badges_earned?.map((b: any) => b.badge_id) || [];
          for (const prerequisite of badge.prerequisites) {
            if (!earnedBadges.includes(prerequisite)) {
              return false;
            }
          }
        }

        // Check completion requirements
        if (badge.criteria?.completion_requirements && progress) {
          const req = badge.criteria.completion_requirements;

          if (req.lessons_completed && progress.subjects_progress) {
            const subjectProgress = progress.subjects_progress.find(
              (sp: any) => sp.subject === badge.subject
            );
            if (
              !subjectProgress ||
              subjectProgress.lessons_completed < req.lessons_completed
            ) {
              return false;
            }
          }

          if (req.minimum_score && progress.subjects_progress) {
            const subjectProgress = progress.subjects_progress.find(
              (sp: any) => sp.subject === badge.subject
            );
            if (
              !subjectProgress ||
              subjectProgress.proficiency_score < req.minimum_score
            ) {
              return false;
            }
          }
        }

        // Check time requirements
        if (
          badge.criteria?.time_requirements?.minimum_study_hours &&
          progress
        ) {
          if (
            progress.total_study_hours <
            badge.criteria.time_requirements.minimum_study_hours
          ) {
            return false;
          }
        }

        // Check verification requirements
        if (
          badge.criteria?.verification_requirements
            ?.guardian_approval_required &&
          !familyId
        ) {
          return false;
        }

        return true;
      }) || [];

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: availableBadges,
      }),
    };
  } catch (error) {
    console.error("Get available badges error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Failed to get available badges",
      }),
    };
  }
};

const handleGetStudentProgress = async (data: any, headers: any) => {
  const { studentPubkey } = data;

  if (!studentPubkey) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Student pubkey is required",
      }),
    };
  }

  try {
    const { data: progress, error } = await supabase
      .from("student_progress")
      .select("*")
      .eq("student_pubkey_hash", await hashPubkey(studentPubkey))
      .single();

    if (error || !progress) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          success: false,
          error: "Student progress not found",
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: progress,
      }),
    };
  } catch (error) {
    console.error("Get student progress error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Failed to get student progress",
      }),
    };
  }
};

const handleGetStudentDashboard = async (data: any, headers: any) => {
  const { studentPubkey, familyId } = data;

  if (!studentPubkey) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Student pubkey is required",
      }),
    };
  }

  try {
    // Get all dashboard data
    const [
      progress,
      availableBadges,
      achievementsSummary,
      mentorInteractions,
      credentializations,
    ] = await Promise.all([
      handleGetStudentProgress({ studentPubkey }, headers).then(
        (res) => JSON.parse(res.body).data
      ),
      handleGetAvailableBadges({ studentPubkey, familyId }, headers).then(
        (res) => JSON.parse(res.body).data
      ),
      getAchievementsSummary(studentPubkey),
      getMentorInteractions(studentPubkey),
      getCredentializations(studentPubkey),
    ]);

    const dashboardData = {
      progress,
      available_badges: availableBadges,
      achievements_summary: achievementsSummary,
      mentor_interactions: mentorInteractions,
      credentializations: credentializations,
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: dashboardData,
      }),
    };
  } catch (error) {
    console.error("Get student dashboard error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Failed to get student dashboard",
      }),
    };
  }
};

const handleWoTNotarization = async (data: any, headers: any) => {
  // Validate input
  const validation = validateInput(data, wotNotarizationSchema);
  if (!validation.valid) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Invalid input",
        details: validation.errors,
      }),
    };
  }

  const {
    badgeId,
    studentPubkey,
    mentorPubkey,
    verificationNotes,
    privacyLevel,
    guardianApproval,
  } = data;

  try {
    // Create WoT notarization
    const notarization = {
      id: crypto.randomUUID(),
      redemption_id: crypto.randomUUID(),
      badge_id: badgeId,
      student_pubkey_hash: await hashPubkey(studentPubkey),
      mentor_pubkey: mentorPubkey,
      mentor_nip05: "", // Would be fetched from mentor profile
      mentor_signature: "", // Would be generated
      verification_timestamp: Math.floor(Date.now() / 1000),
      verification_notes: verificationNotes,
      verification_level: "basic",
      competency_verified: [], // Would be determined from badge
      institutional_verification: false,
      verification_hash: await hashString(
        `${badgeId}${studentPubkey}${mentorPubkey}`
      ),
      privacy_level: privacyLevel,
      transferable: false,
      revoked: false,
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
    };

    // Save notarization
    const { error: saveError } = await supabase
      .from("wot_mentor_notarizations")
      .insert([notarization]);

    if (saveError) {
      throw new Error("Failed to save notarization");
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: notarization,
      }),
    };
  } catch (error) {
    console.error("WoT notarization error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Failed to create WoT notarization",
      }),
    };
  }
};

const handleMentorRegistration = async (data: any, headers: any) => {
  // Validate input
  const validation = validateInput(data, mentorRegistrationSchema);
  if (!validation.valid) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Invalid input",
        details: validation.errors,
      }),
    };
  }

  const {
    mentorPubkey,
    nip05,
    competencyAreas,
    verificationLevel,
    bio,
    institutionAffiliation,
    yearsExperience,
  } = data;

  try {
    // Check if mentor already exists
    const { data: existingMentor } = await supabase
      .from("mentor_registrations")
      .select("id")
      .eq("mentor_pubkey", mentorPubkey)
      .single();

    if (existingMentor) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({
          success: false,
          error: "Mentor already registered",
        }),
      };
    }

    // Create mentor registration
    const mentor = {
      id: crypto.randomUUID(),
      mentor_pubkey: mentorPubkey,
      nip05_identifier: nip05,
      nip05_verified: false, // Would be verified separately
      competency_areas: competencyAreas,
      verification_level: verificationLevel,
      bio,
      institution_affiliation: institutionAffiliation,
      years_experience: yearsExperience,
      active: true,
      verified_by_institution: false,
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
    };

    // Save mentor registration
    const { error: saveError } = await supabase
      .from("mentor_registrations")
      .insert([mentor]);

    if (saveError) {
      throw new Error("Failed to save mentor registration");
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: mentor,
      }),
    };
  } catch (error) {
    console.error("Mentor registration error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Failed to register mentor",
      }),
    };
  }
};

const handleGetMentorDashboard = async (data: any, headers: any) => {
  const { mentorPubkey } = data;

  if (!mentorPubkey) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Mentor pubkey is required",
      }),
    };
  }

  try {
    // Get mentor profile and related data
    const { data: mentorProfile } = await supabase
      .from("mentor_registrations")
      .select("*")
      .eq("mentor_pubkey", mentorPubkey)
      .single();

    if (!mentorProfile) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          success: false,
          error: "Mentor not found",
        }),
      };
    }

    // Get mentor reputation and statistics
    const { data: reputation } = await supabase
      .from("mentor_reputations")
      .select("*")
      .eq("mentor_pubkey", mentorPubkey)
      .single();

    // Get pending verifications
    const { data: pendingVerifications } = await supabase
      .from("wot_mentor_notarizations")
      .select("*")
      .eq("mentor_pubkey", mentorPubkey)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(10);

    const dashboardData = {
      mentor_profile: mentorProfile,
      reputation: reputation || {
        mentor_pubkey: mentorPubkey,
        total_verifications: 0,
        approved_verifications: 0,
        approval_rate: 0,
        average_quality_score: 0,
        reputation_score: 0,
        competency_areas: mentorProfile.competency_areas,
        verification_level: mentorProfile.verification_level,
        years_active: 0,
        recent_activity: Math.floor(Date.now() / 1000),
      },
      pending_verifications: pendingVerifications || [],
      recent_verifications: [], // Would be fetched
      competency_stats: [], // Would be calculated
      students_mentored: 0, // Would be calculated
      institutional_standing: "pending",
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: dashboardData,
      }),
    };
  } catch (error) {
    console.error("Get mentor dashboard error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Failed to get mentor dashboard",
      }),
    };
  }
};

// Helper functions for dashboard data
const getAchievementsSummary = async (studentPubkey: string) => {
  try {
    const { data: progress } = await supabase
      .from("student_progress")
      .select("badges_earned")
      .eq("student_pubkey_hash", await hashPubkey(studentPubkey))
      .single();

    if (!progress || !progress.badges_earned) {
      return {
        total_badges: 0,
        badges_by_level: {},
        badges_by_category: {},
        badges_by_subject: {},
        wot_verified_badges: 0,
        institutional_cosigned_badges: 0,
        streak_info: {
          current_streak: 0,
          longest_streak: 0,
          streak_start_date: 0,
        },
        recent_achievements: [],
        next_milestones: [],
        mentor_relationships: [],
      };
    }

    // Calculate summary from badges_earned
    const totalBadges = progress.badges_earned.length;
    const wotVerifiedBadges = progress.badges_earned.filter(
      (b: any) => b.wot_verified
    ).length;
    const institutionalCosignedBadges = progress.badges_earned.filter(
      (b: any) => b.institutional_cosigned
    ).length;

    return {
      total_badges: totalBadges,
      badges_by_level: {},
      badges_by_category: {},
      badges_by_subject: {},
      wot_verified_badges: wotVerifiedBadges,
      institutional_cosigned_badges: institutionalCosignedBadges,
      streak_info: {
        current_streak: 0,
        longest_streak: 0,
        streak_start_date: 0,
      },
      recent_achievements: progress.badges_earned.slice(-5),
      next_milestones: [],
      mentor_relationships: [],
    };
  } catch (error) {
    console.error("Get achievements summary error:", error);
    return null;
  }
};

const getMentorInteractions = async (studentPubkey: string) => {
  try {
    const { data: interactions } = await supabase
      .from("mentor_interactions")
      .select("*")
      .eq("student_pubkey_hash", await hashPubkey(studentPubkey))
      .order("interaction_timestamp", { ascending: false })
      .limit(10);

    return interactions || [];
  } catch (error) {
    console.error("Get mentor interactions error:", error);
    return [];
  }
};

const getCredentializations = async (studentPubkey: string) => {
  try {
    const { data: notarizations } = await supabase
      .from("wot_mentor_notarizations")
      .select("*")
      .eq("student_pubkey_hash", await hashPubkey(studentPubkey))
      .eq("revoked", false)
      .order("created_at", { ascending: false });

    return notarizations || [];
  } catch (error) {
    console.error("Get WoT notarizations error:", error);
    return [];
  }
};
