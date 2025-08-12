import { AlertTriangle, Check, Eye, EyeOff, Info, Wallet, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

interface NWCModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (nwcUri: string) => void;
  isLoading?: boolean;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

const NWCModal: React.FC<NWCModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isLoading = false
}) => {
  const [nwcUri, setNwcUri] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const [showUri, setShowUri] = useState(false);
  const [validation, setValidation] = useState<ValidationResult>({
    isValid: false,
    errors: [],
    warnings: []
  });
  const [hasInteracted, setHasInteracted] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setNwcUri('');
      setShowUri(false);
      setValidation({ isValid: false, errors: [], warnings: [] });
      setHasInteracted(false);
    }
  }, [isOpen]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('modal-open');
      return () => {
        document.body.classList.remove('modal-open');
      };
    }
  }, [isOpen]);

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen && !isLoading) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isOpen, onClose, isLoading]);

  const validateNWCUri = (uri: string): ValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!uri.trim()) {
      return { isValid: false, errors: ['NWC URI is required'], warnings: [] };
    }

    // Check protocol
    if (!uri.startsWith('nostr+walletconnect://')) {
      errors.push('URI must start with "nostr+walletconnect://"');
    }

    try {
      const url = new URL(uri);
      const pubkey = url.hostname;
      const relay = url.searchParams.get('relay');
      const secret = url.searchParams.get('secret');
      const permissions = url.searchParams.get('permissions');

      // Validate pubkey
      if (!pubkey) {
        errors.push('Missing pubkey in URI');
      } else if (pubkey.length !== 64) {
        errors.push('Pubkey must be exactly 64 characters');
      } else if (!/^[0-9a-f]{64}$/i.test(pubkey)) {
        errors.push('Pubkey must be a valid hex string');
      }

      // Validate relay
      if (!relay) {
        errors.push('Missing relay parameter');
      } else if (!relay.startsWith('wss://') && !relay.startsWith('ws://')) {
        errors.push('Relay must be a valid WebSocket URL (wss:// or ws://)');
      } else if (!relay.startsWith('wss://')) {
        warnings.push('Consider using secure WebSocket (wss://) for better security');
      }

      // Validate secret
      if (!secret) {
        errors.push('Missing secret parameter');
      } else if (secret.length < 32) {
        errors.push('Secret is too short (minimum 32 characters)');
      } else if (secret.length < 64) {
        warnings.push('Secret is shorter than recommended (64+ characters)');
      }

      // Check permissions (optional but informative)
      if (!permissions) {
        warnings.push('No permissions specified - wallet may have limited functionality');
      } else {
        const permList = permissions.split(',');
        if (permList.length === 0) {
          warnings.push('Empty permissions list');
        }
      }

    } catch (error) {
      errors.push('Invalid URI format');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  };

  const handleUriChange = (value: string) => {
    setNwcUri(value);
    setHasInteracted(true);

    // Validate in real-time
    const validationResult = validateNWCUri(value);
    if (!mountedRef.current) return;
    setValidation(validationResult);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validation.isValid && !isLoading) {
      onSubmit(nwcUri.trim());
    }
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !isLoading) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-white rounded-xl shadow-2xl border border-gray-200 p-6 max-w-lg w-full mx-4 relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Close modal"
        >
          <X className="h-6 w-6" />
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Wallet className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Connect Your Nostr Wallet
          </h2>
          <p className="text-gray-600">
            Enter your Nostr Wallet Connect (NWC) URI to authenticate securely
          </p>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 rounded-lg p-4 mb-6">
          <div className="flex items-start space-x-3">
            <Info className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-blue-900 mb-2">
                Where to find your NWC URI:
              </h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• <strong>Alby:</strong> Settings → Wallet Connect</li>
                <li>• <strong>Zeus:</strong> Settings → NWC</li>
                <li>• <strong>Mutiny:</strong> Settings → Nostr Wallet Connect</li>
                <li>• <strong>Other wallets:</strong> Look for "NWC" or "Wallet Connect"</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              NWC URI
            </label>
            <div className="relative">
              <input
                type={showUri ? 'text' : 'password'}
                value={nwcUri}
                onChange={(e) => handleUriChange(e.target.value)}
                placeholder="nostr+walletconnect://..."
                disabled={isLoading}
                className={`w-full px-4 py-3 pr-12 border rounded-lg focus:outline-none focus:ring-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${hasInteracted
                    ? validation.isValid
                      ? 'border-green-300 focus:border-green-500 focus:ring-green-200'
                      : validation.errors.length > 0
                        ? 'border-red-300 focus:border-red-500 focus:ring-red-200'
                        : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'
                    : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'
                  }`}
              />
              <button
                type="button"
                onClick={() => setShowUri(!showUri)}
                disabled={isLoading}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={showUri ? 'Hide URI' : 'Show URI'}
              >
                {showUri ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>

            {/* Validation Messages */}
            {hasInteracted && (
              <div className="mt-2 space-y-1">
                {validation.errors.map((error, index) => (
                  <div key={`error-${index}`} className="flex items-start space-x-2 text-sm text-red-600">
                    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                ))}
                {validation.warnings.map((warning, index) => (
                  <div key={`warning-${index}`} className="flex items-start space-x-2 text-sm text-yellow-600">
                    <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{warning}</span>
                  </div>
                ))}
                {validation.isValid && validation.errors.length === 0 && (
                  <div className="flex items-center space-x-2 text-sm text-green-600">
                    <Check className="h-4 w-4" />
                    <span>Valid NWC URI format</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Security Notice */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="text-sm font-semibold text-yellow-800 mb-1">
                  Security Notice
                </h4>
                <p className="text-sm text-yellow-700">
                  Your NWC URI contains sensitive information. Never share it with untrusted parties.
                  This connection will be used only for authentication purposes.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!validation.isValid || isLoading}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <Wallet className="h-5 w-5" />
                  <span>Connect Wallet</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NWCModal;