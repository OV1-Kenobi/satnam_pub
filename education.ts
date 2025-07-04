/**
 * Education and Badge System Types for Citadel Academy Integration
 * Implements NIP-58 Nostr badges for educational achievements
 */

import { NostrEvent } from "./user";

/**
 * Educational achievement levels
 */
export type AchievementLevel =
  | "initiate" // First steps in Bitcoin education
  | "apprentice" // Basic Bitcoin knowledge
  | "journeyman" // Intermediate skills
  | "craftsman" // Advanced practical skills
  | "master" // Expert level understanding
  | "guardian" // Leadership and teaching ability
  | "sage"; // Wisdom and sovereignty mastery

/**
 * Educational subject areas
 */
export type EducationSubject =
  | "bitcoin-fundamentals"
  | "lightning-network"
  | "privacy-sovereignty"
  | "self-custody"
  | "family-treasury"
  | "nostr-identity"
  | "security-ops"
  | "citadel-building";

/**
 * Badge categories for different achievement types
 */
export type BadgeCategory =
  | "knowledge" // Theoretical understanding
  | "practical" // Hands-on skills
  | "security" // Security practices
  | "leadership" // Teaching and mentoring
  | "sovereignty" // Self-reliance achievements
  | "family" // Family coordination
  | "community"; // Community building

/**
 * NIP-58 Badge Definition Event (Kind 30009)
 * Defines what a badge represents and how it can be earned
 */
export interface BadgeDefinition {
  id: string; // Badge unique identifier
  name: string; // Human-readable badge name
  description: string; // Detailed description
  image: string; // Badge image URL or data URI
  category: BadgeCategory; // Type of achievement
  subject: EducationSubject; // Subject area
  level: AchievementLevel; // Achievement level
  prerequisites: string[]; // Required previous badges
  criteria: BadgeCriteria; // Earning requirements
  issuer_pubkey: string; // Citadel Academy issuer public key
  event_template: BadgeDefinitionEvent; // Nostr event template
  created_at: number; // Creation timestamp
  privacy_level: "public" | "family" | "private"; // Visibility setting
}

/**
 * Badge earning criteria
 */
export interface BadgeCriteria {
  completion_requirements: {
    lessons_completed?: number;
    quizzes_passed?: number;
    practical_exercises?: number;
    minimum_score?: number;
  };
  time_requirements?: {
    minimum_study_hours?: number;
    retention_period_days?: number;
  };
  verification_requirements?: {
    peer_review_required?: boolean;
    guardian_approval_required?: boolean;
    proof_of_work_required?: boolean;
  };
  special_conditions?: string[]; // Additional custom requirements
}

/**
 * NIP-58 Badge Definition Event Structure
 */
export interface BadgeDefinitionEvent extends NostrEvent {
  kind: 30009; // Badge Definition event kind
  tags: [
    ["d", string], // Badge identifier
    ["name", string], // Badge name
    ["description", string], // Badge description
    ["image", string], // Badge image
    ["category", BadgeCategory], // Badge category
    ["subject", EducationSubject], // Subject area
    ["level", AchievementLevel], // Achievement level
    ["privacy", "public" | "family" | "private"], // Privacy level
    ...string[][] // Additional tags
  ];
  content: string; // JSON-encoded badge criteria
}

/**
 * Badge Award Event (Kind 8)
 * Awarded to a user for achieving a specific badge
 */
export interface BadgeAward {
  id: string; // Award unique identifier
  badge_id: string; // Reference to badge definition
  recipient_pubkey: string; // Student's public key
  issuer_pubkey: string; // Citadel Academy issuer
  awarded_at: number; // Award timestamp
  evidence: AwardEvidence; // Proof of achievement
  verification_status: "pending" | "verified" | "revoked";
  event_template: BadgeAwardEvent; // Nostr event template
  privacy_encrypted?: boolean; // Whether award is encrypted
}

/**
 * Evidence supporting a badge award
 */
export interface AwardEvidence {
  lessons_completed: string[]; // Completed lesson IDs
  quiz_scores: QuizScore[]; // Quiz performance
  practical_work: PracticalWork[]; // Hands-on exercises
  peer_reviews: PeerReview[]; // Peer validations
  guardian_approvals: GuardianApproval[]; // Family approvals
  timestamp_proofs: TimestampProof[]; // Time-based verification
}

/**
 * Quiz performance record
 */
export interface QuizScore {
  quiz_id: string;
  score: number;
  max_score: number;
  completion_time: number;
  attempts: number;
  timestamp: number;
}

/**
 * Practical work submission
 */
export interface PracticalWork {
  exercise_id: string;
  submission_type: "text" | "image" | "video" | "file";
  encrypted_submission?: string; // Privacy-protected content
  completion_timestamp: number;
  verification_hash?: string; // Integrity verification
}

/**
 * Peer review validation
 */
export interface PeerReview {
  reviewer_pubkey: string;
  review_score: number;
  review_comments?: string;
  timestamp: number;
  verified: boolean;
}

/**
 * Guardian approval for family members
 */
export interface GuardianApproval {
  guardian_pubkey: string;
  approval_type: "knowledge" | "practical" | "security";
  approval_timestamp: number;
  notes?: string;
}

/**
 * Timestamp proof for time-based requirements
 */
export interface TimestampProof {
  activity_type: string;
  start_timestamp: number;
  end_timestamp: number;
  duration_seconds: number;
  verification_hash: string;
}

/**
 * NIP-58 Badge Award Event Structure
 */
export interface BadgeAwardEvent extends NostrEvent {
  kind: 8; // Badge Award event kind
  tags: [
    ["a", string], // Reference to badge definition
    ["p", string], // Recipient public key
    ["e", string], // Award event ID
    ["t", string], // Award timestamp
    ...string[][] // Additional tags
  ];
  content: string; // JSON-encoded award evidence
}

/**
 * Student progress tracking
 */
export interface StudentProgress {
  student_pubkey: string;
  family_id?: string;
  badges_earned: BadgeAward[];
  current_level: AchievementLevel;
  subjects_progress: SubjectProgress[];
  learning_streak_days: number;
  total_study_hours: number;
  privacy_settings: ProgressPrivacySettings;
  created_at: number;
  updated_at: number;
}

/**
 * Progress within a specific subject
 */
export interface SubjectProgress {
  subject: EducationSubject;
  level: AchievementLevel;
  lessons_completed: number;
  lessons_total: number;
  badges_earned: number;
  badges_available: number;
  current_streak: number;
  last_activity: number;
  proficiency_score: number; // 0-100 competency rating
}

/**
 * Privacy settings for educational progress
 */
export interface ProgressPrivacySettings {
  public_badges: boolean; // Show badges publicly
  family_visible: boolean; // Visible to family members
  leaderboard_participation: boolean; // Participate in rankings
  achievement_announcements: boolean; // Share achievements
  progress_sharing: "none" | "family" | "public"; // Share detailed progress
}

/**
 * Educational content item
 */
export interface EducationContent {
  id: string;
  title: string;
  description: string;
  type: "lesson" | "quiz" | "exercise" | "project";
  subject: EducationSubject;
  level: AchievementLevel;
  duration_minutes: number;
  prerequisites: string[]; // Required prior content
  learning_objectives: string[];
  content_hash: string; // Integrity verification
  encrypted_content?: string; // Privacy-protected content
  created_at: number;
  updated_at: number;
  privacy_level: "public" | "family" | "private";
}

/**
 * Learning session tracking
 */
export interface LearningSession {
  id: string;
  student_pubkey: string;
  content_id: string;
  session_type: "study" | "quiz" | "exercise";
  start_time: number;
  end_time?: number;
  completion_percentage: number;
  score?: number;
  notes?: string;
  privacy_encrypted: boolean;
  created_at: number;
}

/**
 * Family educational coordination
 */
export interface FamilyEducation {
  family_id: string;
  education_plan: FamilyEducationPlan;
  member_progress: StudentProgress[];
  shared_achievements: BadgeAward[];
  family_level: AchievementLevel;
  coordination_settings: FamilyCoordinationSettings;
  created_at: number;
  updated_at: number;
}

/**
 * Family education plan
 */
export interface FamilyEducationPlan {
  plan_name: string;
  target_level: AchievementLevel;
  priority_subjects: EducationSubject[];
  milestone_badges: string[]; // Key badges to achieve
  timeline_months: number;
  guardian_requirements: GuardianRequirement[];
}

/**
 * Guardian requirements for family education
 */
export interface GuardianRequirement {
  guardian_pubkey: string;
  approval_required_for: BadgeCategory[];
  mentorship_subjects: EducationSubject[];
  verification_authority: boolean;
}

/**
 * Family coordination settings
 */
export interface FamilyCoordinationSettings {
  shared_progress_tracking: boolean;
  peer_learning_enabled: boolean;
  family_challenges: boolean;
  achievement_celebrations: boolean;
  privacy_level: "internal" | "extended" | "public";
}

/**
 * Citadel Academy integration configuration
 */
export interface CitadelAcademyConfig {
  issuer_keys: {
    public_key: string;
    private_key_encrypted: string;
  };
  relay_endpoints: string[];
  badge_definitions: BadgeDefinition[];
  content_repository: string;
  verification_policies: VerificationPolicy[];
  privacy_policies: PrivacyPolicy[];
}

/**
 * Verification policy for badge awards
 */
export interface VerificationPolicy {
  badge_category: BadgeCategory;
  verification_level: "automatic" | "peer" | "guardian" | "expert";
  evidence_requirements: string[];
  approval_threshold: number;
  revocation_conditions: string[];
}

/**
 * Privacy policy for educational data
 */
export interface PrivacyPolicy {
  data_type: "progress" | "achievements" | "content" | "sessions";
  retention_period_days: number;
  encryption_required: boolean;
  deletion_triggers: string[];
  sharing_restrictions: string[];
}

/**
 * API response types
 */
export interface BadgeSystemResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  privacy_level?: "public" | "family" | "private";
  encryption_notice?: string;
}

export interface StudentDashboardData {
  progress: StudentProgress;
  available_badges: BadgeDefinition[];
  recommended_content: EducationContent[];
  current_sessions: LearningSession[];
  family_progress?: FamilyEducation;
  achievements_summary: AchievementsSummary;
}

export interface AchievementsSummary {
  total_badges: number;
  badges_by_category: Record<BadgeCategory, number>;
  badges_by_level: Record<AchievementLevel, number>;
  recent_achievements: BadgeAward[];
  next_milestones: BadgeDefinition[];
  streak_info: {
    current_streak: number;
    longest_streak: number;
    streak_level: AchievementLevel;
  };
}

/**
 * Export all types for external use
 */
export type * from "./education";
/**
 * Education and Badge System Types for Citadel Academy Integration
 * Implements NIP-58 Nostr badges for educational achievements
 */

/**
 * Educational achievement levels
 */
export type AchievementLevel =
  | "initiate" // First steps in Bitcoin education
  | "apprentice" // Basic Bitcoin knowledge
  | "journeyman" // Intermediate skills
  | "craftsman" // Advanced practical skills
  | "master" // Expert level understanding
  | "guardian" // Leadership and teaching ability
  | "sage"; // Wisdom and sovereignty mastery

/**
 * Educational subject areas
 */
export type EducationSubject =
  | "bitcoin-fundamentals"
  | "lightning-network"
  | "privacy-sovereignty"
  | "self-custody"
  | "family-treasury"
  | "nostr-identity"
  | "security-ops"
  | "citadel-building";

/**
 * Badge categories for different achievement types
 */
export type BadgeCategory =
  | "knowledge" // Theoretical understanding
  | "practical" // Hands-on skills
  | "security" // Security practices
  | "leadership" // Teaching and mentoring
  | "sovereignty" // Self-reliance achievements
  | "family" // Family coordination
  | "community"; // Community building

/**
 * NIP-58 Badge Definition Event (Kind 30009)
 * Defines what a badge represents and how it can be earned
 */
export interface BadgeDefinition {
  id: string; // Badge unique identifier
  name: string; // Human-readable badge name
  description: string; // Detailed description
  image: string; // Badge image URL or data URI
  category: BadgeCategory; // Type of achievement
  subject: EducationSubject; // Subject area
  level: AchievementLevel; // Achievement level
  prerequisites: string[]; // Required previous badges
  criteria: BadgeCriteria; // Earning requirements
  issuer_pubkey: string; // Citadel Academy issuer public key
  event_template: BadgeDefinitionEvent; // Nostr event template
  created_at: number; // Creation timestamp
  privacy_level: "public" | "family" | "private"; // Visibility setting
}

/**
 * Badge earning criteria
 */
export interface BadgeCriteria {
  completion_requirements: {
    lessons_completed?: number;
    quizzes_passed?: number;
    practical_exercises?: number;
    minimum_score?: number;
  };
  time_requirements?: {
    minimum_study_hours?: number;
    retention_period_days?: number;
  };
  verification_requirements?: {
    peer_review_required?: boolean;
    guardian_approval_required?: boolean;
    proof_of_work_required?: boolean;
  };
  special_conditions?: string[]; // Additional custom requirements
}

/**
 * NIP-58 Badge Definition Event Structure
 */
export interface BadgeDefinitionEvent extends NostrEvent {
  kind: 30009; // Badge Definition event kind
  tags: [
    ["d", string], // Badge identifier
    ["name", string], // Badge name
    ["description", string], // Badge description
    ["image", string], // Badge image
    ["category", BadgeCategory], // Badge category
    ["subject", EducationSubject], // Subject area
    ["level", AchievementLevel], // Achievement level
    ["privacy", "public" | "family" | "private"], // Privacy level
    ...string[][] // Additional tags
  ];
  content: string; // JSON-encoded badge criteria
}

/**
 * Badge Award Event (Kind 8)
 * Awarded to a user for achieving a specific badge
 */
export interface BadgeAward {
  id: string; // Award unique identifier
  badge_id: string; // Reference to badge definition
  recipient_pubkey: string; // Student's public key
  issuer_pubkey: string; // Citadel Academy issuer
  awarded_at: number; // Award timestamp
  evidence: AwardEvidence; // Proof of achievement
  verification_status: "pending" | "verified" | "revoked";
  event_template: BadgeAwardEvent; // Nostr event template
  privacy_encrypted?: boolean; // Whether award is encrypted
}

/**
 * Evidence supporting a badge award
 */
export interface AwardEvidence {
  lessons_completed: string[]; // Completed lesson IDs
  quiz_scores: QuizScore[]; // Quiz performance
  practical_work: PracticalWork[]; // Hands-on exercises
  peer_reviews: PeerReview[]; // Peer validations
  guardian_approvals: GuardianApproval[]; // Family approvals
  timestamp_proofs: TimestampProof[]; // Time-based verification
}

/**
 * Quiz performance record
 */
export interface QuizScore {
  quiz_id: string;
  score: number;
  max_score: number;
  completion_time: number;
  attempts: number;
  timestamp: number;
}

/**
 * Practical work submission
 */
export interface PracticalWork {
  exercise_id: string;
  submission_type: "text" | "image" | "video" | "file";
  encrypted_submission?: string; // Privacy-protected content
  completion_timestamp: number;
  verification_hash?: string; // Integrity verification
}

/**
 * Peer review validation
 */
export interface PeerReview {
  reviewer_pubkey: string;
  review_score: number;
  review_comments?: string;
  timestamp: number;
  verified: boolean;
}

/**
 * Guardian approval for family members
 */
export interface GuardianApproval {
  guardian_pubkey: string;
  approval_type: "knowledge" | "practical" | "security";
  approval_timestamp: number;
  notes?: string;
}

/**
 * Timestamp proof for time-based requirements
 */
export interface TimestampProof {
  activity_type: string;
  start_timestamp: number;
  end_timestamp: number;
  duration_seconds: number;
  verification_hash: string;
}

/**
 * NIP-58 Badge Award Event Structure
 */
export interface BadgeAwardEvent extends NostrEvent {
  kind: 8; // Badge Award event kind
  tags: [
    ["a", string], // Reference to badge definition
    ["p", string], // Recipient public key
    ["e", string], // Award event ID
    ["t", string], // Award timestamp
    ...string[][] // Additional tags
  ];
  content: string; // JSON-encoded award evidence
}

/**
 * Student progress tracking
 */
export interface StudentProgress {
  student_pubkey: string;
  family_id?: string;
  badges_earned: BadgeAward[];
  current_level: AchievementLevel;
  subjects_progress: SubjectProgress[];
  learning_streak_days: number;
  total_study_hours: number;
  privacy_settings: ProgressPrivacySettings;
  created_at: number;
  updated_at: number;
}

/**
 * Progress within a specific subject
 */
export interface SubjectProgress {
  subject: EducationSubject;
  level: AchievementLevel;
  lessons_completed: number;
  lessons_total: number;
  badges_earned: number;
  badges_available: number;
  current_streak: number;
  last_activity: number;
  proficiency_score: number; // 0-100 competency rating
}

/**
 * Privacy settings for educational progress
 */
export interface ProgressPrivacySettings {
  public_badges: boolean; // Show badges publicly
  family_visible: boolean; // Visible to family members
  leaderboard_participation: boolean; // Participate in rankings
  achievement_announcements: boolean; // Share achievements
  progress_sharing: "none" | "family" | "public"; // Share detailed progress
}

/**
 * Educational content item
 */
export interface EducationContent {
  id: string;
  title: string;
  description: string;
  type: "lesson" | "quiz" | "exercise" | "project";
  subject: EducationSubject;
  level: AchievementLevel;
  duration_minutes: number;
  prerequisites: string[]; // Required prior content
  learning_objectives: string[];
  content_hash: string; // Integrity verification
  encrypted_content?: string; // Privacy-protected content
  created_at: number;
  updated_at: number;
  privacy_level: "public" | "family" | "private";
}

/**
 * Learning session tracking
 */
export interface LearningSession {
  id: string;
  student_pubkey: string;
  content_id: string;
  session_type: "study" | "quiz" | "exercise";
  start_time: number;
  end_time?: number;
  completion_percentage: number;
  score?: number;
  notes?: string;
  privacy_encrypted: boolean;
  created_at: number;
}

/**
 * Family educational coordination
 */
export interface FamilyEducation {
  family_id: string;
  education_plan: FamilyEducationPlan;
  member_progress: StudentProgress[];
  shared_achievements: BadgeAward[];
  family_level: AchievementLevel;
  coordination_settings: FamilyCoordinationSettings;
  created_at: number;
  updated_at: number;
}

/**
 * Family education plan
 */
export interface FamilyEducationPlan {
  plan_name: string;
  target_level: AchievementLevel;
  priority_subjects: EducationSubject[];
  milestone_badges: string[]; // Key badges to achieve
  timeline_months: number;
  guardian_requirements: GuardianRequirement[];
}

/**
 * Guardian requirements for family education
 */
export interface GuardianRequirement {
  guardian_pubkey: string;
  approval_required_for: BadgeCategory[];
  mentorship_subjects: EducationSubject[];
  verification_authority: boolean;
}

/**
 * Family coordination settings
 */
export interface FamilyCoordinationSettings {
  shared_progress_tracking: boolean;
  peer_learning_enabled: boolean;
  family_challenges: boolean;
  achievement_celebrations: boolean;
  privacy_level: "internal" | "extended" | "public";
}

/**
 * Citadel Academy integration configuration
 */
export interface CitadelAcademyConfig {
  issuer_keys: {
    public_key: string;
    private_key_encrypted: string;
  };
  relay_endpoints: string[];
  badge_definitions: BadgeDefinition[];
  content_repository: string;
  verification_policies: VerificationPolicy[];
  privacy_policies: PrivacyPolicy[];
}

/**
 * Verification policy for badge awards
 */
export interface VerificationPolicy {
  badge_category: BadgeCategory;
  verification_level: "automatic" | "peer" | "guardian" | "expert";
  evidence_requirements: string[];
  approval_threshold: number;
  revocation_conditions: string[];
}

/**
 * Privacy policy for educational data
 */
export interface PrivacyPolicy {
  data_type: "progress" | "achievements" | "content" | "sessions";
  retention_period_days: number;
  encryption_required: boolean;
  deletion_triggers: string[];
  sharing_restrictions: string[];
}

/**
 * API response types
 */
export interface BadgeSystemResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  privacy_level?: "public" | "family" | "private";
  encryption_notice?: string;
}

export interface StudentDashboardData {
  progress: StudentProgress;
  available_badges: BadgeDefinition[];
  recommended_content: EducationContent[];
  current_sessions: LearningSession[];
  family_progress?: FamilyEducation;
  achievements_summary: AchievementsSummary;
}

export interface AchievementsSummary {
  total_badges: number;
  badges_by_category: Record<BadgeCategory, number>;
  badges_by_level: Record<AchievementLevel, number>;
  recent_achievements: BadgeAward[];
  next_milestones: BadgeDefinition[];
  streak_info: {
    current_streak: number;
    longest_streak: number;
    streak_level: AchievementLevel;
  };
}

/**
 * Export all types for external use
 */
export type * from "./education";
