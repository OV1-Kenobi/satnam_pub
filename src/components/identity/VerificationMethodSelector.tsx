/**
 * Verification Method Selector Component
 * Phase 1: Allow users to manually select verification method
 * Provides UI for choosing between kind:0, PKARR, and DNS verification
 */

import React, { useState } from "react";
import { Zap, Clock, AlertCircle, CheckCircle } from "lucide-react";

export type VerificationMethod = "kind:0" | "pkarr" | "dns" | "auto";

interface VerificationMethodOption {
  id: VerificationMethod;
  label: string;
  description: string;
  icon: React.ReactNode;
  pros: string[];
  cons: string[];
  recommended?: boolean;
}

interface VerificationMethodSelectorProps {
  selectedMethod: VerificationMethod;
  onMethodChange: (method: VerificationMethod) => void;
  enabledMethods?: VerificationMethod[];
  loading?: boolean;
  disabled?: boolean;
}

const methodOptions: VerificationMethodOption[] = [
  {
    id: "auto",
    label: "Automatic (Recommended)",
    description: "Try kind:0 → PKARR → DNS in order",
    icon: <Zap className="w-5 h-5" />,
    pros: [
      "Most reliable",
      "Fastest available method",
      "Decentralized when possible",
    ],
    cons: ["May take longer if first methods fail"],
    recommended: true,
  },
  {
    id: "kind:0",
    label: "Nostr Metadata (kind:0)",
    description: "Verify via Nostr relay metadata events",
    icon: <Zap className="w-5 h-5" />,
    pros: [
      "Fully decentralized",
      "User-controlled",
      "Fastest if available",
    ],
    cons: ["Requires published kind:0 event", "Relay dependent"],
  },
  {
    id: "pkarr",
    label: "BitTorrent DHT (PKARR)",
    description: "Verify via decentralized DHT records",
    icon: <Zap className="w-5 h-5" />,
    pros: ["Decentralized", "No DNS required", "Censorship resistant"],
    cons: ["Requires DHT record", "Slower than kind:0"],
  },
  {
    id: "dns",
    label: "DNS (NIP-05)",
    description: "Traditional DNS-based verification",
    icon: <Clock className="w-5 h-5" />,
    pros: ["Most compatible", "Widely supported", "Fast"],
    cons: ["Centralized", "DNS dependent", "Requires domain control"],
  },
];

export const VerificationMethodSelector: React.FC<
  VerificationMethodSelectorProps
> = ({
  selectedMethod,
  onMethodChange,
  enabledMethods = ["auto", "kind:0", "pkarr", "dns"],
  loading = false,
  disabled = false,
}) => {
  const [expandedMethod, setExpandedMethod] = useState<VerificationMethod | null>(
    null
  );

  const availableMethods = methodOptions.filter((m) =>
    enabledMethods.includes(m.id)
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Verification Method
        </h3>
        <p className="text-sm text-gray-600">
          Choose how you want your identity to be verified
        </p>
      </div>

      {/* Method Options */}
      <div className="space-y-3">
        {availableMethods.map((method) => (
          <div key={method.id}>
            {/* Method Card */}
            <button
              onClick={() => {
                onMethodChange(method.id);
                setExpandedMethod(
                  expandedMethod === method.id ? null : method.id
                );
              }}
              disabled={disabled || loading}
              className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                selectedMethod === method.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              } ${disabled || loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  {/* Icon */}
                  <div className="text-gray-600 mt-1">{method.icon}</div>

                  {/* Content */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-gray-900">
                        {method.label}
                      </h4>
                      {method.recommended && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {method.description}
                    </p>
                  </div>
                </div>

                {/* Radio Button */}
                <div className="ml-4">
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      selectedMethod === method.id
                        ? "border-blue-500 bg-blue-500"
                        : "border-gray-300"
                    }`}
                  >
                    {selectedMethod === method.id && (
                      <CheckCircle className="w-4 h-4 text-white" />
                    )}
                  </div>
                </div>
              </div>
            </button>

            {/* Expanded Details */}
            {expandedMethod === method.id && (
              <div className="mt-2 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                {/* Pros */}
                <div>
                  <h5 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Advantages
                  </h5>
                  <ul className="space-y-1">
                    {method.pros.map((pro, idx) => (
                      <li key={idx} className="text-sm text-gray-700">
                        • {pro}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Cons */}
                <div>
                  <h5 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    Considerations
                  </h5>
                  <ul className="space-y-1">
                    {method.cons.map((con, idx) => (
                      <li key={idx} className="text-sm text-gray-700">
                        • {con}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
        <p className="text-sm text-blue-900">
          <strong>Tip:</strong> Automatic mode is recommended for most users as
          it will try the fastest available method first.
        </p>
      </div>
    </div>
  );
};

export default VerificationMethodSelector;

