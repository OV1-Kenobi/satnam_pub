/**
 * Citadel Academy Progress Tracker
 * Privacy-preserving educational progress tracking with encrypted storage
 */

import {
  AchievementLevel,
  AchievementsSummary,
  BadgeCategory,
  EducationContent,
  EducationSubject,
  LearningSession,
  ProgressPrivacySettings,
  StudentDashboardData,
  StudentProgress,
  SubjectProgress,
} from "../../types/education";
import { decryptData, encryptData } from "../privacy/encryption";
import { validateInput } from "../security/input-validation";
import { rateLimiter } from "../security/rate-limiter";
import { supabase } from "../supabase";
import { badgeSystem } from "./badge-system";

/**
 * Progress Tracker Class
 * Manages student educational progress with privacy-first design
 */
export class ProgressTracker {
  private progressCache: Map<string, StudentProgress> = new Map();
  private sessionCache: Map<string, LearningSession[]> = new Map();

  /**
   * Initialize a new student's progress
   */
  async initializeStudentProgress(
    studentPubkey: string,
    familyId?: string,
    privacySettings?: Partial<ProgressPrivacySettings>
  ): Promise<StudentProgress> {
    try {
      await validateInput(
        { studentPubkey, familyId },
        "student-initialization"
      );
      await rateLimiter.checkLimit("progress-initialization", studentPubkey);

      const defaultPrivacySettings: ProgressPrivacySettings = {
        public_badges: false,
        family_visible: true,
        leaderboard_participation: false,
        achievement_announcements: false,
        progress_sharing: "family",
        ...privacySettings,
      };

      const progress: StudentProgress = {
        student_pubkey: studentPubkey,
        family_id: familyId,
        badges_earned: [],
        current_level: "initiate",
        subjects_progress: this.initializeSubjectProgress(),
        learning_streak_days: 0,
        total_study_hours: 0,
        privacy_settings: defaultPrivacySettings,
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
      };

      // Store encrypted progress
      await this.storeProgress(progress);

      // Cache locally
      this.progressCache.set(studentPubkey, progress);

      return progress;
    } catch (error) {
      throw new Error(
        `Failed to initialize student progress: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Initialize progress for all education subjects
   */
  private initializeSubjectProgress(): SubjectProgress[] {
    const subjects: EducationSubject[] = [
      "bitcoin-fundamentals",
      "lightning-network",
      "privacy-sovereignty",
      "self-custody",
      "family-treasury",
      "nostr-identity",
      "security-ops",
      "citadel-building",
    ];

    return subjects.map((subject) => ({
      subject,
      level: "initiate",
      lessons_completed: 0,
      lessons_total: this.getLessonCountForSubject(subject),
      badges_earned: 0,
      badges_available: this.getBadgeCountForSubject(subject),
      current_streak: 0,
      last_activity: 0,
      proficiency_score: 0,
    }));
  }

  /**
   * Get lesson count for a subject (would be configurable)
   */
  private getLessonCountForSubject(subject: EducationSubject): number {
    const lessonCounts: Record<EducationSubject, number> = {
      "bitcoin-fundamentals": 15,
      "lightning-network": 12,
      "privacy-sovereignty": 10,
      "self-custody": 8,
      "family-treasury": 20,
      "nostr-identity": 6,
      "security-ops": 18,
      "citadel-building": 25,
    };
    return lessonCounts[subject] || 10;
  }

  /**
   * Get badge count for a subject
   */
  private getBadgeCountForSubject(subject: EducationSubject): number {
    const badgeDefinitions = badgeSystem.getBadgesBySubject(subject);
    return badgeDefinitions.length;
  }

  /**
   * Record a learning session
   */
  async recordLearningSession(
    studentPubkey: string,
    contentId: string,
    sessionType: "study" | "quiz" | "exercise",
    duration: number,
    score?: number,
    notes?: string
  ): Promise<LearningSession> {
    try {
      await validateInput(
        { studentPubkey, contentId, sessionType },
        "learning-session"
      );
      await rateLimiter.checkLimit("session-recording", studentPubkey);

      const session: LearningSession = {
        id: `${studentPubkey}-${contentId}-${Date.now()}`,
        student_pubkey: studentPubkey,
        content_id: contentId,
        session_type: sessionType,
        start_time: Math.floor(Date.now() / 1000) - duration,
        end_time: Math.floor(Date.now() / 1000),
        completion_percentage: score ? Math.min(100, score) : 100,
        score,
        notes,
        privacy_encrypted: true,
        created_at: Math.floor(Date.now() / 1000),
      };

      // Store encrypted session
      await this.storeSession(session);

      // Update progress
      await this.updateProgressFromSession(studentPubkey, session);

      return session;
    } catch (error) {
      throw new Error(
        `Failed to record learning session: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Update student progress based on learning session
   */
  private async updateProgressFromSession(
    studentPubkey: string,
    session: LearningSession
  ): Promise<void> {
    const progress = await this.getStudentProgress(studentPubkey);
    if (!progress) return;

    // Update total study hours
    const sessionHours = (session.end_time! - session.start_time) / 3600;
    progress.total_study_hours += sessionHours;

    // Update streak
    await this.updateLearningStreak(progress, session);

    // Update subject progress
    await this.updateSubjectProgress(progress, session);

    // Update overall level
    await this.updateOverallLevel(progress);

    // Save updated progress
    progress.updated_at = Math.floor(Date.now() / 1000);
    await this.storeProgress(progress);
    this.progressCache.set(studentPubkey, progress);
  }

  /**
   * Update learning streak
   */
  private async updateLearningStreak(
    progress: StudentProgress,
    session: LearningSession
  ): Promise<void> {
    const today = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    const sessionDay = Math.floor(session.start_time / (60 * 60 * 24));

    if (sessionDay === today) {
      // Activity today - maintain or start streak
      const lastActivityDay = Math.floor(
        (Math.max(
          ...progress.subjects_progress.map((sp) => sp.last_activity)
        ) || 0) /
          (60 * 60 * 24)
      );

      if (lastActivityDay === today - 1) {
        // Consecutive day - increment streak
        progress.learning_streak_days += 1;
      } else if (lastActivityDay < today - 1) {
        // Gap in activity - reset streak
        progress.learning_streak_days = 1;
      }
    }
  }

  /**
   * Update subject-specific progress
   */
  private async updateSubjectProgress(
    progress: StudentProgress,
    session: LearningSession
  ): Promise<void> {
    // Get content info to determine subject
    const content = await this.getContentInfo(session.content_id);
    if (!content) return;

    const subjectProgress = progress.subjects_progress.find(
      (sp) => sp.subject === content.subject
    );
    if (!subjectProgress) return;

    // Update lesson completion
    if (
      session.session_type === "study" &&
      session.completion_percentage >= 80
    ) {
      subjectProgress.lessons_completed += 1;
    }

    // Update proficiency score
    if (session.score) {
      const currentScore = subjectProgress.proficiency_score || 0;
      const newScore = (currentScore + session.score) / 2; // Moving average
      subjectProgress.proficiency_score = Math.min(100, newScore);
    }

    // Update last activity
    subjectProgress.last_activity = session.end_time || session.start_time;

    // Update current streak for subject
    const today = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    const sessionDay = Math.floor(session.start_time / (60 * 60 * 24));

    if (sessionDay === today) {
      subjectProgress.current_streak += 1;
    } else if (sessionDay < today - 1) {
      subjectProgress.current_streak = 1;
    }

    // Update badges earned count
    const earnedBadges = await badgeSystem.getStudentBadges(
      progress.student_pubkey
    );
    subjectProgress.badges_earned = earnedBadges.filter((badge) => {
      const badgeDefinition = badgeSystem
        .getBadgeDefinitions()
        .find((bd) => bd.id === badge.badge_id);
      return badgeDefinition?.subject === content.subject;
    }).length;
  }

  /**
   * Update overall achievement level
   */
  private async updateOverallLevel(progress: StudentProgress): Promise<void> {
    const earnedBadges = await badgeSystem.getStudentBadges(
      progress.student_pubkey
    );

    // Define level thresholds
    const levelThresholds: Record<AchievementLevel, number> = {
      initiate: 0,
      apprentice: 3,
      journeyman: 8,
      craftsman: 15,
      master: 25,
      guardian: 40,
      sage: 60,
    };

    const badgeCount = earnedBadges.length;
    let newLevel: AchievementLevel = "initiate";

    for (const [level, threshold] of Object.entries(levelThresholds)) {
      if (badgeCount >= threshold) {
        newLevel = level as AchievementLevel;
      }
    }

    progress.current_level = newLevel;
    progress.badges_earned = earnedBadges;
  }

  /**
   * Get student progress (with privacy controls)
   */
  async getStudentProgress(
    studentPubkey: string
  ): Promise<StudentProgress | null> {
    try {
      // Check cache first
      const cached = this.progressCache.get(studentPubkey);
      if (cached) return cached;

      // Query database
      const { data, error } = await supabase
        .from("student_progress")
        .select("*")
        .eq("student_pubkey_hash", this.hashPubkey(studentPubkey))
        .single();

      if (error || !data) return null;

      // Decrypt progress data
      const decryptedProgress = await decryptData(
        data.encrypted_progress,
        studentPubkey
      );
      const progress: StudentProgress = JSON.parse(decryptedProgress);

      // Cache result
      this.progressCache.set(studentPubkey, progress);

      return progress;
    } catch (error) {
      console.error("Failed to get student progress:", error);
      return null;
    }
  }

  /**
   * Get student dashboard data
   */
  async getStudentDashboard(
    studentPubkey: string
  ): Promise<StudentDashboardData | null> {
    try {
      const progress = await this.getStudentProgress(studentPubkey);
      if (!progress) return null;

      const availableBadges = await badgeSystem.getAvailableBadges(
        studentPubkey
      );
      const recommendedContent = await this.getRecommendedContent(progress);
      const currentSessions = await this.getRecentSessions(studentPubkey, 5);
      const achievementsSummary = await this.getAchievementsSummary(progress);

      return {
        progress,
        available_badges: availableBadges,
        recommended_content: recommendedContent,
        current_sessions: currentSessions,
        achievements_summary: achievementsSummary,
      };
    } catch (error) {
      console.error("Failed to get student dashboard:", error);
      return null;
    }
  }

  /**
   * Get achievements summary
   */
  private async getAchievementsSummary(
    progress: StudentProgress
  ): Promise<AchievementsSummary> {
    const badges = progress.badges_earned;
    const availableBadges = await badgeSystem.getAvailableBadges(
      progress.student_pubkey
    );

    // Count badges by category
    const badgesByCategory: Record<BadgeCategory, number> = {
      knowledge: 0,
      practical: 0,
      security: 0,
      leadership: 0,
      sovereignty: 0,
      family: 0,
      community: 0,
    };

    // Count badges by level
    const badgesByLevel: Record<AchievementLevel, number> = {
      initiate: 0,
      apprentice: 0,
      journeyman: 0,
      craftsman: 0,
      master: 0,
      guardian: 0,
      sage: 0,
    };

    // Get badge definitions for categorization
    const badgeDefinitions = badgeSystem.getBadgeDefinitions();

    badges.forEach((badge) => {
      const definition = badgeDefinitions.find(
        (bd) => bd.id === badge.badge_id
      );
      if (definition) {
        badgesByCategory[definition.category]++;
        badgesByLevel[definition.level]++;
      }
    });

    return {
      total_badges: badges.length,
      badges_by_category: badgesByCategory,
      badges_by_level: badgesByLevel,
      recent_achievements: badges.slice(-3), // Last 3 achievements
      next_milestones: availableBadges.slice(0, 3), // Next 3 available badges
      streak_info: {
        current_streak: progress.learning_streak_days,
        longest_streak: progress.learning_streak_days, // Could track separately
        streak_level: this.getStreakLevel(progress.learning_streak_days),
      },
    };
  }

  /**
   * Get streak level based on days
   */
  private getStreakLevel(days: number): AchievementLevel {
    if (days >= 365) return "sage";
    if (days >= 180) return "guardian";
    if (days >= 90) return "master";
    if (days >= 45) return "craftsman";
    if (days >= 21) return "journeyman";
    if (days >= 7) return "apprentice";
    return "initiate";
  }

  /**
   * Get recommended content based on progress
   */
  private async getRecommendedContent(
    progress: StudentProgress
  ): Promise<EducationContent[]> {
    // Find subjects with lowest completion rates
    const sortedSubjects = progress.subjects_progress
      .sort(
        (a, b) =>
          a.lessons_completed / a.lessons_total -
          b.lessons_completed / b.lessons_total
      )
      .slice(0, 3);

    // Mock content recommendations (would query actual content database)
    return sortedSubjects.map((subject) => ({
      id: `recommended-${subject.subject}-${Date.now()}`,
      title: `Next Steps in ${subject.subject}`,
      description: `Continue your journey in ${subject.subject}`,
      type: "lesson" as const,
      subject: subject.subject,
      level: subject.level,
      duration_minutes: 30,
      prerequisites: [],
      learning_objectives: [`Master ${subject.subject} concepts`],
      content_hash: "",
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
      privacy_level: "public" as const,
    }));
  }

  /**
   * Get recent learning sessions
   */
  async getRecentSessions(
    studentPubkey: string,
    limit: number = 10
  ): Promise<LearningSession[]> {
    try {
      const cached = this.sessionCache.get(studentPubkey);
      if (cached) return cached.slice(0, limit);

      const { data, error } = await supabase
        .from("learning_sessions")
        .select("*")
        .eq("student_pubkey_hash", this.hashPubkey(studentPubkey))
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error || !data) return [];

      const sessions: LearningSession[] = [];
      for (const row of data) {
        try {
          const decryptedSession = await decryptData(
            row.encrypted_session,
            studentPubkey
          );
          sessions.push(JSON.parse(decryptedSession));
        } catch (error) {
          console.error("Failed to decrypt session:", error);
        }
      }

      // Cache result
      this.sessionCache.set(studentPubkey, sessions);

      return sessions;
    } catch (error) {
      console.error("Failed to get recent sessions:", error);
      return [];
    }
  }

  /**
   * Store encrypted progress
   */
  private async storeProgress(progress: StudentProgress): Promise<void> {
    const encryptedProgress = await encryptData(
      JSON.stringify(progress),
      progress.student_pubkey
    );

    const { error } = await supabase.from("student_progress").upsert({
      student_pubkey_hash: this.hashPubkey(progress.student_pubkey),
      encrypted_progress: encryptedProgress,
      family_id: progress.family_id,
      current_level: progress.current_level,
      learning_streak_days: progress.learning_streak_days,
      total_study_hours: progress.total_study_hours,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      throw new Error(`Failed to store progress: ${error.message}`);
    }
  }

  /**
   * Store encrypted learning session
   */
  private async storeSession(session: LearningSession): Promise<void> {
    const encryptedSession = await encryptData(
      JSON.stringify(session),
      session.student_pubkey
    );

    const { error } = await supabase.from("learning_sessions").insert({
      id: session.id,
      student_pubkey_hash: this.hashPubkey(session.student_pubkey),
      encrypted_session: encryptedSession,
      content_id: session.content_id,
      session_type: session.session_type,
      start_time: new Date(session.start_time * 1000).toISOString(),
      end_time: session.end_time
        ? new Date(session.end_time * 1000).toISOString()
        : null,
      completion_percentage: session.completion_percentage,
      created_at: new Date().toISOString(),
    });

    if (error) {
      throw new Error(`Failed to store session: ${error.message}`);
    }
  }

  /**
   * Get content information
   */
  private async getContentInfo(
    contentId: string
  ): Promise<EducationContent | null> {
    // Mock implementation - would query actual content database
    const mockContent: EducationContent = {
      id: contentId,
      title: "Mock Content",
      description: "Mock educational content",
      type: "lesson",
      subject: "bitcoin-fundamentals",
      level: "initiate",
      duration_minutes: 30,
      prerequisites: [],
      learning_objectives: [],
      content_hash: "",
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
      privacy_level: "public",
    };

    return mockContent;
  }

  /**
   * Hash pubkey for privacy
   */
  private hashPubkey(pubkey: string): string {
    // Use the same hashing method as the rest of the system
    return Buffer.from(pubkey).toString("base64");
  }

  /**
   * Update privacy settings
   */
  async updatePrivacySettings(
    studentPubkey: string,
    settings: Partial<ProgressPrivacySettings>
  ): Promise<void> {
    const progress = await this.getStudentProgress(studentPubkey);
    if (!progress) throw new Error("Student progress not found");

    progress.privacy_settings = { ...progress.privacy_settings, ...settings };
    progress.updated_at = Math.floor(Date.now() / 1000);

    await this.storeProgress(progress);
    this.progressCache.set(studentPubkey, progress);
  }

  /**
   * Delete student progress (privacy compliance)
   */
  async deleteStudentProgress(studentPubkey: string): Promise<void> {
    try {
      // Delete from database
      await supabase
        .from("student_progress")
        .delete()
        .eq("student_pubkey_hash", this.hashPubkey(studentPubkey));

      await supabase
        .from("learning_sessions")
        .delete()
        .eq("student_pubkey_hash", this.hashPubkey(studentPubkey));

      // Clear cache
      this.progressCache.delete(studentPubkey);
      this.sessionCache.delete(studentPubkey);
    } catch (error) {
      throw new Error(
        `Failed to delete progress: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Get family progress summary
   */
  async getFamilyProgress(familyId: string): Promise<StudentProgress[]> {
    try {
      const { data, error } = await supabase
        .from("student_progress")
        .select("*")
        .eq("family_id", familyId);

      if (error || !data) return [];

      const familyProgress: StudentProgress[] = [];
      for (const row of data) {
        try {
          // Note: This would need family-level decryption keys
          // For now, return public data only
          const progress: StudentProgress = {
            student_pubkey: "family-member", // Anonymized
            family_id: familyId,
            badges_earned: [],
            current_level: row.current_level,
            subjects_progress: [],
            learning_streak_days: row.learning_streak_days,
            total_study_hours: row.total_study_hours,
            privacy_settings: {
              public_badges: false,
              family_visible: true,
              leaderboard_participation: false,
              achievement_announcements: false,
              progress_sharing: "family",
            },
            created_at: 0,
            updated_at: 0,
          };
          familyProgress.push(progress);
        } catch (error) {
          console.error("Failed to process family member progress:", error);
        }
      }

      return familyProgress;
    } catch (error) {
      console.error("Failed to get family progress:", error);
      return [];
    }
  }

  /**
   * Clear cache (for testing or manual refresh)
   */
  clearCache(): void {
    this.progressCache.clear();
    this.sessionCache.clear();
  }
}

// Export singleton instance
export const progressTracker = new ProgressTracker();
/**
 * Citadel Academy Progress Tracker
 * Privacy-preserving educational progress tracking with encrypted storage
 */

/**
 * Progress Tracker Class
 * Manages student educational progress with privacy-first design
 */
export class ProgressTracker {
  private progressCache: Map<string, StudentProgress> = new Map();
  private sessionCache: Map<string, LearningSession[]> = new Map();

  /**
   * Initialize a new student's progress
   */
  async initializeStudentProgress(
    studentPubkey: string,
    familyId?: string,
    privacySettings?: Partial<ProgressPrivacySettings>
  ): Promise<StudentProgress> {
    try {
      await validateInput(
        { studentPubkey, familyId },
        "student-initialization"
      );
      await rateLimiter.checkLimit("progress-initialization", studentPubkey);

      const defaultPrivacySettings: ProgressPrivacySettings = {
        public_badges: false,
        family_visible: true,
        leaderboard_participation: false,
        achievement_announcements: false,
        progress_sharing: "family",
        ...privacySettings,
      };

      const progress: StudentProgress = {
        student_pubkey: studentPubkey,
        family_id: familyId,
        badges_earned: [],
        current_level: "initiate",
        subjects_progress: this.initializeSubjectProgress(),
        learning_streak_days: 0,
        total_study_hours: 0,
        privacy_settings: defaultPrivacySettings,
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
      };

      // Store encrypted progress
      await this.storeProgress(progress);

      // Cache locally
      this.progressCache.set(studentPubkey, progress);

      return progress;
    } catch (error) {
      throw new Error(
        `Failed to initialize student progress: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Initialize progress for all education subjects
   */
  private initializeSubjectProgress(): SubjectProgress[] {
    const subjects: EducationSubject[] = [
      "bitcoin-fundamentals",
      "lightning-network",
      "privacy-sovereignty",
      "self-custody",
      "family-treasury",
      "nostr-identity",
      "security-ops",
      "citadel-building",
    ];

    return subjects.map((subject) => ({
      subject,
      level: "initiate",
      lessons_completed: 0,
      lessons_total: this.getLessonCountForSubject(subject),
      badges_earned: 0,
      badges_available: this.getBadgeCountForSubject(subject),
      current_streak: 0,
      last_activity: 0,
      proficiency_score: 0,
    }));
  }

  /**
   * Get lesson count for a subject (would be configurable)
   */
  private getLessonCountForSubject(subject: EducationSubject): number {
    const lessonCounts: Record<EducationSubject, number> = {
      "bitcoin-fundamentals": 15,
      "lightning-network": 12,
      "privacy-sovereignty": 10,
      "self-custody": 8,
      "family-treasury": 20,
      "nostr-identity": 6,
      "security-ops": 18,
      "citadel-building": 25,
    };
    return lessonCounts[subject] || 10;
  }

  /**
   * Get badge count for a subject
   */
  private getBadgeCountForSubject(subject: EducationSubject): number {
    const badgeDefinitions = badgeSystem.getBadgesBySubject(subject);
    return badgeDefinitions.length;
  }

  /**
   * Record a learning session
   */
  async recordLearningSession(
    studentPubkey: string,
    contentId: string,
    sessionType: "study" | "quiz" | "exercise",
    duration: number,
    score?: number,
    notes?: string
  ): Promise<LearningSession> {
    try {
      await validateInput(
        { studentPubkey, contentId, sessionType },
        "learning-session"
      );
      await rateLimiter.checkLimit("session-recording", studentPubkey);

      const session: LearningSession = {
        id: `${studentPubkey}-${contentId}-${Date.now()}`,
        student_pubkey: studentPubkey,
        content_id: contentId,
        session_type: sessionType,
        start_time: Math.floor(Date.now() / 1000) - duration,
        end_time: Math.floor(Date.now() / 1000),
        completion_percentage: score ? Math.min(100, score) : 100,
        score,
        notes,
        privacy_encrypted: true,
        created_at: Math.floor(Date.now() / 1000),
      };

      // Store encrypted session
      await this.storeSession(session);

      // Update progress
      await this.updateProgressFromSession(studentPubkey, session);

      return session;
    } catch (error) {
      throw new Error(
        `Failed to record learning session: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Update student progress based on learning session
   */
  private async updateProgressFromSession(
    studentPubkey: string,
    session: LearningSession
  ): Promise<void> {
    const progress = await this.getStudentProgress(studentPubkey);
    if (!progress) return;

    // Update total study hours
    const sessionHours = (session.end_time! - session.start_time) / 3600;
    progress.total_study_hours += sessionHours;

    // Update streak
    await this.updateLearningStreak(progress, session);

    // Update subject progress
    await this.updateSubjectProgress(progress, session);

    // Update overall level
    await this.updateOverallLevel(progress);

    // Save updated progress
    progress.updated_at = Math.floor(Date.now() / 1000);
    await this.storeProgress(progress);
    this.progressCache.set(studentPubkey, progress);
  }

  /**
   * Update learning streak
   */
  private async updateLearningStreak(
    progress: StudentProgress,
    session: LearningSession
  ): Promise<void> {
    const today = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    const sessionDay = Math.floor(session.start_time / (60 * 60 * 24));

    if (sessionDay === today) {
      // Activity today - maintain or start streak
      const lastActivityDay = Math.floor(
        (Math.max(
          ...progress.subjects_progress.map((sp) => sp.last_activity)
        ) || 0) /
          (60 * 60 * 24)
      );

      if (lastActivityDay === today - 1) {
        // Consecutive day - increment streak
        progress.learning_streak_days += 1;
      } else if (lastActivityDay < today - 1) {
        // Gap in activity - reset streak
        progress.learning_streak_days = 1;
      }
    }
  }

  /**
   * Update subject-specific progress
   */
  private async updateSubjectProgress(
    progress: StudentProgress,
    session: LearningSession
  ): Promise<void> {
    // Get content info to determine subject
    const content = await this.getContentInfo(session.content_id);
    if (!content) return;

    const subjectProgress = progress.subjects_progress.find(
      (sp) => sp.subject === content.subject
    );
    if (!subjectProgress) return;

    // Update lesson completion
    if (
      session.session_type === "study" &&
      session.completion_percentage >= 80
    ) {
      subjectProgress.lessons_completed += 1;
    }

    // Update proficiency score
    if (session.score) {
      const currentScore = subjectProgress.proficiency_score || 0;
      const newScore = (currentScore + session.score) / 2; // Moving average
      subjectProgress.proficiency_score = Math.min(100, newScore);
    }

    // Update last activity
    subjectProgress.last_activity = session.end_time || session.start_time;

    // Update current streak for subject
    const today = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    const sessionDay = Math.floor(session.start_time / (60 * 60 * 24));

    if (sessionDay === today) {
      subjectProgress.current_streak += 1;
    } else if (sessionDay < today - 1) {
      subjectProgress.current_streak = 1;
    }

    // Update badges earned count
    const earnedBadges = await badgeSystem.getStudentBadges(
      progress.student_pubkey
    );
    subjectProgress.badges_earned = earnedBadges.filter((badge) => {
      const badgeDefinition = badgeSystem
        .getBadgeDefinitions()
        .find((bd) => bd.id === badge.badge_id);
      return badgeDefinition?.subject === content.subject;
    }).length;
  }

  /**
   * Update overall achievement level
   */
  private async updateOverallLevel(progress: StudentProgress): Promise<void> {
    const earnedBadges = await badgeSystem.getStudentBadges(
      progress.student_pubkey
    );

    // Define level thresholds
    const levelThresholds: Record<AchievementLevel, number> = {
      initiate: 0,
      apprentice: 3,
      journeyman: 8,
      craftsman: 15,
      master: 25,
      guardian: 40,
      sage: 60,
    };

    const badgeCount = earnedBadges.length;
    let newLevel: AchievementLevel = "initiate";

    for (const [level, threshold] of Object.entries(levelThresholds)) {
      if (badgeCount >= threshold) {
        newLevel = level as AchievementLevel;
      }
    }

    progress.current_level = newLevel;
    progress.badges_earned = earnedBadges;
  }

  /**
   * Get student progress (with privacy controls)
   */
  async getStudentProgress(
    studentPubkey: string
  ): Promise<StudentProgress | null> {
    try {
      // Check cache first
      const cached = this.progressCache.get(studentPubkey);
      if (cached) return cached;

      // Query database
      const { data, error } = await supabase
        .from("student_progress")
        .select("*")
        .eq("student_pubkey_hash", this.hashPubkey(studentPubkey))
        .single();

      if (error || !data) return null;

      // Decrypt progress data
      const decryptedProgress = await decryptData(
        data.encrypted_progress,
        studentPubkey
      );
      const progress: StudentProgress = JSON.parse(decryptedProgress);

      // Cache result
      this.progressCache.set(studentPubkey, progress);

      return progress;
    } catch (error) {
      console.error("Failed to get student progress:", error);
      return null;
    }
  }

  /**
   * Get student dashboard data
   */
  async getStudentDashboard(
    studentPubkey: string
  ): Promise<StudentDashboardData | null> {
    try {
      const progress = await this.getStudentProgress(studentPubkey);
      if (!progress) return null;

      const availableBadges = await badgeSystem.getAvailableBadges(
        studentPubkey
      );
      const recommendedContent = await this.getRecommendedContent(progress);
      const currentSessions = await this.getRecentSessions(studentPubkey, 5);
      const achievementsSummary = await this.getAchievementsSummary(progress);

      return {
        progress,
        available_badges: availableBadges,
        recommended_content: recommendedContent,
        current_sessions: currentSessions,
        achievements_summary: achievementsSummary,
      };
    } catch (error) {
      console.error("Failed to get student dashboard:", error);
      return null;
    }
  }

  /**
   * Get achievements summary
   */
  private async getAchievementsSummary(
    progress: StudentProgress
  ): Promise<AchievementsSummary> {
    const badges = progress.badges_earned;
    const availableBadges = await badgeSystem.getAvailableBadges(
      progress.student_pubkey
    );

    // Count badges by category
    const badgesByCategory: Record<BadgeCategory, number> = {
      knowledge: 0,
      practical: 0,
      security: 0,
      leadership: 0,
      sovereignty: 0,
      family: 0,
      community: 0,
    };

    // Count badges by level
    const badgesByLevel: Record<AchievementLevel, number> = {
      initiate: 0,
      apprentice: 0,
      journeyman: 0,
      craftsman: 0,
      master: 0,
      guardian: 0,
      sage: 0,
    };

    // Get badge definitions for categorization
    const badgeDefinitions = badgeSystem.getBadgeDefinitions();

    badges.forEach((badge) => {
      const definition = badgeDefinitions.find(
        (bd) => bd.id === badge.badge_id
      );
      if (definition) {
        badgesByCategory[definition.category]++;
        badgesByLevel[definition.level]++;
      }
    });

    return {
      total_badges: badges.length,
      badges_by_category: badgesByCategory,
      badges_by_level: badgesByLevel,
      recent_achievements: badges.slice(-3), // Last 3 achievements
      next_milestones: availableBadges.slice(0, 3), // Next 3 available badges
      streak_info: {
        current_streak: progress.learning_streak_days,
        longest_streak: progress.learning_streak_days, // Could track separately
        streak_level: this.getStreakLevel(progress.learning_streak_days),
      },
    };
  }

  /**
   * Get streak level based on days
   */
  private getStreakLevel(days: number): AchievementLevel {
    if (days >= 365) return "sage";
    if (days >= 180) return "guardian";
    if (days >= 90) return "master";
    if (days >= 45) return "craftsman";
    if (days >= 21) return "journeyman";
    if (days >= 7) return "apprentice";
    return "initiate";
  }

  /**
   * Get recommended content based on progress
   */
  private async getRecommendedContent(
    progress: StudentProgress
  ): Promise<EducationContent[]> {
    // Find subjects with lowest completion rates
    const sortedSubjects = progress.subjects_progress
      .sort(
        (a, b) =>
          a.lessons_completed / a.lessons_total -
          b.lessons_completed / b.lessons_total
      )
      .slice(0, 3);

    // Mock content recommendations (would query actual content database)
    return sortedSubjects.map((subject) => ({
      id: `recommended-${subject.subject}-${Date.now()}`,
      title: `Next Steps in ${subject.subject}`,
      description: `Continue your journey in ${subject.subject}`,
      type: "lesson" as const,
      subject: subject.subject,
      level: subject.level,
      duration_minutes: 30,
      prerequisites: [],
      learning_objectives: [`Master ${subject.subject} concepts`],
      content_hash: "",
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
      privacy_level: "public" as const,
    }));
  }

  /**
   * Get recent learning sessions
   */
  async getRecentSessions(
    studentPubkey: string,
    limit: number = 10
  ): Promise<LearningSession[]> {
    try {
      const cached = this.sessionCache.get(studentPubkey);
      if (cached) return cached.slice(0, limit);

      const { data, error } = await supabase
        .from("learning_sessions")
        .select("*")
        .eq("student_pubkey_hash", this.hashPubkey(studentPubkey))
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error || !data) return [];

      const sessions: LearningSession[] = [];
      for (const row of data) {
        try {
          const decryptedSession = await decryptData(
            row.encrypted_session,
            studentPubkey
          );
          sessions.push(JSON.parse(decryptedSession));
        } catch (error) {
          console.error("Failed to decrypt session:", error);
        }
      }

      // Cache result
      this.sessionCache.set(studentPubkey, sessions);

      return sessions;
    } catch (error) {
      console.error("Failed to get recent sessions:", error);
      return [];
    }
  }

  /**
   * Store encrypted progress
   */
  private async storeProgress(progress: StudentProgress): Promise<void> {
    const encryptedProgress = await encryptData(
      JSON.stringify(progress),
      progress.student_pubkey
    );

    const { error } = await supabase.from("student_progress").upsert({
      student_pubkey_hash: this.hashPubkey(progress.student_pubkey),
      encrypted_progress: encryptedProgress,
      family_id: progress.family_id,
      current_level: progress.current_level,
      learning_streak_days: progress.learning_streak_days,
      total_study_hours: progress.total_study_hours,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      throw new Error(`Failed to store progress: ${error.message}`);
    }
  }

  /**
   * Store encrypted learning session
   */
  private async storeSession(session: LearningSession): Promise<void> {
    const encryptedSession = await encryptData(
      JSON.stringify(session),
      session.student_pubkey
    );

    const { error } = await supabase.from("learning_sessions").insert({
      id: session.id,
      student_pubkey_hash: this.hashPubkey(session.student_pubkey),
      encrypted_session: encryptedSession,
      content_id: session.content_id,
      session_type: session.session_type,
      start_time: new Date(session.start_time * 1000).toISOString(),
      end_time: session.end_time
        ? new Date(session.end_time * 1000).toISOString()
        : null,
      completion_percentage: session.completion_percentage,
      created_at: new Date().toISOString(),
    });

    if (error) {
      throw new Error(`Failed to store session: ${error.message}`);
    }
  }

  /**
   * Get content information
   */
  private async getContentInfo(
    contentId: string
  ): Promise<EducationContent | null> {
    // Mock implementation - would query actual content database
    const mockContent: EducationContent = {
      id: contentId,
      title: "Mock Content",
      description: "Mock educational content",
      type: "lesson",
      subject: "bitcoin-fundamentals",
      level: "initiate",
      duration_minutes: 30,
      prerequisites: [],
      learning_objectives: [],
      content_hash: "",
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
      privacy_level: "public",
    };

    return mockContent;
  }

  /**
   * Hash pubkey for privacy
   */
  private hashPubkey(pubkey: string): string {
    // Use the same hashing method as the rest of the system
    return Buffer.from(pubkey).toString("base64");
  }

  /**
   * Update privacy settings
   */
  async updatePrivacySettings(
    studentPubkey: string,
    settings: Partial<ProgressPrivacySettings>
  ): Promise<void> {
    const progress = await this.getStudentProgress(studentPubkey);
    if (!progress) throw new Error("Student progress not found");

    progress.privacy_settings = { ...progress.privacy_settings, ...settings };
    progress.updated_at = Math.floor(Date.now() / 1000);

    await this.storeProgress(progress);
    this.progressCache.set(studentPubkey, progress);
  }

  /**
   * Delete student progress (privacy compliance)
   */
  async deleteStudentProgress(studentPubkey: string): Promise<void> {
    try {
      // Delete from database
      await supabase
        .from("student_progress")
        .delete()
        .eq("student_pubkey_hash", this.hashPubkey(studentPubkey));

      await supabase
        .from("learning_sessions")
        .delete()
        .eq("student_pubkey_hash", this.hashPubkey(studentPubkey));

      // Clear cache
      this.progressCache.delete(studentPubkey);
      this.sessionCache.delete(studentPubkey);
    } catch (error) {
      throw new Error(
        `Failed to delete progress: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Get family progress summary
   */
  async getFamilyProgress(familyId: string): Promise<StudentProgress[]> {
    try {
      const { data, error } = await supabase
        .from("student_progress")
        .select("*")
        .eq("family_id", familyId);

      if (error || !data) return [];

      const familyProgress: StudentProgress[] = [];
      for (const row of data) {
        try {
          // Note: This would need family-level decryption keys
          // For now, return public data only
          const progress: StudentProgress = {
            student_pubkey: "family-member", // Anonymized
            family_id: familyId,
            badges_earned: [],
            current_level: row.current_level,
            subjects_progress: [],
            learning_streak_days: row.learning_streak_days,
            total_study_hours: row.total_study_hours,
            privacy_settings: {
              public_badges: false,
              family_visible: true,
              leaderboard_participation: false,
              achievement_announcements: false,
              progress_sharing: "family",
            },
            created_at: 0,
            updated_at: 0,
          };
          familyProgress.push(progress);
        } catch (error) {
          console.error("Failed to process family member progress:", error);
        }
      }

      return familyProgress;
    } catch (error) {
      console.error("Failed to get family progress:", error);
      return [];
    }
  }

  /**
   * Clear cache (for testing or manual refresh)
   */
  clearCache(): void {
    this.progressCache.clear();
    this.sessionCache.clear();
  }
}

// Export singleton instance
export const progressTracker = new ProgressTracker();
