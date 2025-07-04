/**
 * Education and Badge System Types
 * Includes NIP-58 badges and WoT mentor notarization
 */

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

// Student Progress
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
  wot_notarizations: WoTMentorNotarization[];
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

// Export types for reward system integration
export * from "./rewards";
