/**
 * Agent Management Dashboard Component
 * List and manage agents under guardian's control
 * Aligned with: docs/planning/NIP-Triumvirate-Satnam-Integration-Plan.md §8
 */

import React, { useEffect, useState } from "react";
import { Bot, Edit, Shield, FileText, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { Database } from "../../../types/database";
import { SkillLicensingManager } from "./SkillLicensingManager";
import { OTSProofList } from "../ots/OTSProofList";

type AgentProfile = Database["public"]["Tables"]["agent_profiles"]["Row"];

export const AgentManagementDashboard: React.FC = () => {
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<AgentProfile | null>(null);
  const [view, setView] = useState<"list" | "edit" | "skills" | "proofs">("list");
  const [walletPolicy, setWalletPolicy] = useState({
    max_single_spend_sats: 1000,
    daily_limit_sats: 100000,
    requires_approval_above_sats: 10000,
    preferred_spend_rail: "lightning" as "lightning" | "cashu" | "fedimint",
    sweep_threshold_sats: 50000,
    sweep_destination: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAgents();
  }, []);

  async function fetchAgents() {
    try {
      setLoading(true);
      // TODO: Filter by guardian's created_by_user_id
      const { data, error } = await supabase
        .from("agent_profiles")
        .select("*")
        .eq("is_agent", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAgents(data || []);
    } catch (err) {
      console.error("Failed to fetch agents:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveWalletPolicy() {
    if (!selectedAgent) return;

    setSaving(true);
    try {
      const response = await fetch("/.netlify/functions/nip-sa-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-wallet-policy",
          agent_pubkey: selectedAgent.agent_pubkey,
          guardian_pubkey: "TODO", // TODO: Get from auth context
          wallet_policy: walletPolicy,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update wallet policy");
      }

      alert("Wallet policy updated successfully!");
      setView("list");
      fetchAgents();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function handleEditAgent(agent: AgentProfile) {
    setSelectedAgent(agent);
    setWalletPolicy({
      max_single_spend_sats: agent.max_single_spend_sats,
      daily_limit_sats: agent.daily_limit_sats,
      requires_approval_above_sats: agent.requires_approval_above_sats,
      preferred_spend_rail: agent.preferred_spend_rail as "lightning" | "cashu" | "fedimint",
      sweep_threshold_sats: agent.sweep_threshold_sats,
      sweep_destination: agent.sweep_destination || "",
    });
    setView("edit");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (view === "skills" && selectedAgent) {
    return (
      <div>
        <button
          onClick={() => setView("list")}
          className="mb-4 text-purple-600 hover:text-purple-800"
        >
          ← Back to Agents
        </button>
        <SkillLicensingManager agentPubkey={selectedAgent.agent_pubkey || ""} />
      </div>
    );
  }

  if (view === "proofs" && selectedAgent) {
    return (
      <div>
        <button
          onClick={() => setView("list")}
          className="mb-4 text-purple-600 hover:text-purple-800"
        >
          ← Back to Agents
        </button>
        <OTSProofList agentPubkey={selectedAgent.agent_pubkey || ""} />
      </div>
    );
  }

  if (view === "edit" && selectedAgent) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">
            Edit Wallet Policy: {selectedAgent.agent_username}
          </h2>
          <button
            onClick={() => setView("list")}
            className="text-purple-600 hover:text-purple-800"
          >
            Cancel
          </button>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max Single Spend (sats)
            </label>
            <input
              type="number"
              value={walletPolicy.max_single_spend_sats}
              onChange={(e) =>
                setWalletPolicy({
                  ...walletPolicy,
                  max_single_spend_sats: parseInt(e.target.value),
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Daily Limit (sats)
            </label>
            <input
              type="number"
              value={walletPolicy.daily_limit_sats}
              onChange={(e) =>
                setWalletPolicy({
                  ...walletPolicy,
                  daily_limit_sats: parseInt(e.target.value),
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Requires Approval Above (sats)
            </label>
            <input
              type="number"
              value={walletPolicy.requires_approval_above_sats}
              onChange={(e) =>
                setWalletPolicy({
                  ...walletPolicy,
                  requires_approval_above_sats: parseInt(e.target.value),
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Preferred Spend Rail
            </label>
            <select
              value={walletPolicy.preferred_spend_rail}
              onChange={(e) =>
                setWalletPolicy({
                  ...walletPolicy,
                  preferred_spend_rail: e.target.value as "lightning" | "cashu" | "fedimint",
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="lightning">Lightning</option>
              <option value="cashu">Cashu</option>
              <option value="fedimint">Fedimint</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sweep Threshold (sats)
            </label>
            <input
              type="number"
              value={walletPolicy.sweep_threshold_sats}
              onChange={(e) =>
                setWalletPolicy({
                  ...walletPolicy,
                  sweep_threshold_sats: parseInt(e.target.value),
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sweep Destination (Lightning Address or On-Chain)
            </label>
            <input
              type="text"
              value={walletPolicy.sweep_destination}
              onChange={(e) =>
                setWalletPolicy({
                  ...walletPolicy,
                  sweep_destination: e.target.value,
                })
              }
              placeholder="guardian@satnam.pub or bc1..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <button
            onClick={handleSaveWalletPolicy}
            disabled={saving}
            className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              "Save Wallet Policy"
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center">
          <Bot className="h-6 w-6 mr-2 text-purple-600" />
          Agent Management
        </h2>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Agent
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Reputation
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tasks
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Proofs
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {agents.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  No agents found.
                </td>
              </tr>
            ) : (
              agents.map((agent) => (
                <tr key={agent.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {agent.agent_username}
                    </div>
                    <div className="text-xs text-gray-500">
                      {agent.unified_address}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {agent.reputation_score}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {agent.total_tasks_completed}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {agent.ots_attestation_count}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                    <button
                      onClick={() => handleEditAgent(agent)}
                      className="inline-flex items-center text-purple-600 hover:text-purple-800"
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        setSelectedAgent(agent);
                        setView("skills");
                      }}
                      className="inline-flex items-center text-blue-600 hover:text-blue-800"
                    >
                      <Shield className="h-4 w-4 mr-1" />
                      Skills
                    </button>
                    <button
                      onClick={() => {
                        setSelectedAgent(agent);
                        setView("proofs");
                      }}
                      className="inline-flex items-center text-green-600 hover:text-green-800"
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      Proofs
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

