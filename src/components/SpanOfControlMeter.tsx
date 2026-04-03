import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface OversightLoad {
    managed_agent_count: number;
    span_of_control_limit: number;
    agents_with_active_tasks: number;
    total_active_tasks: number;
    at_capacity: boolean;
}

export function SpanOfControlMeter() {
    const supabaseClient = supabase;
    const [oversight, setOversight] = useState<OversightLoad | null>(null);

    useEffect(() => {
        fetchOversight();
    }, []);

    async function fetchOversight() {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;

        const { data, error } = await supabaseClient
            .from('human_oversight_load')
            .select('*')
            .eq('human_id', user.id)
            .single();

        if (!error && data) {
            setOversight(data);
        } else if (error && error.code === 'PGRST116') {
            // No agents yet
            const { data: userdata } = await supabaseClient
                .from('user_identities')
                .select('span_of_control_limit')
                .eq('id', user.id)
                .single();

            setOversight({
                managed_agent_count: 0,
                span_of_control_limit: userdata?.span_of_control_limit || 5,
                agents_with_active_tasks: 0,
                total_active_tasks: 0,
                at_capacity: false
            });
        }
    }

    if (!oversight) return null;

    const percentage = (oversight.managed_agent_count / oversight.span_of_control_limit) * 100;
    const remaining = oversight.span_of_control_limit - oversight.managed_agent_count;

    return (
        <div className="bg-white border rounded-lg p-4 shadow">
            <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold">Span of Control</h3>
                <span className="text-sm text-gray-600">
                    {oversight.managed_agent_count}/{oversight.span_of_control_limit} agents
                </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-gray-200 rounded-full h-4 mb-2">
                <div
                    className={`h-4 rounded-full transition-all ${percentage >= 100 ? 'bg-red-500' :
                            percentage >= 80 ? 'bg-orange-500' :
                                percentage >= 60 ? 'bg-yellow-500' :
                                    'bg-green-500'
                        }`}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                />
            </div>

            <div className="text-sm space-y-1">
                {oversight.at_capacity ? (
                    <div className="text-red-600 font-medium">
                        ⚠️ At capacity - cannot create more agents
                    </div>
                ) : (
                    <div className="text-gray-600">
                        {remaining} slot{remaining !== 1 ? 's' : ''} remaining
                    </div>
                )}

                <div className="text-gray-500 text-xs">
                    {oversight.agents_with_active_tasks} agent{oversight.agents_with_active_tasks !== 1 ? 's' : ''} with active tasks
                    ({oversight.total_active_tasks} total task{oversight.total_active_tasks !== 1 ? 's' : ''})
                </div>
            </div>

            {oversight.at_capacity && (
                <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                    <p className="font-medium mb-1">Options:</p>
                    <ul className="list-disc list-inside space-y-0.5 text-gray-700">
                        <li>Pause or archive underutilized agents</li>
                        <li>Request limit increase (requires guardian approval)</li>
                        <li>Delegate oversight to another steward</li>
                    </ul>
                </div>
            )}
        </div>
    );
}