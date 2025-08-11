/**
 * Recovery and Rotation Interface Component
 * 
 * Main interface for Nostr key recovery and rotation functionality.
 * Provides access to both recovery (when logged out) and rotation (when logged in).
 */

import { AlertTriangle, Key, RefreshCw, Shield, User, Users } from 'lucide-react';
import React, { useState } from 'react';
import { FederationRole } from '../../types/auth';
import { useAuth } from './AuthProvider';
import { KeyRotationModal } from './KeyRotationModal';
import { NsecRecoveryModal } from './NsecRecoveryModal';

interface RecoveryAndRotationInterfaceProps {
  className?: string;
}

export const RecoveryAndRotationInterface: React.FC<RecoveryAndRotationInterfaceProps> = ({
  className = ''
}) => {
  const auth = useAuth();
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [showRotationModal, setShowRotationModal] = useState(false);
  const [selectedUserRole, setSelectedUserRole] = useState<FederationRole>('private');

  // Determine user context
  const isLoggedIn = !!(auth.authenticated && auth.user);
  const userRole = auth.user?.federationRole || 'private';

  const handleRecoveryClick = () => {
    if (isLoggedIn) {
      // User is logged in - they should log out first
      return;
    }
    setShowRecoveryModal(true);
  };

  const handleRotationClick = () => {
    if (!isLoggedIn) {
      // User must be logged in for rotation
      return;
    }
    setShowRotationModal(true);
  };

  const getRecoveryDescription = () => {
    if (selectedUserRole === 'private') {
      return 'Recover your encrypted nsec using your NIP-05/password or npub/password credentials';
    } else {
      return 'Family federation recovery requires guardian consensus for nsec access';
    }
  };

  const getRotationDescription = () => {
    return 'Generate new Nostr keys while preserving your NIP-05 identifier and Lightning Address';
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Nostr Key Management
        </h2>
        <p className="text-gray-600">
          Secure recovery and rotation for your Nostr identity
        </p>
      </div>

      {/* Status Display */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center space-x-3">
          <Shield className="h-5 w-5 text-gray-600" />
          <div>
            <h3 className="font-semibold text-gray-900">Current Status</h3>
            <p className="text-sm text-gray-600">
              {isLoggedIn
                ? `Logged in as ${userRole} user - Key rotation available`
                : 'Logged out - Key recovery available'
              }
            </p>
          </div>
        </div>
      </div>

      {/* User Role Selection (for recovery when logged out) */}
      {!isLoggedIn && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Account Type
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              onClick={() => setSelectedUserRole('private')}
              className={`p-4 border rounded-lg text-left transition-colors ${selectedUserRole === 'private'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
                }`}
            >
              <div className="flex items-center space-x-3">
                <User className="h-5 w-5 text-blue-600" />
                <div>
                  <h4 className="font-semibold text-gray-900">Private Individual</h4>
                  <p className="text-sm text-gray-600">Self-sovereign account recovery</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setSelectedUserRole('offspring')}
              className={`p-4 border rounded-lg text-left transition-colors ${selectedUserRole !== 'private'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
                }`}
            >
              <div className="flex items-center space-x-3">
                <Users className="h-5 w-5 text-blue-600" />
                <div>
                  <h4 className="font-semibold text-gray-900">Family Federation</h4>
                  <p className="text-sm text-gray-600">Guardian consensus required</p>
                </div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Key Recovery Card */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-blue-100 rounded-full">
              <Key className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Nsec Recovery</h3>
              <p className="text-sm text-gray-600">Recover your encrypted private key</p>
            </div>
          </div>

          <p className="text-gray-700 text-sm mb-4">
            {getRecoveryDescription()}
          </p>

          {isLoggedIn ? (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="h-4 w-4 text-orange-600 flex-shrink-0 mt-0.5" />
                <p className="text-orange-700 text-sm">
                  You must be logged out to access key recovery. Please sign out first.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
              <p className="text-green-700 text-sm">
                ✅ Recovery available - You are logged out
              </p>
            </div>
          )}

          <button
            onClick={handleRecoveryClick}
            disabled={isLoggedIn}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
          >
            <Key className="h-4 w-4" />
            <span>Recover Nsec</span>
          </button>
        </div>

        {/* Key Rotation Card */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-orange-100 rounded-full">
              <RefreshCw className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Key Rotation</h3>
              <p className="text-sm text-gray-600">Rotate compromised keys</p>
            </div>
          </div>

          <p className="text-gray-700 text-sm mb-4">
            {getRotationDescription()}
          </p>

          {!isLoggedIn ? (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="h-4 w-4 text-orange-600 flex-shrink-0 mt-0.5" />
                <p className="text-orange-700 text-sm">
                  You must be logged in to rotate keys. Please sign in first.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
              <p className="text-green-700 text-sm">
                ✅ Rotation available - You are authenticated
              </p>
            </div>
          )}

          <button
            onClick={handleRotationClick}
            disabled={!isLoggedIn}
            className="w-full bg-orange-600 text-white py-2 px-4 rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Rotate Keys</span>
          </button>
        </div>
      </div>

      {/* Security Information */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h3 className="font-semibold text-gray-900 mb-3 flex items-center space-x-2">
          <Shield className="h-5 w-5 text-gray-600" />
          <span>Security Information</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
          <div>
            <h4 className="font-semibold mb-2">Recovery Security</h4>
            <ul className="space-y-1">
              <li>• Requires same credentials as signin</li>
              <li>• All attempts logged for security</li>
              <li>• Nsec decrypted in memory only</li>
              <li>• Immediate cleanup after display</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-2">Rotation Security</h4>
            <ul className="space-y-1">
              <li>• Cryptographically secure key generation</li>
              <li>• NIP-05 and Lightning Address preserved</li>
              <li>• Deprecation notices for old keys</li>
              <li>• Social network continuity maintained</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Modals */}
      <NsecRecoveryModal
        isOpen={showRecoveryModal}
        onClose={() => setShowRecoveryModal(false)}
        userRole={selectedUserRole}
      />

      <KeyRotationModal
        isOpen={showRotationModal}
        onClose={() => setShowRotationModal(false)}
        onRotationComplete={() => {
          setShowRotationModal(false);
          // Could trigger a re-authentication or page refresh
        }}
      />
    </div>
  );
};
