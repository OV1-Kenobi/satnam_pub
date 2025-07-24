import {
  Clock,
  CreditCard,
  Save,
  Settings,
  Users,
  Wallet,
  X,
  Zap
} from 'lucide-react';
import React, { useState } from 'react';
import { PaymentSchedule } from '../lib/payment-automation.js';
import ContactsSelector from './shared/ContactsSelector';

interface Contact {
  id: string;
  name: string;
  npub?: string;
  lightningAddress?: string;
  avatar?: string;
  role?: 'family' | 'friend' | 'business' | 'guardian';
  isOnline?: boolean;
}

interface IndividualPaymentSchedule {
  id?: string;
  recipientAddress: string;
  recipientName: string;
  amount: number;
  frequency: 'daily' | 'weekly' | 'monthly';
  dayOfWeek?: number;
  dayOfMonth?: number;
  enabled: boolean;
  paymentMethod: 'lightning' | 'ecash';
  memo?: string;
  autoApprovalLimit: number;
  createdAt?: string;
  updatedAt?: string;
}

interface IndividualPaymentAutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (schedule: Partial<PaymentSchedule>) => void;
  userId: string;
  existingSchedule?: PaymentSchedule;
}

const IndividualPaymentAutomationModal: React.FC<IndividualPaymentAutomationModalProps> = ({
  isOpen,
  onClose,
  onSave,
  userId,
  existingSchedule
}) => {
  const [formData, setFormData] = useState<IndividualPaymentSchedule>({
    recipientAddress: existingSchedule?.recipientAddress || '',
    recipientName: existingSchedule?.recipientName || '',
    amount: existingSchedule?.amount || 21000,
    frequency: (existingSchedule?.frequency === 'yearly' ? 'monthly' : existingSchedule?.frequency) || 'weekly',
    dayOfWeek: existingSchedule?.dayOfWeek || 1,
    dayOfMonth: existingSchedule?.dayOfMonth || 1,
    enabled: existingSchedule?.enabled ?? true,
    paymentMethod: 'lightning',
    memo: existingSchedule?.memo || '',
    autoApprovalLimit: existingSchedule?.autoApprovalLimit || 1000000
  });

  const [currentTab, setCurrentTab] = useState<'basic' | 'advanced'>('basic');
  const [showContactsSelector, setShowContactsSelector] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const handleContactSelect = (contact: Contact) => {
    setSelectedContact(contact);
    setFormData(prev => ({
      ...prev,
      recipientAddress: contact.lightningAddress || contact.npub || '',
      recipientName: contact.name
    }));
  };

  if (!isOpen) return null;

  const handleSave = () => {
    if (!formData.recipientAddress || !formData.recipientName || !formData.amount) {
      alert('Please fill in all required fields.');
      return;
    }

    const scheduleData: Partial<PaymentSchedule> = {
      familyId: undefined, // Individual payments don't have familyId
      recipientId: userId,
      recipientNpub: userId, // For individual, use userId as npub
      recipientAddress: formData.recipientAddress,
      recipientName: formData.recipientName,
      amount: formData.amount,
      currency: 'sats',
      frequency: formData.frequency,
      dayOfWeek: formData.dayOfWeek,
      dayOfMonth: formData.dayOfMonth,
      status: formData.enabled ? 'active' : 'paused',
      requiresApproval: false, // Individual payments don't require approval
      approvalThreshold: formData.autoApprovalLimit,
      createdBy: userId,
      memo: formData.memo,
      autoApprovalLimit: formData.autoApprovalLimit,
      createdAt: existingSchedule?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    onSave(scheduleData);
    onClose();
  };

  const paymentMethods = [
    { value: 'lightning', label: 'Lightning Network', icon: Zap, description: 'Fast, low-fee payments' },
    { value: 'ecash', label: 'eCash', icon: Wallet, description: 'Private, offline-capable payments' }
  ];

  const frequencies = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <CreditCard className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {existingSchedule ? 'Edit' : 'Create'} Individual Payment Schedule
              </h2>
              <p className="text-sm text-gray-500">
                Automate recurring payments for your personal use
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
            { id: 'advanced', label: 'Advanced Options', icon: Clock }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id as 'basic' | 'advanced')}
              className={`flex items-center space-x-2 px-6 py-3 font-medium transition-colors ${currentTab === tab.id
                  ? 'text-blue-600 border-b-2 border-blue-600'
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
              {/* Recipient Information */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Recipient Address *
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={formData.recipientAddress}
                      onChange={(e) => setFormData(prev => ({ ...prev, recipientAddress: e.target.value }))}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="alice@getalby.com or npub1..."
                    />
                    <button
                      type="button"
                      onClick={() => setShowContactsSelector(true)}
                      className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      title="Select from contacts"
                    >
                      <Users className="h-4 w-4" />
                    </button>
                  </div>
                  {selectedContact && (
                    <div className="mt-2 p-2 bg-blue-50 rounded-lg">
                      <p className="text-sm text-blue-700">
                        Selected: <span className="font-medium">{selectedContact.name}</span>
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Display Name *
                  </label>
                  <input
                    type="text"
                    value={formData.recipientName}
                    onChange={(e) => setFormData(prev => ({ ...prev, recipientName: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Alice"
                  />
                </div>
              </div>

              {/* Amount and Frequency */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payment Amount (sats) *
                  </label>
                  <div className="relative">
                    <Zap className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-blue-500" />
                    <input
                      type="number"
                      value={formData.amount}
                      onChange={(e) => setFormData(prev => ({ ...prev, amount: parseInt(e.target.value) }))}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                    onChange={(e) => setFormData(prev => ({ ...prev, frequency: e.target.value as 'daily' | 'weekly' | 'monthly' }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                <div className="grid grid-cols-2 gap-3">
                  {paymentMethods.map(method => (
                    <button
                      key={method.value}
                      onClick={() => setFormData(prev => ({ ...prev, paymentMethod: method.value as 'lightning' | 'ecash' }))}
                      className={`flex items-center space-x-3 p-4 rounded-lg border-2 transition-colors ${formData.paymentMethod === method.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                        }`}
                    >
                      <method.icon className={`w-5 h-5 ${formData.paymentMethod === method.value
                          ? 'text-blue-600'
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Payment for services"
                />
              </div>
            </div>
          )}

          {currentTab === 'advanced' && (
            <div className="space-y-6">
              {/* Auto-approval Limit */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Auto-approval Limit (sats)
                </label>
                <input
                  type="number"
                  value={formData.autoApprovalLimit}
                  onChange={(e) => setFormData(prev => ({ ...prev, autoApprovalLimit: parseInt(e.target.value) }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="1000000"
                  min="1000"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Payments above this amount will require manual approval
                </p>
              </div>

              {/* Enable/Disable */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-700">Enable Schedule</label>
                  <p className="text-xs text-gray-500">Allow this payment schedule to run automatically</p>
                </div>
                <button
                  onClick={() => setFormData(prev => ({ ...prev, enabled: !prev.enabled }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.enabled ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${formData.enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                  />
                </button>
              </div>
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
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <Save className="w-4 h-4" />
            <span>Save Schedule</span>
          </button>
        </div>
      </div>

      {showContactsSelector && (
        <ContactsSelector
          isOpen={showContactsSelector}
          onClose={() => setShowContactsSelector(false)}
          onSelectContact={handleContactSelect}
          title="Select Recipient"
        />
      )}
    </div>
  );
};

export default IndividualPaymentAutomationModal; 