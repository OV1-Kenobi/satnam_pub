// src/components/AuthTestingPanel.tsx
import React, { useState } from "react";
import { Buffer } from "buffer";
import {
  generateSecretKey as generatePrivateKey,
  getPublicKey,
  finalizeEvent as finishEvent,
  nip19,
} from "nostr-tools";

interface TestResult {
  test: string;
  status: "success" | "error" | "pending";
  message: string;
  data?: any;
}

const AuthTestingPanel: React.FC = () => {
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [nwcUri, setNwcUri] = useState("");
  const [testNpub, setTestNpub] = useState("");

  const addResult = (result: TestResult) => {
    setTestResults((prev) => [...prev, result]);
  };

  const clearResults = () => {
    setTestResults([]);
  };

  const runNWCValidationTest = async () => {
    addResult({
      test: "NWC Validation",
      status: "pending",
      message: "Testing NWC URI validation...",
    });

    try {
      const response = await fetch("/api/auth/nwc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nwcUri }),
      });

      const result = await response.json();

      if (result.success) {
        addResult({
          test: "NWC Validation",
          status: "success",
          message: "NWC validation successful",
          data: result.data,
        });
      } else {
        addResult({
          test: "NWC Validation",
          status: "error",
          message: result.error || "NWC validation failed",
        });
      }
    } catch (error) {
      addResult({
        test: "NWC Validation",
        status: "error",
        message: `Network error: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  };

  const runOTPFlowTest = async () => {
    if (!testNpub) {
      addResult({
        test: "OTP Flow",
        status: "error",
        message: "Please enter a test npub",
      });
      return;
    }

    // Step 1: Initiate OTP
    addResult({
      test: "OTP Initiate",
      status: "pending",
      message: "Initiating OTP...",
    });

    try {
      const initiateResponse = await fetch("/api/auth/otp/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ npub: testNpub }),
      });

      const initiateResult = await initiateResponse.json();

      if (initiateResult.success) {
        addResult({
          test: "OTP Initiate",
          status: "success",
          message: "OTP initiated successfully",
          data: initiateResult.data,
        });

        // For testing, we'll use a mock OTP
        const mockOTP = "123456";

        // Step 2: Verify OTP
        addResult({
          test: "OTP Verify",
          status: "pending",
          message: "Verifying OTP...",
        });

        const pubkey = nip19.decode(testNpub).data as string;
        const verifyResponse = await fetch("/api/auth/otp/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pubkey, otp_code: mockOTP }),
        });

        const verifyResult = await verifyResponse.json();

        if (verifyResult.success) {
          addResult({
            test: "OTP Verify",
            status: "success",
            message: "OTP verification successful",
            data: verifyResult.data,
          });
        } else {
          addResult({
            test: "OTP Verify",
            status: "error",
            message: verifyResult.error || "OTP verification failed",
          });
        }
      } else {
        addResult({
          test: "OTP Initiate",
          status: "error",
          message: initiateResult.error || "OTP initiation failed",
        });
      }
    } catch (error) {
      addResult({
        test: "OTP Flow",
        status: "error",
        message: `Network error: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  };

  const runNostrAuthTest = async () => {
    addResult({
      test: "Nostr Auth",
      status: "pending",
      message: "Testing Nostr authentication...",
    });

    try {
      // Generate test keypair
      const privkey = generatePrivateKey();
      const pubkey = getPublicKey(privkey);

      // Create signed event
      const authEvent = finishEvent(
        {
          kind: 1,
          created_at: Math.floor(Date.now() / 1000),
          tags: [],
          content: "Identity Forge Authentication Test",
        },
        privkey,
      );

      const response = await fetch("/api/auth/nostr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedEvent: authEvent }),
      });

      const result = await response.json();

      if (result.success) {
        addResult({
          test: "Nostr Auth",
          status: "success",
          message: "Nostr authentication successful",
          data: {
            npub: nip19.npubEncode(pubkey),
            user_id: result.data.session.user_id,
          },
        });
      } else {
        addResult({
          test: "Nostr Auth",
          status: "error",
          message: result.error || "Nostr authentication failed",
        });
      }
    } catch (error) {
      addResult({
        test: "Nostr Auth",
        status: "error",
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  };

  const runAllTests = async () => {
    setIsRunning(true);
    clearResults();

    await runNostrAuthTest();

    if (nwcUri) {
      await runNWCValidationTest();
    }

    if (testNpub) {
      await runOTPFlowTest();
    }

    setIsRunning(false);
  };

  const generateTestData = () => {
    const privkey = generatePrivateKey();
    const pubkey = getPublicKey(privkey);
    const npub = nip19.npubEncode(pubkey);
    setTestNpub(npub);

    // Example NWC URI format
    const secretHex = Buffer.from(privkey).toString("hex");
    setNwcUri(
      `nostr+walletconnect://${pubkey}?relay=wss://relay.damus.io&secret=${secretHex}`,
    );
  };

  return (
    <div className="bg-gray-900 text-white p-6 rounded-lg">
      <h2 className="text-2xl font-bold mb-6">
        🧪 Authentication Testing Panel
      </h2>

      {/* Test Configuration */}
      <div className="mb-8 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            Test NPub (for OTP testing):
          </label>
          <input
            type="text"
            value={testNpub}
            onChange={(e) => setTestNpub(e.target.value)}
            placeholder="npub1..."
            className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            NWC URI (for NWC testing):
          </label>
          <input
            type="text"
            value={nwcUri}
            onChange={(e) => setNwcUri(e.target.value)}
            placeholder="nostr+walletconnect://..."
            className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white"
          />
        </div>

        <div className="flex space-x-4">
          <button
            onClick={generateTestData}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
          >
            Generate Test Data
          </button>

          <button
            onClick={runAllTests}
            disabled={isRunning}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded"
          >
            {isRunning ? "Running Tests..." : "Run All Tests"}
          </button>

          <button
            onClick={clearResults}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
          >
            Clear Results
          </button>
        </div>
      </div>

      {/* Individual Test Buttons */}
      <div className="mb-6 flex space-x-4">
        <button
          onClick={runNostrAuthTest}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded"
        >
          Test Nostr Auth
        </button>

        <button
          onClick={runNWCValidationTest}
          disabled={!nwcUri}
          className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded"
        >
          Test NWC
        </button>

        <button
          onClick={runOTPFlowTest}
          disabled={!testNpub}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded"
        >
          Test OTP Flow
        </button>
      </div>

      {/* Test Results */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Test Results:</h3>
        {testResults.length === 0 ? (
          <p className="text-gray-400">No tests run yet</p>
        ) : (
          testResults.map((result, index) => (
            <div
              key={index}
              className={`p-3 rounded border-l-4 ${
                result.status === "success"
                  ? "bg-green-900/30 border-green-400"
                  : result.status === "error"
                    ? "bg-red-900/30 border-red-400"
                    : "bg-yellow-900/30 border-yellow-400"
              }`}
            >
              <div className="flex items-center space-x-2">
                <span className="font-medium">{result.test}:</span>
                <span
                  className={
                    result.status === "success"
                      ? "text-green-400"
                      : result.status === "error"
                        ? "text-red-400"
                        : "text-yellow-400"
                  }
                >
                  {result.status.toUpperCase()}
                </span>
              </div>
              <p className="text-sm mt-1">{result.message}</p>
              {result.data && (
                <pre className="text-xs mt-2 bg-gray-800 p-2 rounded overflow-x-auto">
                  {JSON.stringify(result.data, null, 2)}
                </pre>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AuthTestingPanel;
