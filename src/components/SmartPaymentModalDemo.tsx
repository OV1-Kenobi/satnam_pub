import { Bitcoin, Download, Send, Users, Zap } from "lucide-react";
import React, { useState } from "react";
import { FamilyMember } from "../types/shared";
import SmartPaymentModal from "./SmartPaymentModal";

// Mock family members data
const mockFamilyMembers: FamilyMember[] = [
  {
    id: "1",
    username: "satnam_dad",
    lightningAddress: "satnam_dad@my.satnam.pub",
    role: "adult",
  },
  {
    id: "2",
    username: "satnam_mom",
    lightningAddress: "satnam_mom@my.satnam.pub",
    role: "adult",
  },
  {
    id: "3",
    username: "satnam_teen",
    lightningAddress: "satnam_teen@my.satnam.pub",
    role: "offspring",
    spendingLimits: {
      daily: 100000,
      weekly: 500000,
    },
  },
  {
    id: "4",
    username: "satnam_kid",
    lightningAddress: "satnam_kid@my.satnam.pub",
    role: "offspring",
    spendingLimits: {
      daily: 50000,
      weekly: 200000,
    },
  },
];

const SmartPaymentModalDemo: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"send" | "receive">("send");
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [recentPayments, setRecentPayments] = useState<any[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<any[]>([]);

  // Mock exchange rate (sats to USD)
  const satsToDollars = 0.00004; // $0.00004 per sat

  const formatSats = (sats: number): string => {
    return new Intl.NumberFormat().format(sats);
  };

  const formatUSD = (sats: number): string => {
    return (sats * satsToDollars).toFixed(2);
  };

  const handleOpenModal = (type: "send" | "receive", memberId?: string) => {
    setModalType(type);
    setSelectedMemberId(memberId || "");
    setIsModalOpen(true);
  };

  const handlePaymentSuccess = (payment: any) => {
    const newPayment = {
      id: Date.now().toString(),
      ...payment,
      timestamp: new Date().toISOString(),
      status: "completed",
    };
    setRecentPayments(prev => [newPayment, ...prev.slice(0, 4)]);
  };

  const handleInvoiceGenerated = (invoice: string, qrCode: string) => {
    const newInvoice = {
      id: Date.now().toString(),
      invoice,
      qrCode,
      timestamp: new Date().toISOString(),
      status: "pending",
    };
    setRecentInvoices(prev => [newInvoice, ...prev.slice(0, 4)]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">
            Smart Payment Modal Demo
          </h1>
          <p className="text-xl text-purple-200 mb-8">
            Enhanced Lightning payment modal for family transactions in Satnam.pub
          </p>
          <div className="flex items-center justify-center space-x-6 text-orange-300">
            <div className="flex items-center space-x-2">
              <Zap className="h-5 w-5" />
              <span>Lightning Fast</span>
            </div>
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5" />
              <span>Family Friendly</span>
            </div>
            <div className="flex items-center space-x-2">
              <Bitcoin className="h-5 w-5" />
              <span>Privacy First</span>
            </div>
          </div>
        </div>

        {/* Family Members Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {mockFamilyMembers.map((member) => (
            <div
              key={member.id}
              className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-orange-500/20 hover:border-orange-500/40 transition-all duration-300"
            >
              <div className="flex items-center space-x-3 mb-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${(member.role === "adult" || member.role === "guardian")
                  ? "bg-gradient-to-br from-orange-500 to-amber-500"
                  : "bg-gradient-to-br from-amber-400 to-orange-400"
                  }`}>
                  {member.username?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <div>
                  <h3 className="text-white font-semibold">{member.username}</h3>
                  <p className="text-orange-300 text-sm capitalize">{member.role}</p>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-white/70">Balance:</span>
                  <span className="text-white">{formatSats(member.balance || 0)} sats</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/70">USD Value:</span>
                  <span className="text-green-400">${formatUSD(member.balance || 0)}</span>
                </div>
                {member.spendingLimits && (
                  <div className="flex justify-between text-sm">
                    <span className="text-white/70">Daily Limit:</span>
                    <span className="text-amber-400">{formatSats(member.spendingLimits.daily ?? 0)} sats</span>
                  </div>
                )}
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={() => handleOpenModal("send", member.id)}
                  className="flex-1 px-3 py-2 bg-orange-500/20 border border-orange-500/30 rounded-lg text-orange-300 hover:bg-orange-500/30 transition-all duration-300 flex items-center justify-center space-x-1"
                >
                  <Send className="h-4 w-4" />
                  <span className="text-sm">Send</span>
                </button>
                <button
                  onClick={() => handleOpenModal("receive", member.id)}
                  className="flex-1 px-3 py-2 bg-amber-500/20 border border-amber-500/30 rounded-lg text-amber-300 hover:bg-amber-500/30 transition-all duration-300 flex items-center justify-center space-x-1"
                >
                  <Download className="h-4 w-4" />
                  <span className="text-sm">Receive</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Quick Action Buttons */}
        <div className="flex justify-center space-x-4 mb-12">
          <button
            onClick={() => handleOpenModal("send")}
            className="px-8 py-4 bg-gradient-to-r from-orange-500 to-amber-500 rounded-xl text-white font-semibold hover:from-orange-600 hover:to-amber-600 transition-all duration-300 flex items-center space-x-2 shadow-lg"
          >
            <Send className="h-5 w-5" />
            <span>Send Payment</span>
          </button>
          <button
            onClick={() => handleOpenModal("receive")}
            className="px-8 py-4 bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl text-white font-semibold hover:from-amber-600 hover:to-orange-600 transition-all duration-300 flex items-center space-x-2 shadow-lg"
          >
            <Download className="h-5 w-5" />
            <span>Generate Invoice</span>
          </button>
        </div>

        {/* Recent Activity */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* Recent Payments */}
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-orange-500/20">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center space-x-2">
              <Send className="h-5 w-5 text-orange-400" />
              <span>Recent Payments</span>
            </h3>
            {recentPayments.length > 0 ? (
              <div className="space-y-3">
                {recentPayments.map((payment) => (
                  <div key={payment.id} className="bg-white/5 rounded-lg p-3">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-white font-medium">
                          To: {mockFamilyMembers.find(m => m.id === payment.toMember)?.username || payment.toMember}
                        </p>
                        <p className="text-white/70 text-sm">
                          From: {mockFamilyMembers.find(m => m.id === payment.fromMember)?.username}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-orange-300 font-semibold">
                          {formatSats(payment.amount)} sats
                        </p>
                        <p className="text-green-400 text-sm">
                          ${formatUSD(payment.amount)}
                        </p>
                      </div>
                    </div>
                    {payment.memo && (
                      <p className="text-white/60 text-sm italic">"{payment.memo}"</p>
                    )}
                    <div className="flex justify-between items-center mt-2 text-xs">
                      <span className="text-white/50">
                        {new Date(payment.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="text-green-400 capitalize">{payment.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-white/50 text-center py-8">No recent payments</p>
            )}
          </div>

          {/* Recent Invoices */}
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-orange-500/20">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center space-x-2">
              <Download className="h-5 w-5 text-amber-400" />
              <span>Recent Invoices</span>
            </h3>
            {recentInvoices.length > 0 ? (
              <div className="space-y-3">
                {recentInvoices.map((invoice) => (
                  <div key={invoice.id} className="bg-white/5 rounded-lg p-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-white font-medium">Invoice Generated</span>
                      <span className="text-amber-400 capitalize">{invoice.status}</span>
                    </div>
                    <p className="text-white/70 text-sm mb-2">
                      {new Date(invoice.timestamp).toLocaleString()}
                    </p>
                    <div className="bg-white/5 rounded p-2">
                      <p className="text-xs text-white/60 font-mono break-all">
                        {invoice.invoice.substring(0, 50)}...
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-white/50 text-center py-8">No recent invoices</p>
            )}
          </div>
        </div>

        {/* Features List */}
        <div className="mt-12 bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-orange-500/20">
          <h3 className="text-2xl font-bold text-white mb-6 text-center">Modal Features</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <Users className="h-6 w-6 text-orange-400" />
              </div>
              <h4 className="text-white font-semibold mb-2">Family Member Search</h4>
              <p className="text-white/70 text-sm">
                Searchable dropdown with real-time filtering of family members
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <Bitcoin className="h-6 w-6 text-amber-400" />
              </div>
              <h4 className="text-white font-semibold mb-2">Dual Currency</h4>
              <p className="text-white/70 text-sm">
                Real-time conversion between sats and USD with live exchange rates
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <Zap className="h-6 w-6 text-orange-400" />
              </div>
              <h4 className="text-white font-semibold mb-2">Smart Routing</h4>
              <p className="text-white/70 text-sm">
                Intelligent payment routing with privacy and fee optimization
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Smart Payment Modal */}
      <SmartPaymentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        type={modalType}
        familyMembers={mockFamilyMembers}
        selectedMemberId={selectedMemberId}
        satsToDollars={satsToDollars}
        onPaymentSuccess={handlePaymentSuccess}
        onInvoiceGenerated={handleInvoiceGenerated}
      />
    </div>
  );
};

export default SmartPaymentModalDemo;