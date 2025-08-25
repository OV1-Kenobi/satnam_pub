/**
 * FROST Signature Panel Component
 * 
 * Displays pending FROST multi-signature transactions and allows authorized
 * family members (stewards/guardians) to approve transactions.
 */

import { AlertTriangle, CheckCircle, Clock, Shield, Users, X, Zap } from 'lucide-react';
import React, { useState } from 'react';
import { FrostTransaction } from '../services/familyWalletApi';

interface FrostSignaturePanelProps {
  pendingTransactions: FrostTransaction[];
  userRole: string;
  canApprove: boolean;
  onApproveTransaction: (transactionId: string) => Promise<void>;
  onRefresh: () => void;
}

const FrostSignaturePanel: React.FC<FrostSignaturePanelProps> = ({
  pendingTransactions,
  userRole,
  canApprove,
  onApproveTransaction,
  onRefresh
}) => {
  const [approvingTransactions, setApprovingTransactions] = useState<Set<string>>(new Set());
  const [errorNotification, setErrorNotification] = useState<string | null>(null);

  // Auto-dismiss error notification
  const dismissError = () => {
    setErrorNotification(null);
  };

  const handleApprove = async (transactionId: string) => {
    if (!canApprove) return;

    setApprovingTransactions(prev => new Set(prev).add(transactionId));

    try {
      await onApproveTransaction(transactionId);
      onRefresh(); // Refresh the transaction list
      // Clear any previous error notifications on success
      setErrorNotification(null);
    } catch (error) {
      console.error('Error approving transaction:', error);

      // Add user-visible error notification
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setErrorNotification(`Failed to approve transaction: ${errorMessage}. Please try again.`);

      // Auto-dismiss error notification after 5 seconds
      setTimeout(() => {
        setErrorNotification(null);
      }, 5000);
    } finally {
      setApprovingTransactions(prev => {
        const newSet = new Set(prev);
        newSet.delete(transactionId);
        return newSet;
      });
    }
  };

  const getTransactionIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'lightning':
      case 'payment':
        return <Zap className="h-5 w-5 text-orange-500" />;
      case 'fedimint':
      case 'mint':
      case 'spend':
        return <Shield className="h-5 w-5 text-purple-500" />;
      default:
        return <Users className="h-5 w-5 text-blue-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending_signatures':
        return 'text-yellow-600 bg-yellow-100';
      case 'threshold_met':
        return 'text-green-600 bg-green-100';
      case 'completed':
        return 'text-green-700 bg-green-200';
      case 'failed':
        return 'text-red-600 bg-red-100';
      case 'expired':
        return 'text-gray-600 bg-gray-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const formatTimeRemaining = (deadline: string) => {
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const diffMs = deadlineDate.getTime() - now.getTime();

    if (diffMs <= 0) return 'Expired';

    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);

    if (diffHours > 0) {
      return `${diffHours}h ${diffMinutes % 60}m remaining`;
    } else {
      return `${diffMinutes}m remaining`;
    }
  };

  if (pendingTransactions.length === 0) {
    return (
      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
        <div className="flex items-center space-x-3 mb-4">
          <CheckCircle className="h-6 w-6 text-green-400" />
          <h3 className="text-xl font-bold text-white">FROST Signatures</h3>
        </div>
        <div className="text-center py-8">
          <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-300">No pending transactions requiring signatures</p>
          <p className="text-gray-400 text-sm mt-2">All family transactions are up to date</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Error Toast Notification */}
      {errorNotification && (
        <div className="fixed top-4 right-4 z-50 max-w-md bg-red-500/90 backdrop-blur-sm border border-red-400 rounded-lg p-4 shadow-lg animate-in slide-in-from-top-2">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-200 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-100 font-medium">Transaction Approval Failed</p>
              <p className="text-xs text-red-200 mt-1">{errorNotification}</p>
            </div>
            <button
              onClick={dismissError}
              className="text-red-200 hover:text-red-100 transition-colors"
              aria-label="Dismiss error"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <Shield className="h-6 w-6 text-purple-400" />
            <h3 className="text-xl font-bold text-white">FROST Multi-Signature Approvals</h3>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-purple-200">
              {pendingTransactions.length} pending
            </span>
            <button
              onClick={onRefresh}
              className="p-2 text-purple-200 hover:text-white transition-colors"
            >
              <Clock className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {pendingTransactions.map((transaction) => (
            <div
              key={transaction.id}
              className="bg-black/20 rounded-lg p-4 border border-white/10"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center space-x-3">
                  {getTransactionIcon(transaction.type)}
                  <div>
                    <h4 className="font-semibold text-white">
                      {transaction.description || `${transaction.type} Transaction`}
                    </h4>
                    <p className="text-sm text-gray-300">
                      {transaction.amount?.toLocaleString('en-US') ?? '0'} sats
                    </p>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(transaction.status)}`}>
                  {transaction.status.replace('_', ' ')}
                </span>
              </div>

              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-4">
                  <div className="text-sm text-gray-300">
                    <span className="font-medium">Signatures:</span>{' '}
                    <span className={transaction.current_signatures >= transaction.required_signatures ? 'text-green-400' : 'text-yellow-400'}>
                      {transaction.current_signatures}/{transaction.required_signatures}
                    </span>
                  </div>
                  {transaction.signature_deadline && (
                    <div className="text-sm text-gray-300">
                      <Clock className="h-3 w-3 inline mr-1" />
                      {formatTimeRemaining(transaction.signature_deadline)}
                    </div>
                  )}
                </div>
              </div>

              {/* Signature Progress Bar */}
              <div className="mb-4">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Signature Progress</span>
                  <span>{transaction.required_signatures > 0 ? Math.round((transaction.current_signatures / transaction.required_signatures) * 100) : 100}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${transaction.current_signatures >= transaction.required_signatures || transaction.required_signatures === 0
                      ? 'bg-green-500'
                      : 'bg-yellow-500'
                      }`}
                    style={{
                      width: `${transaction.required_signatures > 0 ? Math.min((transaction.current_signatures / transaction.required_signatures) * 100, 100) : 100}%`
                    }}
                  />
                </div>
                {transaction.required_signatures === 0 && (
                  <div className="mt-2 p-2 bg-green-500/10 border border-green-500/30 rounded text-xs text-green-200">
                    ✅ All required signatures collected - Transaction ready for settlement
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-400">
                  Created {new Date(transaction.created_at).toLocaleDateString()}
                </div>

                {canApprove && transaction.status === 'pending_signatures' && (
                  <button
                    onClick={() => handleApprove(transaction.id)}
                    disabled={approvingTransactions.has(transaction.id)}
                    className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    {approvingTransactions.has(transaction.id) ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Signing...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4" />
                        <span>Approve & Sign</span>
                      </>
                    )}
                  </button>
                )}

                {!canApprove && (
                  <div className="flex items-center space-x-2 text-gray-400 text-sm">
                    <AlertTriangle className="h-4 w-4" />
                    <span>Requires {userRole === 'adult' ? 'Steward' : 'Guardian'} role</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {!canApprove && (
          <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <div className="flex items-center space-x-2 text-yellow-200">
              <AlertTriangle className="h-5 w-5" />
              <div>
                <p className="font-medium">Signature Authorization Required</p>
                <p className="text-sm text-yellow-300 mt-1">
                  Only Stewards and Guardians can approve family federation transactions.
                  You can view transaction history and pending approvals.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default FrostSignaturePanel;
