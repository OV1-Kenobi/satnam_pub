import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Zap, 
  Wallet, 
  Calendar, 
  Settings, 
  Play, 
  Pause,
  Edit,
  Trash2,
  DollarSign,
  TrendingUp
} from 'lucide-react';
import { PaymentAutomationService, PaymentSchedule } from '../lib/payment-automation';
import { IndividualPaymentAutomationModal } from './shared';

const IndividualPaymentDashboard: React.FC = () => {
  const [paymentSchedules, setPaymentSchedules] = useState<PaymentSchedule[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<PaymentSchedule | undefined>();
  const [loading, setLoading] = useState(true);

  // Mock user ID - in real app this would come from auth context
  const userId = 'user-123';

  useEffect(() => {
    loadPaymentSchedules();
  }, []);

  const loadPaymentSchedules = async () => {
    try {
      setLoading(true);
      // In a real app, you'd fetch from the API
      const schedules = await PaymentAutomationService.getPaymentSchedules(userId);
      setPaymentSchedules(schedules);
    } catch (error) {
      console.error('Error loading payment schedules:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSchedule = async (schedule: Partial<PaymentSchedule>) => {
    try {
      if (editingSchedule) {
        // Update existing schedule
        const updatedSchedules = paymentSchedules.map(s => 
          s.id === editingSchedule.id ? { ...s, ...schedule } : s
        );
        setPaymentSchedules(updatedSchedules);
      } else {
        // Create new schedule
        const newSchedule = await PaymentAutomationService.createPaymentSchedule({
          ...schedule,
          familyId: undefined, // Individual payments don't have familyId
          recipientId: userId,
          recipientNpub: userId,
          currency: 'sats',
          status: 'active',
          requiresApproval: false,
          approvalThreshold: 0,
          createdBy: userId
        } as any);
        setPaymentSchedules(prev => [...prev, newSchedule]);
      }
      setIsModalOpen(false);
      setEditingSchedule(undefined);
    } catch (error) {
      console.error('Error saving schedule:', error);
      alert('Failed to save payment schedule');
    }
  };

  const handleEditSchedule = (schedule: PaymentSchedule) => {
    setEditingSchedule(schedule);
    setIsModalOpen(true);
  };

  const handleToggleSchedule = async (scheduleId: string, enabled: boolean) => {
    try {
      const updatedSchedules = paymentSchedules.map(schedule =>
        schedule.id === scheduleId 
          ? { ...schedule, enabled, updatedAt: new Date().toISOString() }
          : schedule
      );
      setPaymentSchedules(updatedSchedules);
    } catch (error) {
      console.error('Error toggling schedule:', error);
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (confirm('Are you sure you want to delete this payment schedule?')) {
      try {
        const updatedSchedules = paymentSchedules.filter(s => s.id !== scheduleId);
        setPaymentSchedules(updatedSchedules);
      } catch (error) {
        console.error('Error deleting schedule:', error);
      }
    }
  };

  const getPaymentMethodIcon = (schedule: PaymentSchedule) => {
    const method = schedule.protocolPreferences?.primary || 'lightning';
    switch (method) {
      case 'lightning': return <Zap className="w-4 h-4 text-yellow-500" />;
      case 'ecash': return <Wallet className="w-4 h-4 text-green-500" />;
      case 'fedimint': return <DollarSign className="w-4 h-4 text-purple-500" />;
      default: return <DollarSign className="w-4 h-4 text-gray-500" />;
    }
  };

  const formatNextPayment = (date: string) => {
    return new Date(date).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payment Automation</h1>
          <p className="text-gray-600">Manage your automated payment schedules</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Schedule</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-blue-500" />
            <span className="text-sm font-medium text-gray-600">Active Schedules</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {paymentSchedules.filter(s => s.enabled).length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-5 h-5 text-green-500" />
            <span className="text-sm font-medium text-gray-600">Total Sent</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {Math.floor(paymentSchedules.reduce((sum, s) => sum + (s.totalDistributed || 0), 0) / 1000)}k sats
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            <span className="text-sm font-medium text-gray-600">Lightning Payments</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {paymentSchedules.filter(s => s.protocolPreferences?.primary === 'lightning').length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-2">
            <Wallet className="w-5 h-5 text-green-500" />
            <span className="text-sm font-medium text-gray-600">eCash Payments</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {paymentSchedules.filter(s => s.protocolPreferences?.primary === 'ecash').length}
          </p>
        </div>
      </div>

      {/* Payment Schedules */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Payment Schedules</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {paymentSchedules.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p>No payment schedules yet</p>
              <p className="text-sm">Create your first automated payment schedule</p>
            </div>
          ) : (
            paymentSchedules.map(schedule => (
              <div key={schedule.id} className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      {getPaymentMethodIcon(schedule)}
                      <div>
                        <h3 className="font-medium text-gray-900">{schedule.recipientName}</h3>
                        <p className="text-sm text-gray-500">{schedule.recipientAddress}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <p className="font-medium text-gray-900">{schedule.amount} sats</p>
                      <p className="text-sm text-gray-500 capitalize">{schedule.frequency}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleToggleSchedule(schedule.id, !schedule.enabled)}
                        className={`p-2 rounded-lg transition-colors ${
                          schedule.enabled 
                            ? 'bg-green-100 text-green-600 hover:bg-green-200' 
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {schedule.enabled ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleEditSchedule(schedule)}
                        className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteSchedule(schedule.id)}
                        className="p-2 text-red-600 hover:text-red-700 hover:bg-red-100 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Individual Payment Automation Modal */}
      <IndividualPaymentAutomationModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingSchedule(undefined);
        }}
        onSave={handleSaveSchedule}
        userId={userId}
        existingSchedule={editingSchedule}
      />
    </div>
  );
};

export default IndividualPaymentDashboard;