// Netlify Function - Assess Task Verifiability
import { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

interface AssessmentRequest {
  task_description: string;
  output_type?: string;
  success_criteria?: Record<string, any>;
  task_id?: string;
  min_verifiability_threshold?: number; // Reject if below this
}

interface AssessmentResponse {
  assessment_id: string;
  verifiability_score: number;
  verification_method: string;
  requires_decomposition: boolean;
  decomposition_suggestions?: string[];
  dispute_risk: string;
  can_proceed: boolean;
  estimated_verification_cost_sats: number;
  warnings: string[];
}

export const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext,
) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const payload: AssessmentRequest = JSON.parse(event.body || "{}");
    const minThreshold = payload.min_verifiability_threshold || 60;

    // Call assessment function
    const { data: assessmentId, error: assessError } = await supabase.rpc(
      "assess_task_verifiability",
      {
        p_task_description: payload.task_description,
        p_output_type: payload.output_type,
        p_success_criteria: payload.success_criteria,
        p_task_id: payload.task_id,
      },
    );

    if (assessError) {
      console.error("Assessment error:", assessError);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: assessError.message }),
      };
    }

    // Fetch full assessment
    const { data: assessment, error: fetchError } = await supabase
      .from("task_verifiability_assessments")
      .select("*")
      .eq("id", assessmentId)
      .single();

    if (fetchError || !assessment) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Failed to fetch assessment" }),
      };
    }

    // Generate warnings based on assessment
    const warnings: string[] = [];

    if (assessment.verifiability_score < 40) {
      warnings.push("Very low verifiability - high risk of disputes");
    }

    if (
      assessment.dispute_risk === "HIGH" ||
      assessment.dispute_risk === "CRITICAL"
    ) {
      warnings.push(
        `${assessment.dispute_risk} dispute risk - consider adding objective criteria`,
      );
    }

    if (!assessment.can_automate_verification) {
      warnings.push(
        `Requires human review (estimated cost: ${assessment.verification_cost_sats} sats)`,
      );
    }

    if (assessment.requires_decomposition) {
      warnings.push("Task should be decomposed into more verifiable subtasks");
    }

    // Generate decomposition suggestions if needed
    let decompositionSuggestions: string[] | undefined;
    if (assessment.requires_decomposition) {
      decompositionSuggestions = await generateDecompositionSuggestions(
        payload.task_description,
        assessment.primary_verification_method,
      );
    }

    const response: AssessmentResponse = {
      assessment_id: assessmentId,
      verifiability_score: assessment.verifiability_score,
      verification_method: assessment.primary_verification_method,
      requires_decomposition: assessment.requires_decomposition,
      decomposition_suggestions: decompositionSuggestions,
      dispute_risk: assessment.dispute_risk,
      can_proceed: assessment.verifiability_score >= minThreshold,
      estimated_verification_cost_sats: assessment.verification_cost_sats,
      warnings,
    };

    return {
      statusCode: 200,
      body: JSON.stringify(response),
    };
  } catch (err: any) {
    console.error("Assessment error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

async function generateDecompositionSuggestions(
  taskDescription: string,
  verificationMethod: string,
): Promise<string[]> {
  // TODO: Call LLM service to generate smart decomposition suggestions
  // For now, return generic suggestions based on verification method

  const suggestions: Record<string, string[]> = {
    HUMAN_REVIEW: [
      'Break into objective sub-criteria (e.g., "includes brand colors" instead of "looks good")',
      "Add milestone reviews at 25%, 50%, 75% completion",
      'Define specific deliverables (e.g., "5 logo concepts" before "final logo")',
    ],
    ORACLE_CHECK: [
      "Separate data fetching from data validation",
      "Define explicit response schema before making requests",
      "Add retry logic and error handling as separate verifiable steps",
    ],
    AUTOMATED_TEST: ["Already highly verifiable - no decomposition needed"],
  };

  return (
    suggestions[verificationMethod] || [
      "Consider breaking task into smaller, independently verifiable units",
      "Add intermediate checkpoints with clear success criteria",
      "Separate creative/subjective elements from objective elements",
    ]
  );
}
