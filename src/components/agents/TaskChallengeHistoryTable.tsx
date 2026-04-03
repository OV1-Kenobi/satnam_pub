/**
 * Task Challenge History Table
 * Sub-component displaying task challenge history with filtering
 * @module TaskChallengeHistoryTable
 */

import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Filter,
  XCircle,
} from "lucide-react";
import React, { useState } from "react";

interface TaskChallenge {
  challenge_id: string;
  task_id: string;
  agent_id: string;
  challenge_reason: string;
  challenge_details: string;
  delegator_response: "pending" | "revised" | "overridden" | "cancelled";
  created_at: string;
  resolved_at?: string;
}

interface TaskChallengeHistoryTableProps {
  challenges: TaskChallenge[];
}

export const TaskChallengeHistoryTable: React.FC<TaskChallengeHistoryTableProps> = ({
  challenges,
}) => {
  const [filterType, setFilterType] = useState<string>("all");
  const [filterAgent, setFilterAgent] = useState<string>("all");

  if (!challenges || challenges.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          No Task Challenges
        </h3>
        <p className="text-gray-600">
          Task challenges will appear here when agents question task requests.
        </p>
      </div>
    );
  }

  const challengeTypes = Array.from(
    new Set(challenges.map((c) => c.challenge_reason))
  );
  const agentIds = Array.from(new Set(challenges.map((c) => c.agent_id)));

  const filteredChallenges = challenges.filter((challenge) => {
    const typeMatch = filterType === "all" || challenge.challenge_reason === filterType;
    const agentMatch = filterAgent === "all" || challenge.agent_id === filterAgent;
    return typeMatch && agentMatch;
  });

  const getResponseBadge = (response: string) => {
    switch (response) {
      case "pending":
        return { label: "Pending", color: "yellow", icon: Clock };
      case "revised":
        return { label: "Revised", color: "blue", icon: CheckCircle };
      case "overridden":
        return { label: "Overridden", color: "purple", icon: AlertTriangle };
      case "cancelled":
        return { label: "Cancelled", color: "red", icon: XCircle };
      default:
        return { label: response, color: "gray", icon: Clock };
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            Task Challenge History
          </h3>
          <div className="flex items-center gap-3">
            <Filter className="h-4 w-4 text-gray-500" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm"
            >
              <option value="all">All Types</option>
              {challengeTypes.map((type) => (
                <option key={type} value={type}>
                  {type.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <select
              value={filterAgent}
              onChange={(e) => setFilterAgent(e.target.value)}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm"
            >
              <option value="all">All Agents</option>
              {agentIds.map((agentId) => (
                <option key={agentId} value={agentId}>
                  Agent {agentId.slice(0, 8)}...
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-3">
          {filteredChallenges.map((challenge) => {
            const responseBadge = getResponseBadge(challenge.delegator_response);
            const ResponseIcon = responseBadge.icon;

            return (
              <div
                key={challenge.challenge_id}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">
                        {challenge.challenge_reason.replace(/_/g, " ")}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium bg-${responseBadge.color}-100 text-${responseBadge.color}-700 flex items-center gap-1`}
                      >
                        <ResponseIcon className="h-3 w-3" />
                        {responseBadge.label}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      Agent {challenge.agent_id.slice(0, 8)}... • Task{" "}
                      {challenge.task_id.slice(0, 8)}...
                    </p>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    <p>{new Date(challenge.created_at).toLocaleDateString()}</p>
                    <p>{new Date(challenge.created_at).toLocaleTimeString()}</p>
                  </div>
                </div>

                <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded mb-2">
                  {challenge.challenge_details}
                </p>

                {challenge.resolved_at && (
                  <p className="text-xs text-gray-500">
                    Resolved: {new Date(challenge.resolved_at).toLocaleString()}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {filteredChallenges.length === 0 && (
          <p className="text-center text-gray-500 py-8">
            No challenges match the selected filters.
          </p>
        )}
      </div>
    </div>
  );
};

