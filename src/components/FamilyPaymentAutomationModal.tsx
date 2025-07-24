import {
  Clock,
  Coins,
  Crown,
  Save,
  Settings,
  Shield,
  UserCheck,
  Users,
  Wallet,
  X,
  Zap
} from 'lucide-react';
import React, { useState } from 'react';
import { PaymentSchedule } from '../lib/payment-automation.js';

interface Contact {
  id: string;
  name: string;
  npub?: string;
  lightningAddress?: string;
  avatar?: string;
  role?: 'family' | 'friend' | 'business' | 'guardian';
  isOnline?: boolean;
}

interface FamilyMember {
  id: string;
  name: string;
  role: 'guardian' | 'steward' | 'adult' | 'teen' | 'child';
  avatar: string;
  lightningAddress?: string;
  npub?: string;
}

interface FamilyPaymentSchedule {
  id?: string;
  familyId: string;
  recipientType: 'family_member' | 'ln_address' | 'npub' | 'cashu_token';
  recipientAddress: string;
  recipientName: string;
  recipientId?: string;
  amount: number;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  dayOfWeek?: number;
  dayOfMonth?: number;
  enabled: boolean;
  paymentMethod: 'lightning' | 'ecash' | 'fedimint';
  memo?: string;
  requiresApproval: boolean;
  approvalThreshold: number;
  approvers: string[];
  autoApprovalLimit: number;
  createdAt?: string;
  updatedAt?: string;
}

interface FamilyPaymentAutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (schedule: Partial<PaymentSchedule>) => void;
  familyId: string;
  familyMembers: FamilyMember[];
  currentUserRole: 'guardian' | 'steward' | 'adult';
  existingSchedule?: PaymentSchedule;
}

const FamilyPaymentAutomationModal: React.FC<FamilyPaymentAutomationModalProps> = ({
  isOpen,
  onClose,
  onSave,
  familyId,
  familyMembers,
  currentUserRole,
  existingSchedule
}) => {
  const [formData, setFormData] = useState<FamilyPaymentSchedule>({
    familyId,
    recipientType: (existingSchedule?.recipientType as 'family_member' | 'ln_address' | 'npub' | 'cashu_token') || 'family_member',
    recipientAddress: existingSchedule?.recipientAddress || '',
    recipientName: existingSchedule?.recipientName || '',
    recipientId: existingSchedule?.recipientId,
    amount: existingSchedule?.amount || 21000,
    frequency: (existingSchedule?.frequency as 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom') || 'weekly',
    dayOfWeek: existingSchedule?.dayOfWeek || 1,
    dayOfMonth: existingSchedule?.dayOfMonth || 1,
    enabled: existingSchedule?.enabled ?? true,
    paymentMethod: 'lightning', // Fixed: removed non-existent property
    memo: existingSchedule?.memo || '',
    requiresApproval: existingSchedule?.requiresApproval ?? true,
    approvalThreshold: existingSchedule?.approvalThreshold || 100000,
    approvers: [], // Fixed: removed non-existent property
    autoApprovalLimit: existingSchedule?.autoApprovalLimit || 50000
  });

  const [currentTab, setCurrentTab] = useState<'basic' | 'approval' | 'advanced'>('basic');

  if (!isOpen) return null;

  const handleSave = () => {
    if (!formData.recipientAddress || !formData.recipientName || !formData.amount) {
      alert('Please fill in all required fields.');
      return;
    }

    const scheduleData: Partial<PaymentSchedule> = {
      familyId: formData.familyId,
      recipientId: formData.recipientId || formData.recipientAddress,
      recipientNpub: formData.recipientAddress,
      recipientAddress: formData.recipientAddress,
      recipientName: formData.recipientName,
      amount: formData.amount,
      currency: 'sats',
      frequency: formData.frequency === 'custom' ? 'daily' : formData.frequency as 'daily' | 'weekly' | 'monthly' | 'yearly',
      customInterval: formData.frequency === 'custom' ? 7 : undefined, // Default to 7 days for custom
      dayOfWeek: formData.dayOfWeek,
      dayOfMonth: formData.dayOfMonth,
      status: formData.enabled ? 'active' : 'paused',
      requiresApproval: formData.requiresApproval,
      approvalThreshold: formData.approvalThreshold,
      createdBy: currentUserRole,
      // paymentMethod removed - not in PaymentSchedule interface
      // approvedBy removed - not in PaymentSchedule interface
      metadata: {
        description: formData.memo,
        category: 'family_automation',
        tags: ['automated', 'family']
      },
      createdAt: existingSchedule?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    onSave(scheduleData);
    onClose();
  };

  const paymentMethods = [
    { value: 'lightning', label: 'Lightning Network', icon: Zap, description: 'Fast, low-fee payments' },
    { value: 'ecash', label: 'eCash', icon: Wallet, description: 'Private, offline-capable payments' },
    { value: 'fedimint', label: 'Fedimint', icon: Coins, description: 'Federated mint payments' }
  ];

  const frequencies = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'yearly', label: 'Yearly' }
  ];

  const recipientTypes = [
    { value: 'family_member', label: 'Family Member', icon: Users, description: 'Send to family member' },
    { value: 'ln_address', label: 'Lightning Address', icon: Zap, description: 'External Lightning address' },
    { value: 'npub', label: 'Nostr Profile', icon: UserCheck, description: 'Send to Nostr pubkey' },
    { value: 'cashu_token', label: 'Cashu Token', icon: Coins, description: 'Generate eCash token' }
  ];

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'guardian': return <Crown className="w-4 h-4 text-purple-600" />;
      case 'steward': return <Shield className="w-4 h-4 text-blue-600" />;
      case 'adult': return <UserCheck className="w-4 h-4 text-green-600" />;
      case 'teen': return <Users className="w-4 h-4 text-orange-600" />;
      case 'child': return <Users className="w-4 h-4 text-gray-600" />;
      default: return <Users className="w-4 h-4 text-gray-600" />;
    }
  };

  const canManageApprovals = currentUserRole === 'guardian' || currentUserRole === 'steward';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-orange-100">
              <Users className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {existingSchedule ? 'Edit' : 'Create'} Family Payment Schedule
              </h2>
              <p className="text-sm text-gray-500">
                Manage automated payments with family governance and approval workflows
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {[
            { id: 'basic', label: 'Basic Settings', icon: Settings },
            { id: 'approval', label: 'Approval Workflow', icon: Shield, disabled: !canManageApprovals },
            { id: 'advanced', label: 'Advanced Options', icon: Clock }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => !tab.disabled && setCurrentTab(tab.id as 'basic' | 'approval' | 'advanced')}
              className={`flex items-center space-x-2 px-6 py-3 font-medium transition-colors ${currentTab === tab.id
                ? 'text-orange-600 border-b-2 border-orange-600'
                : tab.disabled
                  ? 'text-gray-400 cursor-not-allowed'
                  : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {currentTab === 'basic' && (
            <div className="space-y-6">
              {/* Recipient Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Recipient Type *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {recipientTypes.map(type => (
                    <button
                      key={type.value}
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        recipientType: type.value as 'family_member' | 'ln_address' | 'npub' | 'cashu_token',
                        recipientAddress: '',
                        recipientName: ''
                      }))}
                      className={`flex items-center space-x-3 p-4 rounded-lg border-2 transition-colors ${formData.recipientType === type.value
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-gray-200 hover:border-gray-300'
                        }`}
                    >
                      <type.icon className={`w-5 h-5 ${formData.recipientType === type.value
                        ? 'text-orange-600'
                        : 'text-gray-500'
                        }`} />
                      <div className="text-left">
                        <div className="font-medium text-gray-900">{type.label}</div>
                        <div className="text-sm text-gray-500">{type.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Family Member Selection (if applicable) */}
              {formData.recipientType === 'family_member' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Select Family Member *
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {familyMembers.map(member => (
                      <button
                        key={member.id}
                        onClick={() => setFormData(prev => ({
                          ...prev,
                          recipientId: member.id,
                          recipientAddress: member.lightningAddress || member.npub || member.id,
                          recipientName: member.name
                        }))}
                        className={`flex items-center space-x-3 p-3 rounded-lg border-2 transition-colors ${formData.recipientId === member.id
                          ? 'border-orange-500 bg-orange-50'
                          : 'border-gray-200 hover:border-gray-300'
                          }`}
                      >
                        <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center font-semibold text-orange-600">
                          {member.avatar}
                        </div>
                        <div className="text-left flex-1">
                          <div className="font-medium text-gray-900">{member.name}</div>
                          <div className="text-sm text-gray-500 flex items-center space-x-1">
                            {getRoleIcon(member.role)}
                            <span className="capitalize">{member.role}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Recipient Address Input (for non-family members) */}
              {formData.recipientType !== 'family_member' && (
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {formData.recipientType === 'ln_address' ? 'Lightning Address' :
                        formData.recipientType === 'npub' ? 'Nostr Public Key' :
                          formData.recipientType === 'cashu_token' ? 'Cashu Mint URL' : 'Recipient Address'} *
                    </label>
                    <input
                      type="text"
                      value={formData.recipientAddress}
                      onChange={(e) => setFormData(prev => ({ ...prev, recipientAddress: e.target.value }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      placeholder={
                        formData.recipientType === 'ln_address' ? 'alice@getalby.com' :
                          formData.recipientType === 'npub' ? 'npub1...' :
                            formData.recipientType === 'cashu_token' ? 'https://mint.example.com' : 'Enter address'
                      }
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Display Name *
                    </label>
                    <input
                      type="text"
                      value={formData.recipientName}
                      onChange={(e) => setFormData(prev => ({ ...prev, recipientName: e.target.value }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      placeholder="Alice"
                    />
                  </div>
                </div>
              )}

              {/* Amount and Frequency */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payment Amount (sats) *
                  </label>
                  <div className="relative">
                    <Zap className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-orange-500" />
                    <input
                      type="number"
                      value={formData.amount}
                      onChange={(e) => setFormData(prev => ({ ...prev, amount: parseInt(e.target.value) }))}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      placeholder="21000"
                      min="1000"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    ≈ ${((formData.amount || 0) * 0.0005).toFixed(2)} USD
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Frequency *
                  </label>
                  <select
                    value={formData.frequency}
                    onChange={(e) => setFormData(prev => ({ ...prev, frequency: e.target.value as 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom' }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  >
                    {frequencies.map(freq => (
                      <option key={freq.value} value={freq.value}>{freq.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Payment Method *
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {paymentMethods.map(method => (
                    <button
                      key={method.value}
                      onClick={() => setFormData(prev => ({ ...prev, paymentMethod: method.value as 'lightning' | 'ecash' | 'fedimint' }))}
                      className={`flex items-center space-x-3 p-4 rounded-lg border-2 transition-colors ${formData.paymentMethod === method.value
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-gray-200 hover:border-gray-300'
                        }`}
                    >
                      <method.icon className={`w-5 h-5 ${formData.paymentMethod === method.value
                        ? 'text-orange-600'
                        : 'text-gray-500'
                        }`} />
                      <div className="text-left">
                        <div className="font-medium text-gray-900">{method.label}</div>
                        <div className="text-sm text-gray-500">{method.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Memo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Memo (Optional)
                </label>
                <input
                  type="text"
                  value={formData.memo}
                  onChange={(e) => setFormData(prev => ({ ...prev, memo: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Payment for family services"
                />
              </div>
            </div>
          )}

          {currentTab === 'approval' && canManageApprovals && (
            <div className="space-y-6">
              {/* Approval Requirements */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Approval Threshold (sats)
                  </label>
                  <input
                    type="number"
                    value={formData.approvalThreshold}
                    onChange={(e) => setFormData(prev => ({ ...prev, approvalThreshold: parseInt(e.target.value) }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="100000"
                    min="1000"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Payments above this amount require approval
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Auto-approval Limit (sats)
                  </label>
                  <input
                    type="number"
                    value={formData.autoApprovalLimit}
                    onChange={(e) => setFormData(prev => ({ ...prev, autoApprovalLimit: parseInt(e.target.value) }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="50000"
                    min="1000"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Payments below this amount are auto-approved
                  </p>
                </div>
              </div>

              {/* Require Approval Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-700">Require Approval</label>
                  <p className="text-xs text-gray-500">Enable approval workflow for this schedule</p>
                </div>
                <button
                  onClick={() => setFormData(prev => ({ ...prev, requiresApproval: !prev.requiresApproval }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.requiresApproval ? 'bg-orange-600' : 'bg-gray-200'
                    }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${formData.requiresApproval ? 'translate-x-6' : 'translate-x-1'
                      }`}
                  />
                </button>
              </div>

              {/* Approver Selection */}
              {formData.requiresApproval && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Select Approvers
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {familyMembers.filter(member => member.role === 'guardian' || member.role === 'steward').map(member => (
                      <button
                        key={member.id}
                        onClick={() => {
                          const approvers = formData.approvers.includes(member.id)
                            ? formData.approvers.filter(id => id !== member.id)
                            : [...formData.approvers, member.id];
                          setFormData(prev => ({ ...prev, approvers }));
                        }}
                        className={`flex items-center space-x-3 p-3 rounded-lg border-2 transition-colors ${formData.approvers.includes(member.id)
                          ? 'border-orange-500 bg-orange-50'
                          : 'border-gray-200 hover:border-gray-300'
                          }`}
                      >
                        <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center font-semibold text-orange-600">
                          {member.avatar}
                        </div>
                        <div className="text-left flex-1">
                          <div className="font-medium text-gray-900">{member.name}</div>
                          <div className="text-sm text-gray-500 flex items-center space-x-1">
                            {getRoleIcon(member.role)}
                            <span className="capitalize">{member.role}</span>
                          </div>
                        </div>
                        {formData.approvers.includes(member.id) && (
                          <div className="w-5 h-5 bg-orange-600 rounded-full flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {currentTab === 'advanced' && (
            <div className="space-y-6">
              {/* Enable/Disable */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-700">Enable Schedule</label>
                  <p className="text-xs text-gray-500">Allow this payment schedule to run automatically</p>
                </div>
                <button
                  onClick={() => setFormData(prev => ({ ...prev, enabled: !prev.enabled }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.enabled ? 'bg-orange-600' : 'bg-gray-200'
                    }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${formData.enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                  />
                </button>
              </div>

              {/* Schedule Details */}
              {formData.frequency === 'weekly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Day of Week
                  </label>
                  <select
                    value={formData.dayOfWeek}
                    onChange={(e) => setFormData(prev => ({ ...prev, dayOfWeek: parseInt(e.target.value) }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  >
                    <option value={1}>Monday</option>
                    <option value={2}>Tuesday</option>
                    <option value={3}>Wednesday</option>
                    <option value={4}>Thursday</option>
                    <option value={5}>Friday</option>
                    <option value={6}>Saturday</option>
                    <option value={0}>Sunday</option>
                  </select>
                </div>
              )}

              {formData.frequency === 'monthly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Day of Month
                  </label>
                  <select
                    value={formData.dayOfMonth}
                    onChange={(e) => setFormData(prev => ({ ...prev, dayOfMonth: parseInt(e.target.value) }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  >
                    {Array.from({ length: 28 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>{i + 1}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center space-x-2"
          >
            <Save className="w-4 h-4" />
            <span>Save Schedule</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default FamilyPaymentAutomationModal; 