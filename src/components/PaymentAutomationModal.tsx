import {
    Bell,
    Building,
    Clock,
    Coins,
    Globe,
    Lightning,
    Mail,
    Route,
    Save,
    Settings,
    Shield,
    UserCheck,
    Users,
    X,
    Zap
} from 'lucide-react';
import React, { useState } from 'react';

import {
    NotificationSettings,
    PaymentConditions,
    PaymentContext,
    PaymentRouting,
    PaymentSchedule,
    RecipientType
} from '../lib/payment-automation';

interface PaymentAutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (schedule: Partial<PaymentSchedule>) => void;
  context: PaymentContext; // 'individual' | 'family'
  userId: string;
  familyId?: string;
  familyMembers?: Array<{
    id: string;
    name: string;
    role: 'parent' | 'child' | 'guardian';
    avatar: string;
    lightningAddress?: string;
    npub?: string;
  }>;
  existingSchedule?: PaymentSchedule;
}

const PaymentAutomationModal: React.FC<PaymentAutomationModalProps> = ({
  isOpen,
  onClose,
  onSave,
  context,
  userId,
  familyId,
  familyMembers = [],
  existingSchedule
}) => {
  const [formData, setFormData] = useState<Partial<PaymentSchedule>>({
    context,
    userId,
    familyId,
    recipientType: existingSchedule?.recipientType || 'ln_address',
    recipientAddress: existingSchedule?.recipientAddress || '',
    recipientName: existingSchedule?.recipientName || '',
    amount: existingSchedule?.amount || 21000, // 21k sats default
    frequency: existingSchedule?.frequency || 'weekly',
    dayOfWeek: existingSchedule?.dayOfWeek || 1, // Monday
    dayOfMonth: existingSchedule?.dayOfMonth || 1,
    enabled: existingSchedule?.enabled ?? true,
    paymentRouting: existingSchedule?.paymentRouting || (context === 'individual' ? 'breez' : 'phoenixd'),
    routingPreferences: existingSchedule?.routingPreferences || {
      maxFeePercent: 1.0,
      privacyMode: true,
      routingStrategy: 'balanced'
    },
    protocolPreferences: existingSchedule?.protocolPreferences || {
      primary: 'lightning',
      fallback: ['cashu'],
      cashuMintUrl: 'https://mint.satnam.pub'
    },
    paymentPurpose: existingSchedule?.paymentPurpose || 'custom',
    memo: existingSchedule?.memo || '',
    tags: existingSchedule?.tags || [],
    autoApprovalLimit: existingSchedule?.autoApprovalLimit || (context === 'individual' ? 1000000 : 100000),
    parentApprovalRequired: existingSchedule?.parentApprovalRequired ?? (context === 'family'),
    preferredMethod: existingSchedule?.preferredMethod || 'auto',
    maxRetries: existingSchedule?.maxRetries || 3,
    retryDelay: existingSchedule?.retryDelay || 30,
    conditions: existingSchedule?.conditions || {
      maxDailySpend: context === 'individual' ? 1000000 : 200000,
      maxTransactionSize: context === 'individual' ? 500000 : 100000,
      requireApprovalAbove: context === 'individual' ? 1000000 : 500000,
      pauseOnSuspiciousActivity: true,
      maxLightningAmount: 2000000,
      maxCashuAmount: 1000000,
      maxFedimintAmount: context === 'family' ? 5000000 : 0,
      minimumPrivacyScore: 70,
      requireTorRouting: false,
      avoidKYCNodes: true
    },
    notificationSettings: existingSchedule?.notificationSettings || {
      notifyOnDistribution: true,
      notifyOnFailure: true,
      notifyOnSuspiciousActivity: true,
      notificationMethods: ['email']
    }
  });

  const [currentTab, setCurrentTab] = useState<'basic' | 'routing' | 'conditions' | 'notifications'>('basic');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Available routing methods based on context
  const availableRoutingMethods = context === 'individual' 
    ? [
        { value: 'breez', label: 'Breez Node', description: 'Primary Lightning node for individuals', icon: Lightning },
        { value: 'cashu_mint', label: 'Cashu eCash', description: 'Private eCash payments via mint', icon: Coins },
        { value: 'external_ln', label: 'External Lightning', description: 'Route via external Lightning network', icon: Globe }
      ]
    : [
        { value: 'phoenixd', label: 'PhoenixD', description: 'Family Lightning channels', icon: Lightning },
        { value: 'voltage', label: 'Voltage Enterprise', description: 'Enterprise Lightning infrastructure', icon: Building },
        { value: 'internal_fedimint', label: 'Family Fedimint', description: 'Internal federation transfers', icon: Users },
        { value: 'cashu_mint', label: 'Cashu eCash', description: 'Family eCash via mint', icon: Coins },
        { value: 'external_ln', label: 'External Lightning', description: 'Route to external addresses', icon: Globe }
      ];

  // Available recipient types based on context
  const availableRecipientTypes = context === 'family'
    ? [
        { value: 'family_member', label: 'Family Member', description: 'Send to family member', icon: Users },
        { value: 'ln_address', label: 'Lightning Address', description: 'External Lightning address', icon: Lightning },
        { value: 'npub', label: 'Nostr Profile', description: 'Send to Nostr pubkey', icon: UserCheck },
        { value: 'cashu_token', label: 'Cashu Token', description: 'Generate eCash token', icon: Coins }
      ]
    : [
        { value: 'ln_address', label: 'Lightning Address', description: 'External Lightning address', icon: Lightning },
        { value: 'npub', label: 'Nostr Profile', description: 'Send to Nostr pubkey', icon: UserCheck },
        { value: 'cashu_token', label: 'Cashu Token', description: 'Generate eCash token', icon: Coins }
      ];

  if (!isOpen) return null;

  const handleSave = () => {
    // Validate required fields
    if (!formData.recipientAddress || !formData.recipientName || !formData.amount) {
      alert('Please fill in all required fields.');
      return;
    }

    // Calculate next distribution date
    const nextDistribution = calculateNextDistribution(
      formData.frequency!,
      formData.dayOfWeek,
      formData.dayOfMonth
    );

    const scheduleData: Partial<PaymentSchedule> = {
      ...formData,
      nextDistribution,
      distributionCount: existingSchedule?.distributionCount || 0,
      totalDistributed: existingSchedule?.totalDistributed || 0,
      createdAt: existingSchedule?.createdAt || new Date(),
      updatedAt: new Date(),
    };

    onSave(scheduleData);
    onClose();
  };

  const calculateNextDistribution = (
    frequency: string,
    dayOfWeek?: number,
    dayOfMonth?: number
  ): Date => {
    const now = new Date();
    const next = new Date(now);

    switch (frequency) {
      case 'daily':
        next.setDate(now.getDate() + 1);
        break;
      case 'weekly':
        const daysUntilTarget = ((dayOfWeek || 0) - now.getDay() + 7) % 7;
        next.setDate(now.getDate() + (daysUntilTarget || 7));
        break;
      case 'monthly':
        next.setMonth(now.getMonth() + 1);
        next.setDate(Math.min(dayOfMonth || 1, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
        break;
    }

    next.setHours(9, 0, 0, 0); // 9 AM distribution time
    return next;
  };

  const handleRecipientTypeChange = (recipientType: RecipientType) => {
    setFormData(prev => ({
      ...prev,
      recipientType,
      recipientAddress: '',
      recipientName: ''
    }));
  };

  const handleFamilyMemberSelect = (memberId: string) => {
    const member = familyMembers.find(m => m.id === memberId);
    if (member) {
      setFormData(prev => ({
        ...prev,
        recipientAddress: member.lightningAddress || member.npub || memberId,
        recipientName: member.name,
        recipientMetadata: {
          familyRole: member.role,
          publicKey: member.npub,
          profilePicture: member.avatar
        }
      }));
    }
  };

  const updateConditions = (field: keyof PaymentConditions, value: any) => {
    setFormData(prev => ({
      ...prev,
      conditions: {
        ...prev.conditions!,
        [field]: value
      }
    }));
  };

  const updateRoutingPreferences = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      routingPreferences: {
        ...prev.routingPreferences!,
        [field]: value
      }
    }));
  };

  const updateProtocolPreferences = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      protocolPreferences: {
        ...prev.protocolPreferences!,
        [field]: value
      }
    }));
  };

  const updateNotificationSettings = (field: keyof NotificationSettings, value: any) => {
    setFormData(prev => ({
      ...prev,
      notificationSettings: {
        ...prev.notificationSettings!,
        [field]: value
      }
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${context === 'individual' ? 'bg-blue-100' : 'bg-orange-100'}`}>
              {context === 'individual' ? (
                <UserCheck className={`w-6 h-6 ${context === 'individual' ? 'text-blue-600' : 'text-orange-600'}`} />
              ) : (
                <Users className={`w-6 h-6 ${context === 'individual' ? 'text-blue-600' : 'text-orange-600'}`} />
              )}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {existingSchedule ? 'Edit' : 'Create'} {context === 'individual' ? 'Individual' : 'Family'} Payment Schedule
              </h2>
              <p className="text-sm text-gray-500">
                Automate recurring payments with multi-protocol support
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
            { id: 'routing', label: 'Payment Routing', icon: Route },
            { id: 'conditions', label: 'Controls & Limits', icon: Shield },
            { id: 'notifications', label: 'Notifications', icon: Bell }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id as any)}
              className={`flex items-center space-x-2 px-6 py-3 font-medium transition-colors ${
                currentTab === tab.id
                  ? `${context === 'individual' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-orange-600 border-b-2 border-orange-600'}`
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
                  {availableRecipientTypes.map(type => (
                    <button
                      key={type.value}
                      onClick={() => handleRecipientTypeChange(type.value as RecipientType)}
                      className={`flex items-center space-x-3 p-4 rounded-lg border-2 transition-colors ${
                        formData.recipientType === type.value
                          ? `${context === 'individual' ? 'border-blue-500 bg-blue-50' : 'border-orange-500 bg-orange-50'}`
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <type.icon className={`w-5 h-5 ${
                        formData.recipientType === type.value
                          ? `${context === 'individual' ? 'text-blue-600' : 'text-orange-600'}`
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
              {formData.recipientType === 'family_member' && context === 'family' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Select Family Member *
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {familyMembers.map(member => (
                      <button
                        key={member.id}
                        onClick={() => handleFamilyMemberSelect(member.id)}
                        className={`flex items-center space-x-3 p-3 rounded-lg border-2 transition-colors ${
                          formData.recipientAddress === (member.lightningAddress || member.npub || member.id)
                            ? 'border-orange-500 bg-orange-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center font-semibold text-orange-600">
                          {member.avatar}
                        </div>
                        <div className="text-left">
                          <div className="font-medium text-gray-900">{member.name}</div>
                          <div className="text-sm text-gray-500 capitalize">{member.role}</div>
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
                      className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent ${
                        context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                      }`}
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
                      className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent ${
                        context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                      }`}
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
                    <Zap className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${
                      context === 'individual' ? 'text-blue-500' : 'text-orange-500'
                    }`} />
                    <input
                      type="number"
                      value={formData.amount}
                      onChange={(e) => setFormData(prev => ({ ...prev, amount: parseInt(e.target.value) }))}
                      className={`w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent ${
                        context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                      }`}
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
                    onChange={(e) => setFormData(prev => ({ ...prev, frequency: e.target.value as any }))}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent ${
                      context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                    }`}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
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
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent ${
                      context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                    }`}
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
                  <input
                    type="number"
                    value={formData.dayOfMonth}
                    onChange={(e) => setFormData(prev => ({ ...prev, dayOfMonth: parseInt(e.target.value) }))}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent ${
                      context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                    }`}
                    min="1"
                    max="31"
                  />
                </div>
              )}

              {/* Payment Purpose and Memo */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payment Purpose
                  </label>
                  <select
                    value={formData.paymentPurpose}
                    onChange={(e) => setFormData(prev => ({ ...prev, paymentPurpose: e.target.value as any }))}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent ${
                      context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                    }`}
                  >
                    <option value="custom">Custom</option>
                    <option value="allowance">Allowance</option>
                    <option value="subscription">Subscription</option>
                    <option value="donation">Donation</option>
                    <option value="bill_payment">Bill Payment</option>
                    <option value="gift">Gift</option>
                    <option value="dca">Dollar Cost Average</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Memo (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.memo}
                    onChange={(e) => setFormData(prev => ({ ...prev, memo: e.target.value }))}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent ${
                      context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                    }`}
                    placeholder="Payment memo"
                  />
                </div>
              </div>
            </div>
          )}

          {currentTab === 'routing' && (
            <div className="space-y-6">
              <div className={`${context === 'individual' ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'} border rounded-lg p-4`}>
                <div className="flex items-center space-x-2">
                  <Route className={`w-5 h-5 ${context === 'individual' ? 'text-blue-600' : 'text-orange-600'}`} />
                  <h3 className={`font-medium ${context === 'individual' ? 'text-blue-900' : 'text-orange-900'}`}>
                    {context === 'individual' ? 'Individual' : 'Family'} Payment Routing
                  </h3>
                </div>
                <p className={`text-sm mt-1 ${context === 'individual' ? 'text-blue-700' : 'text-orange-700'}`}>
                  Configure how payments are routed and processed
                </p>
              </div>

              {/* Routing Method Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Primary Routing Method
                </label>
                <div className="grid grid-cols-1 gap-3">
                  {availableRoutingMethods.map(method => (
                    <button
                      key={method.value}
                      onClick={() => setFormData(prev => ({ ...prev, paymentRouting: method.value as PaymentRouting }))}
                      className={`flex items-center space-x-4 p-4 rounded-lg border-2 transition-colors ${
                        formData.paymentRouting === method.value
                          ? `${context === 'individual' ? 'border-blue-500 bg-blue-50' : 'border-orange-500 bg-orange-50'}`
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <method.icon className={`w-6 h-6 ${
                        formData.paymentRouting === method.value
                          ? `${context === 'individual' ? 'text-blue-600' : 'text-orange-600'}`
                          : 'text-gray-500'
                      }`} />
                      <div className="text-left flex-1">
                        <div className="font-medium text-gray-900">{method.label}</div>
                        <div className="text-sm text-gray-500">{method.description}</div>
                      </div>
                      {formData.paymentRouting === method.value && (
                        <div className={`w-2 h-2 rounded-full ${context === 'individual' ? 'bg-blue-500' : 'bg-orange-500'}`} />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Protocol Preferences */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Protocol Preferences
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: 'lightning', label: 'Lightning', icon: Lightning },
                    { value: 'cashu', label: 'Cashu eCash', icon: Coins },
                    { value: 'fedimint', label: 'Fedimint', icon: Building, disabled: context === 'individual' }
                  ].map(protocol => (
                    <button
                      key={protocol.value}
                      disabled={protocol.disabled}
                      onClick={() => updateProtocolPreferences('primary', protocol.value)}
                      className={`flex flex-col items-center space-y-2 p-3 rounded-lg border-2 transition-colors ${
                        protocol.disabled
                          ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                          : formData.protocolPreferences?.primary === protocol.value
                            ? `${context === 'individual' ? 'border-blue-500 bg-blue-50' : 'border-orange-500 bg-orange-50'}`
                            : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <protocol.icon className={`w-5 h-5 ${
                        protocol.disabled
                          ? 'text-gray-400'
                          : formData.protocolPreferences?.primary === protocol.value
                            ? `${context === 'individual' ? 'text-blue-600' : 'text-orange-600'}`
                            : 'text-gray-500'
                      }`} />
                      <span className="text-sm font-medium">{protocol.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Routing Preferences */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Max Fee Percentage
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.routingPreferences?.maxFeePercent}
                    onChange={(e) => updateRoutingPreferences('maxFeePercent', parseFloat(e.target.value))}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent ${
                      context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                    }`}
                    min="0.1"
                    max="5"
                  />
                  <p className="text-xs text-gray-500 mt-1">Maximum acceptable fee as percentage</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Routing Strategy
                  </label>
                  <select
                    value={formData.routingPreferences?.routingStrategy}
                    onChange={(e) => updateRoutingPreferences('routingStrategy', e.target.value)}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent ${
                      context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                    }`}
                  >
                    <option value="fastest">Fastest</option>
                    <option value="cheapest">Cheapest</option>
                    <option value="most_private">Most Private</option>
                    <option value="balanced">Balanced</option>
                  </select>
                </div>
              </div>

              {/* Privacy Mode Toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <div className="font-medium text-gray-900">Privacy Mode</div>
                  <div className="text-sm text-gray-500">Enhanced privacy routing with additional protections</div>
                </div>
                <button
                  onClick={() => updateRoutingPreferences('privacyMode', !formData.routingPreferences?.privacyMode)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    formData.routingPreferences?.privacyMode 
                      ? `${context === 'individual' ? 'bg-blue-600' : 'bg-orange-600'}` 
                      : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      formData.routingPreferences?.privacyMode ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {currentTab === 'conditions' && (
            <div className="space-y-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center space-x-2">
                  <Shield className="w-5 h-5 text-red-600" />
                  <h3 className="font-medium text-red-900">Security Controls & Limits</h3>
                </div>
                <p className="text-sm text-red-700 mt-1">
                  Set spending limits and security controls for automated payments
                </p>
              </div>

              {/* Daily and Transaction Limits */}
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Max Daily Spend (sats)
                  </label>
                  <input
                    type="number"
                    value={formData.conditions?.maxDailySpend}
                    onChange={(e) => updateConditions('maxDailySpend', parseInt(e.target.value))}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent ${
                      context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Max Transaction Size (sats)
                  </label>
                  <input
                    type="number"
                    value={formData.conditions?.maxTransactionSize}
                    onChange={(e) => updateConditions('maxTransactionSize', parseInt(e.target.value))}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent ${
                      context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Require Approval Above (sats)
                  </label>
                  <input
                    type="number"
                    value={formData.conditions?.requireApprovalAbove}
                    onChange={(e) => updateConditions('requireApprovalAbove', parseInt(e.target.value))}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent ${
                      context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                    }`}
                  />
                </div>
              </div>

              {/* Protocol-Specific Limits */}
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Max Lightning Amount (sats)
                  </label>
                  <input
                    type="number"
                    value={formData.conditions?.maxLightningAmount}
                    onChange={(e) => updateConditions('maxLightningAmount', parseInt(e.target.value))}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent ${
                      context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Max Cashu Amount (sats)
                  </label>
                  <input
                    type="number"
                    value={formData.conditions?.maxCashuAmount}
                    onChange={(e) => updateConditions('maxCashuAmount', parseInt(e.target.value))}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent ${
                      context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                    }`}
                  />
                </div>

                {context === 'family' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Max Fedimint Amount (sats)
                    </label>
                    <input
                      type="number"
                      value={formData.conditions?.maxFedimintAmount}
                      onChange={(e) => updateConditions('maxFedimintAmount', parseInt(e.target.value))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                  </div>
                )}
              </div>

              {/* Security Toggles */}
              <div className="space-y-3">
                {[
                  { key: 'pauseOnSuspiciousActivity', label: 'Pause on Suspicious Activity', desc: 'Automatically pause when unusual patterns detected' },
                  { key: 'requireTorRouting', label: 'Require Tor Routing', desc: 'Route all payments through Tor network' },
                  { key: 'avoidKYCNodes', label: 'Avoid KYC Nodes', desc: 'Avoid routing through known KYC-required nodes' }
                ].map(toggle => (
                  <div key={toggle.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-medium text-gray-900">{toggle.label}</div>
                      <div className="text-sm text-gray-500">{toggle.desc}</div>
                    </div>
                    <button
                      onClick={() => updateConditions(toggle.key as keyof PaymentConditions, !(formData.conditions as any)?.[toggle.key])}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        (formData.conditions as any)?.[toggle.key] 
                          ? `${context === 'individual' ? 'bg-blue-600' : 'bg-orange-600'}` 
                          : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          (formData.conditions as any)?.[toggle.key] ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>

              {/* Privacy Score Requirement */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Minimum Privacy Score (0-100)
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={formData.conditions?.minimumPrivacyScore}
                  onChange={(e) => updateConditions('minimumPrivacyScore', parseInt(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>Public (0)</span>
                  <span className="font-medium">Current: {formData.conditions?.minimumPrivacyScore}</span>
                  <span>Maximum Privacy (100)</span>
                </div>
              </div>
            </div>
          )}

          {currentTab === 'notifications' && (
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center space-x-2">
                  <Bell className="w-5 h-5 text-green-600" />
                  <h3 className="font-medium text-green-900">Notification Settings</h3>
                </div>
                <p className="text-sm text-green-700 mt-1">
                  Stay informed about payment activities and important events
                </p>
              </div>

              <div className="space-y-4">
                {[
                  { key: 'notifyOnDistribution', label: 'Payment Executions', desc: 'Get notified when scheduled payments are sent' },
                  { key: 'notifyOnFailure', label: 'Payment Failures', desc: 'Alert when payments fail to execute' },
                  { key: 'notifyOnSuspiciousActivity', label: 'Suspicious Activity', desc: 'Alert for unusual payment patterns' }
                ].map(notification => (
                  <div key={notification.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-medium text-gray-900">{notification.label}</div>
                      <div className="text-sm text-gray-500">{notification.desc}</div>
                    </div>
                    <button
                      onClick={() => updateNotificationSettings(notification.key as keyof NotificationSettings, !(formData.notificationSettings as any)?.[notification.key])}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        (formData.notificationSettings as any)?.[notification.key] 
                          ? `${context === 'individual' ? 'bg-blue-600' : 'bg-orange-600'}` 
                          : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          (formData.notificationSettings as any)?.[notification.key] ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notification Methods
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: 'email', label: 'Email', icon: Mail },
                    { value: 'nostr_dm', label: 'Nostr DM', icon: UserCheck }
                  ].map(method => (
                    <button
                      key={method.value}
                      onClick={() => {
                        const current = formData.notificationSettings?.notificationMethods || [];
                        const updated = current.includes(method.value as any)
                          ? current.filter(m => m !== method.value)
                          : [...current, method.value as any];
                        updateNotificationSettings('notificationMethods', updated);
                      }}
                      className={`flex items-center justify-center space-x-2 p-3 rounded-lg border-2 transition-colors ${
                        formData.notificationSettings?.notificationMethods?.includes(method.value as any)
                          ? `${context === 'individual' ? 'border-blue-500 bg-blue-50' : 'border-orange-500 bg-orange-50'}`
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <method.icon className="w-4 h-4" />
                      <span className="font-medium">{method.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Clock className="w-4 h-4" />
            <span>
              Next payment: {formData.frequency && calculateNextDistribution(
                formData.frequency,
                formData.dayOfWeek,
                formData.dayOfMonth
              ).toLocaleDateString()}
            </span>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className={`flex items-center space-x-2 px-4 py-2 text-white rounded-lg transition-colors ${
                context === 'individual' 
                  ? 'bg-blue-600 hover:bg-blue-700' 
                  : 'bg-orange-600 hover:bg-orange-700'
              }`}
            >
              <Save className="w-4 h-4" />
              <span>{existingSchedule ? 'Update' : 'Create'} Schedule</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentAutomationModal;