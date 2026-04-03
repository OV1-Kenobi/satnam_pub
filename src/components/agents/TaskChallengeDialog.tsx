import { useState } from "react";

import type { TaskChallengeCheck } from "../../lib/agents/task-challenge-evaluator";

const CHALLENGE_LABELS: Record<TaskChallengeCheck["challenge_reason"], string> = {
  AMBIGUOUS_SPEC: "Ambiguous Specification",
  RESOURCE_EXCEED: "Resource Limit Exceeded",
  ETHICAL_CONCERN: "Ethical Concern",
  CAPABILITY_MISMATCH: "Capability Mismatch",
  CONTEXT_SATURATION: "Context Window Saturation",
};

const CHALLENGE_ICONS: Record<TaskChallengeCheck["challenge_reason"], string> = {
  AMBIGUOUS_SPEC: "🤔",
  RESOURCE_EXCEED: "💰",
  ETHICAL_CONCERN: "⚠️",
  CAPABILITY_MISMATCH: "🔧",
  CONTEXT_SATURATION: "🧠",
};

const MIN_OVERRIDE_EXPLANATION_LENGTH = 20;

interface TaskChallengeDialogProps {
  challenge: TaskChallengeCheck;
  agentName: string;
  onRevise(): void;
  onOverride(explanation: string): void;
  onCancel(): void;
}

export function TaskChallengeDialog({
  challenge,
  agentName,
  onRevise,
  onOverride,
  onCancel,
}: TaskChallengeDialogProps) {
  const [overrideExplanation, setOverrideExplanation] = useState("");
  const [showOverrideForm, setShowOverrideForm] = useState(false);

  const trimmedExplanation = overrideExplanation.trim();
  const canConfirmOverride = trimmedExplanation.length >= MIN_OVERRIDE_EXPLANATION_LENGTH;

  return (
    <div className="max-w-2xl rounded-2xl border border-amber-700 bg-slate-950/90 p-6 text-slate-100 shadow-xl">
      <div className="flex items-start gap-3">
        <span className="text-4xl" aria-hidden="true">
          {CHALLENGE_ICONS[challenge.challenge_reason]}
        </span>
        <div className="flex-1">
          <h3 className="text-xl font-semibold text-amber-200">
            Agent "{agentName}" has concerns about this task
          </h3>
          <p className="mt-1 text-sm text-slate-300">
            {CHALLENGE_LABELS[challenge.challenge_reason]}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-amber-700/60 bg-amber-950/20 p-4 text-sm">
        <div className="font-semibold text-amber-100">Agent&apos;s Concern</div>
        <div className="mt-2 text-slate-200">{challenge.agent_concern}</div>
      </div>

      {challenge.suggested_modification ? (
        <div className="mt-4 rounded-xl border border-sky-700/60 bg-sky-950/20 p-4 text-sm">
          <div className="font-semibold text-sky-100">Suggested Modification</div>
          <div className="mt-2 text-slate-200">{challenge.suggested_modification}</div>
        </div>
      ) : null}

      <div className="mt-4 text-sm text-slate-300">
        <strong>Confidence in challenge:</strong> {challenge.confidence_in_challenge}%
      </div>

      {!showOverrideForm ? (
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white"
            onClick={onRevise}
          >
            Revise Task
          </button>
          <button
            type="button"
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white"
            onClick={() => setShowOverrideForm(true)}
          >
            Override with Explanation
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm"
            onClick={onCancel}
          >
            Cancel Task
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-300">
              Explain why you&apos;re overriding this concern:
            </span>
            <textarea
              className="min-h-28 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
              placeholder="Provide clear reasoning for overriding the agent's concern..."
              value={overrideExplanation}
              onChange={(event) => setOverrideExplanation(event.target.value)}
            />
          </label>
          <div className="text-xs text-slate-400">
            Minimum explanation length: {MIN_OVERRIDE_EXPLANATION_LENGTH} characters.
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={!canConfirmOverride}
              onClick={() => onOverride(trimmedExplanation)}
            >
              Confirm Override
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm"
              onClick={() => setShowOverrideForm(false)}
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default TaskChallengeDialog;
