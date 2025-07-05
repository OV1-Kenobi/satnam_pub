import {
    AlertTriangle,
    RefreshCw,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { copyToClipboard } from "../lib/utils";
import { SatnamFamilyMember } from "../types/shared";
import {
    FamilyMembersSection,
    InvoiceModal,
    NodeStatusSection,
    PaymentModal,
    QRCodeModal,
    TransactionHistorySection,
} from "./FamilyLightningDashboard/index";
import { NodeStatus, Transaction } from "./FamilyLightningDashboard/types";

interface FamilyLightningDashboardProps {
  familyId: string;
}

const FamilyLightningDashboard: React.FC<FamilyLightningDashboardProps> = ({ familyId }) => {
  const [familyMembers, setFamilyMembers] = useState<SatnamFamilyMember[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [nodeStatus, setNodeStatus] = useState<NodeStatus>({
    phoenixd: { connected: false, automatedLiquidity: false },
    voltage: { connected: false },
    lnproxy: { active: true, privacyLevel: "high" },
    lnbits: { operational: false },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showQRCodeModal, setShowQRCodeModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [satsToDollars, setSatsToDollars] = useState(0.0004); // Mock rate: 1 sat = $0.0004 (1 BTC = $40,000)

  // Fetch family members
  useEffect(() => {
    const fetchFamilyMembers = async () => {
      try {
        setIsLoading(true);
        // In a real implementation, this would be an API call
        // const response = await fetch(`/api/family/members?familyId=${familyId}`);
        // const data = await response.json();
        
        // Mock data for demonstration
        const mockMembers: SatnamFamilyMember[] = [
          {
            id: "1",
            username: "Satoshi",
            role: "adult",
            lightningAddress: "satoshi@satnam.pub",
            balance: 250000,
            nip05Verified: true,
            spendingLimits: {
              daily: 100000,
              weekly: 500000,
            },
          },
          {
            id: "2",
            username: "Hal",
            role: "adult",
            lightningAddress: "hal@satnam.pub",
            balance: 175000,
            nip05Verified: true,
            spendingLimits: {
              daily: 100000,
              weekly: 500000,
            },
          },
          {
            id: "3",
            username: "Alice",
            role: "child",
            lightningAddress: "alice@satnam.pub",
            balance: 45000,
            nip05Verified: false,
            spendingLimits: {
              daily: 10000,
              weekly: 50000,
            },
          },
          {
            id: "4",
            username: "Bob",
            role: "child",
            lightningAddress: "bob@satnam.pub",
            balance: 15000,
            nip05Verified: false,
            spendingLimits: {
              daily: 5000,
              weekly: 25000,
            },
          },
        ];
        
        setFamilyMembers(mockMembers);
        setIsLoading(false);
      } catch (err) {
        setError("Failed to load family members");
        setIsLoading(false);
        console.error("Error fetching family members:", err);
      }
    };

    fetchFamilyMembers();
  }, [familyId]);

  // Fetch transactions
  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        // In a real implementation, this would be an API call
        // const response = await fetch(`/api/payments/history?familyId=${familyId}`);
        // const data = await response.json();
        
        // Mock data for demonstration
        const mockTransactions: Transaction[] = [
          {
            id: "tx1",
            type: "received",
            amount: 50000,
            from: "alice@getalby.com",
            to: "satoshi@satnam.pub",
            memo: "Payment for services",
            timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
            privacyRouted: true,
            status: "completed",
          },
          {
            id: "tx2",
            type: "sent",
            amount: 25000,
            from: "satoshi@satnam.pub",
            to: "alice@satnam.pub",
            memo: "Weekly payment",
            timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4),
            privacyRouted: true,
            status: "completed",
          },
          {
            id: "tx3",
            type: "sent",
            amount: 15000,
            from: "hal@satnam.pub",
            to: "bob@walletofsatoshi.com",
            memo: "Dinner payment",
            timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24),
            privacyRouted: true,
            status: "completed",
          },
          {
            id: "tx4",
            type: "received",
            amount: 10000,
            from: "john@strike.me",
            to: "bob@satnam.pub",
            memo: "Birthday gift",
            timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48),
            privacyRouted: true,
            status: "completed",
          },
        ];
        
        setTransactions(mockTransactions);
      } catch (err) {
        console.error("Error fetching transactions:", err);
      }
    };

    fetchTransactions();
  }, [familyId]);

  // Fetch node status
  useEffect(() => {
    const fetchNodeStatus = async () => {
      try {
        // In a real implementation, this would be an API call
        // const response = await fetch(`/api/phoenixd/status`);
        // const data = await response.json();
        
        // Mock data for demonstration
        const mockStatus: NodeStatus = {
          phoenixd: {
            connected: true,
            automatedLiquidity: true,
            version: "v0.7.0",
          },
          voltage: {
            connected: true,
            nodeId: "03a1b2c3d4e5...",
          },
          lnproxy: {
            active: true,
            privacyLevel: "high",
          },
          lnbits: {
            operational: true,
          },
        };
        
        setNodeStatus(mockStatus);
      } catch (err) {
        console.error("Error fetching node status:", err);
      }
    };

    fetchNodeStatus();
    
    // Set up polling for real-time updates
    const interval = setInterval(fetchNodeStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Event handlers
  const handleCopyAddress = (address: string) => {
    copyToClipboard(address, setCopiedAddress);
  };

  const handleSendPayment = (memberId: string) => {
    setSelectedMember(memberId);
    setShowPaymentModal(true);
  };

  const handleGenerateInvoice = (memberId: string) => {
    setSelectedMember(memberId);
    setShowInvoiceModal(true);
  };

  const handleShowQRCode = (memberId: string) => {
    setSelectedMember(memberId);
    setShowQRCodeModal(true);
  };

  const handleShowPaymentModal = () => {
    setSelectedMember(null);
    setShowPaymentModal(true);
  };

  const handleShowInvoiceModal = () => {
    setSelectedMember(null);
    setShowInvoiceModal(true);
  };

  const handleClosePaymentModal = () => {
    setShowPaymentModal(false);
    setSelectedMember(null);
  };

  const handleCloseInvoiceModal = () => {
    setShowInvoiceModal(false);
    setSelectedMember(null);
  };

  const handleCloseQRCodeModal = () => {
    setShowQRCodeModal(false);
    setSelectedMember(null);
  };

  if (isLoading) {
    return (
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 text-center">
        <div className="animate-spin w-8 h-8 border-4 border-yellow-400 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-white">Loading Lightning Banking...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/30 backdrop-blur-sm rounded-2xl p-6 border border-red-500/50 text-center">
        <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-4" />
        <p className="text-white font-bold mb-2">Failed to load Lightning Banking</p>
        <p className="text-red-200">{error}</p>
        <button 
          className="mt-4 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 flex items-center space-x-2 mx-auto"
          onClick={() => window.location.reload()}
        >
          <RefreshCw className="h-4 w-4" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* DEMO MODE Banner */}
      <div className="bg-yellow-500/20 border border-yellow-500 rounded-lg p-3 text-center">
        <p className="text-yellow-300 font-bold flex items-center justify-center">
          <AlertTriangle className="h-5 w-5 mr-2" />
          DEMO MODE: PhoenixD Family Banking Integration
        </p>
      </div>

      {/* Node Status Section */}
      <NodeStatusSection 
        nodeStatus={nodeStatus} 
        familyMembers={familyMembers} 
      />

      {/* Family Members Section */}
      <FamilyMembersSection
        familyMembers={familyMembers}
        copiedAddress={copiedAddress}
        onSendPayment={handleSendPayment}
        onGenerateInvoice={handleGenerateInvoice}
        onShowQRCode={handleShowQRCode}
        onCopyAddress={handleCopyAddress}
        onShowPaymentModal={handleShowPaymentModal}
        onShowInvoiceModal={handleShowInvoiceModal}
      />

      {/* Transaction History Section */}
      <TransactionHistorySection
        transactions={transactions}
        satsToDollars={satsToDollars}
      />

      {/* Payment Modal */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={handleClosePaymentModal}
        familyMembers={familyMembers}
        selectedMember={selectedMember}
        onSelectedMemberChange={setSelectedMember}
      />

      {/* Invoice Modal */}
      <InvoiceModal
        isOpen={showInvoiceModal}
        onClose={handleCloseInvoiceModal}
        familyMembers={familyMembers}
        selectedMember={selectedMember}
        onSelectedMemberChange={setSelectedMember}
      />

      {/* QR Code Modal */}
      <QRCodeModal
        isOpen={showQRCodeModal}
        onClose={handleCloseQRCodeModal}
        familyMembers={familyMembers}
        selectedMember={selectedMember}
        copiedAddress={copiedAddress}
        onCopyAddress={handleCopyAddress}
      />
    </div>
  );
};

export default FamilyLightningDashboard;