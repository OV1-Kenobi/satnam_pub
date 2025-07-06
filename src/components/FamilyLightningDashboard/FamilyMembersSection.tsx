import { CheckCircle, Copy, Download, QrCode, Send } from "lucide-react";
import React from "react";
import { formatSats, getStatusColor, getStatusIcon } from "../../lib/utils";
import { SatnamFamilyMember } from "../../types/shared";

interface FamilyMembersSectionProps {
  familyMembers: SatnamFamilyMember[];
  copiedAddress: string | null;
  onSendPayment: (memberId: string) => void;
  onGenerateInvoice: (memberId: string) => void;
  onShowQRCode: (memberId: string) => void;
  onCopyAddress: (address: string) => void;
  onShowPaymentModal: () => void;
  onShowInvoiceModal: () => void;
}

const FamilyMembersSection: React.FC<FamilyMembersSectionProps> = ({
  familyMembers,
  copiedAddress,
  onSendPayment,
  onGenerateInvoice,
  onShowQRCode,
  onCopyAddress,
  onShowPaymentModal,
  onShowInvoiceModal,
}) => {
  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Family Lightning Wallets</h2>
        <div className="flex space-x-3">
          <button
            onClick={onShowPaymentModal}
            className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 flex items-center space-x-2 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-transparent"
            aria-label="Open send payment modal"
          >
            <Send className="h-4 w-4" />
            <span>Send Payment</span>
          </button>
          <button
            onClick={onShowInvoiceModal}
            className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 flex items-center space-x-2 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-transparent"
            aria-label="Open generate invoice modal"
          >
            <Download className="h-4 w-4" />
            <span>Generate Invoice</span>
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {familyMembers.map((member) => (
          <div key={member.id} className="bg-white/10 rounded-xl p-6 hover:bg-white/15 transition-all duration-300 border border-white/20">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${
                  (member.role === "adult" || member.role === "guardian" || member.role === "steward")
                    ? "bg-gradient-to-br from-yellow-400 to-orange-500"
                    : member.role === "offspring"
                      ? "bg-gradient-to-br from-green-400 to-blue-500"
                      : "bg-gradient-to-br from-blue-400 to-purple-500"
                }`}>
                  {member.username.charAt(0)}
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg">{member.username}</h3>
                  <div className="flex items-center space-x-2">
                    <span className="text-purple-200 text-sm capitalize">{member.role}</span>
                    <div className={`flex items-center space-x-1 ${getStatusColor(member.nip05Verified ? "verified" : "pending")}`}>
                      {(() => {
                        const IconComponent = getStatusIcon(member.nip05Verified ? "verified" : "pending");
                        return <IconComponent className="h-4 w-4" />;
                      })()}
                      <span className="text-xs">{member.nip05Verified ? "Verified" : "Pending"}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-white font-bold text-lg">{formatSats(member.balance || 0)}</p>
                <p className="text-purple-200 text-sm">sats</p>
              </div>
            </div>

            <div className="bg-white/10 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-purple-200 text-sm">Lightning Address</span>
                <button
                  onClick={() => onCopyAddress(member.lightningAddress)}
                  className="text-purple-200 hover:text-white transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-transparent rounded p-1"
                  aria-label={`Copy lightning address for ${member.username}`}
                  title={copiedAddress === member.lightningAddress ? "Copied!" : "Copy address"}
                >
                  {copiedAddress === member.lightningAddress ? (
                    <CheckCircle className="h-4 w-4 text-green-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-yellow-400 font-mono text-sm">{member.lightningAddress}</p>
            </div>

            {member.spendingLimits && (
              <div className="bg-white/10 rounded-lg p-4 mb-4">
                <h4 className="text-white font-semibold mb-2 text-sm">Spending Limits</h4>
                <div className="space-y-2 text-xs">
                  {member.spendingLimits.daily && (
                    <div className="flex items-center justify-between">
                      <span className="text-purple-200">Daily</span>
                      <span className="text-white">{formatSats(member.spendingLimits.daily)} sats</span>
                    </div>
                  )}
                  {member.spendingLimits.weekly && (
                    <div className="flex items-center justify-between">
                      <span className="text-purple-200">Weekly</span>
                      <span className="text-white">{formatSats(member.spendingLimits.weekly)} sats</span>
                    </div>
                  )}
                  {member.spendingLimits.requiresApproval && (
                    <div className="flex items-center justify-between">
                      <span className="text-purple-200">Requires Approval</span>
                      <span className="text-white">{formatSats(member.spendingLimits.requiresApproval)} sats</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex space-x-2">
              <button
                onClick={() => onSendPayment(member.id)}
                className="flex-1 bg-purple-700 hover:bg-purple-800 text-white font-bold py-2 px-3 rounded-lg transition-all duration-300 text-sm flex items-center justify-center space-x-1 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-transparent"
                aria-label={`Send payment to ${member.username}`}
              >
                <Send className="h-3 w-3" />
                <span>Send</span>
              </button>
              <button
                onClick={() => onGenerateInvoice(member.id)}
                className="flex-1 bg-purple-700 hover:bg-purple-800 text-white font-bold py-2 px-3 rounded-lg transition-all duration-300 text-sm flex items-center justify-center space-x-1 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-transparent"
                aria-label={`Generate invoice for ${member.username}`}
              >
                <Download className="h-3 w-3" />
                <span>Receive</span>
              </button>
              <button
                onClick={() => onShowQRCode(member.id)}
                className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-2 px-3 rounded-lg transition-all duration-300 text-sm flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-transparent"
                aria-label={`Show QR code for ${member.username}`}
                title="Show QR Code"
              >
                <QrCode className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FamilyMembersSection;