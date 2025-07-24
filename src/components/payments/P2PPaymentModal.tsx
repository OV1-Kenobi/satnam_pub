/**
 * P2P Payment Modal Component
 * Provides interface for internal Satnam-to-Satnam and external Lightning payments
 */

import { AlertTriangle, Clock, Loader2, Shield, X, Zap } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { ApiError, paymentsClient } from '../../lib/api/paymentsClient.js';

// Simple notification system (same as ECashBridgeModal)
interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description: string;
}

const useToast = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const toast = ({ title, description, variant = 'info' }: {
    title: string;
    description: string;
    variant?: 'success' | 'error' | 'warning' | 'info' | 'destructive';
  }) => {
    const id = Math.random().toString(36).substr(2, 9);
    const type = variant === 'destructive' ? 'error' : variant;
    const notification: Notification = { id, type, title, description };

    setNotifications(prev => [notification, ...prev].slice(0, 5));

    // Auto-remove after 5 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const ToastContainer = () => (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {notifications.map(notification => (
        <div
          key={notification.id}
          className={`p-4 rounded-lg shadow-lg max-w-sm border ${notification.type === 'success' ? 'bg-green-100 border-green-400 text-green-700' :
            notification.type === 'error' ? 'bg-red-100 border-red-400 text-red-700' :
              notification.type === 'warning' ? 'bg-yellow-100 border-yellow-400 text-yellow-700' :
                'bg-blue-100 border-blue-400 text-blue-700'
            }`}
        >
          <div className="flex justify-between items-start">
            <div>
              <h4 className="font-medium">{notification.title}</h4>
              <p className="text-sm mt-1">{notification.description}</p>
            </div>
            <button
              onClick={() => setNotifications(prev => prev.filter(n => n.id !== notification.id))}
              className="ml-2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );

  return { toast, ToastContainer };
};

interface P2PPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (paymentResult: any) => void;
}

interface PaymentFormData {
  toUser: string;
  amount: string;
  memo: string;
  paymentType: 'P2P_INTERNAL_LIGHTNING' | 'P2P_EXTERNAL_LIGHTNING';
  enablePrivacy: boolean;
}

interface FeeEstimate {
  baseFee: number;
  privacyFee: number;
  routingFee: number;
  total: number;
  estimatedTime: string;
}

export function P2PPaymentModal({ isOpen, onClose, onSuccess }: P2PPaymentModalProps) {
  const { user } = useAuth();
  const { toast, ToastContainer } = useToast();

  const [formData, setFormData] = useState<PaymentFormData>({
    toUser: '',
    amount: '',
    memo: '',
    paymentType: 'P2P_INTERNAL_LIGHTNING',
    enablePrivacy: false,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [feeEstimate, setFeeEstimate] = useState<FeeEstimate | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [nodeHealth, setNodeHealth] = useState<any>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({
        toUser: '',
        amount: '',
        memo: '',
        paymentType: 'P2P_INTERNAL_LIGHTNING',
        enablePrivacy: false,
      });
      setValidationErrors({});
      setFeeEstimate(null);
      loadNodeHealth();
    }
  }, [isOpen]);

  // Load node health status
  const loadNodeHealth = async () => {
    try {
      const health = await paymentsClient.getNodeHealthStatus();
      setNodeHealth(health);
    } catch (error) {
      console.warn('Failed to load node health:', error);
    }
  };

  // Calculate fee estimate when amount or payment type changes
  useEffect(() => {
    if (formData.amount && !isNaN(Number(formData.amount))) {
      calculateFeeEstimate();
    } else {
      setFeeEstimate(null);
    }
  }, [formData.amount, formData.paymentType, formData.enablePrivacy]);

  const calculateFeeEstimate = () => {
    const amount = Number(formData.amount);
    if (amount <= 0) return;

    let baseFee = 0;
    let privacyFee = 0;
    let routingFee = Math.floor(amount * 0.001); // 0.1% base routing fee
    let estimatedTime = '< 30 seconds';

    if (formData.paymentType === 'P2P_INTERNAL_LIGHTNING') {
      baseFee = Math.floor(amount * 0.001); // 0.1% for internal
      privacyFee = Math.floor(amount * 0.001); // Privacy always enabled for internal
      estimatedTime = '< 30 seconds';
    } else {
      baseFee = Math.floor(amount * 0.005); // 0.5% for external
      privacyFee = formData.enablePrivacy ? Math.floor(amount * 0.002) : 0; // 0.2% privacy fee
      estimatedTime = formData.enablePrivacy ? '1-2 minutes' : '30-60 seconds';
    }

    setFeeEstimate({
      baseFee,
      privacyFee,
      routingFee,
      total: baseFee + privacyFee + routingFee,
      estimatedTime,
    });
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    // Validate recipient
    if (!formData.toUser.trim()) {
      errors.toUser = 'Recipient is required';
    } else if (formData.paymentType === 'P2P_INTERNAL_LIGHTNING') {
      // Validate Satnam user format
      if (!formData.toUser.includes('@satnam.pub') && !formData.toUser.match(/^[0-9a-f-]{36}$/i)) {
        errors.toUser = 'Enter a Satnam username (user@satnam.pub) or user ID';
      }
    } else {
      // Validate Lightning address format
      if (!formData.toUser.includes('@') && !formData.toUser.startsWith('lnbc')) {
        errors.toUser = 'Enter a valid Lightning address or invoice';
      }
    }

    // Validate amount
    if (!formData.amount.trim()) {
      errors.amount = 'Amount is required';
    } else {
      const amount = Number(formData.amount);
      if (isNaN(amount) || amount <= 0) {
        errors.amount = 'Amount must be a positive number';
      } else if (amount > 100000000) { // 1 BTC limit
        errors.amount = 'Amount exceeds maximum limit of 100,000,000 sats';
      } else if (amount < 1) {
        errors.amount = 'Minimum amount is 1 satoshi';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      const paymentRequest = {
        toUser: formData.toUser.trim(),
        amount: Number(formData.amount),
        memo: formData.memo.trim() || undefined,
        paymentType: formData.paymentType,
        enablePrivacy: formData.paymentType === 'P2P_EXTERNAL_LIGHTNING' ? formData.enablePrivacy : undefined,
      };

      const result = await paymentsClient.sendP2PPayment(paymentRequest);

      if (result.success) {
        toast({
          title: 'Payment Sent Successfully',
          description: `Payment of ${formData.amount} sats sent via ${result.routing?.preferredNode}`,
        });

        onSuccess?.(result);
        onClose();
      } else {
        throw new Error(result.error || 'Payment failed');
      }
    } catch (error) {
      console.error('Payment error:', error);

      let errorMessage = 'Payment failed. Please try again.';
      if (error instanceof ApiError) {
        errorMessage = error.getUserFriendlyMessage();
      }

      toast({
        title: 'Payment Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatSatoshis = (sats: number): string => {
    return new Intl.NumberFormat().format(sats);
  };

  const getBTCValue = (sats: number): string => {
    return (sats / 100000000).toFixed(8);
  };

  if (!isOpen) return null;

  return (
    <>
      <ToastContainer />
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Send P2P Lightning Payment
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              disabled={isLoading}
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Payment Type Selection */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">Payment Type</label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="internal"
                      name="paymentType"
                      value="P2P_INTERNAL_LIGHTNING"
                      checked={formData.paymentType === 'P2P_INTERNAL_LIGHTNING'}
                      onChange={(e) =>
                        setFormData(prev => ({
                          ...prev,
                          paymentType: e.target.value as 'P2P_INTERNAL_LIGHTNING' | 'P2P_EXTERNAL_LIGHTNING',
                          enablePrivacy: e.target.value === 'P2P_INTERNAL_LIGHTNING' ? true : prev.enablePrivacy
                        }))
                      }
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <label htmlFor="internal" className="flex items-center gap-2 text-sm text-gray-700">
                      <Shield className="h-4 w-4 text-green-500" />
                      Internal Satnam Payment (Privacy Enabled)
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="external"
                      name="paymentType"
                      value="P2P_EXTERNAL_LIGHTNING"
                      checked={formData.paymentType === 'P2P_EXTERNAL_LIGHTNING'}
                      onChange={(e) =>
                        setFormData(prev => ({
                          ...prev,
                          paymentType: e.target.value as 'P2P_INTERNAL_LIGHTNING' | 'P2P_EXTERNAL_LIGHTNING',
                          enablePrivacy: e.target.value === 'P2P_INTERNAL_LIGHTNING' ? true : prev.enablePrivacy
                        }))
                      }
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <label htmlFor="external" className="flex items-center gap-2 text-sm text-gray-700">
                      <Zap className="h-4 w-4 text-blue-500" />
                      External Lightning Payment
                    </label>
                  </div>
                </div>
              </div>

              {/* Recipient Input */}
              <div className="space-y-2">
                <label htmlFor="toUser" className="block text-sm font-medium text-gray-700">
                  {formData.paymentType === 'P2P_INTERNAL_LIGHTNING' ? 'Satnam User' : 'Lightning Address'}
                </label>
                <input
                  id="toUser"
                  type="text"
                  placeholder={
                    formData.paymentType === 'P2P_INTERNAL_LIGHTNING'
                      ? 'user@satnam.pub or user ID'
                      : 'user@domain.com or lnbc...'
                  }
                  value={formData.toUser}
                  onChange={(e) => setFormData(prev => ({ ...prev, toUser: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${validationErrors.toUser ? 'border-red-500' : 'border-gray-300'
                    }`}
                />
                {validationErrors.toUser && (
                  <p className="text-sm text-red-500">{validationErrors.toUser}</p>
                )}
              </div>

              {/* Amount Input */}
              <div className="space-y-2">
                <label htmlFor="amount" className="block text-sm font-medium text-gray-700">Amount (satoshis)</label>
                <input
                  id="amount"
                  type="number"
                  placeholder="1000"
                  value={formData.amount}
                  onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${validationErrors.amount ? 'border-red-500' : 'border-gray-300'
                    }`}
                />
                {validationErrors.amount && (
                  <p className="text-sm text-red-500">{validationErrors.amount}</p>
                )}
                {formData.amount && !isNaN(Number(formData.amount)) && (
                  <p className="text-sm text-gray-500">
                    ≈ {getBTCValue(Number(formData.amount))} BTC
                  </p>
                )}
              </div>

              {/* Memo Input */}
              <div className="space-y-2">
                <label htmlFor="memo" className="block text-sm font-medium text-gray-700">Memo (optional)</label>
                <input
                  id="memo"
                  type="text"
                  placeholder="Payment description"
                  value={formData.memo}
                  onChange={(e) => setFormData(prev => ({ ...prev, memo: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Privacy Toggle for External Payments */}
              {formData.paymentType === 'P2P_EXTERNAL_LIGHTNING' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label htmlFor="privacy" className="flex items-center gap-2 text-sm font-medium text-gray-700">
                      <Shield className="h-4 w-4" />
                      Enable Privacy Protection
                    </label>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        id="privacy"
                        type="checkbox"
                        checked={formData.enablePrivacy}
                        onChange={(e) =>
                          setFormData(prev => ({ ...prev, enablePrivacy: e.target.checked }))
                        }
                        className="sr-only"
                      />
                      <div className={`w-11 h-6 rounded-full transition-colors ${formData.enablePrivacy ? 'bg-blue-600' : 'bg-gray-200'
                        }`}>
                        <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${formData.enablePrivacy ? 'translate-x-5' : 'translate-x-0.5'
                          } mt-0.5`} />
                      </div>
                    </label>
                  </div>
                  <div className={`flex items-center space-x-2 p-3 rounded-lg border ${formData.enablePrivacy
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-yellow-50 border-yellow-200'
                    }`}>
                    <AlertTriangle className={`h-4 w-4 ${formData.enablePrivacy ? 'text-blue-600' : 'text-yellow-600'
                      }`} />
                    <p className={`text-sm ${formData.enablePrivacy ? 'text-blue-700' : 'text-yellow-700'
                      }`}>
                      {formData.enablePrivacy
                        ? 'Privacy protection adds ~0.2% fee and 1-2 minutes processing time'
                        : 'Without privacy, your Lightning node identity may be visible to the recipient'
                      }
                    </p>
                  </div>
                </div>
              )}

              {/* Fee Estimate */}
              {feeEstimate && (
                <div className="space-y-2 p-3 bg-gray-50 rounded-lg">
                  <h4 className="font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Fee Estimate
                  </h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Base Fee:</span>
                      <span>{formatSatoshis(feeEstimate.baseFee)} sats</span>
                    </div>
                    {feeEstimate.privacyFee > 0 && (
                      <div className="flex justify-between">
                        <span>Privacy Fee:</span>
                        <span>{formatSatoshis(feeEstimate.privacyFee)} sats</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Routing Fee:</span>
                      <span>{formatSatoshis(feeEstimate.routingFee)} sats</span>
                    </div>
                    <div className="flex justify-between font-medium border-t pt-1">
                      <span>Total Fee:</span>
                      <span>{formatSatoshis(feeEstimate.total)} sats</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Estimated Time:</span>
                      <span>{feeEstimate.estimatedTime}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  disabled={isLoading || !formData.toUser || !formData.amount}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Zap className="mr-2 h-4 w-4" />
                      Send Payment
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
