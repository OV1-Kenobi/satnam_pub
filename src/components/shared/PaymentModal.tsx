import { RefreshCw, Send, Shield, XCircle } from "lucide-react";
import React, { useEffect, useState } from "react";
import { formatSats } from '../../lib/utils.js';
import { FamilyMember } from "../../types/shared";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  familyMembers: FamilyMember[];
  selectedMember: string | null;
  onSelectedMemberChange: (memberId: string) => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  familyMembers,
  selectedMember,
  onSelectedMemberChange,
}) => {
  const [paymentForm, setPaymentForm] = useState({
    from: '',
    to: '',
    satsAmount: '',
    usdAmount: '',
    memo: ''
  });
  const [paymentLoading, setPaymentLoading] = useState(false);

  const isPaymentFormValid = paymentForm.from && paymentForm.to && 
    (paymentForm.satsAmount || paymentForm.usdAmount) &&
    // Validate amounts are positive numbers
    (paymentForm.satsAmount ? Number(paymentForm.satsAmount) > 0 : true) &&
    (paymentForm.usdAmount ? Number(paymentForm.usdAmount) > 0 : true) &&
    // Basic Lightning address/invoice validation
    (paymentForm.to.includes('@') || paymentForm.to.toLowerCase().startsWith('lnbc'));

  const handleSendPayment = async () => {
    if (!isPaymentFormValid || paymentLoading) return;
    
    setPaymentLoading(true);
    try {
      // Simulate payment processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      // In a real implementation, this would make an API call
      console.log('Payment sent:', paymentForm);
      onClose();
    } catch (error) {
      console.error('Payment failed:', error);
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
        memo: ''
      });
      setPaymentLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-purple-900 rounded-2xl p-8 max-w-md w-full border border-yellow-400/20 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white hover:text-purple-200 transition-colors duration-200"
        >
          <XCircle className="h-6 w-6" />
        </button>

        <h2 className="text-2xl font-bold text-white mb-6">Send Lightning Payment</h2>

        <div className="space-y-4">
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

          <div className="bg-white/10 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-semibold">Privacy Routing</span>
              <div className="flex items-center space-x-2 text-green-400">
                <Shield className="h-4 w-4" />
                <span>Enabled</span>
              </div>
            </div>
            <p className="text-purple-200 text-sm">
              All payments are routed through LNProxy for enhanced privacy protection.
            </p>
          </div>

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
              <span>{paymentLoading ? "Sending..." : "Send Payment"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;