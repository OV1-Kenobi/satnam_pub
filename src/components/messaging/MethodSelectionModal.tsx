/**
 * Method Selection Modal Component
 * 
 * Provides explicit user choice for signing methods when NIP-07 is unavailable.
 * Eliminates automatic fallback and requires explicit user opt-in.
 */

import { AlertTriangle, CheckCircle, Chrome, Key, Shield, X } from 'lucide-react';
import React, { useState } from 'react';
import type { SigningMethod } from '../../lib/messaging/secure-message-signing';

export interface MethodSelectionData {
    selectedMethod: SigningMethod | null;
    userConfirmed: boolean;
    timestamp: number;
}

interface MethodSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onMethodSelect: (selection: MethodSelectionData) => void;
    messageType: 'group-message' | 'direct-message' | 'invitation' | 'general-event';
    isNIP07Available: boolean;
    currentPreference: SigningMethod;
}

export const MethodSelectionModal: React.FC<MethodSelectionModalProps> = ({
    isOpen,
    onClose,
    onMethodSelect,
    messageType,
    isNIP07Available,
    currentPreference
}) => {
    const [selectedMethod, setSelectedMethod] = useState<SigningMethod | null>(null);
    const [userUnderstanding, setUserUnderstanding] = useState(false);

    if (!isOpen) return null;

    const handleConfirm = () => {
        if (!selectedMethod || !userUnderstanding) {
            return;
        }

        const selection: MethodSelectionData = {
            selectedMethod,
            userConfirmed: true,
            timestamp: Date.now()
        };

        onMethodSelect(selection);
        onClose();
    };

    const handleCancel = () => {
        const selection: MethodSelectionData = {
            selectedMethod: null,
            userConfirmed: false,
            timestamp: Date.now()
        };

        onMethodSelect(selection);
        onClose();
    };

    const getMessageTypeDescription = () => {
        switch (messageType) {
            case 'group-message':
                return 'group message (NIP-58)';
            case 'direct-message':
                return 'direct message (NIP-59 gift-wrapped)';
            case 'invitation':
                return 'peer invitation';
            case 'general-event':
                return 'Nostr event';
            default:
                return 'message';
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-blue-100 rounded-full">
                            <Key className="h-6 w-6 text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold text-gray-900">
                                Choose Signing Method
                            </h2>
                            <p className="text-sm text-gray-600">
                                Select how to sign your {getMessageTypeDescription()}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="h-5 w-5 text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Warning about preference mismatch */}
                    {currentPreference === 'nip07' && !isNIP07Available && (
                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                            <div className="flex items-start space-x-3">
                                <AlertTriangle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
                                <div>
                                    <h3 className="font-semibold text-orange-800 mb-2">
                                        Your Preferred Method is Unavailable
                                    </h3>
                                    <p className="text-orange-700 text-sm">
                                        You have NIP-07 browser extension set as your preferred signing method,
                                        but no compatible extension is currently available. Please choose an alternative below.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Method Selection */}
                    <div className="space-y-4">
                        <h3 className="font-semibold text-gray-900">Available Signing Methods</h3>

                        {/* NIP-07 Option */}
                        <div className={`border-2 rounded-lg p-4 transition-colors cursor-pointer ${selectedMethod === 'nip07'
                                ? 'border-blue-500 bg-blue-50'
                                : isNIP07Available
                                    ? 'border-gray-200 hover:border-gray-300'
                                    : 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
                            }`} onClick={() => isNIP07Available && setSelectedMethod('nip07')}>
                            <div className="flex items-start space-x-3">
                                <div className={`p-2 rounded-full ${isNIP07Available ? 'bg-green-100' : 'bg-gray-100'
                                    }`}>
                                    <Chrome className={`h-5 w-5 ${isNIP07Available ? 'text-green-600' : 'text-gray-400'
                                        }`} />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center space-x-2">
                                        <input
                                            type="radio"
                                            name="signingMethod"
                                            value="nip07"
                                            checked={selectedMethod === 'nip07'}
                                            onChange={() => isNIP07Available && setSelectedMethod('nip07')}
                                            disabled={!isNIP07Available}
                                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                                        />
                                        <h4 className="font-medium text-gray-900">
                                            Browser Extension (NIP-07)
                                            {!isNIP07Available && <span className="text-gray-500 font-normal"> - Unavailable</span>}
                                            <span className="ml-2 px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                                                Recommended
                                            </span>
                                        </h4>
                                    </div>
                                    <p className="text-sm text-gray-600 mt-1">
                                        Zero-knowledge signing with browser extension.
                                        {!isNIP07Available && ' Install Alby, nos2x, or Flamingo extension to use this method.'}
                                    </p>
                                    <div className="mt-2 space-y-1 text-xs text-gray-500">
                                        <div className="flex items-center space-x-2">
                                            <CheckCircle className="h-3 w-3 text-green-500" />
                                            <span>Maximum security - no private key exposure</span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <CheckCircle className="h-3 w-3 text-green-500" />
                                            <span>Zero-knowledge architecture</span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <CheckCircle className="h-3 w-3 text-green-500" />
                                            <span>No server-side key access</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Encrypted Nsec Option */}
                        <div className={`border-2 rounded-lg p-4 transition-colors cursor-pointer ${selectedMethod === 'encrypted-nsec'
                                ? 'border-orange-500 bg-orange-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`} onClick={() => setSelectedMethod('encrypted-nsec')}>
                            <div className="flex items-start space-x-3">
                                <div className="p-2 bg-orange-100 rounded-full">
                                    <Shield className="h-5 w-5 text-orange-600" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center space-x-2">
                                        <input
                                            type="radio"
                                            name="signingMethod"
                                            value="encrypted-nsec"
                                            checked={selectedMethod === 'encrypted-nsec'}
                                            onChange={() => setSelectedMethod('encrypted-nsec')}
                                            className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300"
                                        />
                                        <h4 className="font-medium text-gray-900">
                                            Encrypted Private Key (Database)
                                            <span className="ml-2 px-2 py-1 text-xs bg-orange-100 text-orange-800 rounded-full">
                                                Fallback
                                            </span>
                                        </h4>
                                    </div>
                                    <p className="text-sm text-gray-600 mt-1">
                                        Secure signing using your encrypted private key stored in our database.
                                        Requires explicit consent and temporary key access.
                                    </p>
                                    <div className="mt-2 space-y-1 text-xs text-gray-500">
                                        <div className="flex items-center space-x-2">
                                            <CheckCircle className="h-3 w-3 text-orange-500" />
                                            <span>Encrypted storage with user-specific salt</span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <CheckCircle className="h-3 w-3 text-orange-500" />
                                            <span>Memory-only decryption during signing</span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <CheckCircle className="h-3 w-3 text-orange-500" />
                                            <span>Immediate cleanup after use</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Understanding confirmation */}
                    <div className="space-y-4">
                        <h3 className="font-semibold text-gray-900">Confirmation Required</h3>

                        <label className="flex items-start space-x-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={userUnderstanding}
                                onChange={(e) => setUserUnderstanding(e.target.checked)}
                                className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                            <span className="text-sm text-gray-700">
                                I understand that this is an explicit choice and there is no automatic fallback between methods.
                                I am choosing this signing method for my {getMessageTypeDescription()}.
                            </span>
                        </label>
                    </div>

                    {/* Extension recommendation */}
                    {!isNIP07Available && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <div className="flex items-start space-x-3">
                                <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                                <div>
                                    <h3 className="font-semibold text-green-800 mb-2">
                                        Recommendation: Install NIP-07 Extension
                                    </h3>
                                    <p className="text-green-700 text-sm mb-3">
                                        For maximum security and the best user experience, install a NIP-07 compatible browser extension:
                                    </p>
                                    <div className="space-y-1 text-sm text-green-700">
                                        <div>• <strong>Alby:</strong> Bitcoin Lightning wallet with Nostr support</div>
                                        <div>• <strong>nos2x:</strong> Lightweight Nostr key manager</div>
                                        <div>• <strong>Flamingo:</strong> Simple Nostr browser extension</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
                    <button
                        onClick={handleCancel}
                        className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>

                    <button
                        onClick={handleConfirm}
                        disabled={!selectedMethod || !userUnderstanding}
                        className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                    >
                        <Key className="h-4 w-4" />
                        <span>Use Selected Method</span>
                    </button>
                </div>
            </div>
        </div>
    );
};