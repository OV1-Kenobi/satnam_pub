import { useEffect, useState } from 'react';
import { supabase } from '../src/lib/supabase';

interface CalibrationData {
    reported_confidence: number;
    calibrated_confidence: number;
    adjustment_factor: number;
    calibration_score: number | null;
    overconfidence_bias: number;
    is_calibrated: boolean;
    historical_success_rate: number;
}

interface Props {
    agentId: string;
    agentName: string;
    reportedConfidence: number;
    showDetails?: boolean;
}

export function CalibratedConfidenceDisplay({
    agentId,
    agentName,
    reportedConfidence,
    showDetails = true
}: Props) {
    const [calibration, setCalibration] = useState<CalibrationData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchCalibration();
    }, [agentId, reportedConfidence]);

    async function fetchCalibration() {
        const { data, error } = await supabase
            .rpc('get_calibrated_confidence', {
                p_agent_id: agentId,
                p_reported_confidence: reportedConfidence
            });

        if (!error && data) {
            setCalibration(data);
        }
        setLoading(false);
    }

    if (loading) return <div className="text-sm text-gray-500">Calibrating...</div>;
    if (!calibration) return null;

    const confidenceGap = Math.abs(calibration.reported_confidence - calibration.calibrated_confidence);
    const isOverconfident = calibration.reported_confidence > calibration.calibrated_confidence;
    const isSignificantGap = confidenceGap > 15;

    function getConfidenceColor(conf: number): string {
        if (conf >= 75) return 'text-green-600';
        if (conf >= 50) return 'text-yellow-600';
        return 'text-red-600';
    }

    function getCalibrationBadge(): JSX.Element {
        if (!calibration?.is_calibrated) {
            return <span className="text-xs text-gray-500">(No calibration data)</span>;
        }

        if (calibration.calibration_score! >= 80) {
            return <span className="text-xs text-green-600">🟢 Well-calibrated</span>;
        } else if (calibration.calibration_score! >= 60) {
            return <span className="text-xs text-yellow-600">🟡 Moderately calibrated</span>;
        } else {
            return <span className="text-xs text-red-600">🔴 Poorly calibrated</span>;
        }
    }

    return (
        <div className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{agentName}</span>
                {calibration.is_calibrated && getCalibrationBadge()}
            </div>

            {/* Confidence display */}
            <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Self-Reported:</span>
                    <span className={`font-medium ${getConfidenceColor(calibration.reported_confidence)}`}>
                        {calibration.reported_confidence.toFixed(0)}%
                    </span>
                </div>

                {calibration?.is_calibrated && (
                    <>
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">Calibrated:</span>
                            <span className={`font-bold ${getConfidenceColor(calibration.calibrated_confidence)}`}>
                                {calibration.calibrated_confidence.toFixed(0)}%
                            </span>
                        </div>

                        {isSignificantGap && (
                            <div className={`text-xs p-2 rounded ${isOverconfident ? 'bg-orange-50 text-orange-700' : 'bg-blue-50 text-blue-700'
                                }`}>
                                {isOverconfident ? '⚠️' : 'ℹ️'} Historically {isOverconfident ? 'overconfident' : 'underconfident'} by{' '}
                                {confidenceGap.toFixed(0)}%
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Historical performance */}
            {showDetails && calibration?.is_calibrated && (
                <div className="pt-2 border-t text-xs space-y-1 text-gray-600">
                    <div className="flex justify-between">
                        <span>Historical Success:</span>
                        <span className="font-medium">{calibration.historical_success_rate.toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Calibration Score:</span>
                        <span className="font-medium">{calibration.calibration_score?.toFixed(0)}/100</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Adjustment Factor:</span>
                        <span className="font-medium">{calibration.adjustment_factor.toFixed(2)}x</span>
                    </div>
                </div>
            )}
        </div>
    );
}