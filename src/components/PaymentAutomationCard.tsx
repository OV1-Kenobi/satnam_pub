import {
  Building,
  Calendar,
  Clock,
  Coins,
  CreditCard,
  Edit3,
  Globe,
  Pause,
  Play,
  Router,
  Settings,
  Shield,
  Trash2,
  UserCheck,
  Users,
  Zap
} from 'lucide-react';
import React, { useState } from 'react';

import {
  PaymentContext,
  PaymentRouting,
  PaymentSchedule,
  RecipientType
} from '../lib/payment-automation';

interface PaymentAutomationCardProps {
  context: PaymentContext;
  schedules: PaymentSchedule[];
  onCreateSchedule: () => void;
  onEditSchedule: (schedule: PaymentSchedule) => void;
  onToggleSchedule: (scheduleId: string, enabled: boolean) => void;
  onDeleteSchedule: (scheduleId: string) => void;
}

const PaymentAutomationCard: React.FC<PaymentAutomationCardProps> = ({
  context,
  schedules,
  onCreateSchedule,
  onEditSchedule,
  onToggleSchedule,
  onDeleteSchedule
}) => {
  const [expandedSchedule, setExpandedSchedule] = useState<string | null>(null);

  const getRoutingIcon = (routing: PaymentRouting) => {
    const iconMap = {
      'breez': Zap,
      'phoenixd': Zap,
      'voltage': Building,
      'cashu_mint': Coins,
      'internal_fedimint': Users,
      'external_ln': Globe
    };
    return iconMap[routing] || Router;
  };

  const getRecipientIcon = (recipientType: RecipientType) => {
    const iconMap = {
      'ln_address': Zap,
      'family_member': Users,
      'cashu_token': Coins,
      'fedimint_internal': Building,
      'npub': UserCheck
    };
    return iconMap[recipientType] || CreditCard;
  };

  const getFrequencyDisplay = (frequency: string, dayOfWeek?: number, dayOfMonth?: number) => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    switch (frequency) {
      case 'daily':
        return 'Daily';
      case 'weekly':
        return `Weekly (${days[dayOfWeek || 0]})`;
      case 'monthly':
        return `Monthly (${dayOfMonth || 1}${getOrdinalSuffix(dayOfMonth || 1)})`;
      default:
        return frequency;
    }
  };

  const getOrdinalSuffix = (day: number) => {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };

  const formatNextPayment = (date: Date) => {
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays < 7) return `In ${diffDays} days`;
    return date.toLocaleDateString();
  };

  const activeSchedules = schedules.filter(s => s.enabled);
  const totalMonthlyAmount = schedules
    .filter(s => s.enabled)
    .reduce((sum, s) => {
      const multiplier = s.frequency === 'daily' ? 30 : s.frequency === 'weekly' ? 4.3 : 1;
      return sum + (s.amount * multiplier);
    }, 0);

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200">
      {/* Header */}
      <div className={`p-6 border-b border-gray-200 ${context === 'individual' ? 'bg-blue-50' : 'bg-orange-50'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`p-3 rounded-lg ${context === 'individual' ? 'bg-blue-100' : 'bg-orange-100'}`}>
              {context === 'individual' ? (
                <UserCheck className={`w-6 h-6 ${context === 'individual' ? 'text-blue-600' : 'text-orange-600'}`} />
              ) : (
                <Users className={`w-6 h-6 ${context === 'family' ? 'text-orange-600' : 'text-blue-600'}`} />
              )}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {context === 'individual' ? 'Individual' : 'Family'} Payment Automation
              </h3>
              <p className="text-sm text-gray-600">
                {activeSchedules.length} active schedule{activeSchedules.length !== 1 ? 's' : ''} •
                ~{Math.floor(totalMonthlyAmount / 1000)}k sats/month
              </p>
            </div>
          </div>
          <button
            onClick={onCreateSchedule}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-white transition-colors ${context === 'individual'
              ? 'bg-blue-600 hover:bg-blue-700'
              : 'bg-orange-600 hover:bg-orange-700'
              }`}
          >
            <Calendar className="w-4 h-4" />
            <span>New Schedule</span>
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="p-6 border-b border-gray-100">
        <div className="grid grid-cols-3 gap-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {schedules.length}
            </div>
            <div className="text-sm text-gray-500">Total Schedules</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {activeSchedules.length}
            </div>
            <div className="text-sm text-gray-500">Active</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {Math.floor(totalMonthlyAmount / 1000)}k
            </div>
            <div className="text-sm text-gray-500">Sats/Month</div>
          </div>
        </div>
      </div>

      {/* Schedule List */}
      <div className="divide-y divide-gray-100">
        {schedules.length === 0 ? (
          <div className="p-8 text-center">
            <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 ${context === 'individual' ? 'bg-blue-100' : 'bg-orange-100'
              }`}>
              <Calendar className={`w-8 h-8 ${context === 'individual' ? 'text-blue-600' : 'text-orange-600'}`} />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Payment Schedules</h3>
            <p className="text-gray-500 mb-4">
              Create your first automated payment to get started
            </p>
            <button
              onClick={onCreateSchedule}
              className={`px-4 py-2 rounded-lg text-white transition-colors ${context === 'individual'
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-orange-600 hover:bg-orange-700'
                }`}
            >
              Create Schedule
            </button>
          </div>
        ) : (
          schedules.map((schedule) => {
            const RoutingIcon = getRoutingIcon((schedule.paymentRouting ?? 'external_ln') as PaymentRouting);
            const RecipientIcon = getRecipientIcon((schedule.recipientType ?? 'ln_address') as RecipientType);
            const isExpanded = expandedSchedule === schedule.id;

            return (
              <div key={schedule.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4 flex-1">
                    {/* Status Indicator */}
                    <div className={`w-3 h-3 rounded-full ${schedule.enabled ? 'bg-green-500' : 'bg-gray-300'
                      }`} />

                    {/* Recipient Info */}
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-lg ${context === 'individual' ? 'bg-blue-50' : 'bg-orange-50'
                        }`}>
                        <RecipientIcon className={`w-4 h-4 ${context === 'individual' ? 'text-blue-600' : 'text-orange-600'
                          }`} />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">
                          {schedule.recipientName}
                        </div>
                        <div className="text-sm text-gray-500">
                          {schedule.recipientAddress && schedule.recipientAddress.length > 30
                            ? `${schedule.recipientAddress.substring(0, 30)}...`
                            : schedule.recipientAddress || 'No address'}
                        </div>
                      </div>
                    </div>

                    {/* Amount and Frequency */}
                    <div className="text-right">
                      <div className="font-semibold text-gray-900">
                        {(schedule.amount / 1000).toFixed(0)}k sats
                      </div>
                      <div className="text-sm text-gray-500">
                        {getFrequencyDisplay(schedule.frequency, schedule.dayOfWeek, schedule.dayOfMonth)}
                      </div>
                    </div>

                    {/* Routing Method */}
                    <div className="flex items-center space-x-2">
                      <RoutingIcon className="w-4 h-4 text-gray-500" />
                      <span className="text-sm text-gray-600 capitalize">
                        {(schedule.paymentRouting ?? 'external_ln').replace('_', ' ')}
                      </span>
                    </div>

                    {/* Next Payment */}
                    <div className="text-right">
                      <div className="flex items-center space-x-1 text-sm text-gray-600">
                        <Clock className="w-3 h-3" />
                        <span>{formatNextPayment(schedule.nextDistribution)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => onToggleSchedule(schedule.id, !schedule.enabled)}
                      className={`p-2 rounded-lg transition-colors ${schedule.enabled
                        ? 'text-orange-600 hover:bg-orange-50'
                        : 'text-green-600 hover:bg-green-50'
                        }`}
                      title={schedule.enabled ? 'Pause Schedule' : 'Resume Schedule'}
                    >
                      {schedule.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>

                    <button
                      onClick={() => onEditSchedule(schedule)}
                      className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                      title="Edit Schedule"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => setExpandedSchedule(isExpanded ? null : schedule.id)}
                      className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                      title="View Details"
                    >
                      <Settings className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => {
                        if (confirm(`Are you sure you want to delete the payment schedule for ${schedule.recipientName}?`)) {
                          onDeleteSchedule(schedule.id);
                        }
                      }}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete Schedule"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <div>
                          <div className="text-sm font-medium text-gray-700">Payment Purpose</div>
                          <div className="text-sm text-gray-600 capitalize">
                            {(schedule.paymentPurpose ?? 'general').replace('_', ' ')}
                          </div>
                        </div>
                        {schedule.memo && (
                          <div>
                            <div className="text-sm font-medium text-gray-700">Memo</div>
                            <div className="text-sm text-gray-600">{schedule.memo}</div>
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-medium text-gray-700">Routing Strategy</div>
                          <div className="text-sm text-gray-600 capitalize">
                            {schedule.routingPreferences?.routingStrategy?.replace('_', ' ')}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="text-sm font-medium text-gray-700">Total Distributed</div>
                          <div className="text-sm text-gray-600">
                            {((schedule.totalDistributed || 0) / 1000).toFixed(0)}k sats ({schedule.distributionCount || 0} payments)
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-700">Max Daily Spend</div>
                          <div className="text-sm text-gray-600">
                            {((schedule.conditions?.maxDailySpend || 0) / 1000).toFixed(0)}k sats
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-700">Privacy Settings</div>
                          <div className="flex items-center space-x-2 text-sm">
                            {schedule.routingPreferences?.privacyMode && (
                              <span className="flex items-center space-x-1 text-green-600">
                                <Shield className="w-3 h-3" />
                                <span>Privacy Mode</span>
                              </span>
                            )}
                            {schedule.conditions?.avoidKYCNodes && (
                              <span className="flex items-center space-x-1 text-blue-600">
                                <UserCheck className="w-3 h-3" />
                                <span>No KYC</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default PaymentAutomationCard;