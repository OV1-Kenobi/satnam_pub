/**
 * Skill Licensing Manager Component
 * Enable/disable skills for agents
 * Aligned with: docs/planning/NIP-Triumvirate-Satnam-Integration-Plan.md §8
 */

import React, { useEffect, useState } from "react";
import { Plus, Minus, Loader2, Shield } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { Database } from "../../../types/database";

type SkillManifest = Database["public"]["Tables"]["skill_manifests"]["Row"];

interface SkillLicensingManagerProps {
  agentPubkey: string;
}

export const SkillLicensingManager: React.FC<SkillLicensingManagerProps> = ({
  agentPubkey,
}) => {
  const [availableSkills, setAvailableSkills] = useState<SkillManifest[]>([]);
  const [enabledSkillIds, setEnabledSkillIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchSkills();
  }, [agentPubkey]);

  async function fetchSkills() {
    try {
      setLoading(true);

      // Fetch all verified skills
      const { data: skills, error: skillsError } = await supabase
        .from("skill_manifests")
        .select("*")
        .eq("attestation_status", "verified")
        .order("name");

      if (skillsError) throw skillsError;
      setAvailableSkills(skills || []);

      // Fetch agent's enabled skills
      const { data: agent, error: agentError } = await supabase
        .from("agent_profiles")
        .select("enabled_skill_scope_ids")
        .eq("agent_pubkey", agentPubkey)
        .single();

      if (agentError) throw agentError;
      setEnabledSkillIds(agent?.enabled_skill_scope_ids || []);
    } catch (err) {
      console.error("Failed to fetch skills:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleEnableSkill(skillScopeId: string) {
    setProcessing(true);
    try {
      const response = await fetch("/.netlify/functions/nip-sa-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "enable-skill",
          agent_pubkey: agentPubkey,
          skill_scope_id: skillScopeId,
          guardian_pubkey: "TODO", // TODO: Get from auth context
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to enable skill");
      }

      setEnabledSkillIds([...enabledSkillIds, skillScopeId]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to enable skill");
    } finally {
      setProcessing(false);
    }
  }

  async function handleDisableSkill(skillScopeId: string) {
    setProcessing(true);
    try {
      const response = await fetch("/.netlify/functions/nip-sa-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "disable-skill",
          agent_pubkey: agentPubkey,
          skill_scope_id: skillScopeId,
          guardian_pubkey: "TODO", // TODO: Get from auth context
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to disable skill");
      }

      setEnabledSkillIds(enabledSkillIds.filter((id) => id !== skillScopeId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to disable skill");
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  const enabledSkills = availableSkills.filter((skill) =>
    enabledSkillIds.includes(skill.skill_scope_id)
  );
  const disabledSkills = availableSkills.filter(
    (skill) => !enabledSkillIds.includes(skill.skill_scope_id)
  );

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 flex items-center">
        <Shield className="h-6 w-6 mr-2 text-purple-600" />
        Skill Licensing
      </h2>

      <div className="grid grid-cols-2 gap-6">
        {/* Available Skills */}
        <div>
          <h3 className="text-lg font-semibold mb-4 text-gray-700">
            Available Skills ({disabledSkills.length})
          </h3>
          <div className="space-y-2">
            {disabledSkills.map((skill) => (
              <div
                key={skill.id}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:border-purple-300 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">{skill.name}</h4>
                    <p className="text-sm text-gray-500 mt-1">
                      v{skill.version} • {skill.publisher_pubkey.slice(0, 16)}...
                    </p>
                    {skill.description && (
                      <p className="text-xs text-gray-600 mt-2">
                        {skill.description.slice(0, 100)}...
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleEnableSkill(skill.skill_scope_id)}
                    disabled={processing}
                    className="ml-4 p-2 text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-50"
                    title="Enable skill"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))}
            {disabledSkills.length === 0 && (
              <p className="text-gray-500 text-center py-8">
                All verified skills are enabled.
              </p>
            )}
          </div>
        </div>

        {/* Enabled Skills */}
        <div>
          <h3 className="text-lg font-semibold mb-4 text-gray-700">
            Enabled Skills ({enabledSkills.length})
          </h3>
          <div className="space-y-2">
            {enabledSkills.map((skill) => (
              <div
                key={skill.id}
                className="bg-green-50 border border-green-200 rounded-lg p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">{skill.name}</h4>
                    <p className="text-sm text-gray-500 mt-1">
                      v{skill.version} • {skill.publisher_pubkey.slice(0, 16)}...
                    </p>
                    {skill.description && (
                      <p className="text-xs text-gray-600 mt-2">
                        {skill.description.slice(0, 100)}...
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDisableSkill(skill.skill_scope_id)}
                    disabled={processing}
                    className="ml-4 p-2 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                    title="Disable skill"
                  >
                    <Minus className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))}
            {enabledSkills.length === 0 && (
              <p className="text-gray-500 text-center py-8">
                No skills enabled yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

