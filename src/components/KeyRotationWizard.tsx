import React, { useMemo, useState } from "react";
import { LightningStrategy, Nip05Strategy, useKeyRotation } from "../hooks/useKeyRotation";

interface Props { onClose?: () => void }

type Step = "review" | "strategies" | "publish" | "commit" | "done" | "error";

export const KeyRotationWizard: React.FC<Props> = ({ onClose }) => {
  const { start, complete, ceps, rotationId, current, whitelist, deprecationDays, loading, error } = useKeyRotation();
  const [step, setStep] = useState<Step>("review");
  const [nip05Strategy, setNip05Strategy] = useState<Nip05Strategy>("keep");
  const [nip05Identifier, setNip05Identifier] = useState("");
  const [lightningStrategy, setLightningStrategy] = useState<LightningStrategy>("keep");
  const [lightningAddress, setLightningAddress] = useState("");
  const [oldNpub, setOldNpub] = useState<string>("");
  const [newNpub, setNewNpub] = useState<string>("");
  const [cepsMeta, setCepsMeta] = useState<{ delegationEventId?: string; kind0EventIds?: string[]; noticeEventIds?: string[]; profileUpdateEventId?: string } | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const nip05Allowed = useMemo(() => (whitelist || []).length ? whitelist : ["satnam.pub"], [whitelist]);

  const onBegin = async () => {
    try {
      setLocalError(null); // Clear any previous errors
      const res = await start({ nip05: nip05Strategy, lightning: lightningStrategy });
      if (!res.success) {
        setLocalError(res.error || "Failed to start key rotation");
        setStep("error");
        return;
      }
      setOldNpub(res.current?.npub || "");
      setStep("strategies");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
      setLocalError(errorMessage);
      setStep("error");
    }
  };

  const onPublish = async () => {
    // In production, newNpub should be sourced from Identity Forge or user import
    if (!newNpub) { alert("Enter new npub"); return; }
    const meta = await ceps.publishRotationEvents(oldNpub, newNpub, {});
    setCepsMeta(meta);
    setStep("commit");
  };

  const onCommit = async () => {
    try {
      if (!rotationId) {
        setLocalError("No rotation ID available");
        setStep("error");
        return;
      }
      setLocalError(null); // Clear any previous errors
      const res = await complete({
        rotationId,
        oldNpub,
        newNpub,
        nip05: { strategy: nip05Strategy, identifier: nip05Strategy === "create" ? nip05Identifier : undefined },
        lightning: { strategy: lightningStrategy, address: lightningStrategy === "create" ? lightningAddress : undefined },
        ceps: cepsMeta || undefined,
      });
      if (!res.success) {
        setLocalError(res.error || "Failed to complete key rotation");
        setStep("error");
        return;
      }
      setStep("done");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
      setLocalError(errorMessage);
      setStep("error");
    }
  };

  return (
    <div className="p-4 border rounded-md max-w-2xl">
      <h2 className="text-xl font-semibold mb-2">Nostr Key Rotation</h2>
      {step === "review" && (
        <div className="space-y-3">
          <p className="text-sm text-gray-700">Deprecation window: {deprecationDays} days</p>
          <button className="px-3 py-2 bg-blue-600 text-white rounded" disabled={loading} onClick={onBegin}>Begin</button>
        </div>
      )}
      {step === "strategies" && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium">NIP-05 Strategy</label>
            <select value={nip05Strategy} onChange={(e) => setNip05Strategy(e.target.value as Nip05Strategy)} className="border p-2 rounded">
              <option value="keep">Keep existing</option>
              <option value="create">Create new (whitelist enforced)</option>
            </select>
            {nip05Strategy === "create" && (
              <div className="mt-2">
                <input value={nip05Identifier} onChange={(e) => setNip05Identifier(e.target.value)} placeholder={`name@${nip05Allowed[0] || "domain"}`} className="border p-2 rounded w-full" />
                <p className="text-xs text-gray-500 mt-1">Allowed: {nip05Allowed.join(", ")}</p>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium">Lightning Address</label>
            <select value={lightningStrategy} onChange={(e) => setLightningStrategy(e.target.value as LightningStrategy)} className="border p-2 rounded">
              <option value="keep">Keep existing</option>
              <option value="create">Create/Use new</option>
            </select>
            {lightningStrategy === "create" && (
              <input className="mt-2 border p-2 rounded w-full" value={lightningAddress} onChange={(e) => setLightningAddress(e.target.value)} placeholder="name@your-domain" />
            )}
          </div>
          <div>
            <label className="block text-sm font-medium">Old npub</label>
            <input className="border p-2 rounded w-full" value={oldNpub || current?.npub || ""} onChange={(e) => setOldNpub(e.target.value)} placeholder="npub1..." />
          </div>
          <div>
            <label className="block text-sm font-medium">New npub</label>
            <input className="border p-2 rounded w-full" value={newNpub} onChange={(e) => setNewNpub(e.target.value)} placeholder="npub1..." />
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-2 bg-purple-600 text-white rounded" onClick={() => setStep("publish")}>Next: Publish</button>
          </div>
        </div>
      )}
      {step === "publish" && (
        <div className="space-y-3">
          <p className="text-sm text-gray-700">Publish NIP-26 and profile updates via CEPS (simulated)</p>
          <button className="px-3 py-2 bg-indigo-600 text-white rounded" disabled={loading} onClick={onPublish}>Publish events</button>
        </div>
      )}
      {step === "commit" && (
        <div className="space-y-3">
          <p className="text-sm text-gray-700">Commit rotation to database</p>
          <button className="px-3 py-2 bg-green-600 text-white rounded" disabled={loading} onClick={onCommit}>Commit</button>
        </div>
      )}
      {step === "done" && (
        <div className="space-y-3">
          <p className="text-green-700">Rotation completed successfully.</p>
          <button className="px-3 py-2 bg-gray-200 rounded" onClick={onClose}>Close</button>
        </div>
      )}
      {(step === "error" || error) && (
        <div className="space-y-2">
          <p className="text-red-600 text-sm">An error occurred: {localError || error || "Unknown error"}</p>
          <button className="px-3 py-2 bg-gray-200 rounded" onClick={() => { setLocalError(null); setStep("review"); }}>Back</button>
        </div>
      )}
    </div>
  );
};

export default KeyRotationWizard;

