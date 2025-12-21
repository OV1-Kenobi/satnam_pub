/**
 * Orphans Tab Component
 * Orphaned NIP-05 detection and cleanup - Platform Admin only
 * @module OrphansTab
 */

import { AlertTriangle, Loader2, Search, Trash2 } from "lucide-react";
import React, { useCallback, useState } from "react";

interface OrphanRecord {
  nip05_duid: string;
  identifier: string;
  domain: string;
  npub: string;
  created_at: string;
  reason: string;
}

interface OrphansTabProps {
  sessionToken: string | null;
}

export const OrphansTab: React.FC<OrphansTabProps> = ({ sessionToken }) => {
  const [orphans, setOrphans] = useState<OrphanRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [hasScanned, setHasScanned] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [domainFilter, setDomainFilter] = useState("");

  const scanForOrphans = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    setError(null);
    setHasScanned(true);
    try {
      const response = await fetch("/api/admin/account-control", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "scan_orphans",
          domain_filter: domainFilter.trim() || undefined,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Scan failed");
      }
      const data = await response.json();
      setOrphans(data.data?.orphans || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
      setOrphans([]);
    } finally {
      setLoading(false);
    }
  }, [sessionToken, domainFilter]);

  const cleanupOrphans = useCallback(async () => {
    if (!sessionToken || orphans.length === 0) return;

    // Confirmation dialog for destructive operations
    if (!dryRun) {
      const confirmed = window.confirm(
        `Are you sure you want to permanently delete ${orphans.length} orphaned record(s)? This action cannot be undone.`
      );
      if (!confirmed) return;
    }

    setCleaning(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch("/api/admin/account-control", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "cleanup_orphans",
          dry_run: dryRun,
          orphan_ids: orphans.map((o) => o.nip05_duid),
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Cleanup failed");
      }
      if (!dryRun) {
        setSuccessMessage(
          `Successfully cleaned up ${orphans.length} orphaned record(s)`
        );
        // Delay clearing to show success state
        setTimeout(() => {
          setOrphans([]);
          setHasScanned(false);
          setSuccessMessage(null);
        }, 2000);
      } else {
        setSuccessMessage(
          "Dry run completed successfully - no records were deleted"
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cleanup failed");
    } finally {
      setCleaning(false);
    }
  }, [sessionToken, orphans, dryRun]);

  return (
    <div className="space-y-6">
      {/* Scan Controls */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Orphan Detection</h3>
        <p className="text-gray-600 mb-4">
          Scan for NIP-05 records that reference non-existent user identities.
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <input type="text" value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)}
              placeholder="Filter by domain (optional)"
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500" />
          </div>
          <button onClick={scanForOrphans} disabled={loading}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center space-x-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span>Scan for Orphans</span>
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center space-x-3">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Success Message Display */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center space-x-3">
          <svg
            className="h-5 w-5 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          <p className="text-green-800">{successMessage}</p>
        </div>
      )}

      {/* Results */}
      {hasScanned && !loading && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              {orphans.length} Orphan{orphans.length !== 1 ? "s" : ""} Found
            </h3>
            {orphans.length > 0 && (
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)}
                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500" />
                  <span className="text-sm text-gray-600">Dry Run</span>
                </label>
                <button onClick={cleanupOrphans} disabled={cleaning}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center space-x-2">
                  {cleaning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  <span>{dryRun ? "Preview Cleanup" : "Cleanup Orphans"}</span>
                </button>
              </div>
            )}
          </div>
          {orphans.length === 0 ? (
            <div className="text-center py-8 bg-green-50 rounded-lg">
              <p className="text-green-800">No orphaned records found</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {orphans.map((orphan) => (
                <div key={orphan.nip05_duid} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{orphan.identifier}@{orphan.domain}</p>
                      <p className="text-sm text-gray-500 font-mono truncate">{orphan.npub}</p>
                      <p className="text-sm text-red-600 mt-1">{orphan.reason}</p>
                    </div>
                    <p className="text-sm text-gray-500">{new Date(orphan.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default OrphansTab;
