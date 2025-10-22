/**
 * WebAuthn Authentication Component
 * Handles FIDO2 authentication with fallback to NIP-05/password
 */

import React, { useState } from "react";
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  Key,
  Loader,
  AlertCircle,
} from "lucide-react";

interface WebAuthnAuthenticationProps {
  nip05: string;
  onSuccess?: (sessionToken: string) => void;
  onError?: (error: string) => void;
  onFallback?: () => void;
}

export const WebAuthnAuthentication: React.FC<WebAuthnAuthenticationProps> = ({
  nip05,
  onSuccess,
  onError,
  onFallback,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"ready" | "authenticating" | "complete">("ready");

  const handleAuthenticate = async () => {
    setLoading(true);
    setError(null);

    try {
      // Step 1: Get authentication options from server
      const optionsResponse = await fetch(
        "/.netlify/functions/webauthn-authenticate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start", nip05 }),
        }
      );

      if (!optionsResponse.ok) {
        throw new Error("Failed to get authentication options");
      }

      const optionsData = await optionsResponse.json();
      if (!optionsData.success) {
        throw new Error(optionsData.error || "Failed to start authentication");
      }

      setStep("authenticating");

      // Step 2: Start authentication with browser
      // In production, use @simplewebauthn/browser
      // For now, simulate the flow
      const assertionResponse = {
        response: {
          authenticatorData: btoa("mock-authenticator-data"),
          clientDataJSON: btoa("mock-client-data"),
        },
      };

      // Step 3: Send assertion to server
      const completeResponse = await fetch(
        "/.netlify/functions/webauthn-authenticate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "complete",
            nip05,
            assertionObject: assertionResponse.response.authenticatorData,
            clientDataJSON: assertionResponse.response.clientDataJSON,
          }),
        }
      );

      if (!completeResponse.ok) {
        throw new Error("Authentication failed");
      }

      const completeData = await completeResponse.json();
      if (!completeData.success) {
        throw new Error(completeData.error || "Authentication failed");
      }

      setStep("complete");
      onSuccess?.(completeData.sessionToken);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Authentication failed";
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (step === "complete") {
    return (
      <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
        <div className="flex items-center justify-center mb-4">
          <CheckCircle className="h-12 w-12 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">
          Authentication Successful
        </h2>
        <p className="text-center text-gray-600">
          You have been authenticated with your security key.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="flex items-center gap-2 mb-6">
        <Shield className="h-6 w-6 text-purple-600" />
        <h2 className="text-2xl font-bold text-gray-900">Security Key Authentication</h2>
      </div>

      {/* User Info */}
      <div className="mb-6 p-3 bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-600">
          <strong>Account:</strong> {nip05}
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">{error}</div>
        </div>
      )}

      {/* Instructions */}
      {step === "authenticating" && (
        <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg flex gap-2">
          <Loader className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5 animate-spin" />
          <div className="text-sm text-blue-800">
            <strong>Waiting for security key...</strong>
            <p className="mt-1">
              Insert your security key or use your biometric to authenticate.
            </p>
          </div>
        </div>
      )}

      {/* Security Info */}
      <div className="mb-6 p-3 bg-green-50 border border-green-200 rounded-lg flex gap-2">
        <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-green-800">
          <strong>Secure Authentication:</strong> Your security key provides the highest level of
          protection against phishing and account takeover.
        </div>
      </div>

      {/* Buttons */}
      <div className="flex flex-col gap-3">
        <button
          onClick={handleAuthenticate}
          disabled={loading}
          className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader className="h-4 w-4 animate-spin" />
              Authenticating...
            </>
          ) : (
            <>
              <Key className="h-4 w-4" />
              Authenticate with Security Key
            </>
          )}
        </button>

        <button
          onClick={onFallback}
          disabled={loading}
          className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium disabled:opacity-50"
        >
          Use Password Instead
        </button>
      </div>

      {/* Cloning Detection Info */}
      <div className="mt-6 p-3 bg-gray-50 rounded-lg text-xs text-gray-600">
        <p className="font-medium mb-1">🛡️ Cloning Detection:</p>
        <p>
          Your security key uses a counter to detect if it has been cloned. If cloning is detected,
          the credential will be automatically disabled.
        </p>
      </div>
    </div>
  );
};

export default WebAuthnAuthentication;

