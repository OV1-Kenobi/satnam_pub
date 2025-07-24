import { getEnvVar } from "./utils/env.js";

/**
 * Educational API - Netlify Function
 * Handles course registration, progress tracking, and cognitive capital management
 * @compliance Master Context - Privacy-first, browser-compatible, Bitcoin-only
 */

import { createClient } from "@supabase/supabase-js";
import { validateInput } from "./security/input-validation.js";
import { rateLimit } from "./security/rate-limiter.js";

// Types
interface CourseRegistration {
  courseId: string;
  userPubkey: string;
  familyId?: string;
  enrollmentType: "immediate" | "approval-required" | "external";
  provider: "satnam" | "citadel-academy";
  cost: number;
  metadata?: any;
}

interface ProgressUpdate {
  courseId: string;
  userPubkey: string;
  moduleId: string;
  progress: number;
  timeSpent: number;
  quizScore?: number;
  completedAt?: number;
}

interface CognitiveCapitalMetrics {
  userPubkey: string;
  familyId?: string;
  totalCourses: number;
  completedCourses: number;
  totalTimeSpent: number;
  averageQuizScore: number;
  badgesEarned: number;
  certificatesEarned: number;
  cognitiveCapitalScore: number;
  learningStreak: number;
  weeklyProgress: number;
  monthlyProgress: number;
  lastUpdated: number;
}

interface Course {
  id: string;
  title: string;
  description: string;
  category: "basic" | "advanced" | "specialized";
  provider: "satnam" | "citadel-academy";
  duration: number;
  difficulty: "beginner" | "intermediate" | "advanced";
  prerequisites: string[];
  badges: string[];
  cost: number;
  enrollmentType: "immediate" | "approval-required" | "external";
  maxStudents?: number;
  currentEnrollment?: number;
  startDate?: number;
  instructor?: string;
  syllabus: string[];
  learningOutcomes: string[];
  certificateType: "completion" | "certification" | "badge";
  externalUrl?: string;
  registrationDeadline?: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

// Initialize Supabase client
const supabaseUrl = getEnvVar("SUPABASE_URL")!;
const supabaseServiceKey = getEnvVar("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Rate limiting configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});

// Input validation schemas
const courseRegistrationSchema = {
  courseId: { type: "string", required: true, minLength: 1, maxLength: 100 },
  userPubkey: { type: "string", required: true, minLength: 64, maxLength: 64 },
  familyId: { type: "string", required: false, minLength: 1, maxLength: 100 },
  enrollmentType: {
    type: "string",
    required: true,
    enum: ["immediate", "approval-required", "external"],
  },
  provider: {
    type: "string",
    required: true,
    enum: ["satnam", "citadel-academy"],
  },
  cost: { type: "number", required: true, min: 0, max: 1000000 },
  metadata: { type: "object", required: false },
};

const progressUpdateSchema = {
  courseId: { type: "string", required: true, minLength: 1, maxLength: 100 },
  userPubkey: { type: "string", required: true, minLength: 64, maxLength: 64 },
  moduleId: { type: "string", required: true, minLength: 1, maxLength: 100 },
  progress: { type: "number", required: true, min: 0, max: 100 },
  timeSpent: { type: "number", required: true, min: 0, max: 10000 },
  quizScore: { type: "number", required: false, min: 0, max: 100 },
  completedAt: { type: "number", required: false, min: 0 },
};

export default async function handler(req: any, res: any) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    // Apply rate limiting
    await new Promise((resolve, reject) => {
      limiter(req, res, (result: any) => {
        if (result instanceof Error) {
          reject(result);
        } else {
          resolve(result);
        }
      });
    });

    const { action, ...data } = req.body;

    switch (action) {
      case "register-course":
        return await handleCourseRegistration(data, res);

      case "update-progress":
        return await handleProgressUpdate(data, res);

      case "get-courses":
        return await handleGetCourses(data, res);

      case "get-user-progress":
        return await handleGetUserProgress(data, res);

      case "get-cognitive-capital":
        return await handleGetCognitiveCapital(data, res);

      case "complete-course":
        return await handleCompleteCourse(data, res);

      case "award-badge":
        return await handleAwardBadge(data, res);

      case "get-learning-pathways":
        return await handleGetLearningPathways(data, res);

      default:
        return res.status(400).json({ error: "Invalid action" });
    }
  } catch (error) {
    console.error("Educational API error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function handleCourseRegistration(data: any, res: any) {
  try {
    // Validate input
    const validation = validateInput(data, courseRegistrationSchema);
    if (!validation.isValid) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: validation.errors });
    }

    const {
      courseId,
      userPubkey,
      familyId,
      enrollmentType,
      provider,
      cost,
      metadata,
    } = data;

    // Check if course exists and is active
    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("*")
      .eq("id", courseId)
      .eq("is_active", true)
      .single();

    if (courseError || !course) {
      return res.status(404).json({ error: "Course not found or inactive" });
    }

    // Check if user is already enrolled
    const { data: existingEnrollment } = await supabase
      .from("course_enrollments")
      .select("*")
      .eq("course_id", courseId)
      .eq("user_pubkey", userPubkey)
      .single();

    if (existingEnrollment) {
      return res
        .status(409)
        .json({ error: "User already enrolled in this course" });
    }

    // Check enrollment limits for approval-required courses
    if (enrollmentType === "approval-required" && course.max_students) {
      const { count: currentEnrollment } = await supabase
        .from("course_enrollments")
        .select("*", { count: "exact", head: true })
        .eq("course_id", courseId)
        .eq("status", "enrolled");

      if (currentEnrollment && currentEnrollment >= course.max_students) {
        return res
          .status(409)
          .json({ error: "Course enrollment limit reached" });
      }
    }

    // Create enrollment record
    const enrollmentData = {
      course_id: courseId,
      user_pubkey: userPubkey,
      family_id: familyId,
      enrollment_type: enrollmentType,
      provider,
      cost,
      status: enrollmentType === "immediate" ? "enrolled" : "pending",
      metadata: metadata || {},
      enrolled_at: Math.floor(Date.now() / 1000),
      created_at: Math.floor(Date.now() / 1000),
    };

    const { data: enrollment, error: enrollmentError } = await supabase
      .from("course_enrollments")
      .insert([enrollmentData])
      .select()
      .single();

    if (enrollmentError) {
      console.error("Enrollment error:", enrollmentError);
      return res.status(500).json({ error: "Failed to create enrollment" });
    }

    // Initialize progress tracking
    const progressData = {
      course_id: courseId,
      user_pubkey: userPubkey,
      family_id: familyId,
      overall_progress: 0,
      time_spent: 0,
      modules_completed: 0,
      quizzes_completed: 0,
      average_quiz_score: 0,
      status: "in-progress",
      last_activity: Math.floor(Date.now() / 1000),
      created_at: Math.floor(Date.now() / 1000),
    };

    const { error: progressError } = await supabase
      .from("course_progress")
      .insert([progressData]);

    if (progressError) {
      console.error("Progress initialization error:", progressError);
      // Don't fail the enrollment if progress tracking fails
    }

    return res.status(200).json({
      success: true,
      enrollment,
      message:
        enrollmentType === "immediate"
          ? "Successfully enrolled"
          : "Enrollment request submitted",
    });
  } catch (error) {
    console.error("Course registration error:", error);
    return res.status(500).json({ error: "Failed to register for course" });
  }
}

async function handleProgressUpdate(data: any, res: any) {
  try {
    // Validate input
    const validation = validateInput(data, progressUpdateSchema);
    if (!validation.isValid) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: validation.errors });
    }

    const {
      courseId,
      userPubkey,
      moduleId,
      progress,
      timeSpent,
      quizScore,
      completedAt,
    } = data;

    // Check if user is enrolled
    const { data: enrollment } = await supabase
      .from("course_enrollments")
      .select("*")
      .eq("course_id", courseId)
      .eq("user_pubkey", userPubkey)
      .eq("status", "enrolled")
      .single();

    if (!enrollment) {
      return res.status(404).json({ error: "Course enrollment not found" });
    }

    // Update module progress
    const moduleProgressData = {
      course_id: courseId,
      user_pubkey: userPubkey,
      module_id: moduleId,
      progress,
      time_spent: timeSpent,
      quiz_score: quizScore,
      completed_at:
        completedAt ||
        (progress === 100 ? Math.floor(Date.now() / 1000) : null),
      updated_at: Math.floor(Date.now() / 1000),
    };

    const { error: moduleError } = await supabase
      .from("module_progress")
      .upsert([moduleProgressData], {
        onConflict: "course_id,user_pubkey,module_id",
      });

    if (moduleError) {
      console.error("Module progress error:", moduleError);
      return res
        .status(500)
        .json({ error: "Failed to update module progress" });
    }

    // Update overall course progress
    await updateOverallProgress(courseId, userPubkey);

    return res.status(200).json({
      success: true,
      message: "Progress updated successfully",
    });
  } catch (error) {
    console.error("Progress update error:", error);
    return res.status(500).json({ error: "Failed to update progress" });
  }
}

async function updateOverallProgress(courseId: string, userPubkey: string) {
  try {
    // Get all module progress for this course and user
    const { data: moduleProgress } = await supabase
      .from("module_progress")
      .select("*")
      .eq("course_id", courseId)
      .eq("user_pubkey", userPubkey);

    if (!moduleProgress || moduleProgress.length === 0) return;

    // Calculate overall progress
    const totalModules = moduleProgress.length;
    const completedModules = moduleProgress.filter(
      (m) => m.progress === 100
    ).length;
    const overallProgress = Math.round((completedModules / totalModules) * 100);
    const totalTimeSpent = moduleProgress.reduce(
      (sum, m) => sum + (m.time_spent || 0),
      0
    );
    const quizScores = moduleProgress
      .filter((m) => m.quiz_score !== null)
      .map((m) => m.quiz_score);
    const averageQuizScore =
      quizScores.length > 0
        ? Math.round(
            quizScores.reduce((sum, score) => sum + score, 0) /
              quizScores.length
          )
        : 0;

    // Update course progress
    const progressData = {
      overall_progress: overallProgress,
      time_spent: totalTimeSpent,
      modules_completed: completedModules,
      quizzes_completed: quizScores.length,
      average_quiz_score: averageQuizScore,
      last_activity: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
    };

    const { error } = await supabase
      .from("course_progress")
      .update(progressData)
      .eq("course_id", courseId)
      .eq("user_pubkey", userPubkey);

    if (error) {
      console.error("Overall progress update error:", error);
    }

    // Update cognitive capital if course is completed
    if (overallProgress === 100) {
      await updateCognitiveCapital(userPubkey, courseId);
    }
  } catch (error) {
    console.error("Update overall progress error:", error);
  }
}

async function updateCognitiveCapital(userPubkey: string, courseId: string) {
  try {
    // Get course details
    const { data: course } = await supabase
      .from("courses")
      .select("*")
      .eq("id", courseId)
      .single();

    if (!course) return;

    // Get user's current cognitive capital
    const { data: currentMetrics } = await supabase
      .from("cognitive_capital_metrics")
      .select("*")
      .eq("user_pubkey", userPubkey)
      .single();

    const now = Math.floor(Date.now() / 1000);
    const baseScore =
      course.difficulty === "beginner"
        ? 100
        : course.difficulty === "intermediate"
        ? 200
        : 300;

    const newMetrics: CognitiveCapitalMetrics = {
      user_pubkey: userPubkey,
      total_courses: (currentMetrics?.total_courses || 0) + 1,
      completed_courses: (currentMetrics?.completed_courses || 0) + 1,
      total_time_spent:
        (currentMetrics?.total_time_spent || 0) + course.duration * 60,
      average_quiz_score: currentMetrics?.average_quiz_score || 0, // Will be recalculated
      badges_earned:
        (currentMetrics?.badges_earned || 0) + course.badges.length,
      certificates_earned: (currentMetrics?.certificates_earned || 0) + 1,
      cognitive_capital_score:
        (currentMetrics?.cognitive_capital_score || 0) + baseScore,
      learning_streak: currentMetrics?.learning_streak || 0, // Will be updated separately
      weekly_progress: currentMetrics?.weekly_progress || 0,
      monthly_progress: currentMetrics?.monthly_progress || 0,
      last_updated: now,
    };

    // Upsert cognitive capital metrics
    const { error } = await supabase
      .from("cognitive_capital_metrics")
      .upsert([newMetrics], { onConflict: "user_pubkey" });

    if (error) {
      console.error("Cognitive capital update error:", error);
    }
  } catch (error) {
    console.error("Update cognitive capital error:", error);
  }
}

async function handleGetCourses(data: any, res: any) {
  try {
    const { category, provider, difficulty, isActive = true } = data;

    let query = supabase.from("courses").select("*").eq("is_active", isActive);

    if (category && category !== "all") {
      query = query.eq("category", category);
    }

    if (provider && provider !== "all") {
      query = query.eq("provider", provider);
    }

    if (difficulty && difficulty !== "all") {
      query = query.eq("difficulty", difficulty);
    }

    const { data: courses, error } = await query.order("created_at", {
      ascending: false,
    });

    if (error) {
      console.error("Get courses error:", error);
      return res.status(500).json({ error: "Failed to fetch courses" });
    }

    return res.status(200).json({
      success: true,
      courses: courses || [],
    });
  } catch (error) {
    console.error("Get courses error:", error);
    return res.status(500).json({ error: "Failed to fetch courses" });
  }
}

async function handleGetUserProgress(data: any, res: any) {
  try {
    const { userPubkey, familyId } = data;

    if (!userPubkey) {
      return res.status(400).json({ error: "User pubkey is required" });
    }

    // Get user's course enrollments and progress
    const { data: enrollments, error: enrollmentError } = await supabase
      .from("course_enrollments")
      .select(
        `
        *,
        courses (*),
        course_progress (*)
      `
      )
      .eq("user_pubkey", userPubkey)
      .order("enrolled_at", { ascending: false });

    if (enrollmentError) {
      console.error("Get enrollments error:", enrollmentError);
      return res.status(500).json({ error: "Failed to fetch enrollments" });
    }

    // Get module progress for all courses
    const { data: moduleProgress, error: moduleError } = await supabase
      .from("module_progress")
      .select("*")
      .eq("user_pubkey", userPubkey);

    if (moduleError) {
      console.error("Get module progress error:", moduleError);
      return res.status(500).json({ error: "Failed to fetch module progress" });
    }

    return res.status(200).json({
      success: true,
      enrollments: enrollments || [],
      moduleProgress: moduleProgress || [],
    });
  } catch (error) {
    console.error("Get user progress error:", error);
    return res.status(500).json({ error: "Failed to fetch user progress" });
  }
}

async function handleGetCognitiveCapital(data: any, res: any) {
  try {
    const { userPubkey, familyId } = data;

    if (!userPubkey) {
      return res.status(400).json({ error: "User pubkey is required" });
    }

    // Get cognitive capital metrics
    const { data: metrics, error } = await supabase
      .from("cognitive_capital_metrics")
      .select("*")
      .eq("user_pubkey", userPubkey)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows returned
      console.error("Get cognitive capital error:", error);
      return res
        .status(500)
        .json({ error: "Failed to fetch cognitive capital metrics" });
    }

    // If no metrics exist, create default ones
    if (!metrics) {
      const defaultMetrics: CognitiveCapitalMetrics = {
        user_pubkey: userPubkey,
        family_id: familyId,
        total_courses: 0,
        completed_courses: 0,
        total_time_spent: 0,
        average_quiz_score: 0,
        badges_earned: 0,
        certificates_earned: 0,
        cognitive_capital_score: 0,
        learning_streak: 0,
        weekly_progress: 0,
        monthly_progress: 0,
        last_updated: Math.floor(Date.now() / 1000),
      };

      const { data: newMetrics, error: createError } = await supabase
        .from("cognitive_capital_metrics")
        .insert([defaultMetrics])
        .select()
        .single();

      if (createError) {
        console.error("Create cognitive capital error:", createError);
        return res
          .status(500)
          .json({ error: "Failed to create cognitive capital metrics" });
      }

      return res.status(200).json({
        success: true,
        metrics: newMetrics,
      });
    }

    return res.status(200).json({
      success: true,
      metrics,
    });
  } catch (error) {
    console.error("Get cognitive capital error:", error);
    return res
      .status(500)
      .json({ error: "Failed to fetch cognitive capital metrics" });
  }
}

async function handleCompleteCourse(data: any, res: any) {
  try {
    const { courseId, userPubkey, finalScore } = data;

    if (!courseId || !userPubkey) {
      return res
        .status(400)
        .json({ error: "Course ID and user pubkey are required" });
    }

    // Update enrollment status
    const { error: enrollmentError } = await supabase
      .from("course_enrollments")
      .update({
        status: "completed",
        completed_at: Math.floor(Date.now() / 1000),
        final_score: finalScore,
      })
      .eq("course_id", courseId)
      .eq("user_pubkey", userPubkey);

    if (enrollmentError) {
      console.error("Complete course enrollment error:", enrollmentError);
      return res
        .status(500)
        .json({ error: "Failed to complete course enrollment" });
    }

    // Update course progress
    const { error: progressError } = await supabase
      .from("course_progress")
      .update({
        overall_progress: 100,
        status: "completed",
        completed_at: Math.floor(Date.now() / 1000),
      })
      .eq("course_id", courseId)
      .eq("user_pubkey", userPubkey);

    if (progressError) {
      console.error("Complete course progress error:", progressError);
      return res
        .status(500)
        .json({ error: "Failed to complete course progress" });
    }

    // Update cognitive capital
    await updateCognitiveCapital(userPubkey, courseId);

    return res.status(200).json({
      success: true,
      message: "Course completed successfully",
    });
  } catch (error) {
    console.error("Complete course error:", error);
    return res.status(500).json({ error: "Failed to complete course" });
  }
}

async function handleAwardBadge(data: any, res: any) {
  try {
    const { userPubkey, badgeId, courseId, awardedBy } = data;

    if (!userPubkey || !badgeId) {
      return res
        .status(400)
        .json({ error: "User pubkey and badge ID are required" });
    }

    // Check if badge already awarded
    const { data: existingBadge } = await supabase
      .from("user_badges")
      .select("*")
      .eq("user_pubkey", userPubkey)
      .eq("badge_id", badgeId)
      .single();

    if (existingBadge) {
      return res.status(409).json({ error: "Badge already awarded" });
    }

    // Award badge
    const badgeData = {
      user_pubkey: userPubkey,
      badge_id: badgeId,
      course_id: courseId,
      awarded_by: awardedBy,
      awarded_at: Math.floor(Date.now() / 1000),
    };

    const { data: badge, error } = await supabase
      .from("user_badges")
      .insert([badgeData])
      .select()
      .single();

    if (error) {
      console.error("Award badge error:", error);
      return res.status(500).json({ error: "Failed to award badge" });
    }

    return res.status(200).json({
      success: true,
      badge,
      message: "Badge awarded successfully",
    });
  } catch (error) {
    console.error("Award badge error:", error);
    return res.status(500).json({ error: "Failed to award badge" });
  }
}

async function handleGetLearningPathways(data: any, res: any) {
  try {
    const { userPubkey, familyId } = data;

    // Get all learning pathways
    const { data: pathways, error } = await supabase
      .from("learning_pathways")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Get learning pathways error:", error);
      return res
        .status(500)
        .json({ error: "Failed to fetch learning pathways" });
    }

    // Calculate progress for each pathway if user is provided
    if (userPubkey && pathways) {
      for (const pathway of pathways) {
        const { data: pathwayCourses } = await supabase
          .from("course_enrollments")
          .select("*")
          .eq("user_pubkey", userPubkey)
          .in("course_id", pathway.courses);

        const completedCourses =
          pathwayCourses?.filter((c) => c.status === "completed").length || 0;
        pathway.progress = Math.round(
          (completedCourses / pathway.courses.length) * 100
        );
        pathway.status =
          pathway.progress === 100
            ? "completed"
            : pathway.progress > 0
            ? "in-progress"
            : "not-started";
      }
    }

    return res.status(200).json({
      success: true,
      pathways: pathways || [],
    });
  } catch (error) {
    console.error("Get learning pathways error:", error);
    return res.status(500).json({ error: "Failed to fetch learning pathways" });
  }
}
