/**
 * NSEC Session Creator Component
 * 
 * Simple component to manually create NSEC sessions for testing
 * the hybrid message signing system. This allows users to create
 * session-based signing capabilities without full authentication flow.
 * 
 * WARNING: This is for testing purposes only. In production,
 * NSEC sessions should be created automatically during authentication.
 */

import React, { useState } from 'react';
import { nsecSessionBridge } from '../../lib/auth/nsec-session-bridge';
import { hybridMessageSigning } from '../../lib/messaging/hybrid-message-signing';

export const NSECSessionCreator: React.FC = () => {
  const [nsecInput, setNsecInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<any>(null);

  const createSession = async () => {
    if (!nsecInput.trim()) {
      setError('Please enter an nsec');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Validate nsec format (basic check)
      if (!nsecInput.startsWith('nsec1') && !nsecInput.match(/^[0-9a-f]{64}$/i)) {
        throw new Error('Invalid nsec format. Must be nsec1... or 64-character hex string');
      }

      // Convert nsec1 to hex if needed
      let nsecHex = nsecInput;
      if (nsecInput.startsWith('nsec1')) {
        // In a real implementation, you'd use proper bech32 decoding
        // For testing, we'll just use the input as-is
        console.log('🔐 NSECSessionCreator: Using nsec1 format (would need proper decoding in production)');
      }

      // Create NSEC session
      const newSessionId = await nsecSessionBridge.initializeAfterAuth(nsecHex, {
        duration: 15 * 60 * 1000, // 15 minutes
        maxOperations: 50
      });

      if (newSessionId) {
        setSessionId(newSessionId);
        setError(null);
        
        // Update session status
        const status = nsecSessionBridge.getSessionStatus();
        setSessionStatus(status);
        
        console.log('🔐 NSECSessionCreator: Session created successfully:', newSessionId);
      } else {
        throw new Error('Failed to create NSEC session');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('🔐 NSECSessionCreator: Error creating session:', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const clearSession = () => {
    nsecSessionBridge.clearSession();
    setSessionId(null);
    setSessionStatus(null);
    setError(null);
    console.log('🔐 NSECSessionCreator: Session cleared');
  };

  const checkStatus = async () => {
    const status = nsecSessionBridge.getSessionStatus();
    setSessionStatus(status);
    
    // Also check signing methods
    const methods = await hybridMessageSigning.getAvailableSigningMethods();
    const sessionMethod = methods.find(m => m.id === 'session');
    
    console.log('🔐 NSECSessionCreator: Current status:', {
      bridgeStatus: status,
      sessionMethodAvailable: sessionMethod?.available
    });
  };

  const generateTestNsec = () => {
    // Generate a test nsec (NOT for production use)
    const testNsec = Array.from({ length: 64 }, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
    
    setNsecInput(testNsec);
    setError('⚠️ Test nsec generated - DO NOT use in production!');
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-xl font-bold text-gray-900 mb-4">
        🔐 NSEC Session Creator (Testing)
      </h2>
      
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <div className="flex items-start">
          <span className="text-yellow-600 mr-2">⚠️</span>
          <div className="text-sm text-yellow-800">
            <p className="font-medium mb-1">Testing Tool Only</p>
            <p>This component is for testing hybrid message signing. In production, NSEC sessions are created automatically during authentication.</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            NSEC (Private Key)
          </label>
          <div className="flex space-x-2">
            <input
              type="password"
              value={nsecInput}
              onChange={(e) => setNsecInput(e.target.value)}
              placeholder="nsec1... or 64-character hex string"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={generateTestNsec}
              className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              Generate Test
            </button>
          </div>
          {error && (
            <p className="mt-1 text-sm text-red-600">{error}</p>
          )}
        </div>

        <div className="flex space-x-3">
          <button
            onClick={createSession}
            disabled={loading || !nsecInput.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Create NSEC Session'}
          </button>
          
          <button
            onClick={clearSession}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Clear Session
          </button>
          
          <button
            onClick={checkStatus}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            Check Status
          </button>
        </div>

        {sessionId && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start">
              <span className="text-green-600 mr-2">✅</span>
              <div className="text-sm text-green-800">
                <p className="font-medium mb-1">Session Created Successfully</p>
                <p className="font-mono text-xs break-all">Session ID: {sessionId}</p>
              </div>
            </div>
          </div>
        )}

        {sessionStatus && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-medium text-blue-900 mb-2">Session Status</h3>
            <div className="text-sm text-blue-800 space-y-1">
              <div className="flex justify-between">
                <span>Has Session:</span>
                <span className={sessionStatus.hasSession ? 'text-green-600' : 'text-red-600'}>
                  {sessionStatus.hasSession ? '✅ Yes' : '❌ No'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Can Sign:</span>
                <span className={sessionStatus.canSign ? 'text-green-600' : 'text-red-600'}>
                  {sessionStatus.canSign ? '✅ Yes' : '❌ No'}
                </span>
              </div>
              {sessionStatus.sessionId && (
                <div className="mt-2">
                  <span className="font-medium">Session ID:</span>
                  <p className="font-mono text-xs break-all mt-1">{sessionStatus.sessionId}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 text-xs text-gray-500">
        <p><strong>Next Steps:</strong></p>
        <ol className="list-decimal list-inside space-y-1 mt-1">
          <li>Create an NSEC session using this tool</li>
          <li>Use the HybridSigningTest component to test message signing</li>
          <li>Check browser console for detailed debug logs</li>
          <li>Session will expire after 15 minutes</li>
        </ol>
      </div>
    </div>
  );
};

export default NSECSessionCreator;
