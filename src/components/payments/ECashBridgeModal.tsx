/**
 * eCash Bridge Modal Component
 * Provides interface for bidirectional eCash conversions between Fedimint and Cashu systems
 */

import { ArrowRightLeft, CheckCircle, Clock, Info, Loader2, Shield, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { ApiError, paymentsClient } from '../../lib/api/paymentsClient.js';

// Simple notification system
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

interface ECashBridgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (bridgeResult: any) => void;
}

interface BridgeFormData {
  sourceToken: string;
  targetDestination: string;
  operationType: 'ECASH_FEDIMINT_TO_CASHU' | 'ECASH_CASHU_TO_FEDIMINT' | 'ECASH_FEDIMINT_TO_FEDIMINT' | 'ECASH_CASHU_EXTERNAL_SWAP';
  isMultiNut: boolean;
  enablePrivacy: boolean;
}

interface ConversionPreview {
  sourceAmount: number;
  targetAmount: number;
  conversionFee: number;
  routingPath: string;
  estimatedTime: string;
  privacyLevel: 'high' | 'medium' | 'low';
}

const operationTypeOptions = [
  {
    value: 'ECASH_FEDIMINT_TO_CASHU',
    label: 'Fedimint → Cashu',
    description: 'Convert Fedimint eCash to Cashu tokens',
    icon: '🏦→🎫',
  },
  {
    value: 'ECASH_CASHU_TO_FEDIMINT',
    label: 'Cashu → Fedimint',
    description: 'Convert Cashu tokens to Fedimint eCash',
    icon: '🎫→🏦',
  },
  {
    value: 'ECASH_FEDIMINT_TO_FEDIMINT',
    label: 'Fedimint → Fedimint',
    description: 'Convert between different Fedimint federations',
    icon: '🏦→🏦',
  },
  {
    value: 'ECASH_CASHU_EXTERNAL_SWAP',
    label: 'Cashu → External Cashu',
    description: 'Swap with external Cashu mint',
    icon: '🎫→🌐',
  },
];

export function ECashBridgeModal({ isOpen, onClose, onSuccess }: ECashBridgeModalProps) {
  const { user } = useAuth();
  const { toast, ToastContainer } = useToast();

  const [formData, setBridgeFormData] = useState<BridgeFormData>({
    sourceToken: '',
    targetDestination: '',
    operationType: 'ECASH_FEDIMINT_TO_CASHU',
    isMultiNut: false,
    enablePrivacy: false,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [conversionPreview, setConversionPreview] = useState<ConversionPreview | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [detectedTokenType, setDetectedTokenType] = useState<'fedimint' | 'cashu' | 'unknown'>('unknown');

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setBridgeFormData({
        sourceToken: '',
        targetDestination: '',
        operationType: 'ECASH_FEDIMINT_TO_CASHU',
        isMultiNut: false,
        enablePrivacy: false,
      });
      setValidationErrors({});
      setConversionPreview(null);
      setDetectedTokenType('unknown');
    }
  }, [isOpen]);

  // Auto-detect token type and suggest operation
  useEffect(() => {
    if (formData.sourceToken.length > 10) {
      detectTokenType(formData.sourceToken);
    } else {
      setDetectedTokenType('unknown');
    }
  }, [formData.sourceToken]);

  // Calculate conversion preview when form data changes
  useEffect(() => {
    if (formData.sourceToken && formData.targetDestination && detectedTokenType !== 'unknown') {
      calculateConversionPreview();
    } else {
      setConversionPreview(null);
    }
  }, [formData.sourceToken, formData.targetDestination, formData.operationType, formData.enablePrivacy, detectedTokenType]);

  const detectTokenType = (token: string) => {
    try {
      if (token.startsWith('fedimint_')) {
        setDetectedTokenType('fedimint');
        // Auto-suggest Fedimint to Cashu conversion
        if (formData.operationType === 'ECASH_CASHU_TO_FEDIMINT') {
          setBridgeFormData(prev => ({ ...prev, operationType: 'ECASH_FEDIMINT_TO_CASHU' }));
        }
      } else if (token.startsWith('cashu_')) {
        setDetectedTokenType('cashu');
        // Auto-suggest Cashu to Fedimint conversion
        if (formData.operationType === 'ECASH_FEDIMINT_TO_CASHU') {
          setBridgeFormData(prev => ({ ...prev, operationType: 'ECASH_CASHU_TO_FEDIMINT' }));
        }
      } else {
        // Try to parse as base64 encoded token
        try {
          const decoded = JSON.parse(atob(token));
          if (decoded.proofs && Array.isArray(decoded.proofs)) {
            setDetectedTokenType('cashu');
          } else if (decoded.amount) {
            setDetectedTokenType('fedimint');
          } else {
            setDetectedTokenType('unknown');
          }
        } catch {
          setDetectedTokenType('unknown');
        }
      }
    } catch (error) {
      setDetectedTokenType('unknown');
    }
  };

  const calculateConversionPreview = () => {
    // Mock calculation - in real implementation, this would call an API
    const sourceAmount = estimateTokenAmount(formData.sourceToken);
    let conversionFee = 0;
    let routingPath = '';
    let estimatedTime = '';
    let privacyLevel: 'high' | 'medium' | 'low' = 'medium';

    switch (formData.operationType) {
      case 'ECASH_FEDIMINT_TO_CASHU':
      case 'ECASH_CASHU_TO_FEDIMINT':
      case 'ECASH_FEDIMINT_TO_FEDIMINT':
        conversionFee = Math.floor(sourceAmount * 0.01); // 1% for internal conversions
        routingPath = 'PhoenixD → Lightning → Target';
        estimatedTime = '< 1 minute';
        privacyLevel = 'high';
        break;
      case 'ECASH_CASHU_EXTERNAL_SWAP':
        conversionFee = Math.floor(sourceAmount * 0.02); // 2% for external swaps
        routingPath = 'Breez → Lightning → External Mint';
        estimatedTime = '2-5 minutes';
        privacyLevel = formData.enablePrivacy ? 'high' : 'medium';
        break;
    }

    if (formData.enablePrivacy && formData.operationType === 'ECASH_CASHU_EXTERNAL_SWAP') {
      conversionFee += Math.floor(sourceAmount * 0.002); // Additional 0.2% for privacy
      estimatedTime = '3-7 minutes';
    }

    setConversionPreview({
      sourceAmount,
      targetAmount: sourceAmount - conversionFee,
      conversionFee,
      routingPath,
      estimatedTime,
      privacyLevel,
    });
  };

  const estimateTokenAmount = (token: string): number => {
    // Mock estimation - in real implementation, this would parse the actual token
    try {
      if (token.startsWith('fedimint_') || token.startsWith('cashu_')) {
        const match = token.match(/_(\d+)_/);
        return match ? parseInt(match[1]) : 1000;
      }

      // Try to parse as base64 encoded token
      const decoded = JSON.parse(atob(token));
      if (decoded.amount) return decoded.amount;
      if (decoded.proofs && Array.isArray(decoded.proofs)) {
        return decoded.proofs.reduce((total: number, proof: any) => total + (proof.amount || 0), 0);
      }
    } catch {
      // Fallback estimation
    }
    return 1000; // Default estimate
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    // Validate source token
    if (!formData.sourceToken.trim()) {
      errors.sourceToken = 'Source token is required';
    } else if (formData.sourceToken.length < 10) {
      errors.sourceToken = 'Token appears to be invalid (too short)';
    } else if (detectedTokenType === 'unknown') {
      errors.sourceToken = 'Unable to detect token format. Please check the token.';
    }

    // Validate target destination
    if (!formData.targetDestination.trim()) {
      errors.targetDestination = 'Target destination is required';
    } else {
      // Basic URL validation for external operations
      if (formData.operationType === 'ECASH_CASHU_EXTERNAL_SWAP') {
        try {
          new URL(formData.targetDestination);
        } catch {
          errors.targetDestination = 'Please enter a valid mint URL';
        }
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
      const bridgeRequest = {
        sourceToken: formData.sourceToken.trim(),
        targetDestination: formData.targetDestination.trim(),
        operationType: formData.operationType,
        isMultiNut: formData.isMultiNut,
        enablePrivacy: formData.enablePrivacy,
      };

      const result = await paymentsClient.executeECashBridge(bridgeRequest);

      if (result.success) {
        toast({
          title: 'eCash Bridge Operation Successful',
          description: `Conversion completed via ${result.routing?.preferredNode}`,
        });

        onSuccess?.(result);
        onClose();
      } else {
        throw new Error(result.error || 'Bridge operation failed');
      }
    } catch (error) {
      console.error('Bridge operation error:', error);

      let errorMessage = 'Bridge operation failed. Please try again.';
      if (error instanceof ApiError) {
        errorMessage = error.getUserFriendlyMessage();
      }

      toast({
        title: 'Bridge Operation Failed',
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

  const selectedOperation = operationTypeOptions.find(op => op.value === formData.operationType);

  if (!isOpen) return null;

  return (
    <>
      <ToastContainer />
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              eCash Bridge
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
              {/* Universal Access Notice */}
              <div className="flex items-center space-x-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <p className="text-sm text-green-700">
                  eCash bridge is available to ALL users, including 'private' role users without Family Federation membership.
                </p>
              </div>

              {/* Source Token Input */}
              <div className="space-y-2">
                <label htmlFor="sourceToken" className="block text-sm font-medium text-gray-700">
                  Source eCash Token
                </label>
                <input
                  id="sourceToken"
                  type="text"
                  placeholder="Paste your Fedimint or Cashu token here"
                  value={formData.sourceToken}
                  onChange={(e) => setBridgeFormData(prev => ({ ...prev, sourceToken: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${validationErrors.sourceToken ? 'border-red-500' : 'border-gray-300'
                    }`}
                />
                {validationErrors.sourceToken && (
                  <p className="text-sm text-red-500">{validationErrors.sourceToken}</p>
                )}
                {detectedTokenType !== 'unknown' && (
                  <p className="text-sm text-green-600 flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Detected: {detectedTokenType === 'fedimint' ? 'Fedimint eCash' : 'Cashu Token'}
                  </p>
                )}
              </div>

              {/* Operation Type Selection */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Conversion Type</label>
                <select
                  value={formData.operationType}
                  onChange={(e) =>
                    setBridgeFormData(prev => ({
                      ...prev,
                      operationType: e.target.value as BridgeFormData['operationType']
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {operationTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.icon} {option.label} - {option.description}
                    </option>
                  ))}
                </select>
              </div>

              {/* Target Destination Input */}
              <div className="space-y-2">
                <label htmlFor="targetDestination" className="block text-sm font-medium text-gray-700">
                  {formData.operationType === 'ECASH_CASHU_EXTERNAL_SWAP'
                    ? 'Target Mint URL'
                    : 'Target Federation/Mint'
                  }
                </label>
                <input
                  id="targetDestination"
                  type="text"
                  placeholder={
                    formData.operationType === 'ECASH_CASHU_EXTERNAL_SWAP'
                      ? 'https://mint.example.com'
                      : 'Federation ID or mint identifier'
                  }
                  value={formData.targetDestination}
                  onChange={(e) => setBridgeFormData(prev => ({ ...prev, targetDestination: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${validationErrors.targetDestination ? 'border-red-500' : 'border-gray-300'
                    }`}
                />
                {validationErrors.targetDestination && (
                  <p className="text-sm text-red-500">{validationErrors.targetDestination}</p>
                )}
              </div>

              {/* Multi-Nut Support for External Swaps */}
              {formData.operationType === 'ECASH_CASHU_EXTERNAL_SWAP' && (
                <div className="flex items-center justify-between">
                  <label htmlFor="multinut" className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <Info className="h-4 w-4" />
                    Multi-Nut Payment Structure
                  </label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      id="multinut"
                      type="checkbox"
                      checked={formData.isMultiNut}
                      onChange={(e) =>
                        setBridgeFormData(prev => ({ ...prev, isMultiNut: e.target.checked }))
                      }
                      className="sr-only"
                    />
                    <div className={`w-11 h-6 rounded-full transition-colors ${formData.isMultiNut ? 'bg-blue-600' : 'bg-gray-200'
                      }`}>
                      <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${formData.isMultiNut ? 'translate-x-5' : 'translate-x-0.5'
                        } mt-0.5`} />
                    </div>
                  </label>
                </div>
              )}

              {/* Privacy Toggle for External Operations */}
              {formData.operationType === 'ECASH_CASHU_EXTERNAL_SWAP' && (
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
                          setBridgeFormData(prev => ({ ...prev, enablePrivacy: e.target.checked }))
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
                  {formData.enablePrivacy && (
                    <div className="flex items-center space-x-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <Shield className="h-4 w-4 text-blue-600" />
                      <p className="text-sm text-blue-700">
                        Privacy protection adds ~0.2% fee and extends processing time to 3-7 minutes
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Conversion Preview */}
              {conversionPreview && (
                <div className="space-y-2 p-3 bg-gray-50 rounded-lg">
                  <h4 className="font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Conversion Preview
                  </h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Source Amount:</span>
                      <span>{formatSatoshis(conversionPreview.sourceAmount)} sats</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Conversion Fee:</span>
                      <span>{formatSatoshis(conversionPreview.conversionFee)} sats</span>
                    </div>
                    <div className="flex justify-between font-medium border-t pt-1">
                      <span>Target Amount:</span>
                      <span>{formatSatoshis(conversionPreview.targetAmount)} sats</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Routing Path:</span>
                      <span className="text-xs">{conversionPreview.routingPath}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Estimated Time:</span>
                      <span>{conversionPreview.estimatedTime}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Privacy Level:</span>
                      <span className="capitalize">{conversionPreview.privacyLevel}</span>
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
                  disabled={isLoading || !formData.sourceToken || !formData.targetDestination}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Converting...
                    </>
                  ) : (
                    <>
                      <ArrowRightLeft className="mr-2 h-4 w-4" />
                      Convert eCash
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
