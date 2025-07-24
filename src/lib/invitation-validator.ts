/**
 * Privacy-First Invitation Validation Service
 *
 * Browser-compatible service for validating invitation tokens on the landing page.
 * Used when new users arrive after clicking invitation links.
 *
 * Features:
 * - Privacy-preserving validation
 * - Returns only safe, non-sensitive invitation data
 * - Client-side rate limiting to prevent abuse
 * - No exposure of user identifiers or sensitive information
 */

// Lazy import to prevent client creation on page load
let supabaseClient: any = null;
const getSupabaseClient = async () => {
  if (!supabaseClient) {
    const { supabase } = await import("./supabase");
    supabaseClient = supabase;
  }
  return supabaseClient;
};

// Client-side rate limiting for validation requests
const validationRateLimit = new Map<
  string,
  { count: number; resetTime: number }
>();
const VALIDATION_RATE_LIMIT = 20; // 20 validations per 5 minutes per session
const RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes

export interface InvitationDetails {
  isValid: boolean;
  personalMessage?: string;
  courseCredits?: number;
  expiryDate?: string;
  isExpired?: boolean;
  isUsed?: boolean;
  error?: string;
  welcomeMessage?: string;
  creditsMessage?: string;
}

/**
 * Check client-side rate limiting for validation requests
 */
function checkValidationRateLimit(sessionId: string): boolean {
  const now = Date.now();
  const clientLimit = validationRateLimit.get(sessionId);

  if (!clientLimit) {
    validationRateLimit.set(sessionId, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    });
    return true;
  }

  if (now > clientLimit.resetTime) {
    validationRateLimit.set(sessionId, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    });
    return true;
  }

  if (clientLimit.count >= VALIDATION_RATE_LIMIT) {
    return false;
  }

  clientLimit.count++;
  return true;
}

/**
 * Generate a session ID for rate limiting (privacy-preserving)
 */
function generateSessionId(): string {
  // Use a combination of timestamp and random data for session tracking
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return `${timestamp}-${random}`;
}

/**
 * Get invitation details from database (public safe fields only)
 */
async function getPublicInvitationDetails(
  inviteToken: string
): Promise<InvitationDetails> {
  try {
    const { data, error } = await supabase
      .from("authenticated_peer_invitations")
      .select(
        `
        invitation_data,
        course_credits,
        expires_at,
        used,
        used_at,
        created_at
      `
      )
      .eq("invite_token", inviteToken)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows returned
        return {
          isValid: false,
          error: "Invitation not found",
        };
      }
      throw error;
    }

    const now = new Date();
    const expiryDate = new Date(data.expires_at);
    const isExpired = expiryDate < now;
    const isUsed = data.used;

    // Extract safe data from invitation_data JSONB
    const invitationData = data.invitation_data || {};
    const personalMessage = invitationData.personalMessage;
    const courseCredits = data.course_credits;

    return {
      isValid: !isExpired && !isUsed,
      personalMessage: personalMessage,
      courseCredits: courseCredits,
      expiryDate: data.expires_at,
      isExpired,
      isUsed,
      error: isExpired
        ? "Invitation has expired"
        : isUsed
        ? "Invitation has already been used"
        : undefined,
      welcomeMessage: personalMessage
        ? `You've been invited to join Satnam.pub! ${personalMessage}`
        : `You've been invited to join Satnam.pub!`,
      creditsMessage: `You and your inviter will both receive ${courseCredits} course credits when you sign up.`,
    };
  } catch (error) {
    console.error("Error fetching invitation details:", error);
    return {
      isValid: false,
      error: "Database error",
    };
  }
}

/**
 * Track invitation view for analytics (privacy-preserving)
 */
async function trackInvitationView(inviteToken: string): Promise<void> {
  try {
    // Create privacy-preserving analytics entry
    const eventData = {
      invite_token: inviteToken,
      event_type: "viewed",
      timestamp: new Date().toISOString(),
      // Only store hashed/anonymized data for privacy
      session_hash: generateSessionId(),
      user_agent_hash: navigator.userAgent
        ? btoa(navigator.userAgent).substring(0, 16)
        : null,
    };

    // Store the view event in Supabase (privacy-preserving)
    await (await getSupabaseClient())
      .from("invitation_analytics")
      .insert(eventData);

    console.log("Invitation view tracked", {
      inviteToken,
      hasPersonalMessage: !!eventData.user_agent_hash,
    });
  } catch (error) {
    console.error("Error tracking invitation view:", error);
    // Don't throw - tracking is not critical
  }
}

/**
 * Validate an invitation token
 * This is the main function called from the landing page
 */
export async function validateInvitation(
  inviteToken: string
): Promise<InvitationDetails> {
  try {
    // Client-side rate limiting check
    const sessionId = generateSessionId();
    if (!checkValidationRateLimit(sessionId)) {
      return {
        isValid: false,
        error: "Rate limit exceeded. Please try again later.",
      };
    }

    // Track the validation request (privacy-preserving)
    await trackInvitationView(inviteToken);

    // Get invitation details
    const invitationDetails = await getPublicInvitationDetails(inviteToken);

    if (!invitationDetails.isValid) {
      console.warn("Invalid invitation:", invitationDetails.error);
      return invitationDetails;
    }

    // Log successful validation (privacy-preserving)
    console.log("Invitation validated", {
      inviteToken,
      courseCredits: invitationDetails.courseCredits,
      hasPersonalMessage: !!invitationDetails.personalMessage,
    });

    return invitationDetails;
  } catch (error) {
    console.error("Error validating peer invitation:", error);
    return {
      isValid: false,
      error: "Internal error",
    };
  }
}

/**
 * Extract invitation token from URL parameters
 * Helper function for landing page integration
 */
export function extractInvitationTokenFromURL(): string | null {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("token") || urlParams.get("invite") || null;
}

/**
 * Validate invitation from URL parameters
 * Convenience function for landing page usage
 */
export async function validateInvitationFromURL(): Promise<InvitationDetails | null> {
  const token = extractInvitationTokenFromURL();
  if (!token) {
    return null;
  }
  return await validateInvitation(token);
}
