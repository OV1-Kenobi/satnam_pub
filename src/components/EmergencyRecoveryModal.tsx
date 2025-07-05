/**
 * Emergency Recovery Modal Component
 * 
 * Production-ready emergency recovery interface for end-users.
 * Integrates with the Netlify Function API endpoint for real recovery flows.
 * Supports all RBAC levels with appropriate guardian consensus workflows.
 */

import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Eye,
  EyeOff,
  FileText,
  Key,
  Lock,
  Shield,
  Users,
  X,
  Zap,
  RefreshCw,
  UserCheck,
  AlertCircle,
  Info,
  ArrowLeft,
  ArrowRight,
  Save,
  Send,
  User,
  Settings,
  HelpCircle
} from 'lucide-react';
import { FederationRole } from '../types/auth';

interface EmergencyRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: FederationRole;
  userId: string;
  userNpub: string;
  familyId?: string;
}

interface RecoveryRequest {
  requestType: 'nsec_recovery' | 'ecash_recovery' | 'emergency_liquidity' | 'account_restoration';
  reason: 'lost_key' | 'compromised_key' | 'emergency_funds' | 'account_lockout' | 'guardian_request';
  urgency: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  requestedAmount?: number;
  recoveryMethod: 'password' | 'multisig' | 'shamir' | 'guardian_consensus';
}

interface RecoveryStatus {
  requestId: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'expired';
  currentApprovals: number;
  requiredApprovals: number;
  guardianApprovals: Array<{
    guardianNpub: string;
    guardianRole: FederationRole;
    approval: 'approved' | 'rejected' | 'abstained';
    timestamp: string;
  }>;
  createdAt: string;
  expiresAt: string;
}

interface GuardianInfo {
  npub: string;
  role: FederationRole;
  name: string;
  isOnline: boolean;
  lastSeen: string;
}

export function EmergencyRecoveryModal({ 
  isOpen, 
  onClose, 
  userRole, 
  userId, 
  userNpub, 
  familyId 
}: EmergencyRecoveryModalProps) {
  const [currentStep, setCurrentStep] = useState<'request' | 'approval' | 'execution' | 'complete'>('request');
  const [recoveryRequest, setRecoveryRequest] = useState<RecoveryRequest>({
    requestType: 'nsec_recovery',
    reason: 'lost_key',
    urgency: 'medium',
    description: '',
    recoveryMethod: 'guardian_consensus'
  });
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus | null>(null);
  const [guardians, setGuardians] = useState<GuardianInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load guardians when modal opens
  useEffect(() => {
    if (isOpen && familyId) {
      loadGuardians();
    }
  }, [isOpen, familyId]);

  // Auto-refresh status if request is pending
  useEffect(() => {
    if (recoveryStatus?.status === 'pending') {
      const interval = setInterval(() => {
        checkRecoveryStatus();
      }, 5000); // Check every 5 seconds
      return () => clearInterval(interval);
    }
  }, [recoveryStatus?.status]);

  const loadGuardians = async () => {
    try {
      const response = await fetch('/.netlify/functions/emergency-recovery', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({
          action: 'get_guardians',
          familyId
        })
      });

      if (response.ok) {
        const data = await response.json();
        setGuardians(data.guardians || []);
      }
    } catch (error) {
      console.error('Failed to load guardians:', error);
    }
  };

  const initiateRecovery = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/.netlify/functions/emergency-recovery', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({
          action: 'initiate_recovery',
          userId,
          userNpub,
          userRole,
          ...recoveryRequest
        })
      });

      const result = await response.json();

      if (result.success) {
        setRecoveryStatus({
          requestId: result.data.requestId,
          status: 'pending',
          currentApprovals: 0,
          requiredApprovals: result.data.requiredApprovals,
          guardianApprovals: [],
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        });
        setCurrentStep('approval');
        setSuccess('Recovery request submitted successfully. Guardians will be notified.');
      } else {
        setError(result.error || 'Failed to initiate recovery request');
      }
    } catch (error) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const checkRecoveryStatus = async () => {
    if (!recoveryStatus?.requestId) return;

    try {
      const response = await fetch('/.netlify/functions/emergency-recovery', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({
          action: 'get_status',
          userId
        })
      });

      const result = await response.json();

      if (result.success && result.data.activeRequests.length > 0) {
        const request = result.data.activeRequests[0];
        setRecoveryStatus({
          requestId: request.id,
          status: request.status,
          currentApprovals: request.current_approvals,
          requiredApprovals: request.required_approvals,
          guardianApprovals: request.guardian_approvals || [],
          createdAt: request.created_at,
          expiresAt: request.expires_at
        });

        if (request.status === 'approved') {
          setCurrentStep('execution');
        } else if (request.status === 'completed') {
          setCurrentStep('complete');
        }
      }
    } catch (error) {
      console.error('Failed to check recovery status:', error);
    }
  };

  const executeRecovery = async () => {
    if (!recoveryStatus?.requestId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/.netlify/functions/emergency-recovery', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({
          action: 'execute_recovery',
          recoveryRequestId: recoveryStatus.requestId,
          executorNpub: userNpub,
          executorRole: userRole
        })
      });

      const result = await response.json();

      if (result.success) {
        setCurrentStep('complete');
        setSuccess('Recovery completed successfully!');
      } else {
        setError(result.error || 'Failed to execute recovery');
      }
    } catch (error) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const resetModal = () => {
    setCurrentStep('request');
    setRecoveryRequest({
      requestType: 'nsec_recovery',
      reason: 'lost_key',
      urgency: 'medium',
      description: '',
      recoveryMethod: 'guardian_consensus'
    });
    setRecoveryStatus(null);
    setError(null);
    setSuccess(null);
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Emergency Recovery</h2>
              <p className="text-sm text-gray-600">Recover your account or funds</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Progress Steps */}
          <div className="flex items-center justify-center mb-8">
            {[
              { key: 'request', label: 'Request', icon: FileText },
              { key: 'approval', label: 'Approval', icon: Users },
              { key: 'execution', label: 'Execution', icon: Zap },
              { key: 'complete', label: 'Complete', icon: CheckCircle }
            ].map((step, index) => {
              const Icon = step.icon;
              const isActive = currentStep === step.key;
              const isCompleted = ['request', 'approval', 'execution', 'complete'].indexOf(currentStep) > index;
              
              return (
                <div key={step.key} className="flex items-center">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                    isActive ? 'bg-red-500 border-red-500 text-white' :
                    isCompleted ? 'bg-green-500 border-green-500 text-white' :
                    'bg-gray-100 border-gray-300 text-gray-400'
                  }`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className={`ml-2 text-sm font-medium ${
                    isActive ? 'text-red-600' :
                    isCompleted ? 'text-green-600' :
                    'text-gray-400'
                  }`}>
                    {step.label}
                  </span>
                  {index < 3 && (
                    <div className={`w-16 h-0.5 mx-4 ${
                      isCompleted ? 'bg-green-500' : 'bg-gray-300'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <span className="text-red-800">{error}</span>
              </div>
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="text-green-800">{success}</span>
              </div>
            </div>
          )}

          {/* Step Content */}
          {currentStep === 'request' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recovery Request Details</h3>
                
                {/* Request Type */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Recovery Type
                  </label>
                  <select
                    value={recoveryRequest.requestType}
                    onChange={(e) => setRecoveryRequest(prev => ({
                      ...prev,
                      requestType: e.target.value as RecoveryRequest['requestType']
                    }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  >
                    <option value="nsec_recovery">Private Key Recovery</option>
                    <option value="ecash_recovery">eCash Recovery</option>
                    <option value="emergency_liquidity">Emergency Liquidity</option>
                    <option value="account_restoration">Account Restoration</option>
                  </select>
                </div>

                {/* Reason */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Reason
                  </label>
                  <select
                    value={recoveryRequest.reason}
                    onChange={(e) => setRecoveryRequest(prev => ({
                      ...prev,
                      reason: e.target.value as RecoveryRequest['reason']
                    }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  >
                    <option value="lost_key">Lost Key</option>
                    <option value="compromised_key">Compromised Key</option>
                    <option value="emergency_funds">Emergency Funds</option>
                    <option value="account_lockout">Account Lockout</option>
                    <option value="guardian_request">Guardian Request</option>
                  </select>
                </div>

                {/* Urgency */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Urgency Level
                  </label>
                  <select
                    value={recoveryRequest.urgency}
                    onChange={(e) => setRecoveryRequest(prev => ({
                      ...prev,
                      urgency: e.target.value as RecoveryRequest['urgency']
                    }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                {/* Amount for Emergency Liquidity */}
                {recoveryRequest.requestType === 'emergency_liquidity' && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Requested Amount (sats)
                    </label>
                    <input
                      type="number"
                      value={recoveryRequest.requestedAmount || ''}
                      onChange={(e) => setRecoveryRequest(prev => ({
                        ...prev,
                        requestedAmount: parseInt(e.target.value) || undefined
                      }))}
                      placeholder="Enter amount in satoshis"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    />
                  </div>
                )}

                {/* Recovery Method */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Recovery Method
                  </label>
                  <select
                    value={recoveryRequest.recoveryMethod}
                    onChange={(e) => setRecoveryRequest(prev => ({
                      ...prev,
                      recoveryMethod: e.target.value as RecoveryRequest['recoveryMethod']
                    }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  >
                    <option value="guardian_consensus">Guardian Consensus</option>
                    <option value="password">Password Recovery</option>
                    <option value="multisig">Multi-Signature</option>
                    <option value="shamir">Shamir Secret Sharing</option>
                  </select>
                </div>

                {/* Description */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={recoveryRequest.description}
                    onChange={(e) => setRecoveryRequest(prev => ({
                      ...prev,
                      description: e.target.value
                    }))}
                    placeholder="Provide details about your recovery request..."
                    rows={3}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-3">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={initiateRecovery}
                  disabled={isLoading || !recoveryRequest.description}
                  className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      <span>Submit Request</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {currentStep === 'approval' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Guardian Approval</h3>
                <p className="text-gray-600 mb-6">
                  Your recovery request is being reviewed by family guardians. 
                  You'll be notified once a decision is made.
                </p>

                {/* Status */}
                {recoveryStatus && (
                  <div className="bg-gray-50 rounded-lg p-4 mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Approval Progress</span>
                      <span className="text-sm text-gray-500">
                        {recoveryStatus.currentApprovals} / {recoveryStatus.requiredApprovals}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-red-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(recoveryStatus.currentApprovals / recoveryStatus.requiredApprovals) * 100}%` }}
                      />
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                      Expires: {new Date(recoveryStatus.expiresAt).toLocaleString()}
                    </div>
                  </div>
                )}

                {/* Guardian Status */}
                <div>
                  <h4 className="text-md font-medium text-gray-900 mb-3">Guardian Status</h4>
                  <div className="space-y-2">
                    {guardians.map((guardian) => {
                      const approval = recoveryStatus?.guardianApprovals.find(
                        a => a.guardianNpub === guardian.npub
                      );
                      
                      return (
                        <div key={guardian.npub} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center space-x-3">
                            <div className={`w-3 h-3 rounded-full ${
                              guardian.isOnline ? 'bg-green-500' : 'bg-gray-400'
                            }`} />
                            <div>
                              <div className="font-medium text-gray-900">{guardian.name}</div>
                              <div className="text-sm text-gray-500">{guardian.role}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            {approval ? (
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                approval.approval === 'approved' ? 'bg-green-100 text-green-800' :
                                approval.approval === 'rejected' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {approval.approval}
                              </span>
                            ) : (
                              <span className="text-sm text-gray-500">Pending</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between">
                <button
                  onClick={() => setCurrentStep('request')}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors flex items-center space-x-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back</span>
                </button>
                <button
                  onClick={checkRecoveryStatus}
                  disabled={isLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center space-x-2"
                >
                  <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh Status</span>
                </button>
              </div>
            </div>
          )}

          {currentStep === 'execution' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recovery Execution</h3>
                <p className="text-gray-600 mb-6">
                  Your recovery request has been approved! Click the button below to execute the recovery.
                </p>

                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="text-green-800 font-medium">Recovery Approved</span>
                  </div>
                  <p className="text-green-700 mt-2">
                    All required guardians have approved your recovery request.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between">
                <button
                  onClick={() => setCurrentStep('approval')}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors flex items-center space-x-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back</span>
                </button>
                <button
                  onClick={executeRecovery}
                  disabled={isLoading}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Executing...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      <span>Execute Recovery</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {currentStep === 'complete' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Recovery Complete</h3>
                <p className="text-gray-600 mb-6">
                  Your recovery has been successfully completed. You should now have access to your account or funds.
                </p>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center space-x-2 mb-2">
                    <Info className="h-5 w-5 text-blue-600" />
                    <span className="text-blue-800 font-medium">Next Steps</span>
                  </div>
                  <ul className="text-blue-700 text-sm space-y-1">
                    <li>• Verify your account access</li>
                    <li>• Update your security settings if needed</li>
                    <li>• Consider setting up additional recovery methods</li>
                    <li>• Contact support if you encounter any issues</li>
                  </ul>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-center">
                <button
                  onClick={handleClose}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default EmergencyRecoveryModal; 