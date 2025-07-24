import { DollarSign, Users, Zap } from 'lucide-react';
import React, { useState } from 'react';
import PaymentCascadeModal from '../../components/PaymentCascadeModal';
import { PaymentCascadeNode } from '../../lib/payment-automation';

interface FamilyMember {
  id: string;
  name: string;
  npub: string;
  role: 'guardian' | 'steward' | 'adult' | 'offspring';
}

const PaymentCascadeTest: React.FC = () => {
  const [showCascadeModal, setShowCascadeModal] = useState(false);
  const [savedCascade, setSavedCascade] = useState<PaymentCascadeNode[]>([]);

  // Sample family members for testing
  const sampleFamilyMembers: FamilyMember[] = [
    {
      id: '1',
      name: 'Alice Guardian',
      npub: 'npub1aliceguardian123456789',
      role: 'guardian'
    },
    {
      id: '2',
      name: 'Bob Steward',
      npub: 'npub1bobsteward123456789',
      role: 'steward'
    },
    {
      id: '3',
      name: 'Charlie Adult',
      npub: 'npub1charlieadult123456789',
      role: 'adult'
    },
    {
      id: '4',
      name: 'Diana Offspring',
      npub: 'npub1dianaoffspring123456789',
      role: 'offspring'
    },
    {
      id: '5',
      name: 'Eve Adult',
      npub: 'npub1eveadult123456789',
      role: 'adult'
    }
  ];

  const handleCascadeSave = (cascade: PaymentCascadeNode[]) => {
    setSavedCascade(cascade);
    setShowCascadeModal(false);
    console.log('Payment cascade saved:', cascade);
  };

  const renderCascadePreview = (nodes: PaymentCascadeNode[], level: number = 0) => {
    return nodes.map((node, index) => {
      const member = sampleFamilyMembers.find(m => m.id === node.recipientId);
      return (
        <div key={index} className="ml-4">
          <div className="flex items-center space-x-2 text-sm">
            <span className="text-gray-500">{'─'.repeat(level)}</span>
            <span className="font-medium">{member?.name || 'Unknown'}</span>
            <span className="text-gray-600">
              ({node.amount.toLocaleString()} {node.currency} via {node.method})
            </span>
          </div>
          {node.children && node.children.length > 0 && (
            <div className="ml-4">
              {renderCascadePreview(node.children, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full mb-4">
          <Zap className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Payment Cascade Test</h1>
        <p className="text-gray-600">Test the payment cascade modal functionality</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Test Controls */}
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Test Controls</h3>
          <div className="space-y-4">
            <button
              onClick={() => setShowCascadeModal(true)}
              className="w-full flex items-center justify-center space-x-2 bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              <Zap className="h-5 w-5" />
              <span>Open Cascade Modal</span>
            </button>

            <div className="text-sm text-gray-600">
              <p><strong>Total Amount:</strong> 100,000 sats</p>
              <p><strong>Family Members:</strong> {sampleFamilyMembers.length}</p>
              <p><strong>Available Methods:</strong> Voltage, LNbits, PhoenixD, eCash</p>
            </div>
          </div>
        </div>

        {/* Sample Family Members */}
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Sample Family Members</h3>
          <div className="space-y-2">
            {sampleFamilyMembers.map((member) => (
              <div key={member.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <div>
                  <span className="font-medium">{member.name}</span>
                  <span className="text-sm text-gray-500 ml-2">({member.role})</span>
                </div>
                <span className="text-xs text-gray-400 font-mono">
                  {member.npub.substring(0, 12)}...
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Saved Cascade Preview */}
      {savedCascade.length > 0 && (
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Saved Cascade Preview</h3>
          <div className="bg-gray-50 rounded-lg p-4">
            {renderCascadePreview(savedCascade)}
          </div>
          <div className="mt-4 text-sm text-gray-600">
            <p><strong>Total Distributed:</strong> {savedCascade.reduce((sum, node) => sum + node.amount, 0).toLocaleString()} sats</p>
            <p><strong>Root Payments:</strong> {savedCascade.length}</p>
          </div>
        </div>
      )}

      {/* Features Overview */}
      <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl p-6 border border-purple-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Cascade Modal Features</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Users className="h-4 w-4 text-purple-600" />
              <span className="text-sm font-medium">Family Member Selection</span>
            </div>
            <div className="flex items-center space-x-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">Amount Distribution</span>
            </div>
            <div className="flex items-center space-x-2">
              <Zap className="h-4 w-4 text-orange-600" />
              <span className="text-sm font-medium">Payment Method Selection</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm text-gray-600">
              <p>• Visual tree structure</p>
              <p>• Real-time amount tracking</p>
              <p>• Quick templates</p>
              <p>• Multi-currency support</p>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Cascade Modal */}
      <PaymentCascadeModal
        isOpen={showCascadeModal}
        onClose={() => setShowCascadeModal(false)}
        onSave={handleCascadeSave}
        familyMembers={sampleFamilyMembers}
        totalAmount={100000}
        defaultCurrency="sats"
        title="Test Payment Cascade Setup"
      />
    </div>
  );
};

export default PaymentCascadeTest; 