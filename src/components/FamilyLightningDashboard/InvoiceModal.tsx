import { Download, Shield, XCircle } from "lucide-react";
import React from "react";
import { FamilyMember } from "../../types/shared";

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  familyMembers: FamilyMember[];
  selectedMember: string | null;
  onSelectedMemberChange: (memberId: string) => void;
  satAmount?: number;
  usdAmount?: number;
  onSatAmountChange?: (amount: number) => void;
  onUsdAmountChange?: (amount: number) => void;
  description?: string;
  onDescriptionChange?: (description: string) => void;
  onGenerateInvoice?: () => void;
}

const InvoiceModal: React.FC<InvoiceModalProps> = ({
  isOpen,
  onClose,
  familyMembers,
  selectedMember,
  onSelectedMemberChange,
  satAmount,
  usdAmount,
  onSatAmountChange,
  onUsdAmountChange,
  description,
  onDescriptionChange,
  onGenerateInvoice,
}) => {
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

        <h2 className="text-2xl font-bold text-white mb-6">Generate Invoice</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-white font-semibold mb-2">Receiving Member</label>
            <select
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-yellow-400 transition-all duration-300"
              value={selectedMember || ""}
              onChange={(e) => onSelectedMemberChange(e.target.value)}
            >
              <option value="">Select family member</option>
              {familyMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.username} ({member.lightningAddress})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-white font-semibold mb-2">Amount</label>
            <div className="flex space-x-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  placeholder="0"
                  value={satAmount || ''}
                  onChange={(e) => onSatAmountChange?.(Number(e.target.value))}
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
                  value={usdAmount || ''}
                  onChange={(e) => onUsdAmountChange?.(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-200 focus:outline-none focus:border-yellow-400 transition-all duration-300"
                />
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-purple-200">
                  USD
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-white font-semibold mb-2">Description (Optional)</label>
            <input
              type="text"
              placeholder="What's this invoice for?"
              value={description || ''}
              onChange={(e) => onDescriptionChange?.(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-200 focus:outline-none focus:border-yellow-400 transition-all duration-300"
            />
          </div>

          <div className="bg-white/10 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-semibold">Privacy Protection</span>
              <div className="flex items-center space-x-2 text-green-400">
                <Shield className="h-4 w-4" />
                <span>Enabled</span>
              </div>
            </div>
            <p className="text-purple-200 text-sm">
              Your invoice will be wrapped with LNProxy for enhanced privacy protection.
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
              onClick={onGenerateInvoice}
              className="flex-1 bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
            >
              <Download className="h-5 w-5" />
              <span>Generate Invoice</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceModal;