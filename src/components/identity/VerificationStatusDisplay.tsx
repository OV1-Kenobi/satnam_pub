/**
 * Verification Status Display Component
 * Phase 1: Display hybrid identity verification status and method used
 * Shows which verification method was successful (kind:0, PKARR, or DNS)
 */

import React from "react";
import { CheckCircle, AlertCircle, Clock, Zap } from "lucide-react";

export interface VerificationStatus {
  verified: boolean;
  verificationMethod: "kind:0" | "pkarr" | "dns" | "iroh" | "none";
  nip05?: string;
  pubkey?: string;
  name?: string;
  picture?: string;
  about?: string;
  error?: string;
  verification_timestamp: number;
  response_time_ms: number;
}

interface VerificationStatusDisplayProps {
  status: VerificationStatus;
  showDetails?: boolean;
  compact?: boolean;
}

const methodColors: Record<string, string> = {
  "kind:0": "bg-purple-100 text-purple-800 border-purple-300",
  pkarr: "bg-blue-100 text-blue-800 border-blue-300",
  dns: "bg-amber-100 text-amber-800 border-amber-300",
  iroh: "bg-green-100 text-green-800 border-green-300",
  none: "bg-gray-100 text-gray-800 border-gray-300",
};

const methodIcons: Record<string, React.ReactNode> = {
  "kind:0": <Zap className="w-4 h-4" />,
  pkarr: <Zap className="w-4 h-4" />,
  dns: <Clock className="w-4 h-4" />,
  iroh: <Zap className="w-4 h-4" />,
  none: <AlertCircle className="w-4 h-4" />,
};

const methodLabels: Record<string, string> = {
  "kind:0": "Nostr Metadata",
  pkarr: "BitTorrent DHT",
  dns: "DNS (NIP-05)",
  iroh: "Iroh DHT",
  none: "Not Verified",
};

export const VerificationStatusDisplay: React.FC<
  VerificationStatusDisplayProps
> = ({ status, showDetails = true, compact = false }) => {
  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString();
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {status.verified ? (
          <CheckCircle className="w-5 h-5 text-green-600" />
        ) : (
          <AlertCircle className="w-5 h-5 text-red-600" />
        )}
        <span className="text-sm font-medium">
          {status.verified ? "Verified" : "Not Verified"}
        </span>
        <span
          className={`text-xs px-2 py-1 rounded border ${methodColors[status.verificationMethod]
            }`}
        >
          {methodLabels[status.verificationMethod]}
        </span>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {status.verified ? (
            <CheckCircle className="w-6 h-6 text-green-600" />
          ) : (
            <AlertCircle className="w-6 h-6 text-red-600" />
          )}
          <div>
            <h3 className="font-semibold text-gray-900">
              {status.verified ? "Identity Verified" : "Verification Failed"}
            </h3>
            <p className="text-sm text-gray-600">
              {status.verified
                ? "Your identity has been successfully verified"
                : status.error || "Unable to verify identity"}
            </p>
          </div>
        </div>
      </div>

      {/* Verification Method Badge */}
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">
            Verification Method:
          </span>
          <div
            className={`flex items-center gap-2 px-3 py-1 rounded-full border ${methodColors[status.verificationMethod]
              }`}
          >
            {methodIcons[status.verificationMethod]}
            <span className="text-sm font-medium">
              {methodLabels[status.verificationMethod]}
            </span>
          </div>
        </div>
      </div>

      {/* Details Section */}
      {showDetails && (
        <div className="space-y-3 border-t border-gray-200 pt-4">
          {/* NIP-05 */}
          {status.nip05 && (
            <div className="flex justify-between items-start">
              <span className="text-sm text-gray-600">NIP-05:</span>
              <span className="text-sm font-mono text-gray-900">
                {status.nip05}
              </span>
            </div>
          )}

          {/* Pubkey */}
          {status.pubkey && (
            <div className="flex justify-between items-start">
              <span className="text-sm text-gray-600">Pubkey:</span>
              <span className="text-sm font-mono text-gray-900 truncate max-w-xs">
                {status.pubkey.substring(0, 16)}...
              </span>
            </div>
          )}

          {/* Name */}
          {status.name && (
            <div className="flex justify-between items-start">
              <span className="text-sm text-gray-600">Name:</span>
              <span className="text-sm text-gray-900">{status.name}</span>
            </div>
          )}

          {/* About */}
          {status.about && (
            <div className="flex justify-between items-start">
              <span className="text-sm text-gray-600">About:</span>
              <span className="text-sm text-gray-900 line-clamp-2">
                {status.about}
              </span>
            </div>
          )}

          {/* Timestamp */}
          <div className="flex justify-between items-start">
            <span className="text-sm text-gray-600">Verified At:</span>
            <span className="text-sm text-gray-900">
              {formatTimestamp(status.verification_timestamp)}
            </span>
          </div>

          {/* Response Time */}
          <div className="flex justify-between items-start">
            <span className="text-sm text-gray-600">Response Time:</span>
            <span className="text-sm text-gray-900">
              {status.response_time_ms}ms
            </span>
          </div>

          {/* Error Message */}
          {status.error && !status.verified && (
            <div className="bg-red-50 border border-red-200 rounded p-3 mt-4">
              <p className="text-sm text-red-800">{status.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VerificationStatusDisplay;

