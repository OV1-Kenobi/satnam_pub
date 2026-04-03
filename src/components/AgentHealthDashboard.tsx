import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface AgentHealth {
    agent_id: string;
    agent_name: string;
    health_status: 'available' | 'busy' | 'overloaded' | 'low_budget' | 'paused' | 'offline';
    current_compute_load_percent: number;
    active_task_count: number;
    max_concurrent_tasks: number;
    available_budget_sats: number;
    seconds_since_heartbeat: number;
}

export function AgentHealthDashboard() {
    const [agents, setAgents] = useState<AgentHealth[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchAgentHealth();
        const interval = setInterval(fetchAgentHealth, 10000); // Refresh every 10s
        return () => clearInterval(interval);
    }, []);

    async function fetchAgentHealth() {
        const { data, error } = await supabase
            .from('agent_health_summary')
            .select('*')
            .order('agent_name');

        if (!error && data) {
            setAgents(data);
            setLoading(false);
        }
    }

    function getStatusColor(status: string): string {
        switch (status) {
            case 'available': return 'bg-green-500';
            case 'busy': return 'bg-yellow-500';
            case 'overloaded': return 'bg-orange-500';
            case 'low_budget': return 'bg-yellow-600';
            case 'paused': return 'bg-gray-500';
            case 'offline': return 'bg-red-500';
            default: return 'bg-gray-300';
        }
    }

    function getStatusEmoji(status: string): string {
        switch (status) {
            case 'available': return '🟢';
            case 'busy': return '🟡';
            case 'overloaded': return '🔴';
            case 'low_budget': return '💰';
            case 'paused': return '⏸️';
            case 'offline': return '💀';
            default: return '⚪';
        }
    }

    if (loading) return <div>Loading agent health...</div>;

    return (
        <div className="space-y-4">
            <h2 className="text-2xl font-bold">Agent Health Dashboard</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {agents.map(agent => (
                    <div key={agent.agent_id} className="border rounded-lg p-4 shadow">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="font-semibold">{agent.agent_name}</h3>
                            <span className="text-2xl">{getStatusEmoji(agent.health_status)}</span>
                        </div>

                        <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                                <span>Status:</span>
                                <span className={`px-2 py-0.5 rounded text-white text-xs ${getStatusColor(agent.health_status)}`}>
                                    {agent.health_status.replace('_', ' ')}
                                </span>
                            </div>

                            <div className="flex justify-between">
                                <span>Load:</span>
                                <span>{agent.current_compute_load_percent}%</span>
                            </div>

                            <div className="flex justify-between">
                                <span>Tasks:</span>
                                <span>{agent.active_task_count}/{agent.max_concurrent_tasks}</span>
                            </div>

                            <div className="flex justify-between">
                                <span>Budget:</span>
                                <span>{agent.available_budget_sats.toLocaleString()} sats</span>
                            </div>

                            <div className="flex justify-between text-xs text-gray-500">
                                <span>Last heartbeat:</span>
                                <span>{Math.floor(agent.seconds_since_heartbeat)}s ago</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}