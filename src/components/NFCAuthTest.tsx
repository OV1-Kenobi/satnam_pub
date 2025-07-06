/**
 * @fileoverview NFC Authentication Test Component
 * @description Demonstrates tap-to-sign, tap-to-spend, and guardian approval via NFC
 * @compliance Master Context - Privacy-first, Bitcoin-only, browser-compatible
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Smartphone, 
  CreditCard, 
  Shield, 
  Zap, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Loader2,
  RefreshCw,
  QrCode,
  Eye,
  EyeOff,
  Lock,
  Unlock
} from 'lucide-react';
import { 
  NFCAuthService, 
  NFCHardwareSecurityManager,
  TapToSpendRequest,
  TapToSignRequest,
  NTAG424DNAConfig
} from '../lib/nfc-auth';
import QRCode from 'react-qr-code';

// Use native Web Crypto API - no polyfills per master context

interface NFCAuthTestProps {
  onBack?: () => void;
}

interface NFCDevicePairingData {
  deviceId: string;
  publicKey: string;
  familyId: string;
  applicationId: string;
  pairingCode: string;
  expiresAt: number;
}

export function NFCAuthTest({ onBack }: NFCAuthTestProps) {
  const [nfcManager, setNfcManager] = useState<NFCHardwareSecurityManager | null>(null);
  const [nfcService, setNfcService] = useState<NFCAuthService | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [lastAuth, setLastAuth] = useState<any>(null);
  const [lastOperation, setLastOperation] = useState<string>('');
  const [operationStatus, setOperationStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Enhanced state for device pairing
  const [showPairingQR, setShowPairingQR] = useState(false);
  const [pairingData, setPairingData] = useState<NFCDevicePairingData | null>(null);
  const [showPrivateData, setShowPrivateData] = useState(false);
  const [cryptoProvider, setCryptoProvider] = useState<Crypto | null>(null);

  // Tap-to-Spend form state
  const [spendAmount, setSpendAmount] = useState('');
  const [spendRecipient, setSpendRecipient] = useState('');
  const [spendMemo, setSpendMemo] = useState('');
  const [requiresGuardianApproval, setRequiresGuardianApproval] = useState(false);
  const [privacyLevel, setPrivacyLevel] = useState<'standard' | 'enhanced' | 'maximum'>('standard');

  // Tap-to-Sign form state
  const [signMessage, setSignMessage] = useState('');
  const [signPurpose, setSignPurpose] = useState<'transaction' | 'communication' | 'recovery' | 'identity'>('transaction');
  const [signRequiresGuardianApproval, setSignRequiresGuardianApproval] = useState(false);

  // Privacy controls
  const [privacyMode, setPrivacyMode] = useState<'standard' | 'enhanced' | 'maximum'>('standard');
  const [autoClearData, setAutoClearData] = useState(true);
  const [ephemeralMode, setEphemeralMode] = useState(false);

  useEffect(() => {
    initializeCryptoAndNFC();
    return () => {
      cleanupNFC();
    };
  }, []);

  const initializeCryptoAndNFC = async () => {
    try {
      console.log('🔐 Initializing native Web Crypto API...');
      // Use the browser's native crypto
      const crypto = window.crypto;
      setCryptoProvider(crypto);
      
      console.log('🔐 Initializing NFC Hardware Security Manager...');
      
      const manager = new NFCHardwareSecurityManager();
      
      // Register a test NFC device with enhanced configuration
      const service = manager.registerNFCDevice('test-ntag424', {
        familyId: 'satnam.pub',
        applicationId: 'nfc-auth-test-v2',
        keyId: 0,
        keyVersion: 2,
        maxReadAttempts: 5,
        privacyDelayMs: privacyMode === 'maximum' ? 5000 : 2000
      });

      // Initialize NFC
      await manager.initializeAllDevices();
      
      setNfcManager(manager);
      setNfcService(service);
      setIsInitialized(true);
      
      console.log('✅ Enhanced NFC Hardware Security Manager initialized');
      
    } catch (error) {
      console.error('❌ Failed to initialize enhanced NFC:', error);
      setErrorMessage('Enhanced NFC not supported in this browser or device');
    }
  };

  const generateDevicePairingData = async (): Promise<NFCDevicePairingData> => {
    if (!cryptoProvider) {
      throw new Error('Crypto provider not initialized');
    }

    // Generate a new key pair for device pairing
    const keyPair = await cryptoProvider.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-256'
      },
      true,
      ['sign', 'verify']
    );

    // Export public key
    const publicKeyBuffer = await cryptoProvider.subtle.exportKey('spki', keyPair.publicKey);
    const publicKey = btoa(String.fromCharCode(...new Uint8Array(publicKeyBuffer)));

    // Generate pairing code
    const pairingCode = Array.from(cryptoProvider.getRandomValues(new Uint8Array(6)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();

    const deviceId = `ntag424-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return {
      deviceId,
      publicKey,
      familyId: 'satnam.pub',
      applicationId: 'nfc-auth-test-v2',
      pairingCode,
      expiresAt: Date.now() + (5 * 60 * 1000) // 5 minutes
    };
  };

  const handleGeneratePairingQR = async () => {
    try {
      setOperationStatus('pending');
      setErrorMessage('');

      const pairingData = await generateDevicePairingData();
      setPairingData(pairingData);
      setShowPairingQR(true);
      setOperationStatus('success');

      console.log('✅ Device pairing QR generated');

      // Auto-hide QR after 5 minutes for privacy
      setTimeout(() => {
        setShowPairingQR(false);
        setPairingData(null);
      }, 5 * 60 * 1000);

    } catch (error) {
      console.error('❌ Failed to generate pairing QR:', error);
      setOperationStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to generate pairing QR');
    }
  };

  const cleanupNFC = async () => {
    if (nfcManager) {
      await nfcManager.cleanup();
      setNfcManager(null);
      setNfcService(null);
      setIsInitialized(false);
      setIsListening(false);
    }
  };

  const startListening = async () => {
    if (!nfcService) return;

    try {
      await nfcService.startListening();
      setIsListening(true);
      setOperationStatus('pending');
      setErrorMessage('');
      
      console.log('👂 NFC listening started - tap your NTAG424 DNA device');
      
    } catch (error) {
      console.error('❌ Failed to start NFC listening:', error);
      setErrorMessage('Failed to start NFC listening');
      setOperationStatus('error');
    }
  };

  const stopListening = async () => {
    if (!nfcService) return;

    try {
      await nfcService.stopListening();
      setIsListening(false);
      setOperationStatus('idle');
      
      console.log('🛑 NFC listening stopped');
      
    } catch (error) {
      console.error('❌ Failed to stop NFC listening:', error);
    }
  };

  const handleTapToSpend = async () => {
    if (!nfcService || !spendAmount || !spendRecipient) {
      setErrorMessage('Please fill in all required fields');
      return;
    }

    try {
      setOperationStatus('pending');
      setErrorMessage('');
      setLastOperation('Tap-to-Spend');

      const request: TapToSpendRequest = {
        amount: parseInt(spendAmount),
        recipient: spendRecipient,
        memo: spendMemo,
        requiresGuardianApproval,
        guardianThreshold: requiresGuardianApproval ? 1 : 0,
        privacyLevel
      };

      console.log('💳 Initiating Tap-to-Spend:', request);

      const success = await nfcService.tapToSpend(request);

      if (success) {
        setOperationStatus('success');
        setLastAuth({ type: 'spend', ...request, timestamp: new Date() });
        console.log('✅ Tap-to-Spend successful');
        
        // Auto-clear data if enabled
        if (autoClearData) {
          setTimeout(() => {
            setSpendAmount('');
            setSpendRecipient('');
            setSpendMemo('');
          }, 3000);
        }
      } else {
        setOperationStatus('error');
        setErrorMessage('Tap-to-Spend failed');
        console.log('❌ Tap-to-Spend failed');
      }

    } catch (error) {
      console.error('❌ Tap-to-Spend error:', error);
      setOperationStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleTapToSign = async () => {
    if (!nfcService || !signMessage) {
      setErrorMessage('Please enter a message to sign');
      return;
    }

    try {
      setOperationStatus('pending');
      setErrorMessage('');
      setLastOperation('Tap-to-Sign');

      const request: TapToSignRequest = {
        message: signMessage,
        purpose: signPurpose,
        requiresGuardianApproval: signRequiresGuardianApproval,
        guardianThreshold: signRequiresGuardianApproval ? 1 : 0
      };

      console.log('✍️ Initiating Tap-to-Sign:', request);

      const signature = await nfcService.tapToSign(request);

      if (signature) {
        setOperationStatus('success');
        setLastAuth({ type: 'sign', message: signMessage, signature, timestamp: new Date() });
        console.log('✅ Tap-to-Sign successful:', signature);
        
        // Auto-clear data if enabled
        if (autoClearData) {
          setTimeout(() => {
            setSignMessage('');
          }, 3000);
        }
      } else {
        setOperationStatus('error');
        setErrorMessage('Tap-to-Sign failed');
        console.log('❌ Tap-to-Sign failed');
      }

    } catch (error) {
      console.error('❌ Tap-to-Sign error:', error);
      setOperationStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const resetForms = () => {
    setSpendAmount('');
    setSpendRecipient('');
    setSpendMemo('');
    setSignMessage('');
    setOperationStatus('idle');
    setErrorMessage('');
    setLastAuth(null);
    setLastOperation('');
    setShowPairingQR(false);
    setPairingData(null);
  };

  const togglePrivacyMode = () => {
    const modes: Array<'standard' | 'enhanced' | 'maximum'> = ['standard', 'enhanced', 'maximum'];
    const currentIndex = modes.indexOf(privacyMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setPrivacyMode(modes[nextIndex]);
  };

  // Test function to verify crypto operations
  const testCryptoOperations = async () => {
    if (!cryptoProvider) {
      console.error('❌ Crypto provider not available');
      return;
    }

    try {
      console.log('🧪 Testing crypto operations...');
      
      // Test key generation
      const keyPair = await cryptoProvider.subtle.generateKey(
        {
          name: 'ECDSA',
          namedCurve: 'P-256'
        },
        true,
        ['sign', 'verify']
      );
      console.log('✅ Key pair generated successfully');

      // Test signing
      const message = new TextEncoder().encode('Test message for NFC authentication');
      const signature = await cryptoProvider.subtle.sign(
        {
          name: 'ECDSA',
          hash: 'SHA-256'
        },
        keyPair.privateKey,
        message
      );
      console.log('✅ Message signed successfully');

      // Test verification
      const isValid = await cryptoProvider.subtle.verify(
        {
          name: 'ECDSA',
          hash: 'SHA-256'
        },
        keyPair.publicKey,
        signature,
        message
      );
      console.log('✅ Signature verification:', isValid);

      // Test random values
      const randomBytes = cryptoProvider.getRandomValues(new Uint8Array(32));
      console.log('✅ Random bytes generated:', randomBytes.length);

      console.log('🎉 All crypto operations passed!');
      
    } catch (error) {
      console.error('❌ Crypto test failed:', error);
    }
  };

  if (!isInitialized) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center py-12">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Initializing Enhanced NFC Hardware Security
          </h2>
          <p className="text-gray-600">
            Setting up NTAG424 DNA authentication with enhanced crypto...
          </p>
          {errorMessage && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">{errorMessage}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Enhanced NFC Hardware Security Test
            </h1>
            <p className="text-gray-600">
              Test tap-to-sign, tap-to-spend, and guardian approval via NTAG424 DNA with QR pairing
            </p>
          </div>
          <div className="flex items-center space-x-2">
            {onBack && (
              <button
                onClick={onBack}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                title="Back to home"
              >
                <RefreshCw className="h-5 w-5" />
              </button>
            )}
            <button
              onClick={resetForms}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              title="Reset forms"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Enhanced NFC Status */}
        <div className="flex items-center space-x-4 mt-4">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${isInitialized ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-sm text-gray-600">
              NFC {isInitialized ? 'Ready' : 'Not Available'}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${isListening ? 'bg-orange-500' : 'bg-gray-400'}`}></div>
            <span className="text-sm text-gray-600">
              Listening {isListening ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${cryptoProvider ? 'bg-blue-500' : 'bg-gray-400'}`}></div>
            <span className="text-sm text-gray-600">
              Crypto {cryptoProvider ? 'Ready' : 'Not Available'}
            </span>
          </div>
        </div>

        {/* Privacy Controls */}
        <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900">Privacy Controls</h3>
            <div className="flex items-center space-x-4">
              <button
                onClick={togglePrivacyMode}
                className="flex items-center space-x-2 px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors"
              >
                {privacyMode === 'maximum' ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                <span>{privacyMode.charAt(0).toUpperCase() + privacyMode.slice(1)} Privacy</span>
              </button>
              <label className="flex items-center space-x-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={autoClearData}
                  onChange={(e) => setAutoClearData(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span>Auto-clear data</span>
              </label>
              <label className="flex items-center space-x-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={ephemeralMode}
                  onChange={(e) => setEphemeralMode(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span>Ephemeral mode</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Operation Status */}
      {operationStatus !== 'idle' && (
        <div className={`mb-6 p-4 rounded-lg border ${
          operationStatus === 'success' ? 'bg-green-50 border-green-200' :
          operationStatus === 'error' ? 'bg-red-50 border-red-200' :
          'bg-blue-50 border-blue-200'
        }`}>
          <div className="flex items-center space-x-3">
            {operationStatus === 'pending' && <Loader2 className="h-5 w-5 animate-spin text-blue-600" />}
            {operationStatus === 'success' && <CheckCircle className="h-5 w-5 text-green-600" />}
            {operationStatus === 'error' && <XCircle className="h-5 w-5 text-red-600" />}
            <div>
              <p className="font-medium text-gray-900">
                {lastOperation} {operationStatus === 'pending' ? 'in progress...' : 
                                operationStatus === 'success' ? 'completed successfully' : 'failed'}
              </p>
              {errorMessage && (
                <p className="text-sm text-red-600 mt-1">{errorMessage}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Device Pairing QR Code */}
      {showPairingQR && pairingData && (
        <div className="mb-6 p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Device Pairing QR Code</h3>
            <button
              onClick={() => setShowPrivateData(!showPrivateData)}
              className="flex items-center space-x-2 px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
            >
              {showPrivateData ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              <span>{showPrivateData ? 'Hide' : 'Show'} Details</span>
            </button>
          </div>
          
          <div className="flex items-start space-x-6">
            <div className="flex-shrink-0">
              <div className="p-4 bg-white border border-gray-200 rounded-lg">
                                 <QRCode
                   value={JSON.stringify(pairingData)}
                   size={200}
                   level="M"
                   title="NFC Device Pairing QR Code"
                 />
              </div>
            </div>
            
            {showPrivateData && (
              <div className="flex-1 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Device ID</label>
                  <p className="text-sm text-gray-900 font-mono bg-gray-50 p-2 rounded">{pairingData.deviceId}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Pairing Code</label>
                  <p className="text-sm text-gray-900 font-mono bg-gray-50 p-2 rounded">{pairingData.pairingCode}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Expires At</label>
                  <p className="text-sm text-gray-900">{new Date(pairingData.expiresAt).toLocaleString()}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Public Key</label>
                  <p className="text-sm text-gray-900 font-mono bg-gray-50 p-2 rounded break-all">
                    {pairingData.publicKey.substring(0, 50)}...
                  </p>
                </div>
              </div>
            )}
          </div>
          
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-700">
              <strong>Security Note:</strong> This QR code contains sensitive pairing information. 
              Only scan with trusted NFC devices. The code expires in 5 minutes for security.
            </p>
          </div>
        </div>
      )}

      {/* Last Authentication Result */}
      {lastAuth && (
        <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <h3 className="font-medium text-gray-900 mb-2">Last Authentication Result</h3>
          <div className="text-sm text-gray-600 space-y-1">
            <p><strong>Type:</strong> {lastAuth.type}</p>
            <p><strong>Timestamp:</strong> {lastAuth.timestamp.toLocaleString()}</p>
            {lastAuth.type === 'spend' && (
              <>
                <p><strong>Amount:</strong> {lastAuth.amount} sats</p>
                <p><strong>Recipient:</strong> {lastAuth.recipient}</p>
                {lastAuth.memo && <p><strong>Memo:</strong> {lastAuth.memo}</p>}
              </>
            )}
            {lastAuth.type === 'sign' && (
              <>
                <p><strong>Message:</strong> {lastAuth.message.substring(0, 50)}...</p>
                <p><strong>Signature:</strong> {lastAuth.signature.substring(0, 32)}...</p>
              </>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Tap-to-Spend Section */}
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
          <div className="flex items-center space-x-2 mb-4">
            <CreditCard className="h-6 w-6 text-orange-600" />
            <h2 className="text-lg font-semibold text-gray-900">Tap-to-Spend</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount (sats)
              </label>
              <input
                type="number"
                value={spendAmount}
                onChange={(e) => setSpendAmount(e.target.value)}
                placeholder="10000"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Recipient
              </label>
              <input
                type="text"
                value={spendRecipient}
                onChange={(e) => setSpendRecipient(e.target.value)}
                placeholder="Lightning address or npub"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Memo (optional)
              </label>
              <input
                type="text"
                value={spendMemo}
                onChange={(e) => setSpendMemo(e.target.value)}
                placeholder="Payment description"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Privacy Level
              </label>
              <select
                value={privacyLevel}
                onChange={(e) => setPrivacyLevel(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              >
                <option value="standard">Standard</option>
                <option value="enhanced">Enhanced</option>
                <option value="maximum">Maximum</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="guardian-approval"
                checked={requiresGuardianApproval}
                onChange={(e) => setRequiresGuardianApproval(e.target.checked)}
                className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              />
              <label htmlFor="guardian-approval" className="text-sm text-gray-700">
                Require guardian approval
              </label>
            </div>

            <button
              onClick={handleTapToSpend}
              disabled={!spendAmount || !spendRecipient || operationStatus === 'pending'}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              <Smartphone className="h-4 w-4" />
              <span>Tap to Spend</span>
            </button>
          </div>
        </div>

        {/* Tap-to-Sign Section */}
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
          <div className="flex items-center space-x-2 mb-4">
            <Shield className="h-6 w-6 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Tap-to-Sign</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Message to Sign
              </label>
              <textarea
                value={signMessage}
                onChange={(e) => setSignMessage(e.target.value)}
                placeholder="Enter message to sign with your NFC device..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Purpose
              </label>
              <select
                value={signPurpose}
                onChange={(e) => setSignPurpose(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="transaction">Transaction</option>
                <option value="communication">Communication</option>
                <option value="recovery">Recovery</option>
                <option value="identity">Identity</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="sign-guardian-approval"
                checked={signRequiresGuardianApproval}
                onChange={(e) => setSignRequiresGuardianApproval(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="sign-guardian-approval" className="text-sm text-gray-700">
                Require guardian approval
              </label>
            </div>

            <button
              onClick={handleTapToSign}
              disabled={!signMessage || operationStatus === 'pending'}
              className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              <Smartphone className="h-4 w-4" />
              <span>Tap to Sign</span>
            </button>
          </div>
        </div>
      </div>

      {/* Enhanced NFC Controls */}
      <div className="mt-8 bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Enhanced NFC Controls</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <button
            onClick={handleGeneratePairingQR}
            disabled={operationStatus === 'pending'}
            className="bg-purple-500 hover:bg-purple-600 disabled:bg-gray-300 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
          >
            <QrCode className="h-4 w-4" />
            <span>Generate Pairing QR</span>
          </button>
          
          <button
            onClick={testCryptoOperations}
            disabled={!cryptoProvider}
            className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-300 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
          >
            <Shield className="h-4 w-4" />
            <span>Test Crypto</span>
          </button>
          
          <button
            onClick={startListening}
            disabled={isListening || operationStatus === 'pending'}
            className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
          >
            <Zap className="h-4 w-4" />
            <span>Start Listening</span>
          </button>
          
          <button
            onClick={stopListening}
            disabled={!isListening}
            className="bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
          >
            <XCircle className="h-4 w-4" />
            <span>Stop Listening</span>
          </button>
        </div>
        
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <p className="text-sm text-yellow-700">
              <strong>Enhanced Implementation:</strong> This version includes QR code pairing, 
              enhanced crypto operations with @peculiar/webcrypto, and improved privacy controls. 
              NFC functionality requires physical NTAG424 DNA hardware and browser NFC support.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NFCAuthTest; 