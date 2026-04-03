/**
 * Delegation Health Panel
 * Sub-component showing per-agent health metrics and fallback chains
 * @module DelegationHealthPanel
 */

import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  DollarSign,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import React from "react";
import type { AgentOperationalState } from "../../types/agents";

interface DelegationHealthPanelProps {
  agentStates: AgentOperationalState[];
}

export const DelegationHealthPanel: React.FC<DelegationHealthPanelProps> = ({
  agentStates,
}) => {
  if (!agentStates || agentStates.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          No Agent Data Available
        </h3>
        <p className="text-gray-600">
          Agent health metrics will appear here once agents are active.
        </p>
      </div>
    );
  }

  const getHealthStatus = (agent: AgentOperationalState) => {
    if (!agent.is_online) return { label: "Offline", color: "gray", icon: Clock };
    if (!agent.accepts_new_tasks) return { label: "Overloaded", color: "red", icon: AlertTriangle };
    if (agent.current_compute_load_percent > 80) return { label: "High Load", color: "yellow", icon: TrendingUp };
    return { label: "Healthy", color: "green", icon: CheckCircle };
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Activity className="h-5 w-5 text-blue-600" />
          Agent Health Metrics
        </h3>

        <div className="space-y-4">
          {agentStates.map((agent) => {
            const health = getHealthStatus(agent);
            const HealthIcon = health.icon;

            return (
              <div
                key={agent.agent_id}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-semibold text-gray-900">
                      Agent {agent.agent_id.slice(0, 8)}...
                    </h4>
                    <p className="text-sm text-gray-600">
                      Last heartbeat: {new Date(agent.last_heartbeat).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium bg-${health.color}-100 text-${health.color}-700 flex items-center gap-1`}
                  >
                    <HealthIcon className="h-3 w-3" />
                    {health.label}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                  <div>
                    <p className="text-xs text-gray-600">Compute Load</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {agent.current_compute_load_percent.toFixed(0)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Active Tasks</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {agent.active_task_count}/{agent.max_concurrent_tasks}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Context Usage</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {agent.context_window_used_percent.toFixed(0)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Budget Available</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {agent.available_budget_sats} sats
                    </p>
                  </div>
                </div>

                {/* Progress Bars */}
                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>Compute</span>
                      <span>{agent.current_compute_load_percent.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          agent.current_compute_load_percent > 80
                            ? "bg-red-500"
                            : agent.current_compute_load_percent > 60
                              ? "bg-yellow-500"
                              : "bg-green-500"
                        }`}
                        style={{ width: `${Math.min(agent.current_compute_load_percent, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>Context Window</span>
                      <span>{agent.context_window_used_percent.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          agent.context_window_used_percent > 80
                            ? "bg-red-500"
                            : agent.context_window_used_percent > 60
                              ? "bg-yellow-500"
                              : "bg-blue-500"
                        }`}
                        style={{ width: `${Math.min(agent.context_window_used_percent, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {agent.availability_reason && (
                  <div className="mt-3 text-sm text-gray-600 bg-gray-50 p-2 rounded">
                    ℹ️ {agent.availability_reason}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

