/**
 * @fileoverview Atomic Swap Modal Component
 * @description Modal for executing atomic swaps between Fedimint and Cashu via Lightning
 */

import {
    AlertCircle,
    ArrowRight,
    Bitcoin,
    CheckCircle,
    Clock,
    Loader2,
    Shield,
    X,
    Zap
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import type { AtomicSwapRequest, AtomicSwapResult, SwapQuote, SwapQuoteRequest } from '../lib/api/atomic-swap';
import { atomicSwapAPI } from '../lib/api/atomic-swap';

interface AtomicSwapModalProps {
  isOpen: boolean;
  onClose: () => void;
  fromContext: 'family' | 'individual';
  toContext: 'family' | 'individual';
  fromMemberId: string;
  toMemberId: string;
  defaultAmount?: number;
  purpose?: 'payment' | 'gift' | 'emergency' | 'transfer';
}

interface SwapStep {
  id: number;
  title: string;
  description: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  icon: React.ReactNode;
}

export const AtomicSwapModal: React.FC<AtomicSwapModalProps> = ({
  isOpen,
  onClose,
  fromContext,
  toContext,
  fromMemberId,
  toMemberId,
  defaultAmount = 0,
  purpose = 'transfer'
}) => {
  const [step, setStep] = useState<'quote' | 'confirm' | 'executing' | 'completed' | 'failed'>('quote');
  const [amount, setAmount] = useState(defaultAmount.toString());
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [swapResult, setSwapResult] = useState<AtomicSwapResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const swapType = fromContext === 'family' ? 'fedimint_to_cashu' : 'cashu_to_fedimint';

  const swapSteps: SwapStep[] = [
    {
      id: 1,
      title: fromContext === 'family' ? 'Convert Fedimint eCash' : 'Convert Cashu eCash',
      description: fromContext === 'family' 
        ? 'Converting family eCash to Lightning invoice'
        : 'Melting individual eCash to Lightning payment',
      status: 'pending',
      icon: <Shield className="h-5 w-5" />
    },
    {
      id: 2,
      title: 'Lightning Bridge',
      description: 'Processing payment through Lightning Network',
      status: 'pending',
      icon: <Zap className="h-5 w-5" />
    },
    {
      id: 3,
      title: toContext === 'family' ? 'Mint Fedimint eCash' : 'Mint Cashu eCash',
      description: toContext === 'family'
        ? 'Depositing to family federation'
        : 'Minting individual eCash tokens',
      status: 'pending',
      icon: <Bitcoin className="h-5 w-5" />
    }
  ];

  const [currentSteps, setCurrentSteps] = useState(swapSteps);

  useEffect(() => {
    if (isOpen && defaultAmount > 0) {
      setAmount(defaultAmount.toString());
      handleGetQuote();
    }
  }, [isOpen, defaultAmount]);

  const handleGetQuote = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const quoteRequest: SwapQuoteRequest = {
        fromContext,
        toContext,
        amount: parseFloat(amount),
        swapType
      };

      const quoteResult = await atomicSwapAPI.getSwapQuote(quoteRequest);
      
      if (quoteResult.success) {
        setQuote(quoteResult);
        setStep('confirm');
      } else {
        setError(quoteResult.error || 'Failed to get swap quote');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get quote');
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteSwap = async () => {
    if (!quote) return;

    setLoading(true);
    setStep('executing');
    setError(null);

    try {
      const swapRequest: AtomicSwapRequest = {
        fromContext,
        toContext,
        fromMemberId,
        toMemberId,
        amount: parseFloat(amount),
        swapType,
        purpose,
        requiresApproval: parseFloat(amount) > 100000 // Require approval for amounts > 1000 sats
      };

      const result = await atomicSwapAPI.executeSwap(swapRequest);
      
      if (result.success) {
        setSwapResult(result);
        setStep('completed');
        
        // Update step statuses to completed
        setCurrentSteps(steps => 
          steps.map(step => ({ ...step, status: 'completed' as const }))
        );
      } else {
        setError(result.error || 'Swap execution failed');
        setStep('failed');
        
        // Mark steps as failed
        setCurrentSteps(steps => 
          steps.map(step => ({ ...step, status: 'failed' as const }))
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Swap execution failed');
      setStep('failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep('quote');
    setAmount('');
    setQuote(null);
    setSwapResult(null);
    setError(null);
    setCurrentSteps(swapSteps);
    onClose();
  };

  const formatSats = (sats: number) => {
    return new Intl.NumberFormat().format(sats);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            Atomic Swap
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Swap Direction Indicator */}
          <div className="flex items-center justify-center mb-6">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2 px-3 py-2 bg-purple-100 rounded-lg">
                <Shield className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-medium text-purple-900">
                  {fromContext === 'family' ? 'Family Fedimint' : 'Individual Cashu'}
                </span>
              </div>
              <ArrowRight className="h-5 w-5 text-gray-400" />
              <div className="flex items-center space-x-2 px-3 py-2 bg-blue-100 rounded-lg">
                <Bitcoin className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-900">
                  {toContext === 'family' ? 'Family Fedimint' : 'Individual Cashu'}
                </span>
              </div>
            </div>
          </div>

          {/* Quote Step */}
          {step === 'quote' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount (sats)
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount in satoshis"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {error && (
                <div className="flex items-center space-x-2 text-red-600 bg-red-50 p-3 rounded-lg">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              <button
                onClick={handleGetQuote}
                disabled={loading || !amount}
                className="w-full bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span>Get Quote</span>
                )}
              </button>
            </div>
          )}

          {/* Confirmation Step */}
          {step === 'confirm' && quote && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Amount:</span>
                  <span className="font-medium">{formatSats(parseFloat(amount))} sats</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Network Fees:</span>
                  <span className="font-medium">{formatSats(quote.estimatedFees.totalFee)} sats</span>
                </div>
                <div className="border-t pt-2">
                  <div className="flex justify-between">
                    <span className="font-medium">Total Cost:</span>
                    <span className="font-bold">{formatSats(quote.estimatedTotal)} sats</span>
                  </div>
                </div>
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <Clock className="h-4 w-4" />
                  <span>Estimated time: {quote.estimatedDuration}</span>
                </div>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => setStep('quote')}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleExecuteSwap}
                  disabled={loading}
                  className="flex-1 bg-green-500 text-white py-2 px-4 rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span>Execute Swap</span>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Execution Step */}
          {step === 'executing' && (
            <div className="space-y-4">
              <div className="text-center mb-4">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-500 mb-2" />
                <p className="text-sm text-gray-600">Processing atomic swap...</p>
              </div>

              <div className="space-y-3">
                {currentSteps.map((stepItem, index) => (
                  <div key={stepItem.id} className="flex items-start space-x-3">
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      stepItem.status === 'completed' ? 'bg-green-100 text-green-600' :
                      stepItem.status === 'processing' ? 'bg-blue-100 text-blue-600' :
                      stepItem.status === 'failed' ? 'bg-red-100 text-red-600' :
                      'bg-gray-100 text-gray-400'
                    }`}>
                      {stepItem.status === 'completed' ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : stepItem.status === 'processing' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : stepItem.status === 'failed' ? (
                        <AlertCircle className="h-4 w-4" />
                      ) : (
                        stepItem.icon
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{stepItem.title}</p>
                      <p className="text-xs text-gray-600">{stepItem.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed Step */}
          {step === 'completed' && swapResult && (
            <div className="space-y-4">
              <div className="text-center">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-green-900 mb-2">
                  Swap Completed Successfully!
                </h3>
                <p className="text-sm text-gray-600">
                  Your atomic swap has been processed successfully.
                </p>
              </div>

              <div className="bg-green-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Swap ID:</span>
                  <span className="font-mono text-xs">{swapResult.swapId}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Amount:</span>
                  <span className="font-medium">{formatSats(swapResult.amount)} sats</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total Fees:</span>
                  <span className="font-medium">{formatSats(swapResult.fees.totalFee)} sats</span>
                </div>
              </div>

              <button
                onClick={handleClose}
                className="w-full bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition-colors"
              >
                Close
              </button>
            </div>
          )}

          {/* Failed Step */}
          {step === 'failed' && (
            <div className="space-y-4">
              <div className="text-center">
                <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-red-900 mb-2">
                  Swap Failed
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  The atomic swap could not be completed.
                </p>
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => setStep('quote')}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Try Again
                </button>
                <button
                  onClick={handleClose}
                  className="flex-1 bg-red-500 text-white py-2 px-4 rounded-lg hover:bg-red-600 transition-colors"
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
};

export default AtomicSwapModal;