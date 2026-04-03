import React, { useState } from 'react';

interface VerifiabilityCheckResult {
    verifiability_score: number;
    verification_method: string;
    requires_decomposition: boolean;
    decomposition_suggestions?: string[];
    dispute_risk: string;
    can_proceed: boolean;
    estimated_verification_cost_sats: number;
    warnings: string[];
}

interface Props {
    taskDescription: string;
    outputType?: string;
    successCriteria?: Record<string, any>;
    minThreshold?: number;
    onAssessmentComplete?: (result: VerifiabilityCheckResult) => void;
}

export function TaskVerifiabilityChecker({
    taskDescription,
    outputType,
    successCriteria,
    minThreshold = 60,
    onAssessmentComplete
}: Props) {
    const [checking, setChecking] = useState(false);
    const [result, setResult] = useState<VerifiabilityCheckResult | null>(null);

    async function checkVerifiability() {
        setChecking(true);
        try {
            const response = await fetch('/.netlify/functions/assess-task-verifiability', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    task_description: taskDescription,
                    output_type: outputType,
                    success_criteria: successCriteria,
                    min_verifiability_threshold: minThreshold
                })
            });

            const data = await response.json();
            setResult(data);
            onAssessmentComplete?.(data);
        } catch (err) {
            console.error('Verifiability check failed:', err);
        } finally {
            setChecking(false);
        }
    }

    function getScoreColor(score: number): string {
        if (score >= 80) return 'text-green-600 bg-green-50 border-green-200';
        if (score >= 60) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
        if (score >= 40) return 'text-orange-600 bg-orange-50 border-orange-200';
        return 'text-red-600 bg-red-50 border-red-200';
    }

    function getRiskBadge(risk: string): JSX.Element {
        const colors = {
            'LOW': 'bg-green-100 text-green-800',
            'MEDIUM': 'bg-yellow-100 text-yellow-800',
            'HIGH': 'bg-orange-100 text-orange-800',
            'CRITICAL': 'bg-red-100 text-red-800'
        };

        return (
            <span className={`px-2 py-1 rounded text-xs font-medium ${colors[risk as keyof typeof colors]}`}>
                {risk} Risk
            </span>
        );
    }

    if (!taskDescription) {
        return (
            <div className="text-gray-500 text-sm">
                Enter a task description to check verifiability
            </div>
        );
    }

    return (
        <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Task Verifiability Assessment</h3>
                <button
                    onClick={checkVerifiability}
                    disabled={checking}
                    className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:opacity-50"
                >
                    {checking ? 'Checking...' : 'Check Verifiability'}
                </button>
            </div>

            {result && (
                <div className="space-y-3">
                    {/* Score display */}
                    <div className={`border rounded p-3 ${getScoreColor(result.verifiability_score)}`}>
                        <div className="flex items-center justify-between mb-2">
                            <span className="font-medium">Verifiability Score</span>
                            <span className="text-2xl font-bold">{result.verifiability_score}/100</span>
                        </div>

                        <div className="w-full bg-white/50 rounded-full h-2">
                            <div
                                className="h-2 rounded-full bg-current"
                                style={{ width: `${result.verifiability_score}%` }}
                            />
                        </div>
                    </div>

                    {/* Details */}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                            <span className="text-gray-600">Verification Method:</span>
                            <div className="font-medium">{result.verification_method.replace(/_/g, ' ')}</div>
                        </div>
                        <div>
                            <span className="text-gray-600">Dispute Risk:</span>
                            <div>{getRiskBadge(result.dispute_risk)}</div>
                        </div>
                        <div>
                            <span className="text-gray-600">Verification Cost:</span>
                            <div className="font-medium">{result.estimated_verification_cost_sats} sats</div>
                        </div>
                        <div>
                            <span className="text-gray-600">Can Proceed:</span>
                            <div className="font-medium">{result.can_proceed ? '✓ Yes' : '✗ No'}</div>
                        </div>
                    </div>

                    {/* Warnings */}
                    {result.warnings.length > 0 && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                            <div className="font-medium text-sm text-yellow-800 mb-1">⚠️ Warnings:</div>
                            <ul className="text-sm text-yellow-700 space-y-1">
                                {result.warnings.map((warning, i) => (
                                    <li key={i}>-  {warning}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Decomposition suggestions */}
                    {result.requires_decomposition && result.decomposition_suggestions && (
                        <div className="bg-blue-50 border border-blue-200 rounded p-3">
                            <div className="font-medium text-sm text-blue-800 mb-2">
                                💡 Suggested Decomposition:
                            </div>
                            <ul className="text-sm text-blue-700 space-y-1">
                                {result.decomposition_suggestions.map((suggestion, i) => (
                                    <li key={i}>-  {suggestion}</li>
                                ))}
                            </ul>
                            <button className="mt-2 text-xs text-blue-600 hover:underline">
                                Auto-decompose task →
                            </button>
                        </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2 pt-2">
                        {result.can_proceed ? (
                            <button className="px-4 py-2 bg-green-500 text-white rounded text-sm hover:bg-green-600">
                                ✓ Proceed with Delegation
                            </button>
                        ) : (
                            <>
                                <button className="px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600">
                                    Add Success Criteria
                                </button>
                                <button className="px-4 py-2 bg-orange-500 text-white rounded text-sm hover:bg-orange-600">
                                    Decompose Task
                                </button>
                            </>
                        )}
                        <button className="px-4 py-2 border rounded text-sm hover:bg-gray-50">
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}