/**
 * Citadel Academy Badge System
 * NIP-58 badges with WoT mentor notarization and cognitive capital tracking
 * @compliance Master Context - Privacy-first, browser-compatible, Bitcoin-only
 */

import { supabase } from "../supabase";
import { generateBrowserFingerprint } from "../privacy/browser-fingerprint";

// Achievement Levels
export type AchievementLevel =
  | "initiate"
  | "apprentice"
  | "journeyman"
  | "craftsman"
  | "master"
  | "guardian"
  | "sage";

// Badge Categories
export type BadgeCategory =
  | "knowledge"
  | "practical"
  | "security"
  | "leadership"
  | "sovereignty"
  | "family"
  | "community";

// Education Subjects
export type EducationSubject =
  | "bitcoin-fundamentals"
  | "lightning-network"
  | "privacy-sovereignty"
  | "self-custody"
  | "family-treasury"
  | "nostr-identity"
  | "security-ops"
  | "citadel-building";

// Privacy Levels
export type PrivacyLevel = "public" | "family" | "private";

// Verification Levels
export type VerificationLevel = "basic" | "intermediate" | "advanced";

// Badge Criteria
export interface BadgeCriteria {
  completion_requirements: {
    lessons_completed?: number;
    quizzes_passed?: number;
    practical_exercises?: number;
    minimum_score?: number;
  };
  time_requirements?: {
    minimum_study_hours?: number;
    completion_deadline?: number;
  };
  verification_requirements?: {
    mentor_verification_required?: boolean;
    guardian_approval_required?: boolean;
    peer_review_required?: boolean;
    proof_of_work_required?: boolean;
  };
}

// Badge Definition (NIP-58)
export interface BadgeDefinition {
  id: string;
  badge_id: string;
  name: string;
  description: string;
  image_url?: string;
  category: BadgeCategory;
  subject: EducationSubject;
  level: AchievementLevel;
  prerequisites: string[];
  criteria: BadgeCriteria;
  issuer_pubkey: string;
  mentor_pubkey?: string;
  vice_principal_pubkey?: string;
  privacy_level: PrivacyLevel;
  wot_required: boolean;
  min_mentor_level?: VerificationLevel;
  required_competencies?: string[];
  institutional_cosigning_required: boolean;
  enabled: boolean;
  nostr_event_id?: string;
  encrypted_metadata?: string;
  created_at: number;
  updated_at: number;
}

// Mentor Registration
export interface MentorRegistration {
  id: string;
  mentor_pubkey: string;
  nip05_identifier: string;
  nip05_verified: boolean;
  nip05_verification_date?: number;
  competency_areas: string[];
  verification_level: VerificationLevel;
  bio?: string;
  institution_affiliation?: string;
  years_experience?: number;
  active: boolean;
  verified_by_institution: boolean;
  institution_signature?: string;
  approval_date?: number;
  approved_by_pubkey?: string;
  created_at: number;
  updated_at: number;
}

// Mentor Verification
export interface MentorVerification {
  mentor_pubkey: string;
  mentor_nip05: string;
  verification_timestamp: number;
  verification_notes?: string;
  verification_level: VerificationLevel;
  competency_verified: string[];
  mentor_signature: string;
  quality_score?: number;
  time_spent_minutes?: number;
  verification_artifacts?: string[];
}

// Vice-Principal Co-Signing
export interface VicePrincipalCoSigning {
  vice_principal_pubkey: string;
  co_signature: string;
  institutional_verification: boolean;
  institutional_verification_date?: number;
  block_timestamp?: number;
  block_hash?: string;
  verification_hash: string;
}

// WoT Mentor Notarization
export interface WoTMentorNotarization {
  id: string;
  redemption_id: string;
  badge_id: string;
  student_pubkey_hash: string;
  mentor_pubkey: string;
  mentor_nip05: string;
  mentor_signature: string;
  verification_timestamp: number;
  verification_notes?: string;
  verification_level: VerificationLevel;
  competency_verified: string[];
  vice_principal_pubkey?: string;
  vice_principal_signature?: string;
  institutional_verification: boolean;
  institutional_verification_date?: number;
  block_timestamp?: number;
  block_hash?: string;
  verification_hash: string;
  privacy_level: PrivacyLevel;
  transferable: boolean;
  revoked: boolean;
  revocation_reason?: string;
  revocation_date?: number;
  nostr_event_id?: string;
  nostr_relay_published?: string[];
  encrypted_metadata?: string;
  created_at: number;
  updated_at: number;
}

// NFC Badge Integration
export interface NFCBadgeIntegration {
  id: string;
  notarization_id: string;
  nfc_chip_id: string;
  lightning_wallet_pubkey?: string;
  pin_protection: boolean;
  scratch_off_protection: boolean;
  bearer_note_format:
    | "protected"
    | "unprotected"
    | "pin_protected"
    | "scratch_off";
  physical_badge_metadata: {
    badge_id: string;
    issue_date: number;
    mentor_signature: string;
    vice_principal_signature?: string;
    qr_code_data: string;
    manufacturer?: string;
    batch_number?: string;
  };
  manufacturing_date?: number;
  activation_date?: number;
  expiry_date?: number;
  last_access_date?: number;
  access_count: number;
  max_access_count?: number;
  active: boolean;
  battery_level?: number;
  tamper_evident: boolean;
  tamper_detected: boolean;
  tamper_detection_date?: number;
  created_at: number;
  updated_at: number;
}

// Badge Award (Enhanced with WoT)
export interface BadgeAward {
  id: string;
  award_id: string;
  badge_id: string;
  recipient_pubkey_hash: string;
  issuer_pubkey: string;
  awarded_at: number;
  encrypted_evidence: string;
  verification_status: "pending" | "verified" | "revoked";
  privacy_encrypted: boolean;
  nostr_event_id?: string;
  revocation_reason?: string;
  mentor_verification_id?: string;
  wot_verified: boolean;
  verification_level?: VerificationLevel;
  mentor_pubkey?: string;
  institutional_cosigned: boolean;
  evidence: {
    lessons_completed: string[];
    quiz_scores: Array<{
      quiz_id: string;
      score: number;
      max_score: number;
      completion_date: number;
    }>;
    practical_work: string[];
    guardian_approvals: string[];
    mentor_verification?: MentorVerification;
  };
  created_at: number;
}

// Learning Session
export interface LearningSession {
  id: string;
  session_id: string;
  student_pubkey_hash: string;
  encrypted_session: string;
  content_id: string;
  session_type: "study" | "quiz" | "exercise";
  start_time: number;
  end_time?: number;
  completion_percentage: number;
  score?: number;
  privacy_encrypted: boolean;
  created_at: number;
}

// Student Progress (Enhanced)
export interface StudentProgress {
  id: string;
  student_pubkey_hash: string;
  family_id?: string;
  encrypted_progress: string;
  current_level: AchievementLevel;
  learning_streak_days: number;
  total_study_hours: number;
  badges_earned_count: number;
  privacy_settings: {
    progress_visibility: PrivacyLevel;
    badge_visibility: PrivacyLevel;
    mentor_interaction: PrivacyLevel;
  };
  last_activity?: number;
  created_at: number;
  updated_at: number;
  badges_earned: BadgeAward[];
  subjects_progress: Array<{
    subject: EducationSubject;
    level: AchievementLevel;
    proficiency_score: number;
    badges_earned: number;
    badges_available: number;
    lessons_completed: number;
    lessons_total: number;
    current_streak: number;
    last_activity: number;
  }>;
}

// Student Dashboard Data
export interface StudentDashboardData {
  progress: StudentProgress;
  available_badges: BadgeDefinition[];
  achievements_summary: AchievementsSummary;
  mentor_interactions: MentorInteraction[];
  credentializations: WoTMentorNotarization[];
}

// Achievements Summary
export interface AchievementsSummary {
  total_badges: number;
  badges_by_level: Record<AchievementLevel, number>;
  badges_by_category: Record<BadgeCategory, number>;
  badges_by_subject: Record<EducationSubject, number>;
  wot_verified_badges: number;
  institutional_cosigned_badges: number;
  streak_info: {
    current_streak: number;
    longest_streak: number;
    streak_start_date: number;
  };
  recent_achievements: BadgeAward[];
  next_milestones: BadgeDefinition[];
  mentor_relationships: Array<{
    mentor_pubkey: string;
    mentor_nip05: string;
    verifications_count: number;
    competency_areas: string[];
  }>;
}

// Mentor Interaction
export interface MentorInteraction {
  id: string;
  mentor_pubkey: string;
  mentor_nip05: string;
  student_pubkey_hash: string;
  interaction_type: "verification" | "guidance" | "review" | "assessment";
  badge_id?: string;
  interaction_notes?: string;
  interaction_timestamp: number;
  outcome?: string;
  follow_up_required: boolean;
  privacy_level: PrivacyLevel;
  created_at: number;
}

// Mentor Reputation
export interface MentorReputation {
  mentor_pubkey: string;
  total_verifications: number;
  approved_verifications: number;
  approval_rate: number;
  average_quality_score: number;
  reputation_score: number;
  competency_areas: string[];
  verification_level: VerificationLevel;
  student_feedback_score?: number;
  institution_rating?: number;
  years_active: number;
  recent_activity: number;
}

// Mentor Dashboard Data
export interface MentorDashboardData {
  mentor_profile: MentorRegistration;
  reputation: MentorReputation;
  pending_verifications: Array<{
    student_pubkey_hash: string;
    badge_id: string;
    submission_date: number;
    priority: "high" | "medium" | "low";
  }>;
  recent_verifications: Array<{
    student_pubkey_hash: string;
    badge_id: string;
    verification_date: number;
    outcome: string;
  }>;
  competency_stats: Array<{
    competency: string;
    verifications_count: number;
    success_rate: number;
  }>;
  students_mentored: number;
  institutional_standing: string;
}

// WoT Privacy Controls
export interface WoTPrivacyControls {
  mentor_visibility: PrivacyLevel;
  signature_exposure: "full" | "hash_only" | "private";
  verification_details: "public" | "encrypted" | "hidden";
  institutional_cosigning: "public" | "private";
  achievement_metadata: "full" | "minimal" | "private";
}

// API Request/Response Types
export interface BadgeAwardRequest {
  badgeId: string;
  recipientPubkey: string;
  evidence: {
    lessons_completed: string[];
    quiz_scores: Array<{
      quiz_id: string;
      score: number;
      max_score: number;
    }>;
    practical_work?: string[];
  };
  privacyLevel: PrivacyLevel;
  mentorVerification?: {
    mentor_pubkey: string;
    mentor_nip05: string;
    verification_notes?: string;
    mentor_signature: string;
  };
  vicePrincipalCoSigning?: {
    vice_principal_pubkey: string;
    institutional_verification: boolean;
  };
}

export interface WoTNotarizationRequest {
  badgeId: string;
  studentPubkey: string;
  mentorPubkey: string;
  verificationNotes?: string;
  privacyLevel: PrivacyLevel;
  guardianApproval?: string;
}

export interface MentorRegistrationRequest {
  mentorPubkey: string;
  nip05: string;
  competencyAreas: string[];
  verificationLevel: VerificationLevel;
  bio?: string;
  institutionAffiliation?: string;
  yearsExperience?: number;
}

/**
 * Badge System Service
 */
export class BadgeSystemService {
  private static instance: BadgeSystemService;

  private constructor() {}

  static getInstance(): BadgeSystemService {
    if (!BadgeSystemService.instance) {
      BadgeSystemService.instance = new BadgeSystemService();
    }
    return BadgeSystemService.instance;
  }

  /**
   * Get available badges for a student
   */
  async getAvailableBadges(studentPubkey: string, familyId?: string): Promise<BadgeDefinition[]> {
    try {
      // Get student progress
      const progress = await this.getStudentProgress(studentPubkey);
      if (!progress) {
        return [];
      }

      // Get all badge definitions
      const { data: badges, error } = await supabase
        .from('badge_definitions')
        .select('*')
        .eq('enabled', true);

      if (error || !badges) {
        return [];
      }

      // Filter badges based on prerequisites and progress
      const availableBadges: BadgeDefinition[] = [];

      for (const badge of badges) {
        if (await this.checkBadgeEligibility(badge, progress, studentPubkey, familyId)) {
          availableBadges.push(badge);
        }
      }

      return availableBadges;
    } catch (error) {
      console.error('Error getting available badges:', error);
      return [];
    }
  }

  /**
   * Check if student is eligible for a specific badge
   */
  private async checkBadgeEligibility(
    badge: BadgeDefinition,
    progress: StudentProgress,
    studentPubkey: string,
    familyId?: string
  ): Promise<boolean> {
    try {
      // Check prerequisites
      if (badge.prerequisites.length > 0) {
        const earnedBadges = progress.badges_earned.map(b => b.badge_id);
        for (const prerequisite of badge.prerequisites) {
          if (!earnedBadges.includes(prerequisite)) {
            return false;
          }
        }
      }

      // Check completion requirements
      const criteria = badge.criteria;
      if (criteria.completion_requirements) {
        const req = criteria.completion_requirements;
        
        if (req.lessons_completed && progress.subjects_progress) {
          const subjectProgress = progress.subjects_progress.find(
            sp => sp.subject === badge.subject
          );
          if (!subjectProgress || subjectProgress.lessons_completed < req.lessons_completed) {
            return false;
          }
        }

        if (req.minimum_score && progress.subjects_progress) {
          const subjectProgress = progress.subjects_progress.find(
            sp => sp.subject === badge.subject
          );
          if (!subjectProgress || subjectProgress.proficiency_score < req.minimum_score) {
            return false;
          }
        }
      }

      // Check time requirements
      if (criteria.time_requirements?.minimum_study_hours) {
        if (progress.total_study_hours < criteria.time_requirements.minimum_study_hours) {
          return false;
        }
      }

      // Check verification requirements
      if (criteria.verification_requirements?.guardian_approval_required && !familyId) {
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error checking badge eligibility:', error);
      return false;
    }
  }

  /**
   * Award a badge to a student
   */
  async awardBadge(request: BadgeAwardRequest): Promise<BadgeAward | null> {
    try {
      // Validate badge exists
      const { data: badge, error: badgeError } = await supabase
        .from('badge_definitions')
        .select('*')
        .eq('badge_id', request.badgeId)
        .eq('enabled', true)
        .single();

      if (badgeError || !badge) {
        throw new Error('Badge not found or disabled');
      }

      // Check eligibility
      const progress = await this.getStudentProgress(request.recipientPubkey);
      if (!progress) {
        throw new Error('Student progress not found');
      }

      const isEligible = await this.checkBadgeEligibility(badge, progress, request.recipientPubkey);
      if (!isEligible) {
        throw new Error('Not eligible for this badge');
      }

      // Create badge award
      const award: BadgeAward = {
        id: crypto.randomUUID(),
        award_id: crypto.randomUUID(),
        badge_id: request.badgeId,
        recipient_pubkey_hash: await this.hashPubkey(request.recipientPubkey),
        issuer_pubkey: badge.issuer_pubkey,
        awarded_at: Date.now(),
        encrypted_evidence: await this.encryptEvidence(request.evidence),
        verification_status: 'pending',
        privacy_encrypted: request.privacyLevel === 'private',
        wot_verified: false,
        institutional_cosigned: false,
        evidence: {
          lessons_completed: request.evidence.lessons_completed,
          quiz_scores: request.evidence.quiz_scores.map(qs => ({
            ...qs,
            completion_date: Date.now()
          })),
          practical_work: request.evidence.practical_work || [],
          guardian_approvals: [],
          mentor_verification: request.mentorVerification ? {
            mentor_pubkey: request.mentorVerification.mentor_pubkey,
            mentor_nip05: request.mentorVerification.mentor_nip05,
            verification_timestamp: Date.now(),
            verification_notes: request.mentorVerification.verification_notes,
            verification_level: 'basic',
            competency_verified: [badge.subject],
            mentor_signature: request.mentorVerification.mentor_signature
          } : undefined
        },
        created_at: Date.now()
      };

      // Save badge award
      const { error: saveError } = await supabase
        .from('badge_awards')
        .insert([award]);

      if (saveError) {
        throw new Error('Failed to save badge award');
      }

      // Update student progress
      await this.updateStudentProgress(progress, badge);

      return award;
    } catch (error) {
      console.error('Error awarding badge:', error);
      return null;
    }
  }

  /**
   * Get student progress
   */
  async getStudentProgress(studentPubkey: string): Promise<StudentProgress | null> {
    try {
      const { data, error } = await supabase
        .from('student_progress')
        .select('*')
        .eq('student_pubkey_hash', await this.hashPubkey(studentPubkey))
        .single();

      if (error || !data) {
        return null;
      }

      return data as StudentProgress;
    } catch (error) {
      console.error('Error getting student progress:', error);
      return null;
    }
  }

  /**
   * Update student progress after badge award
   */
  private async updateStudentProgress(progress: StudentProgress, badge: BadgeDefinition): Promise<void> {
    try {
      // Update badges earned count
      progress.badges_earned_count += 1;

      // Update subject progress
      const subjectProgress = progress.subjects_progress.find(sp => sp.subject === badge.subject);
      if (subjectProgress) {
        subjectProgress.badges_earned += 1;
        subjectProgress.last_activity = Date.now();
      }

      // Update last activity
      progress.last_activity = Date.now();

      await supabase
        .from('student_progress')
        .upsert([progress]);
    } catch (error) {
      console.error('Error updating student progress:', error);
    }
  }

  /**
   * Hash public key for privacy
   */
  private async hashPubkey(pubkey: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(pubkey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Encrypt evidence for privacy
   */
  private async encryptEvidence(evidence: any): Promise<string> {
    // Simple encryption for demo - in production use proper encryption
    return btoa(JSON.stringify(evidence));
  }

  /**
   * Get student dashboard data
   */
  async getStudentDashboard(studentPubkey: string, familyId?: string): Promise<StudentDashboardData | null> {
    try {
      const progress = await this.getStudentProgress(studentPubkey);
      if (!progress) {
        return null;
      }

      const availableBadges = await this.getAvailableBadges(studentPubkey, familyId);
      const achievementsSummary = await this.getAchievementsSummary(progress);
      const mentorInteractions = await this.getMentorInteractions(studentPubkey);
      const credentializations = await this.getCredentializations(studentPubkey);

      return {
        progress,
        available_badges: availableBadges,
        achievements_summary: achievementsSummary,
        mentor_interactions: mentorInteractions,
        credentializations: credentializations
      };
    } catch (error) {
      console.error('Error getting student dashboard:', error);
      return null;
    }
  }

  /**
   * Get achievements summary
   */
  private async getAchievementsSummary(progress: StudentProgress): Promise<AchievementsSummary> {
    const badgesByLevel: Record<AchievementLevel, number> = {
      initiate: 0, apprentice: 0, journeyman: 0, craftsman: 0,
      master: 0, guardian: 0, sage: 0
    };

    const badgesByCategory: Record<BadgeCategory, number> = {
      knowledge: 0, practical: 0, security: 0, leadership: 0,
      sovereignty: 0, family: 0, community: 0
    };

    const badgesBySubject: Record<EducationSubject, number> = {
      'bitcoin-fundamentals': 0, 'lightning-network': 0, 'privacy-sovereignty': 0,
      'self-custody': 0, 'family-treasury': 0, 'nostr-identity': 0,
      'security-ops': 0, 'citadel-building': 0
    };

    // Count badges by various criteria
    for (const badge of progress.badges_earned) {
      // This would require joining with badge definitions
      // For now, return basic summary
    }

    return {
      total_badges: progress.badges_earned_count,
      badges_by_level: badgesByLevel,
      badges_by_category: badgesByCategory,
      badges_by_subject: badgesBySubject,
      wot_verified_badges: progress.badges_earned.filter(b => b.wot_verified).length,
      institutional_cosigned_badges: progress.badges_earned.filter(b => b.institutional_cosigned).length,
      streak_info: {
        current_streak: progress.learning_streak_days,
        longest_streak: progress.learning_streak_days, // Would need to track separately
        streak_start_date: Date.now() - (progress.learning_streak_days * 24 * 60 * 60 * 1000)
      },
      recent_achievements: progress.badges_earned.slice(-5),
      next_milestones: [],
      mentor_relationships: []
    };
  }

  /**
   * Get mentor interactions
   */
  private async getMentorInteractions(studentPubkey: string): Promise<MentorInteraction[]> {
    try {
      const { data, error } = await supabase
        .from('mentor_interactions')
        .select('*')
        .eq('student_pubkey_hash', await this.hashPubkey(studentPubkey))
        .order('interaction_timestamp', { ascending: false })
        .limit(10);

      if (error || !data) {
        return [];
      }

      return data as MentorInteraction[];
    } catch (error) {
      console.error('Error getting mentor interactions:', error);
      return [];
    }
  }

  /**
   * Get WoT notarizations
   */
  private async getCredentializations(studentPubkey: string): Promise<WoTMentorNotarization[]> {
    try {
      const { data, error } = await supabase
        .from('wot_mentor_notarizations')
        .select('*')
        .eq('student_pubkey_hash', await this.hashPubkey(studentPubkey))
        .eq('revoked', false)
        .order('created_at', { ascending: false });

      if (error || !data) {
        return [];
      }

      return data as WoTMentorNotarization[];
    } catch (error) {
      console.error('Error getting WoT notarizations:', error);
      return [];
    }
  }
}

// Export singleton instance
export const badgeSystem = BadgeSystemService.getInstance(); 