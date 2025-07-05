/**
 * Emergency Recovery Page Component
 * 
 * Dedicated page for emergency recovery operations.
 * Integrates with authentication system to get user context.
 */

import React, { useState, useEffect } from 'react';
import { ArrowLeft, AlertTriangle, Shield, Users, Key, Zap } from 'lucide-react';
import EmergencyRecoveryModal from './EmergencyRecoveryModal';
import { useAuth } from '../hooks/useAuth';
import { FederationRole } from '../types/auth';

interface EmergencyRecoveryPageProps {
  onBack: () => void;
}

export function EmergencyRecoveryPage({ onBack }: EmergencyRecoveryPageProps) {
  const { user, isAuthenticated, userRole, familyId } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate loading user data
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  const handleStartRecovery = () => {
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading recovery system...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Authentication Required</h2>
          <p className="text-gray-600 mb-4">Please sign in to access emergency recovery.</p>
          <button
            onClick={onBack}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <button
                onClick={onBack}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="h-4 w-4 text-white" />
                </div>
                <h1 className="text-xl font-semibold text-gray-900">Emergency Recovery</h1>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* User Context */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                Recovery Access for {user.username || user.npub?.substring(0, 20) + '...'}
              </h2>
              <p className="text-sm text-gray-600">
                Role: <span className="font-medium capitalize">{userRole}</span>
                {familyId && (
                  <span className="ml-4">
                    Family ID: <span className="font-mono text-xs">{familyId}</span>
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span className="text-sm text-green-600">Authenticated</span>
            </div>
          </div>
        </div>

        {/* Recovery Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Private Key Recovery */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Key className="h-5 w-5 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Private Key Recovery</h3>
            </div>
            <p className="text-gray-600 mb-4">
              Recover lost or compromised private keys using guardian consensus and Shamir Secret Sharing.
            </p>
            <div className="text-sm text-gray-500">
              <p>• Guardian consensus required</p>
              <p>• Shamir Secret Sharing</p>
              <p>• New key generation</p>
            </div>
          </div>

          {/* eCash Recovery */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Shield className="h-5 w-5 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">eCash Recovery</h3>
            </div>
            <p className="text-gray-600 mb-4">
              Recover lost eCash tokens and bearer instruments from backup proofs.
            </p>
            <div className="text-sm text-gray-500">
              <p>• Proof reconstruction</p>
              <p>• Token recovery</p>
              <p>• Backup verification</p>
            </div>
          </div>

          {/* Emergency Liquidity */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <Zap className="h-5 w-5 text-orange-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Emergency Liquidity</h3>
            </div>
            <p className="text-gray-600 mb-4">
              Access emergency funds from family treasury with guardian approval.
            </p>
            <div className="text-sm text-gray-500">
              <p>• Guardian approval</p>
              <p>• Lightning transfer</p>
              <p>• eCash issuance</p>
            </div>
          </div>
        </div>

        {/* Guardian Information */}
        {familyId && (
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-8">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                <Users className="h-4 w-4 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Guardian Consensus</h3>
            </div>
            <p className="text-gray-600 mb-4">
              Emergency recovery requires consensus from family guardians. All guardians will be notified 
              of your recovery request and must approve before recovery can proceed.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-blue-600" />
                <span className="text-blue-800 font-medium">Important</span>
              </div>
              <p className="text-blue-700 text-sm">
                Recovery requests expire after 24 hours. Make sure all guardians are available 
                to review and approve your request.
              </p>
            </div>
          </div>
        )}

        {/* Start Recovery Button */}
        <div className="text-center">
          <button
            onClick={handleStartRecovery}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors flex items-center space-x-2 mx-auto shadow-lg"
          >
            <AlertTriangle className="h-5 w-5" />
            <span>Start Emergency Recovery</span>
          </button>
          <p className="text-sm text-gray-500 mt-3">
            Only use this in genuine emergency situations
          </p>
        </div>
      </div>

      {/* Emergency Recovery Modal */}
      {showModal && (
        <EmergencyRecoveryModal
          isOpen={showModal}
          onClose={handleCloseModal}
          userRole={userRole as FederationRole}
          userId={user.id || 'unknown'}
          userNpub={user.npub || ''}
          familyId={familyId}
        />
      )}
    </div>
  );
}

export default EmergencyRecoveryPage; 