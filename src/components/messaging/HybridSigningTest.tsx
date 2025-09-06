/**
 * Hybrid Signing Test Component
 * 
 * Simple test component to verify the hybrid message signing flow.
 * This component can be used to debug and test the signing process
 * without requiring a full messaging UI.
 */

import React, { useState } from 'react';
import { nsecSessionBridge } from '../../lib/auth/nsec-session-bridge';
import { clientMessageService } from '../../lib/messaging/client-message-service';
import { hybridMessageSigning } from '../../lib/messaging/hybrid-message-signing';

export const HybridSigningTest: React.FC = () => {
  const [testResult, setTestResult] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [availableMethods, setAvailableMethods] = useState<any[]>([]);

  const testHybridSigning = async () => {
    setLoading(true);
    setTestResult('🔐 Starting hybrid signing test...\n');

    try {
      // Step 1: Check available signing methods
      const methods = await hybridMessageSigning.getAvailableSigningMethods();
      setAvailableMethods(methods);

      let result = '🔐 Available signing methods:\n';
      methods.forEach(method => {
        result += `  - ${method.name}: ${method.available ? '✅ Available' : '❌ Unavailable'} (${method.securityLevel})\n`;
      });
      result += '\n';

      // Step 2: Test session availability specifically
      const sessionStatus = nsecSessionBridge.getSessionStatus();
      result += `🔐 Session Bridge Status:\n`;
      result += `  Has Session: ${sessionStatus.hasSession ? '✅ Yes' : '❌ No'}\n`;
      result += `  Can Sign: ${sessionStatus.canSign ? '✅ Yes' : '❌ No'}\n`;
      if (sessionStatus.sessionId) {
        result += `  Session ID: ${sessionStatus.sessionId.substring(0, 8)}...\n`;
      }
      result += '\n';

      // Step 3: Test message creation and signing
      const testMessage = {
        recipient: 'npub1test123456789abcdef', // Test recipient
        content: 'Test message from hybrid signing system',
        messageType: 'direct' as const,
        encryptionLevel: 'maximum' as const,
        communicationType: 'private' as const
      };

      result += '🔐 Testing message signing with test data...\n';
      result += `  Recipient: ${testMessage.recipient}\n`;
      result += `  Content: ${testMessage.content}\n`;
      result += `  Encryption: ${testMessage.encryptionLevel}\n\n`;

      // Step 4: Attempt to send message
      result += '🔐 Attempting to send message via ClientMessageService...\n';
      setTestResult(result);

      const sendResult = await clientMessageService.sendGiftWrappedMessage(testMessage);

      result += `🔐 Send result: ${sendResult.success ? '✅ SUCCESS' : '❌ FAILED'}\n`;
      if (sendResult.success) {
        result += `  Message ID: ${sendResult.messageId}\n`;
        result += `  Signing Method: ${sendResult.signingMethod}\n`;
        result += `  Security Level: ${sendResult.securityLevel}\n`;
        result += `  User Message: ${sendResult.userMessage}\n`;
      } else {
        result += `  Error: ${sendResult.error}\n`;
        result += `  User Message: ${sendResult.userMessage}\n`;
        if (sendResult.signingMethod) {
          result += `  Failed Method: ${sendResult.signingMethod}\n`;
        }
      }

      setTestResult(result);

    } catch (error) {
      const errorResult = testResult + `\n❌ Test failed with error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      setTestResult(errorResult);
    } finally {
      setLoading(false);
    }
  };

  const testSigningMethodsOnly = async () => {
    setLoading(true);
    setTestResult('🔐 Testing signing methods availability...\n');

    try {
      const methods = await hybridMessageSigning.getAvailableSigningMethods();
      setAvailableMethods(methods);

      let result = '🔐 Signing Methods Status:\n\n';

      methods.forEach((method, index) => {
        result += `${index + 1}. ${method.name}\n`;
        result += `   Status: ${method.available ? '✅ Available' : '❌ Unavailable'}\n`;
        result += `   Security: ${method.securityLevel}\n`;
        result += `   Description: ${method.description}\n`;
        if (method.requiresExtension) {
          result += `   Requires: Browser extension\n`;
        }
        if (method.requiresAuthentication) {
          result += `   Requires: User authentication\n`;
        }
        if (method.comingSoon) {
          result += `   Status: Coming soon\n`;
        }
        result += '\n';
      });

      const hasAvailable = await hybridMessageSigning.hasAvailableSigningMethod();
      result += `🔐 Has available signing method: ${hasAvailable ? '✅ YES' : '❌ NO'}\n`;

      if (!hasAvailable) {
        result += '\n💡 Recommendations:\n';
        result += '  - Install a NIP-07 browser extension (e.g., Alby, nos2x)\n';
        result += '  - Sign in to create a secure session\n';
      }

      setTestResult(result);

    } catch (error) {
      setTestResult(`❌ Failed to check signing methods: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const clearResults = () => {
    setTestResult('');
    setAvailableMethods([]);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">
        🔐 Hybrid Message Signing Test
      </h2>

      <div className="space-y-4 mb-6">
        <div className="flex space-x-4">
          <button
            onClick={testSigningMethodsOnly}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Testing...' : 'Test Signing Methods'}
          </button>

          <button
            onClick={testHybridSigning}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Testing...' : 'Test Full Message Flow'}
          </button>

          <button
            onClick={clearResults}
            disabled={loading}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear Results
          </button>
        </div>

        {availableMethods.length > 0 && (
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-medium text-blue-900 mb-2">Quick Status:</h3>
            <div className="flex space-x-4 text-sm">
              {availableMethods.map(method => (
                <div key={method.id} className={`flex items-center space-x-1 ${method.available ? 'text-green-600' : 'text-gray-500'
                  }`}>
                  <span className={`w-2 h-2 rounded-full ${method.available ? 'bg-green-500' : 'bg-gray-400'
                    }`}></span>
                  <span>{method.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {testResult && (
        <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm whitespace-pre-wrap max-h-96 overflow-y-auto">
          {testResult}
        </div>
      )}

      {!testResult && (
        <div className="bg-gray-50 p-8 rounded-lg text-center text-gray-500">
          <p className="mb-2">Click a test button to verify the hybrid signing implementation.</p>
          <p className="text-sm">This will help debug any issues with the signing flow.</p>
        </div>
      )}

      <div className="mt-6 text-xs text-gray-500">
        <p><strong>Test Signing Methods:</strong> Checks which signing methods are available</p>
        <p><strong>Test Full Message Flow:</strong> Attempts to create, sign, and send a test message</p>
        <p><strong>Debug Info:</strong> Check browser console for detailed debug logs</p>
      </div>
    </div>
  );
};

export default HybridSigningTest;
