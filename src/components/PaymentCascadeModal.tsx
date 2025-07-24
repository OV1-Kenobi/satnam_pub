import React, { useState, useEffect } from 'react';
import { Zap, Plus, Minus, Users, DollarSign, Bitcoin, CreditCard, ArrowRight, Crown, Shield, User, Baby, Settings } from 'lucide-react';
import { PaymentCascadeNode } from '../lib/payment-automation.js';

interface FamilyMember {
  id: string;
  name: string;
  npub: string;
  role: 'guardian' | 'steward' | 'adult' | 'offspring';
}

interface PaymentCascadeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (cascade: PaymentCascadeNode[]) => void;
  familyMembers?: FamilyMember[];
  totalAmount?: number;
  defaultCurrency?: 'sats' | 'ecash';
  title?: string;
}

const PaymentCascadeModal: React.FC<PaymentCascadeModalProps> = ({
  isOpen,
  onClose,
  onSave,
  familyMembers = [],
  totalAmount = 0,
  defaultCurrency = 'sats',
  title = 'Payment Cascade Setup'
}) => {
  const [cascade, setCascade] = useState<PaymentCascadeNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<PaymentCascadeNode | null>(null);
  const [editingNode, setEditingNode] = useState<PaymentCascadeNode | null>(null);
  const [distributedAmount, setDistributedAmount] = useState(0);
  const [remainingAmount, setRemainingAmount] = useState(totalAmount);

  const paymentMethods = [
    { id: 'voltage', name: 'Voltage', icon: Zap, color: 'text-blue-400' },
    { id: 'lnbits', name: 'LNbits', icon: Bitcoin, color: 'text-green-400' },
    { id: 'phoenixd', name: 'PhoenixD', icon: Settings, color: 'text-purple-400' },
    { id: 'ecash', name: 'eCash', icon: CreditCard, color: 'text-orange-400' }
  ];

  const roleIcons = {
    guardian: Crown,
    steward: Shield,
    adult: User,
    offspring: Baby
  };

  const roleColors = {
    guardian: 'from-red-600 to-orange-600',
    steward: 'from-purple-600 to-blue-600',
    adult: 'from-green-600 to-teal-600',
    offspring: 'from-yellow-600 to-orange-600'
  };

  useEffect(() => {
    setRemainingAmount(totalAmount - distributedAmount);
  }, [totalAmount, distributedAmount]);

  useEffect(() => {
    calculateDistributedAmount();
  }, [cascade]);

  const calculateDistributedAmount = () => {
    const total = calculateNodeAmounts(cascade);
    setDistributedAmount(total);
  };

  const calculateNodeAmounts = (nodes: PaymentCascadeNode[]): number => {
    return nodes.reduce((sum, node) => {
      const nodeTotal = node.amount + calculateNodeAmounts(node.children || []);
      return sum + nodeTotal;
    }, 0);
  };

  const addRootNode = () => {
    const newNode: PaymentCascadeNode = {
      recipientId: '',
      recipientNpub: '',
      amount: 0,
      currency: defaultCurrency,
      method: defaultCurrency === 'sats' ? 'voltage' : 'ecash',
      children: []
    };
    setCascade([...cascade, newNode]);
    setSelectedNode(newNode);
    setEditingNode(newNode);
  };

  const addChildNode = (parentNode: PaymentCascadeNode) => {
    const newNode: PaymentCascadeNode = {
      recipientId: '',
      recipientNpub: '',
      amount: 0,
      currency: defaultCurrency,
      method: defaultCurrency === 'sats' ? 'voltage' : 'ecash',
      children: []
    };

    const updatedCascade = updateNodeInCascade(cascade, parentNode, {
      ...parentNode,
      children: [...(parentNode.children || []), newNode]
    });

    setCascade(updatedCascade);
    setSelectedNode(newNode);
    setEditingNode(newNode);
  };

  const removeNode = (nodeToRemove: PaymentCascadeNode) => {
    const updatedCascade = removeNodeFromCascade(cascade, nodeToRemove);
    setCascade(updatedCascade);
    setSelectedNode(null);
    setEditingNode(null);
  };

  const updateNodeInCascade = (nodes: PaymentCascadeNode[], targetNode: PaymentCascadeNode, updatedNode: PaymentCascadeNode): PaymentCascadeNode[] => {
    return nodes.map(node => {
      if (node === targetNode) {
        return updatedNode;
      }
      if (node.children) {
        return {
          ...node,
          children: updateNodeInCascade(node.children, targetNode, updatedNode)
        };
      }
      return node;
    });
  };

  const removeNodeFromCascade = (nodes: PaymentCascadeNode[], nodeToRemove: PaymentCascadeNode): PaymentCascadeNode[] => {
    return nodes.filter(node => {
      if (node === nodeToRemove) {
        return false;
      }
      if (node.children) {
        node.children = removeNodeFromCascade(node.children, nodeToRemove);
      }
      return true;
    });
  };

  const updateNode = (node: PaymentCascadeNode, updates: Partial<PaymentCascadeNode>) => {
    const updatedNode = { ...node, ...updates };
    const updatedCascade = updateNodeInCascade(cascade, node, updatedNode);
    setCascade(updatedCascade);
    setEditingNode(updatedNode);
  };

  const handleSave = () => {
    if (remainingAmount !== 0) {
      alert(`Warning: ${remainingAmount} ${defaultCurrency} remains undistributed. Continue anyway?`);
    }
    onSave(cascade);
    onClose();
  };

  const renderNode = (node: PaymentCascadeNode, level: number = 0) => {
    const isSelected = selectedNode === node;
    const isEditing = editingNode === node;
    const MethodIcon = paymentMethods.find(m => m.id === node.method)?.icon || Zap;
    const methodColor = paymentMethods.find(m => m.id === node.method)?.color || 'text-blue-400';

    return (
      <div key={`${node.recipientId}-${level}`} className="space-y-2">
        <div
          className={`border rounded-lg p-4 transition-all duration-300 ${
            isSelected
              ? 'border-purple-500 bg-purple-500/20'
              : 'border-white/20 bg-white/5 hover:bg-white/10'
          }`}
          onClick={() => setSelectedNode(node)}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={`inline-flex items-center justify-center w-8 h-8 bg-gradient-to-br ${methodColor.replace('text-', 'bg-')} rounded-full`}>
                <MethodIcon className="h-4 w-4 text-white" />
              </div>
              <div>
                <h4 className="text-white font-semibold">
                  {node.recipientId ? familyMembers.find(m => m.id === node.recipientId)?.name || 'Unknown' : 'Select Recipient'}
                </h4>
                <p className="text-purple-200 text-sm">
                  {node.amount.toLocaleString()} {node.currency} • {paymentMethods.find(m => m.id === node.method)?.name}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  addChildNode(node);
                }}
                className="text-green-400 hover:text-green-300 transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeNode(node);
                }}
                className="text-red-400 hover:text-red-300 transition-colors"
              >
                <Minus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {isEditing && (
            <div className="space-y-3 border-t border-white/10 pt-3">
              {/* Recipient Selection */}
              <div>
                <label className="block text-white text-sm font-semibold mb-2">Recipient</label>
                <select
                  value={node.recipientId}
                  onChange={(e) => {
                    const member = familyMembers.find(m => m.id === e.target.value);
                    updateNode(node, {
                      recipientId: e.target.value,
                      recipientNpub: member?.npub || ''
                    });
                  }}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">Select a family member</option>
                  {familyMembers.map((member) => {
                    const IconComponent = roleIcons[member.role];
                    return (
                      <option key={member.id} value={member.id}>
                        {member.name} ({member.role})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-white text-sm font-semibold mb-2">Amount</label>
                <input
                  type="number"
                  value={node.amount}
                  onChange={(e) => updateNode(node, { amount: parseInt(e.target.value) || 0 })}
                  min="0"
                  max={remainingAmount + node.amount}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Currency */}
              <div>
                <label className="block text-white text-sm font-semibold mb-2">Currency</label>
                <select
                  value={node.currency}
                  onChange={(e) => updateNode(node, { currency: e.target.value as 'sats' | 'ecash' })}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="sats">Lightning (sats)</option>
                  <option value="ecash">eCash</option>
                </select>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-white text-sm font-semibold mb-2">Payment Method</label>
                <select
                  value={node.method}
                  onChange={(e) => updateNode(node, { method: e.target.value as any })}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {node.currency === 'sats' ? (
                    <>
                      <option value="voltage">Voltage</option>
                      <option value="lnbits">LNbits</option>
                      <option value="phoenixd">PhoenixD</option>
                    </>
                  ) : (
                    <option value="ecash">eCash Mint</option>
                  )}
                </select>
              </div>
            </div>
          )}

          {/* Children */}
          {node.children && node.children.length > 0 && (
            <div className="mt-4 ml-6 space-y-2">
              {node.children.map((child, index) => (
                <div key={index} className="relative">
                  <div className="absolute left-0 top-1/2 w-4 h-px bg-white/20 transform -translate-y-1/2"></div>
                  {renderNode(child, level + 1)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full mb-4">
            <Zap className="h-8 w-8 text-white" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">{title}</h3>
          <p className="text-purple-100">Set up payment cascades and splits for automated distribution</p>
        </div>

        {/* Amount Summary */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-white font-bold text-lg">{totalAmount.toLocaleString()}</div>
              <div className="text-purple-200 text-sm">Total Amount</div>
            </div>
            <div>
              <div className="text-green-400 font-bold text-lg">{distributedAmount.toLocaleString()}</div>
              <div className="text-purple-200 text-sm">Distributed</div>
            </div>
            <div>
              <div className={`font-bold text-lg ${remainingAmount >= 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                {remainingAmount.toLocaleString()}
              </div>
              <div className="text-purple-200 text-sm">Remaining</div>
            </div>
          </div>
        </div>

        {/* Cascade Tree */}
        <div className="space-y-4 mb-6">
          <div className="flex items-center justify-between">
            <h4 className="text-lg font-bold text-white">Payment Cascade</h4>
            <button
              onClick={addRootNode}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300"
            >
              <Plus className="h-4 w-4" />
              Add Root Payment
            </button>
          </div>

          {cascade.length === 0 ? (
            <div className="text-center py-12 text-purple-200">
              <Zap className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-semibold mb-2">No cascade payments configured</p>
              <p className="text-sm">Add root payments to create your payment cascade</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cascade.map((node, index) => renderNode(node))}
            </div>
          )}
        </div>

        {/* Quick Templates */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
          <h4 className="text-lg font-bold text-white mb-4">Quick Templates</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => {
                // Template: Split between guardians and stewards
                const guardians = familyMembers.filter(m => m.role === 'guardian');
                const stewards = familyMembers.filter(m => m.role === 'steward');
                
                const template: PaymentCascadeNode[] = [
                  ...guardians.map(g => ({
                    recipientId: g.id,
                    recipientNpub: g.npub,
                    amount: Math.floor(totalAmount * 0.4 / guardians.length),
                    currency: 'sats' as const,
                    method: 'voltage' as const,
                    children: []
                  })),
                  ...stewards.map(s => ({
                    recipientId: s.id,
                    recipientNpub: s.npub,
                    amount: Math.floor(totalAmount * 0.6 / stewards.length),
                    currency: 'sats' as const,
                    method: 'lnbits' as const,
                    children: []
                  }))
                ];
                setCascade(template);
              }}
              className="text-left p-3 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
            >
              <div className="text-white font-semibold">Guardian + Steward Split</div>
              <div className="text-purple-200 text-sm">40% to guardians, 60% to stewards</div>
            </button>

            <button
              onClick={() => {
                // Template: Cascade to offspring
                const adults = familyMembers.filter(m => m.role === 'adult');
                const offspring = familyMembers.filter(m => m.role === 'offspring');
                
                const template: PaymentCascadeNode[] = adults.map(adult => ({
                  recipientId: adult.id,
                  recipientNpub: adult.npub,
                  amount: Math.floor(totalAmount * 0.3 / adults.length),
                  currency: 'ecash' as const,
                  method: 'ecash' as const,
                  children: offspring.map(child => ({
                    recipientId: child.id,
                    recipientNpub: child.npub,
                    amount: Math.floor(totalAmount * 0.7 / (adults.length * offspring.length)),
                    currency: 'ecash' as const,
                    method: 'ecash' as const,
                    children: []
                  }))
                }));
                setCascade(template);
              }}
              className="text-left p-3 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
            >
              <div className="text-white font-semibold">Adult → Offspring Cascade</div>
              <div className="text-purple-200 text-sm">30% to adults, 70% to offspring via eCash</div>
            </button>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-6">
          <button
            onClick={onClose}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={cascade.length === 0}
            className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Zap className="h-4 w-4" />
            Save Cascade
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentCascadeModal; 