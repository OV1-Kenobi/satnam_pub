import { useEffect, useMemo, useState } from "react";

import type { AgentCapabilities } from "../src/lib/agents/task-challenge-evaluator";
import { CalibratedConfidenceDisplay } from "./CalibratedConfidenceDisplay";

export interface AgentCandidate {
    agent_id: string;
    agent_name: string;
    reputation_score: number;
    reported_confidence: number;
    estimated_cost_sats: number;
    similar_task_success_rate: number;
    recommended_task_type: "compute" | "data_processing" | "api_integration";
    capabilities: AgentCapabilities;
}

interface Props {
    taskDescription: string;
    onSelectAgent: (agent: AgentCandidate) => void;
}

export function AgentSelectionWithCalibration({ taskDescription, onSelectAgent }: Props) {
    const [candidates, setCandidates] = useState<AgentCandidate[]>([]);
    const [loading, setLoading] = useState(true);
    const [sortBy, setSortBy] = useState<
        "calibrated_confidence" | "reputation" | "cost"
    >("calibrated_confidence");

    useEffect(() => {
        const mockCandidates: AgentCandidate[] = [
            {
                agent_id: "11111111-1111-4111-8111-111111111111",
                agent_name: "CodeBot-Pro",
                reputation_score: 4.2,
                reported_confidence: 85,
                estimated_cost_sats: 500,
                similar_task_success_rate: 68,
                recommended_task_type: "compute",
                capabilities: {
                    skill_ids: ["typescript", "testing", "debugging"],
                    max_budget_sats: 750,
                    max_context_tokens: 4096,
                    current_context_used_percent: 35,
                    ethical_constraints: [
                        "no_secret_storage",
                        "no_pii_access",
                        "no_destructive_actions",
                    ],
                    verified_capabilities: ["typescript", "testing", "debugging"],
                },
            },
            {
                agent_id: "22222222-2222-4222-8222-222222222222",
                agent_name: "DevAssistant-AI",
                reputation_score: 3.8,
                reported_confidence: 72,
                estimated_cost_sats: 800,
                similar_task_success_rate: 74,
                recommended_task_type: "data_processing",
                capabilities: {
                    skill_ids: ["analysis", "documentation", "qa"],
                    max_budget_sats: 900,
                    max_context_tokens: 3000,
                    current_context_used_percent: 55,
                    ethical_constraints: [
                        "no_secret_storage",
                        "no_pii_access",
                        "no_destructive_actions",
                    ],
                    verified_capabilities: ["analysis", "documentation", "qa"],
                },
            },
            {
                agent_id: "33333333-3333-4333-8333-333333333333",
                agent_name: "TaskMaster-X",
                reputation_score: 4.5,
                reported_confidence: 90,
                estimated_cost_sats: 1200,
                similar_task_success_rate: 65,
                recommended_task_type: "api_integration",
                capabilities: {
                    skill_ids: ["api_integration", "typescript", "systems_design"],
                    max_budget_sats: 2000,
                    max_context_tokens: 8000,
                    current_context_used_percent: 20,
                    ethical_constraints: [
                        "no_secret_storage",
                        "no_pii_access",
                        "no_destructive_actions",
                    ],
                    verified_capabilities: [
                        "api_integration",
                        "typescript",
                        "systems_design",
                    ],
                },
            },
        ];

        setCandidates(mockCandidates);
        setLoading(false);
    }, [taskDescription]);

    const sortedCandidates = useMemo(() => {
        const next = [...candidates];

        next.sort((left, right) => {
            if (sortBy === "cost") {
                return left.estimated_cost_sats - right.estimated_cost_sats;
            }

            if (sortBy === "reputation") {
                return right.reputation_score - left.reputation_score;
            }

            return right.reported_confidence - left.reported_confidence;
        });

        return next;
    }, [candidates, sortBy]);

    if (loading) {
        return <div>Loading agent candidates...</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="font-semibold">Select Agent for Task</h3>
                <select
                    value={sortBy}
                    onChange={(event) =>
                        setSortBy(
                            event.target.value as "calibrated_confidence" | "reputation" | "cost",
                        )
                    }
                    className="rounded border px-2 py-1 text-sm"
                >
                    <option value="calibrated_confidence">Sort by Calibrated Confidence</option>
                    <option value="reputation">Sort by Reputation</option>
                    <option value="cost">Sort by Cost</option>
                </select>
            </div>

            <div className="space-y-3">
                {sortedCandidates.map((candidate) => (
                    <div key={candidate.agent_id} className="rounded-lg border p-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                                <CalibratedConfidenceDisplay
                                    agentId={candidate.agent_id}
                                    agentName={candidate.agent_name}
                                    reportedConfidence={candidate.reported_confidence}
                                    showDetails={true}
                                />
                            </div>

                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Reputation:</span>
                                    <span className="font-medium">
                                        {candidate.reputation_score.toFixed(1)} ⭐
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Similar Tasks:</span>
                                    <span className="font-medium">
                                        {candidate.similar_task_success_rate}% success
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Estimated Cost:</span>
                                    <span className="font-medium">
                                        {candidate.estimated_cost_sats} sats
                                    </span>
                                </div>
                                <div className="text-xs text-gray-500">
                                    Verified skills: {candidate.capabilities.verified_capabilities.join(", ")}
                                </div>
                                <div className="text-xs text-gray-500">
                                    Budget ceiling {candidate.capabilities.max_budget_sats} sats · context
                                    {" "}
                                    {candidate.capabilities.max_context_tokens} tokens · load
                                    {" "}
                                    {candidate.capabilities.current_context_used_percent}%
                                </div>

                                <button
                                    onClick={() => onSelectAgent(candidate)}
                                    className="mt-2 w-full rounded bg-violet-600 px-4 py-2 text-white hover:bg-violet-700"
                                >
                                    Select Agent
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}