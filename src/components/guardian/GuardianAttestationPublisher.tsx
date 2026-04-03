/**
 * Guardian Attestation Publisher Component
 * Allows guardians to attest skills (kind 1985 Nostr events)
 * Aligned with: docs/planning/NIP-Triumvirate-Satnam-Integration-Plan.md §7.1
 */

import React, { useEffect, useState } from "react";
import { Shield, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { Database } from "../../../types/database";
import { getEnvVar } from "../../config/env.client";

type SkillManifest = Database["public"]["Tables"]["skill_manifests"]["Row"];

type AttestationLabel =
  | "skill/verified"
  | "skill/audited"
  | "skill/verified/tier1"
  | "skill/verified/tier2"
  | "skill/verified/tier3"
  | "skill/verified/tier4";

const ATTESTATION_LABELS: { value: AttestationLabel; label: string }[] = [
  { value: "skill/verified", label: "Verified (Basic)" },
  { value: "skill/audited", label: "Audited (Enhanced)" },
  { value: "skill/verified/tier1", label: "Tier 1: Self-Check" },
  { value: "skill/verified/tier2", label: "Tier 2: Peer Review" },
  { value: "skill/verified/tier3", label: "Tier 3: Audited" },
  { value: "skill/verified/tier4", label: "Tier 4: Formal Verification" },
];

export const GuardianAttestationPublisher: React.FC = () => {
  const [skills, setSkills] = useState<SkillManifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSkill, setSelectedSkill] = useState<SkillManifest | null>(
    null
  );
  const [selectedLabel, setSelectedLabel] =
    useState<AttestationLabel>("skill/verified");
  const [attesting, setAttesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchUnverifiedSkills();
  }, []);

  async function fetchUnverifiedSkills() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("skill_manifests")
        .select("*")
        .eq("attestation_status", "unverified")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSkills(data || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch skills"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleAttest() {
    if (!selectedSkill) return;

    setAttesting(true);
    setError(null);
    setSuccess(null);

    try {
      // 1. Check if NIP-07 extension is available
      if (typeof window === "undefined" || !window.nostr) {
        throw new Error(
          "NIP-07 browser extension not available. Please install Alby or nos2x."
        );
      }

      // 2. Get guardian's public key
      const guardianPubkey = await window.nostr.getPublicKey();

      // 3. Create kind 1985 attestation event
      const unsignedEvent = {
        kind: 1985,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["L", "skill"],
          ["l", selectedLabel, "skill"],
          ["e", selectedSkill.manifest_event_id],
          ["p", selectedSkill.publisher_pubkey],
        ],
        content: `Guardian attestation: ${selectedLabel} for skill ${selectedSkill.name} (${selectedSkill.skill_scope_id})`,
      };

      // 4. Sign with NIP-07
      const signedEvent = await window.nostr.signEvent(unsignedEvent);

      // 5. Publish to Nostr relays (using CEPS)
      // TODO: Integrate with lib/central_event_publishing_service.ts
      // For now, we'll skip relay publishing and go straight to database update

      // 6. Call attest-skill endpoint to update database
      const response = await fetch("/.netlify/functions/nip-skl-registry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "attest-skill",
          nostr_event: signedEvent,
          skill_scope_id: selectedSkill.skill_scope_id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to attest skill");
      }

      const result = await response.json();

      // 7. Trigger OTS proof generation (non-blocking)
      try {
        await fetch("/.netlify/functions/ots-proof-generator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attested_event_kind: 1985,
            attested_event_id: signedEvent.id,
            agent_pubkey: guardianPubkey,
            data: JSON.stringify(signedEvent),
            storage_backend: "supabase",
          }),
        });
      } catch (otsError) {
        console.warn("OTS proof generation failed (non-fatal):", otsError);
      }

      setSuccess(
        `Skill attested successfully! Event ID: ${signedEvent.id.slice(0, 16)}...`
      );
      setSelectedSkill(null);
      fetchUnverifiedSkills(); // Refresh list
    } catch (err) {
      setError(err instanceof Error ? err.message : "Attestation failed");
    } finally {
      setAttesting(false);
    }
  }

  const filteredSkills = skills.filter(
    (skill) =>
      skill.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      skill.publisher_pubkey.toLowerCase().includes(searchTerm.toLowerCase()) ||
      skill.skill_scope_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center">
          <Shield className="h-6 w-6 mr-2 text-purple-600" />
          Guardian Skill Attestations
        </h2>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search by skill name, publisher, or scope ID..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
      />

      {/* Success/Error Messages */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start">
          <CheckCircle className="h-5 w-5 text-green-600 mr-3 mt-0.5" />
          <p className="text-green-800">{success}</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
          <AlertTriangle className="h-5 w-5 text-red-600 mr-3 mt-0.5" />
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Skills Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Skill Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Version
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Publisher
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredSkills.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                  No unverified skills found.
                </td>
              </tr>
            ) : (
              filteredSkills.map((skill) => (
                <tr key={skill.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {skill.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {skill.skill_scope_id.slice(0, 40)}...
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {skill.version}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {skill.publisher_pubkey.slice(0, 16)}...
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button
                      onClick={() => setSelectedSkill(skill)}
                      className="text-purple-600 hover:text-purple-800 font-medium"
                    >
                      Attest
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Attestation Modal */}
      {selectedSkill && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Attest Skill</h3>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600">Skill:</p>
                <p className="font-medium">{selectedSkill.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Version:</p>
                <p className="font-medium">{selectedSkill.version}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Attestation Label:
                </label>
                <select
                  value={selectedLabel}
                  onChange={(e) =>
                    setSelectedLabel(e.target.value as AttestationLabel)
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                >
                  {ATTESTATION_LABELS.map((label) => (
                    <option key={label.value} value={label.value}>
                      {label.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex space-x-3 pt-4">
                <button
                  onClick={() => setSelectedSkill(null)}
                  disabled={attesting}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAttest}
                  disabled={attesting}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center"
                >
                  {attesting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Attesting...
                    </>
                  ) : (
                    "Attest Skill"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

