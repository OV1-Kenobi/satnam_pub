import {
    AlertCircle,
    CheckCircle,
    Info,
    Loader2,
    Router,
    Send,
    Shield,
    Zap
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { FamilyPaymentRouting } from '../../types/family';

interface UnifiedFamilyPaymentsProps {
  familyId: string;
  familyMembers: Array<{
    id: string;
    username: string;
    lightningAddress: string;
    role: string;
  }>;
  onPaymentComplete?: (paymentResult: any) => void;
}

interface PaymentForm {
  fromMember: string;
  toMember: string;
  toAddress: string;
  amount: string;
  description: string;
  paymentType: 'external' | 'zap' | 'internal_governance' | 'allowance';
  preferredProtocol: 'lightning' | 'fedimint' | 'auto';
  enablePrivacy: boolean;
}

interface RoutingRecommendation {
  recommendedRoute: FamilyPaymentRouting;
  alternativeRoutes: FamilyPaymentRouting[];
  routingAnalysis: {
    totalOptions: number;
    bestProtocol: string;
    estimatedSavings: number;
  };
}

const UnifiedFamilyPayments: React.FC<UnifiedFamilyPaymentsProps> = ({
  familyId,
  familyMembers,
  onPaymentComplete,
}) => {
  const [paymentForm, setPaymentForm] = useState<PaymentForm>({
    fromMember: '',
    toMember: '',
    toAddress: '',
    amount: '',
    description: '',
    paymentType: 'external',
    preferredProtocol: 'auto',
    enablePrivacy: true,
  });

  const [routingRecommendations, setRoutingRecommendations] = useState<RoutingRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showRouting, setShowRouting] = useState(false);

  // Fetch routing recommendations
  const fetchRoutingRecommendations = async () => {
    if (!paymentForm.amount || !paymentForm.fromMember) return;

    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        familyId,
        paymentType: paymentForm.paymentType,
        amount: paymentForm.amount,
        fromMember: paymentForm.fromMember,
        ...(paymentForm.toMember && { toMember: paymentForm.toMember }),
        ...(paymentForm.toAddress && { toAddress: paymentForm.toAddress }),
      });

      const response = await fetch(`/api/family/payments/unified/routing?${params}`);
      const result = await response.json();

      if (result.success) {
        setRoutingRecommendations(result.data);
        setShowRouting(true);
      } else {
        setError(result.error || 'Failed to get routing recommendations');
      }
    } catch (err) {
      setError('Network error getting routing recommendations');
      console.error('Routing recommendations error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Execute unified payment
  const executePayment = async () => {
    if (!validateForm()) return;

    try {
      setProcessing(true);
      setError(null);
      setSuccess(null);

      const response = await fetch('/api/family/payments/unified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          familyId,
          fromMember: paymentForm.fromMember,
          toMember: paymentForm.toMember || undefined,
          toAddress: paymentForm.toAddress || undefined,
          amount: parseInt(paymentForm.amount),
          description: paymentForm.description,
          paymentType: paymentForm.paymentType,
          preferredProtocol: paymentForm.preferredProtocol,
          enablePrivacy: paymentForm.enablePrivacy,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setSuccess(`Payment completed via ${result.data.protocolUsed}! Transaction: ${result.data.transactionHash}`);
        onPaymentComplete?.(result.data);
        
        // Reset form
        setPaymentForm({
          fromMember: paymentForm.fromMember, // Keep sender
          toMember: '',
          toAddress: '',
          amount: '',
          description: '',
          paymentType: 'external',
          preferredProtocol: 'auto',
          enablePrivacy: true,
        });
        setRoutingRecommendations(null);
        setShowRouting(false);
      } else {
        setError(result.error || 'Payment failed');
      }
    } catch (err) {
      setError('Network error processing payment');
      console.error('Payment execution error:', err);
    } finally {
      setProcessing(false);
    }
  };

  // Validate form
  const validateForm = (): boolean => {
    if (!paymentForm.fromMember) {
      setError('Please select a sender');
      return false;
    }
    if (!paymentForm.toMember && !paymentForm.toAddress) {
      setError('Please select a recipient or enter an address');
      return false;
    }
    if (!paymentForm.amount || parseInt(paymentForm.amount) <= 0) {
      setError('Please enter a valid amount');
      return false;
    }
    return true;
  };

  // Update form field
  const updateForm = (field: keyof PaymentForm, value: string | boolean) => {
    setPaymentForm(prev => ({ ...prev, [field]: value }));
    setError(null);
    setSuccess(null);
    
    // Reset routing when key fields change
    if (['amount', 'fromMember', 'toMember', 'toAddress', 'paymentType'].includes(field)) {
      setRoutingRecommendations(null);
      setShowRouting(false);
    }
  };

  // Auto-detect payment type
  useEffect(() => {
    if (paymentForm.toAddress && (paymentForm.toAddress.includes('@') || paymentForm.toAddress.startsWith('ln'))) {
      if (paymentForm.toAddress.includes('nostr') || paymentForm.toAddress.includes('zap')) {
        updateForm('paymentType', 'zap');
      } else {
        updateForm('paymentType', 'external');
      }
    } else if (paymentForm.toMember) {
      updateForm('paymentType', 'internal_governance');
    }
  }, [paymentForm.toAddress, paymentForm.toMember]);

  // Format numbers
  const formatSats = (sats: number): string => {
    return new Intl.NumberFormat().format(sats);
  };

  const getProtocolIcon = (protocol: string) => {
    switch (protocol) {
      case 'lightning': return <Zap className="h-4 w-4 text-yellow-400" />;
      case 'fedimint': return <Shield className="h-4 w-4 text-purple-400" />;
      default: return <Router className="h-4 w-4 text-blue-400" />;
    }
  };

  const getProtocolColor = (protocol: string) => {
    switch (protocol) {
      case 'lightning': return 'border-yellow-400/30 bg-yellow-400/10';
      case 'fedimint': return 'border-purple-400/30 bg-purple-400/10';
      default: return 'border-blue-400/30 bg-blue-400/10';
    }
  };

  const getPaymentTypeDescription = (type: string) => {
    switch (type) {
      case 'external': return 'External Lightning payment';
      case 'zap': return 'Nostr zap via Lightning';
      case 'internal_governance': return 'Internal family transfer';
      case 'allowance': return 'Allowance distribution';
      default: return 'Payment';
    }
  };

  return (
    <div className="bg-orange-900 rounded-2xl p-6 border border-orange-400/20">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
            <Router className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Unified Family Payments</h2>
            <p className="text-orange-300">Smart routing between Lightning & Fedimint</p>
          </div>
        </div>
      </div>

      {/* Payment Form */}
      <div className="space-y-6">
        {/* Sender Selection */}
        <div>
          <label className="block text-orange-300 text-sm mb-2">From Family Member</label>
          <select
            value={paymentForm.fromMember}
            onChange={(e) => updateForm('fromMember', e.target.value)}
            className="w-full px-3 py-2 bg-orange-800 text-white rounded-lg border border-orange-600 focus:border-orange-400 focus:outline-none"
          >
            <option value="">Select sender...</option>
            {familyMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.username} ({member.role})
              </option>
            ))}
          </select>
        </div>

        {/* Recipient Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-orange-300 text-sm mb-2">To Family Member</label>
            <select
              value={paymentForm.toMember}
              onChange={(e) => updateForm('toMember', e.target.value)}
              disabled={!!paymentForm.toAddress}
              className="w-full px-3 py-2 bg-orange-800 text-white rounded-lg border border-orange-600 focus:border-orange-400 focus:outline-none disabled:opacity-50"
            >
              <option value="">Select recipient...</option>
              {familyMembers
                .filter(member => member.id !== paymentForm.fromMember)
                .map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.username} ({member.role})
                  </option>
                ))}
            </select>
          </div>
          
          <div>
            <label className="block text-orange-300 text-sm mb-2">Or External Address</label>
            <input
              type="text"
              value={paymentForm.toAddress}
              onChange={(e) => updateForm('toAddress', e.target.value)}
              disabled={!!paymentForm.toMember}
              placeholder="user@domain.com or lnbc..."
              className="w-full px-3 py-2 bg-orange-800 text-white rounded-lg border border-orange-600 focus:border-orange-400 focus:outline-none disabled:opacity-50"
            />
          </div>
        </div>

        {/* Amount and Description */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-orange-300 text-sm mb-2">Amount (sats)</label>
            <input
              type="number"
              value={paymentForm.amount}
              onChange={(e) => updateForm('amount', e.target.value)}
              placeholder="10000"
              className="w-full px-3 py-2 bg-orange-800 text-white rounded-lg border border-orange-600 focus:border-orange-400 focus:outline-none"
            />
          </div>
          
          <div>
            <label className="block text-orange-300 text-sm mb-2">Description</label>
            <input
              type="text"
              value={paymentForm.description}
              onChange={(e) => updateForm('description', e.target.value)}
              placeholder="Payment description..."
              className="w-full px-3 py-2 bg-orange-800 text-white rounded-lg border border-orange-600 focus:border-orange-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Payment Type and Protocol */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-orange-300 text-sm mb-2">Payment Type</label>
            <select
              value={paymentForm.paymentType}
              onChange={(e) => updateForm('paymentType', e.target.value as any)}
              className="w-full px-3 py-2 bg-orange-800 text-white rounded-lg border border-orange-600 focus:border-orange-400 focus:outline-none"
            >
              <option value="external">External Payment</option>
              <option value="zap">Nostr Zap</option>
              <option value="internal_governance">Internal Governance</option>
              <option value="allowance">Allowance Distribution</option>
            </select>
          </div>
          
          <div>
            <label className="block text-orange-300 text-sm mb-2">Preferred Protocol</label>
            <select
              value={paymentForm.preferredProtocol}
              onChange={(e) => updateForm('preferredProtocol', e.target.value as any)}
              className="w-full px-3 py-2 bg-orange-800 text-white rounded-lg border border-orange-600 focus:border-orange-400 focus:outline-none"
            >
              <option value="auto">Auto (Recommended)</option>
              <option value="lightning">Lightning Network</option>
              <option value="fedimint">Fedimint eCash</option>
            </select>
          </div>
        </div>

        {/* Privacy Settings */}
        <div className="flex items-center space-x-3">
          <input
            type="checkbox"
            id="enablePrivacy"
            checked={paymentForm.enablePrivacy}
            onChange={(e) => updateForm('enablePrivacy', e.target.checked)}
            className="w-4 h-4 text-orange-600 bg-orange-800 border-orange-600 rounded focus:ring-orange-500"
          />
          <label htmlFor="enablePrivacy" className="text-orange-300 text-sm">
            Enable privacy routing (LNProxy for Lightning, enhanced privacy for Fedimint)
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-3">
          <button
            onClick={fetchRoutingRecommendations}
            disabled={loading || !paymentForm.amount || !paymentForm.fromMember}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Router className="h-4 w-4" />}
            <span>Get Routing</span>
          </button>
          
          <button
            onClick={executePayment}
            disabled={processing || !validateForm()}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span>Send Payment</span>
          </button>
        </div>
      </div>

      {/* Routing Recommendations */}
      {showRouting && routingRecommendations && (
        <div className="mt-6 space-y-4">
          <h3 className="text-lg font-semibold text-white">Routing Recommendations</h3>
          
          {/* Recommended Route */}
          <div className={`border rounded-lg p-4 ${getProtocolColor(routingRecommendations.recommendedRoute.recommendedProtocol)}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                {getProtocolIcon(routingRecommendations.recommendedRoute.recommendedProtocol)}
                <span className="font-semibold text-white">Recommended: {routingRecommendations.recommendedRoute.recommendedProtocol}</span>
                <span className="text-xs bg-green-600 text-white px-2 py-1 rounded">BEST</span>
              </div>
              <div className="text-right">
                <div className="text-white font-semibold">
                  Fee: {formatSats(routingRecommendations.recommendedRoute.estimatedFee)} sats
                </div>
                <div className="text-sm text-orange-300">
                  ~{Math.round(routingRecommendations.recommendedRoute.estimatedTime / 1000)}s
                </div>
              </div>
            </div>
            
            <div className="text-sm text-orange-200 mb-2">
              {getPaymentTypeDescription(routingRecommendations.recommendedRoute.paymentType)}
            </div>
            
            <div className="text-sm text-orange-300">
              {routingRecommendations.recommendedRoute.reason}
            </div>
            
            <div className="flex items-center space-x-4 mt-2">
              <div className="flex items-center space-x-1">
                <Shield className="h-3 w-3" />
                <span className="text-xs">Privacy: {routingRecommendations.recommendedRoute.privacyLevel}</span>
              </div>
            </div>
          </div>

          {/* Alternative Routes */}
          {routingRecommendations.alternativeRoutes.length > 0 && (
            <div>
              <h4 className="text-md font-semibold text-white mb-2">Alternative Routes</h4>
              <div className="space-y-2">
                {routingRecommendations.alternativeRoutes.map((route, index) => (
                  <div key={index} className={`border rounded-lg p-3 ${getProtocolColor(route.recommendedProtocol)}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        {getProtocolIcon(route.recommendedProtocol)}
                        <span className="text-white">{route.recommendedProtocol}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-white text-sm">
                          Fee: {formatSats(route.estimatedFee)} sats
                        </div>
                        <div className="text-xs text-orange-300">
                          ~{Math.round(route.estimatedTime / 1000)}s
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-orange-300 mt-1">
                      {route.reason}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Routing Analysis */}
          <div className="bg-orange-800/30 rounded-lg p-4">
            <h4 className="text-md font-semibold text-white mb-2">Routing Analysis</h4>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-orange-300">Total Options</div>
                <div className="text-white font-semibold">{routingRecommendations.routingAnalysis.totalOptions}</div>
              </div>
              <div>
                <div className="text-orange-300">Best Protocol</div>
                <div className="text-white font-semibold capitalize">{routingRecommendations.routingAnalysis.bestProtocol}</div>
              </div>
              <div>
                <div className="text-orange-300">Potential Savings</div>
                <div className="text-white font-semibold">
                  {routingRecommendations.routingAnalysis.estimatedSavings > 0 
                    ? `${formatSats(routingRecommendations.routingAnalysis.estimatedSavings)} sats`
                    : 'N/A'
                  }
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status Messages */}
      {error && (
        <div className="mt-4 p-4 bg-red-500/20 border border-red-500/30 rounded-lg">
          <div className="flex items-center space-x-2 text-red-300">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {success && (
        <div className="mt-4 p-4 bg-green-500/20 border border-green-500/30 rounded-lg">
          <div className="flex items-center space-x-2 text-green-300">
            <CheckCircle className="h-5 w-5" />
            <span>{success}</span>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="mt-6 p-4 bg-blue-500/20 border border-blue-500/30 rounded-lg">
        <div className="flex items-start space-x-2">
          <Info className="h-5 w-5 text-blue-400 mt-0.5" />
          <div className="text-blue-300 text-sm">
            <div className="font-semibold mb-1">Smart Routing</div>
            <div>
              • <strong>Lightning:</strong> Best for external payments, Nostr zaps, and fast settlements<br/>
              • <strong>Fedimint:</strong> Best for internal governance, allowances, and zero-fee transfers<br/>
              • <strong>Auto:</strong> Automatically selects the optimal protocol based on payment context
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UnifiedFamilyPayments;