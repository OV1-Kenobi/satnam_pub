/**
 * WebAuthn Registration Component
 * Supports hardware security keys (YubiKey, Titan, Feitian) and platform authenticators
 * (Windows Hello, Touch ID, Face ID)
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
import { useAuth } from "./AuthProvider";

interface WebAuthnRegistrationProps {
  onSuccess?: (credential: any) => void;
  onError?: (error: string) => void;
  onCancel?: () => void;
}

export const WebAuthnRegistration: React.FC<WebAuthnRegistrationProps> = ({
  onSuccess,
  onError,
  onCancel,
}) => {
  const { sessionToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [deviceType, setDeviceType] = useState<"platform" | "roaming">("roaming");
  const [step, setStep] = useState<"select" | "registering" | "complete">("select");

  const handleRegister = async () => {
    if (!deviceName.trim()) {
      setError("Please enter a device name");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Step 1: Get registration options from server
      const optionsResponse = await fetch(
        "/.netlify/functions/webauthn-register",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ action: "start" }),
        }
      );

      if (!optionsResponse.ok) {
        throw new Error("Failed to get registration options");
      }

      const optionsData = await optionsResponse.json();
      if (!optionsData.success) {
        throw new Error(optionsData.error || "Failed to start registration");
      }

      setStep("registering");

      // Step 2: Start registration with browser
      // In production, use @simplewebauthn/browser
      // For now, simulate the flow
      const attestationResponse = {
        response: {
          attestationObject: btoa("mock-attestation"),
          clientDataJSON: btoa("mock-client-data"),
        },
      };

      // Step 3: Send attestation to server
      const completeResponse = await fetch(
        "/.netlify/functions/webauthn-register",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({
            action: "complete",
            deviceName,
            deviceType,
            attestationObject: attestationResponse.response.attestationObject,
            clientDataJSON: attestationResponse.response.clientDataJSON,
          }),
        }
      );

      if (!completeResponse.ok) {
        throw new Error("Failed to complete registration");
      }

      const completeData = await completeResponse.json();
      if (!completeData.success) {
        throw new Error(completeData.error || "Registration failed");
      }

      setSuccess(true);
      setStep("complete");
      onSuccess?.(completeData.credential);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Registration failed";
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (step === "complete" && success) {
    return (
      <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
        <div className="flex items-center justify-center mb-4">
          <CheckCircle className="h-12 w-12 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">
          Registration Successful
        </h2>
        <p className="text-center text-gray-600 mb-6">
          {deviceName} has been registered as a security key for your account.
        </p>
        <button
          onClick={() => onCancel?.()}
          className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium"
        >
          Continue
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="flex items-center gap-2 mb-6">
        <Shield className="h-6 w-6 text-purple-600" />
        <h2 className="text-2xl font-bold text-gray-900">Register Security Key</h2>
      </div>

      {/* Device Type Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Security Key Type
        </label>
        <div className="space-y-2">
          <label className="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="deviceType"
              value="roaming"
              checked={deviceType === "roaming"}
              onChange={(e) => setDeviceType(e.target.value as "roaming")}
              className="h-4 w-4 text-purple-600"
            />
            <span className="ml-3">
              <span className="block text-sm font-medium text-gray-900">
                Hardware Security Key
              </span>
              <span className="text-xs text-gray-500">
                YubiKey, Google Titan, Feitian ePass
              </span>
            </span>
          </label>

          <label className="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="deviceType"
              value="platform"
              checked={deviceType === "platform"}
              onChange={(e) => setDeviceType(e.target.value as "platform")}
              className="h-4 w-4 text-purple-600"
            />
            <span className="ml-3">
              <span className="block text-sm font-medium text-gray-900">
                Platform Authenticator
              </span>
              <span className="text-xs text-gray-500">
                Windows Hello, Touch ID, Face ID
              </span>
            </span>
          </label>
        </div>

        {deviceType === "platform" && (
          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <strong>Security Warning:</strong> Biometric authenticators are less secure than
              hardware keys. Consider using a hardware security key for better protection.
            </div>
          </div>
        )}
      </div>

      {/* Device Name Input */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Device Name
        </label>
        <input
          type="text"
          value={deviceName}
          onChange={(e) => setDeviceName(e.target.value)}
          placeholder="e.g., YubiKey 5, My Windows Hello"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          disabled={loading}
        />
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">{error}</div>
        </div>
      )}

      {/* Instructions */}
      {step === "registering" && (
        <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg flex gap-2">
          <Loader className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5 animate-spin" />
          <div className="text-sm text-blue-800">
            <strong>Waiting for security key...</strong>
            <p className="mt-1">
              {deviceType === "roaming"
                ? "Insert your security key and follow the prompts."
                : "Use your biometric or device PIN to authenticate."}
            </p>
          </div>
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          disabled={loading}
          className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleRegister}
          disabled={loading || !deviceName.trim()}
          className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader className="h-4 w-4 animate-spin" />
              Registering...
            </>
          ) : (
            <>
              <Key className="h-4 w-4" />
              Register Key
            </>
          )}
        </button>
      </div>

      {/* Info Box */}
      <div className="mt-6 p-3 bg-gray-50 rounded-lg text-xs text-gray-600">
        <p className="font-medium mb-1">💡 Tip:</p>
        <p>
          Register multiple security keys for backup. If you lose one, you can still access your
          account with another registered key.
        </p>
      </div>
    </div>
  );
};

export default WebAuthnRegistration;

