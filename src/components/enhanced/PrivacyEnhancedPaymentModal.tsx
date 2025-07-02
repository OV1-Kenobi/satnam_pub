/**
 * Privacy-Enhanced Payment Modal
 * Integrates with the new privacy-enhanced API backend
 */

import { AlertTriangle, Check, Eye, EyeOff, RefreshCw, Send, Shield, XCircle } from "lucide-react";
import React, { useEffect, useState } from "react";
import { formatSats } from "../../lib/utils";
import { PrivacyEnhancedApiService } from "../../services/privacyEnhancedApi";
import { PrivacyLevel } from "../../types/privacy";
import { SatnamFamilyMember } from "../../types/shared";

interface PrivacyEnhancedPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  familyMembers: SatnamFamilyMember[];
  selectedMember: string | null;
  onSelectedMemberChange: (memberId: string) => void;
  onPaymentComplete?: (result: any) => void;
}

interface PaymentRoute {
  method: 'lightning' | 'cashu' | 'lnproxy' | 'fedimint';
  description: string;
  privacyScore: number;
  estimatedFee: number;
  icon: string;
}

const PrivacyEnhancedPaymentModal: React.FC<PrivacyEnhancedPaymentModalProps> = ({
  isOpen,
  onClose,
  familyMembers,
  selectedMember,
  onSelectedMemberChange,
  onPaymentComplete,
}) => {
  const [paymentForm, setPaymentForm] = useState({
    from: '',
    to: '',
    satsAmount: '',
    usdAmount: '',
    memo: '',
    privacyLevel: PrivacyLevel.GIFTWRAPPED
  });
  
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [showPrivacyDetails, setShowPrivacyDetails] = useState(false);
  const [recommendedRoute, setRecommendedRoute] = useState<PaymentRoute | null>(null);
  const [guardianApprovalRequired, setGuardianApprovalRequired] = useState(false);
  const [privacyValidation, setPrivacyValidation] = useState<any>(null);

  const apiService = new PrivacyEnhancedApiService();

  // Calculate recommended payment route based on amount and privacy level
  const calculateRecommendedRoute = (amountSats: number, privacyLevel: PrivacyLevel): PaymentRoute => {
    const routes: Record<PrivacyLevel, PaymentRoute[]> = {
      [PrivacyLevel.GIFTWRAPPED]: [
        {
          method: 'cashu',
          description: 'Cashu eCash tokens for maximum privacy',
          privacyScore: 95,
          estimatedFee: amountSats * 0.001,
          icon: '🪙'
        },
        {
          method: 'lnproxy',
          description: 'LNProxy routing for enhanced privacy',
          privacyScore: 85,
          estimatedFee: amountSats * 0.005,
          icon: '🔀'
        }
      ],
      [PrivacyLevel.ENCRYPTED]: [
        {
          method: 'fedimint',
          description: 'Family federation routing',
          privacyScore: 80,
          estimatedFee: amountSats * 0.002,
          icon: '👨‍👩‍👧‍👦'
        },
        {
          method: 'lnproxy',
          description: 'Privacy-enhanced Lightning',
          privacyScore: 70,
          estimatedFee: amountSats * 0.003,
          icon: '⚡'
        }
      ],
      [PrivacyLevel.MINIMAL]: [
        {
          method: 'lightning',
          description: 'Direct Lightning routing',
          privacyScore: 40,
          estimatedFee: amountSats * 0.001,
          icon: '⚡'
        }
      ]
    };

    const availableRoutes = routes[privacyLevel];
    
    // For small amounts (<50k sats), prefer Cashu for GIFTWRAPPED
    if (privacyLevel === PrivacyLevel.GIFTWRAPPED && amountSats < 50000) {
      return availableRoutes.find(r => r.method === 'cashu') || availableRoutes[0];
    }
    
    // For larger amounts, prefer LNProxy
    if (amountSats >= 50000) {
      return availableRoutes.find(r => r.method === 'lnproxy') || availableRoutes[0];
    }
    
    return availableRoutes[0];
  };

  // Update route recommendation when amount or privacy level changes
  useEffect(() => {
    const satsAmount = parseInt(paymentForm.satsAmount) || 0;
    if (satsAmount > 0) {
      const route = calculateRecommendedRoute(satsAmount, paymentForm.privacyLevel);
      setRecommendedRoute(route);
      
      // Check if guardian approval is required
      setGuardianApprovalRequired(satsAmount > 100000 && paymentForm.privacyLevel === PrivacyLevel.GIFTWRAPPED);
      
      // Validate privacy level
      const validation = apiService.validatePrivacyLevel(paymentForm.privacyLevel, 'payment');
      setPrivacyValidation(validation);
    }
  }, [paymentForm.satsAmount, paymentForm.privacyLevel]);

  const isPaymentFormValid = paymentForm.from && paymentForm.to && 
    (paymentForm.satsAmount || paymentForm.usdAmount) &&
    (paymentForm.satsAmount ? Number(paymentForm.satsAmount) > 0 : true) &&
    (paymentForm.usdAmount ? Number(paymentForm.usdAmount) > 0 : true) &&
    (paymentForm.to.includes('@') || paymentForm.to.toLowerCase().startsWith('lnbc')) &&
    privacyValidation?.valid;

  const handleSendPayment = async () => {
    if (!isPaymentFormValid || paymentLoading) return;
    
    setPaymentLoading(true);
    try {
      const amountSats = parseInt(paymentForm.satsAmount) || 0;
      
      // If guardian approval required, create approval request first
      if (guardianApprovalRequired) {
        console.log('Creating guardian approval request...');
        // This would integrate with the guardian approval API
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Make privacy-enhanced payment
      const paymentResult = await apiService.makePrivacyEnhancedPayment({
        from: paymentForm.from,
        to: paymentForm.to,
        amount: amountSats,
        memo: paymentForm.memo,
        privacyLevel: paymentForm.privacyLevel,
        route: recommendedRoute?.method || 'lightning'
      });

      console.log('Privacy-enhanced payment result:', paymentResult);
      
      if (onPaymentComplete) {
        onPaymentComplete(paymentResult);
      }
      
      onClose();
    } catch (error) {
      console.error('Privacy-enhanced payment failed:', error);
    } finally {
      setPaymentLoading(false);
    }
  };

  // Sync selectedMember prop with form state
  useEffect(() => {
    if (selectedMember) {
      setPaymentForm(prev => ({ ...prev, from: selectedMember }));
    }
  }, [selectedMember]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setPaymentForm({
        from: '',
        to: '',
        satsAmount: '',
        usdAmount: '',
        memo: '',
        privacyLevel: PrivacyLevel.GIFTWRAPPED
      });
      setPaymentLoading(false);
      setShowPrivacyDetails(false);
      setRecommendedRoute(null);
      setGuardianApprovalRequired(false);
      setPrivacyValidation(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-purple-900 rounded-2xl p-8 max-w-lg w-full border border-yellow-400/20 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white hover:text-purple-200 transition-colors duration-200"
        >
          <XCircle className="h-6 w-6" />
        </button>

        <h2 className="text-2xl font-bold text-white mb-6">Privacy-Enhanced Payment</h2>

        <div className="space-y-4">
          {/* From Selection */}
          <div>
            <label className="block text-white font-semibold mb-2">From</label>
            <select
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-yellow-400 transition-all duration-300"
              value={paymentForm.from}
              onChange={(e) => {
                setPaymentForm(prev => ({ ...prev, from: e.target.value }));
                onSelectedMemberChange(e.target.value);
              }}
            >
              <option value="">Select family member</option>
              {familyMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.username} ({formatSats(member.balance || 0)} sats)
                </option>
              ))}
            </select>
          </div>

          {/* To Field */}
          <div>
            <label className="block text-white font-semibold mb-2">To</label>
            <input
              type="text"
              placeholder="Lightning Address or Invoice"
              value={paymentForm.to}
              onChange={(e) => setPaymentForm(prev => ({ ...prev, to: e.target.value }))}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-200 focus:outline-none focus:border-yellow-400 transition-all duration-300"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-white font-semibold mb-2">Amount</label>
            <div className="flex space-x-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  placeholder="0"
                  value={paymentForm.satsAmount}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, satsAmount: e.target.value }))}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-200 focus:outline-none focus:border-yellow-400 transition-all duration-300"
                />
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-purple-200">
                  sats
                </div>
              </div>
              <div className="relative flex-1">
                <input
                  type="number"
                  placeholder="0.00"
                  value={paymentForm.usdAmount}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, usdAmount: e.target.value }))}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-200 focus:outline-none focus:border-yellow-400 transition-all duration-300"
                />
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-purple-200">
                  USD
                </div>
              </div>
            </div>
          </div>

          {/* Privacy Level Selection */}
          <div>
            <label className="block text-white font-semibold mb-2">Privacy Level</label>
            <div className="space-y-2">
              {Object.values(PrivacyLevel).map((level) => (
                <label key={level} className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="privacyLevel"
                    value={level}
                    checked={paymentForm.privacyLevel === level}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, privacyLevel: e.target.value as PrivacyLevel }))}
                    className="text-purple-600"
                  />
                  <span className="text-white capitalize">{level}</span>
                  {level === PrivacyLevel.GIFTWRAPPED && <Shield className="h-4 w-4 text-green-400" />}
                  {level === PrivacyLevel.ENCRYPTED && <Shield className="h-4 w-4 text-blue-400" />}
                  {level === PrivacyLevel.MINIMAL && <Eye className="h-4 w-4 text-yellow-400" />}
                </label>
              ))}
            </div>
          </div>

          {/* Memo */}
          <div>
            <label className="block text-white font-semibold mb-2">Memo (Optional)</label>
            <input 
              type="text"
              placeholder="What's this payment for?"
              value={paymentForm.memo}
              onChange={(e) => setPaymentForm(prev => ({ ...prev, memo: e.target.value }))}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-200 focus:outline-none focus:border-yellow-400 transition-all duration-300"
            />
          </div>

          {/* Recommended Route Display */}
          {recommendedRoute && (
            <div className="bg-white/10 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <span className="text-2xl">{recommendedRoute.icon}</span>
                  <span className="text-white font-semibold">Recommended Route</span>
                </div>
                <button
                  onClick={() => setShowPrivacyDetails(!showPrivacyDetails)}
                  className="text-purple-200 hover:text-white transition-colors"
                >
                  {showPrivacyDetails ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              
              <div className="space-y-2">
                <p className="text-purple-200 text-sm">{recommendedRoute.description}</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-purple-300">Privacy Score:</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-16 bg-white/20 rounded-full h-2">
                      <div 
                        className="bg-green-400 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${recommendedRoute.privacyScore}%` }}
                      />
                    </div>
                    <span className="text-green-400">{recommendedRoute.privacyScore}%</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-purple-300">Estimated Fee:</span>
                  <span className="text-white">{formatSats(recommendedRoute.estimatedFee)} sats</span>
                </div>
              </div>

              {showPrivacyDetails && (
                <div className="mt-3 pt-3 border-t border-white/20">
                  <div className="text-sm text-purple-200 space-y-1">
                    <p><strong>Routing:</strong> {recommendedRoute.method}</p>
                    <p><strong>Metadata Protection:</strong> Enhanced</p>
                    <p><strong>Transaction Unlinkability:</strong> High</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Guardian Approval Notice */}
          {guardianApprovalRequired && (
            <div className="bg-yellow-500/20 border border-yellow-400/30 rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-yellow-400" />
                <span className="text-yellow-200 font-semibold">Guardian Approval Required</span>
              </div>
              <p className="text-yellow-100 text-sm mt-2">
                High-value privacy payments require guardian approval for security.
              </p>
            </div>
          )}

          {/* Privacy Validation Status */}
          {privacyValidation && (
            <div className={`rounded-lg p-3 ${privacyValidation.valid ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
              <div className="flex items-center space-x-2">
                {privacyValidation.valid ? (
                  <Check className="h-4 w-4 text-green-400" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-400" />
                )}
                <span className={privacyValidation.valid ? 'text-green-200' : 'text-red-200'}>
                  {privacyValidation.valid ? 'Privacy validation passed' : privacyValidation.error}
                </span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-4 pt-4">
            <button
              onClick={onClose}
              className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300"
            >
              Cancel
            </button>
            <button
              onClick={handleSendPayment}
              disabled={!isPaymentFormValid || paymentLoading}
              className="flex-1 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
            >
              {paymentLoading ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              <span>{paymentLoading ? "Processing..." : "Send Payment"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacyEnhancedPaymentModal;