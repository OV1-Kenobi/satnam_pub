/**
 * Secure Nsec Input Component
 * 
 * Handles secure input and temporary storage of nsec credentials during sign-up
 * Implements client-side encryption with password-derived keys and temporary expiration
 */

import React, { useState, useCallback } from 'react';
import { EnhancedNostrManager } from '../../../lib/enhanced-nostr-manager';

interface SecureNsecInputProps {
  userId: string;
  userPassword: string;
  onCredentialStored: (credentialId: string) => void;
  onError: (error: string) => void;
  expirationHours?: number;
}

export const SecureNsecInput: React.FC<SecureNsecInputProps> = ({
  userId,
  userPassword,
  onCredentialStored,
  onError,
  expirationHours = 24,
}) => {
  const [nsec, setNsec] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState('');

  const nostrManager = new EnhancedNostrManager();

  // Validate nsec format
  const validateNsec = useCallback((input: string): boolean => {
    if (!input.startsWith('nsec1')) {
      setValidationError('Nsec must start with "nsec1"');
      return false;
    }
    
    if (input.length < 60 || input.length > 70) {
      setValidationError('Invalid nsec length');
      return false;
    }

    // Basic format validation (more comprehensive validation would be done server-side)
    const validChars = /^[a-zA-Z0-9]+$/;
    if (!validChars.test(input.substring(5))) {
      setValidationError('Invalid nsec format');
      return false;
    }

    setValidationError('');
    return true;
  }, []);

  // Handle nsec input change
  const handleNsecChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.trim();
    setNsec(value);
    
    if (value) {
      validateNsec(value);
    } else {
      setValidationError('');
    }
  }, [validateNsec]);

  // Securely store nsec credential
  const handleStoreCredential = useCallback(async () => {
    if (!nsec.trim()) {
      setValidationError('Please enter your nsec');
      return;
    }

    if (!validateNsec(nsec)) {
      return;
    }

    setIsProcessing(true);
    setValidationError('');

    try {
      // Store nsec securely with encryption
      const result = await nostrManager.storeNsecCredentialSecurely(
        userId,
        nsec,
        userPassword,
        expirationHours
      );

      if (result.success) {
        // Clear the input field for security
        setNsec('');
        
        // Notify parent component
        onCredentialStored(result.credentialId);
        
        console.log('✅ Nsec credential stored securely with ID:', result.credentialId);
      } else {
        onError(result.message);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to store credential';
      onError(errorMessage);
      console.error('❌ Failed to store nsec credential:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [nsec, userId, userPassword, expirationHours, validateNsec, onCredentialStored, onError]);

  // Handle form submission
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    handleStoreCredential();
  }, [handleStoreCredential]);

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-600 dark:text-gray-400">
        <p className="mb-2">
          <strong>Security Notice:</strong> Your nsec will be:
        </p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>Encrypted with your password using AES-256-GCM</li>
          <li>Stored with a unique salt and UUID</li>
          <li>Temporarily available for {expirationHours} hours</li>
          <li>Automatically deleted when expired</li>
          <li>Never stored in plain text</li>
        </ul>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="nsec-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Nostr Secret Key (nsec)
          </label>
          
          <div className="relative">
            <input
              id="nsec-input"
              type={showPassword ? 'text' : 'password'}
              value={nsec}
              onChange={handleNsecChange}
              placeholder="nsec1..."
              className={`
                w-full px-3 py-2 border rounded-md shadow-sm
                ${validationError 
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
                  : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                }
                dark:bg-gray-800 dark:border-gray-600 dark:text-white
                focus:outline-none focus:ring-2 focus:ring-opacity-50
              `}
              disabled={isProcessing}
              autoComplete="off"
              spellCheck="false"
            />
            
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              disabled={isProcessing}
            >
              {showPassword ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>

          {validationError && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {validationError}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between">
          <button
            type="submit"
            disabled={isProcessing || !nsec.trim() || !!validationError}
            className={`
              px-4 py-2 rounded-md text-sm font-medium
              ${isProcessing || !nsec.trim() || !!validationError
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
              }
              transition-colors duration-200
            `}
          >
            {isProcessing ? (
              <div className="flex items-center space-x-2">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Securing...</span>
              </div>
            ) : (
              'Store Securely'
            )}
          </button>

          <div className="text-xs text-gray-500 dark:text-gray-400">
            Expires in {expirationHours}h
          </div>
        </div>
      </form>

      {/* Security indicators */}
      <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
        <div className="flex items-start space-x-2">
          <svg className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-green-800 dark:text-green-200">
            <p className="font-medium">Secure Storage Active</p>
            <p className="text-xs mt-1">
              Your nsec is encrypted with military-grade AES-256-GCM encryption and will be automatically deleted when expired.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecureNsecInput; 