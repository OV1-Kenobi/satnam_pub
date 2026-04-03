import { useMemo, useState } from "react";

import {
    AgentSelectionWithCalibration,
    type AgentCandidate,
} from "../../../components/AgentSelectionWithCalibration";
import { TaskVerifiabilityChecker } from "../../../components/TaskVerifiabilityChecker";

import TaskChallengeDialog from "../../components/agents/TaskChallengeDialog";
import { useAuth } from "../../components/auth/AuthProvider";
import {
    evaluateTaskBeforeAcceptance,
    type TaskAssignment,
    type TaskChallengeCheck,
} from "../../lib/agents/task-challenge-evaluator";
import { fetchWithAuth } from "../../lib/auth/fetch-with-auth";
import { showToast } from "../../services/toastService";

interface PersistedTaskChallenge extends TaskChallengeCheck {
    challengeId: string;
    agentName: string;
}

interface TaskChallengeRecordResponse {
    challenge_id?: string;
    error?: string;
}

interface TaskCreateResponse {
    task_id?: string;
    error?: string;
    payment_invoice?: string;
}

const DEFAULT_CONTEXT_TOKEN_ESTIMATE = 1600;

function generateDraftTaskId(): string {
    return globalThis.crypto?.randomUUID?.() ?? "00000000-0000-4000-8000-000000000000";
}

function splitLines(value: string): string[] {
    return value
        .split(/\r?\n/u)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}

function splitCapabilities(value: string): string[] {
    return value
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0);
}

function deriveTaskTitle(description: string): string {
    return description.trim().slice(0, 80) || "Untitled task";
}

function estimateDurationSeconds(description: string): number {
    return Math.max(900, Math.min(7200, description.trim().length * 30));
}

export default function CreateTaskPage() {
    const { user } = useAuth();
    const [taskDescription, setTaskDescription] = useState("");
    const [successCriteriaInput, setSuccessCriteriaInput] = useState("");
    const [requiredCapabilitiesInput, setRequiredCapabilitiesInput] = useState("");
    const [estimatedContextTokens, setEstimatedContextTokens] = useState(
        DEFAULT_CONTEXT_TOKEN_ESTIMATE,
    );
    const [verifiabilityPassed, setVerifiabilityPassed] = useState(false);
    const [selectedAgent, setSelectedAgent] = useState<AgentCandidate | null>(null);
    const [draftTaskId, setDraftTaskId] = useState(generateDraftTaskId);
    const [submitting, setSubmitting] = useState(false);
    const [activeChallenge, setActiveChallenge] =
        useState<PersistedTaskChallenge | null>(null);

    const normalizedSuccessCriteria = useMemo(
        () => splitLines(successCriteriaInput),
        [successCriteriaInput],
    );

    const buildTaskAssignment = (): TaskAssignment => ({
        id: draftTaskId,
        description: taskDescription.trim(),
        required_capabilities: splitCapabilities(requiredCapabilitiesInput),
        estimated_cost_sats: selectedAgent?.estimated_cost_sats ?? 0,
        estimated_context_tokens: estimatedContextTokens,
        success_criteria: normalizedSuccessCriteria,
        delegator_id: user?.id ?? "",
    });

    const resetForm = () => {
        setTaskDescription("");
        setSuccessCriteriaInput("");
        setRequiredCapabilitiesInput("");
        setEstimatedContextTokens(DEFAULT_CONTEXT_TOKEN_ESTIMATE);
        setVerifiabilityPassed(false);
        setSelectedAgent(null);
        setActiveChallenge(null);
        setDraftTaskId(generateDraftTaskId());
    };

    const createTaskRecord = async (task: TaskAssignment): Promise<void> => {
        if (!selectedAgent) {
            throw new Error("Select an agent before creating a task.");
        }

        if (!user?.npub) {
            throw new Error("Your signed-in account is missing an npub for task delegation.");
        }

        const response = await fetchWithAuth("/api/agents/task-record-create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                task_id: task.id,
                agent_id: selectedAgent.agent_id,
                task_title: deriveTaskTitle(task.description),
                task_description: task.description,
                task_type: selectedAgent.recommended_task_type,
                requester_npub: user.npub,
                estimated_duration_seconds: estimateDurationSeconds(task.description),
                estimated_cost_sats: selectedAgent.estimated_cost_sats,
            }),
        });
        const result = (await response.json()) as TaskCreateResponse;

        if (!response.ok || !result.task_id) {
            if (response.status === 402 && result.payment_invoice) {
                throw new Error(
                    `Task creation requires fee payment first. Invoice: ${result.payment_invoice}`,
                );
            }

            throw new Error(result.error || "Failed to create delegated task.");
        }

        showToast.success("Task delegated successfully.");
        resetForm();
    };

    const recordTaskChallenge = async (
        challenge: TaskChallengeCheck,
    ): Promise<string> => {
        if (!selectedAgent) {
            throw new Error("Select an agent before recording a challenge.");
        }

        const response = await fetchWithAuth("/api/agents/task-challenge-record", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                task_id: draftTaskId,
                agent_id: selectedAgent.agent_id,
                challenge,
            }),
        });
        const result = (await response.json()) as TaskChallengeRecordResponse;

        if (!response.ok || !result.challenge_id) {
            throw new Error(result.error || "Failed to record task challenge.");
        }

        return result.challenge_id;
    };

    const resolveTaskChallenge = async (
        resolution: "REVISED" | "OVERRIDE_WITH_EXPLANATION" | "CANCELLED",
        options: {
            challengeAccepted: boolean;
            taskProceeded: boolean;
            delegatorExplanation?: string;
        },
    ): Promise<void> => {
        if (!activeChallenge) {
            return;
        }

        const response = await fetchWithAuth("/api/agents/task-challenge-resolve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                challenge_id: activeChallenge.challengeId,
                resolution,
                challenge_accepted: options.challengeAccepted,
                task_proceeded: options.taskProceeded,
                delegator_explanation: options.delegatorExplanation,
                revised_task_spec: {
                    description: taskDescription.trim(),
                    success_criteria: normalizedSuccessCriteria,
                    required_capabilities: splitCapabilities(requiredCapabilitiesInput),
                    estimated_context_tokens: estimatedContextTokens,
                },
            }),
        });
        const result = (await response.json().catch(() => ({}))) as { error?: string };

        if (!response.ok) {
            throw new Error(result.error || "Failed to resolve task challenge.");
        }
    };

    const handleCreateTask = async () => {
        if (!verifiabilityPassed || !selectedAgent) {
            return;
        }

        if (!taskDescription.trim()) {
            showToast.error("Add a task description before delegating.");
            return;
        }

        setSubmitting(true);

        try {
            const task = buildTaskAssignment();
            const challenge = await evaluateTaskBeforeAcceptance(task, selectedAgent.capabilities);

            if (challenge) {
                const challengeId = await recordTaskChallenge(challenge);
                setActiveChallenge({
                    ...challenge,
                    challengeId,
                    agentName: selectedAgent.agent_name,
                });
                showToast.warning("The selected agent challenged this task before acceptance.");
                return;
            }

            await createTaskRecord(task);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to create task.";
            showToast.error(message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleReviseChallenge = async () => {
        setSubmitting(true);
        try {
            await resolveTaskChallenge("REVISED", {
                challengeAccepted: true,
                taskProceeded: false,
            });
            setActiveChallenge(null);
            setDraftTaskId(generateDraftTaskId());
            showToast.info("Challenge recorded. Revise the task details and submit again.");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to record the revision.";
            showToast.error(message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleOverrideChallenge = async (explanation: string) => {
        setSubmitting(true);
        try {
            const task = buildTaskAssignment();
            await resolveTaskChallenge("OVERRIDE_WITH_EXPLANATION", {
                challengeAccepted: false,
                taskProceeded: true,
                delegatorExplanation: explanation,
            });
            await createTaskRecord(task);
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "Failed to override the task challenge.";
            showToast.error(message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleCancelChallenge = async () => {
        setSubmitting(true);
        try {
            await resolveTaskChallenge("CANCELLED", {
                challengeAccepted: false,
                taskProceeded: false,
            });
            setActiveChallenge(null);
            setDraftTaskId(generateDraftTaskId());
            showToast.info("Task delegation cancelled.");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to cancel the task.";
            showToast.error(message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="mx-auto max-w-4xl space-y-6 p-6">
            <h1 className="text-2xl font-bold">Create New Task</h1>

            <div className="space-y-3">
                <label className="block font-medium">Task Description</label>
                <textarea
                    value={taskDescription}
                    onChange={(event) => setTaskDescription(event.target.value)}
                    className="min-h-32 w-full rounded border p-3"
                    placeholder="Describe the task in detail..."
                />
            </div>

            <div className="space-y-3">
                <label className="block font-medium">Success Criteria</label>
                <textarea
                    value={successCriteriaInput}
                    onChange={(event) => setSuccessCriteriaInput(event.target.value)}
                    className="min-h-24 w-full rounded border p-3"
                    placeholder="Add one measurable success criterion per line"
                />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <label className="block font-medium">
                    Required Capabilities
                    <input
                        value={requiredCapabilitiesInput}
                        onChange={(event) => setRequiredCapabilitiesInput(event.target.value)}
                        className="mt-2 w-full rounded border p-3"
                        placeholder="typescript, testing, api_integration"
                    />
                </label>

                <label className="block font-medium">
                    Estimated Context Tokens
                    <input
                        min={100}
                        step={100}
                        type="number"
                        value={estimatedContextTokens}
                        onChange={(event) => setEstimatedContextTokens(Number(event.target.value) || 0)}
                        className="mt-2 w-full rounded border p-3"
                    />
                </label>
            </div>

            {taskDescription ? (
                <TaskVerifiabilityChecker
                    taskDescription={taskDescription}
                    successCriteria={{ criteria: normalizedSuccessCriteria }}
                    onAssessmentComplete={(result) => {
                        setVerifiabilityPassed(result.can_proceed);
                    }}
                />
            ) : null}

            {verifiabilityPassed ? (
                <AgentSelectionWithCalibration
                    taskDescription={taskDescription}
                    onSelectAgent={(agent) => {
                        setSelectedAgent(agent);
                        setActiveChallenge(null);
                    }}
                />
            ) : null}

            {selectedAgent ? (
                <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
                    <div className="font-semibold">Selected Agent: {selectedAgent.agent_name}</div>
                    <div className="mt-1">
                        Verified capabilities: {selectedAgent.capabilities.verified_capabilities.join(", ")}
                    </div>
                </div>
            ) : null}

            {selectedAgent ? (
                <div className="flex gap-3">
                    <button
                        onClick={() => {
                            void handleCreateTask();
                        }}
                        disabled={submitting}
                        className="rounded bg-green-500 px-6 py-3 font-medium text-white hover:bg-green-600 disabled:opacity-50"
                    >
                        {submitting ? "Processing..." : "Create Task & Delegate"}
                    </button>
                    <button
                        onClick={() => showToast.info("Draft saving is not wired yet in this flow.")}
                        className="rounded border px-6 py-3 hover:bg-gray-50"
                    >
                        Save as Draft
                    </button>
                </div>
            ) : null}

            {activeChallenge ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
                    <TaskChallengeDialog
                        challenge={activeChallenge}
                        agentName={activeChallenge.agentName}
                        onRevise={() => {
                            void handleReviseChallenge();
                        }}
                        onOverride={(explanation) => {
                            void handleOverrideChallenge(explanation);
                        }}
                        onCancel={() => {
                            void handleCancelChallenge();
                        }}
                    />
                </div>
            ) : null}
        </div>
    );
}