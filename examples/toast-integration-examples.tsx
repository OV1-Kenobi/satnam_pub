/**
 * Toast Integration Examples
 * 
 * Practical examples showing how to integrate the unified toast notification
 * system with existing components and patterns in the Satnam codebase.
 */

import React, { useState, useEffect } from 'react';
import { showToast } from '../src/services/toastService';
import ToastContainer from '../src/components/ToastContainer';

// Example 1: API Error Handling
const ApiIntegrationExample: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/family/wallet');
      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }
      const result = await response.json();
      setData(result);
      
      // Success notification
      showToast.success('Wallet data loaded successfully', {
        title: 'Data Refreshed',
        duration: 3000
      });
    } catch (error) {
      // Error notification with retry action
      showToast.error(
        error instanceof Error ? error.message : 'Failed to load wallet data',
        {
          title: 'API Error',
          duration: 0, // Don't auto-dismiss errors
          action: {
            label: 'Retry',
            onClick: () => fetchData()
          }
        }
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4">
      <button
        onClick={fetchData}
        disabled={loading}
        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
      >
        {loading ? 'Loading...' : 'Fetch Wallet Data'}
      </button>
      
      {data && (
        <div className="mt-4 p-4 bg-green-100 rounded">
          <pre>{JSON.stringify(data, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

// Example 2: Form Validation with Toast Feedback
const FormValidationExample: React.FC = () => {
  const [formData, setFormData] = useState({
    amount: '',
    recipient: '',
    description: ''
  });

  const validateForm = () => {
    const errors: string[] = [];

    if (!formData.amount || isNaN(Number(formData.amount))) {
      errors.push('Valid amount is required');
    }

    if (!formData.recipient.trim()) {
      errors.push('Recipient is required');
    }

    if (formData.description.length > 100) {
      errors.push('Description must be less than 100 characters');
    }

    return errors;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const errors = validateForm();
    
    if (errors.length > 0) {
      // Show validation errors
      errors.forEach(error => {
        showToast.warning(error, {
          title: 'Validation Error',
          duration: 5000
        });
      });
      return;
    }

    // Simulate successful submission
    showToast.success('Payment request submitted successfully', {
      title: 'Payment Sent',
      duration: 4000,
      action: {
        label: 'View Details',
        onClick: () => console.log('Navigate to payment details')
      }
    });

    // Reset form
    setFormData({ amount: '', recipient: '', description: '' });
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 space-y-4 max-w-md">
      <div>
        <label className="block text-sm font-medium mb-1">Amount (sats)</label>
        <input
          type="number"
          value={formData.amount}
          onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
          className="w-full p-2 border rounded"
          placeholder="Enter amount"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Recipient</label>
        <input
          type="text"
          value={formData.recipient}
          onChange={(e) => setFormData(prev => ({ ...prev, recipient: e.target.value }))}
          className="w-full p-2 border rounded"
          placeholder="Lightning address or npub"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          className="w-full p-2 border rounded"
          placeholder="Optional description"
          rows={3}
        />
      </div>

      <button
        type="submit"
        className="w-full bg-green-500 text-white py-2 rounded hover:bg-green-600"
      >
        Send Payment
      </button>
    </form>
  );
};

// Example 3: Real-time Status Updates
const StatusUpdatesExample: React.FC = () => {
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');

  useEffect(() => {
    // Simulate connection status changes
    const interval = setInterval(() => {
      const statuses: typeof connectionStatus[] = ['connected', 'disconnected', 'connecting'];
      const currentIndex = statuses.indexOf(connectionStatus);
      const nextStatus = statuses[(currentIndex + 1) % statuses.length];
      
      setConnectionStatus(nextStatus);

      // Show status change notifications
      switch (nextStatus) {
        case 'connected':
          showToast.success('Successfully connected to Lightning Network', {
            title: 'Connection Established',
            duration: 3000
          });
          break;
        case 'disconnected':
          showToast.error('Lost connection to Lightning Network', {
            title: 'Connection Lost',
            duration: 0,
            action: {
              label: 'Reconnect',
              onClick: () => setConnectionStatus('connecting')
            }
          });
          break;
        case 'connecting':
          showToast.info('Attempting to reconnect...', {
            title: 'Reconnecting',
            duration: 2000
          });
          break;
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [connectionStatus]);

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'text-green-600';
      case 'disconnected': return 'text-red-600';
      case 'connecting': return 'text-yellow-600';
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center space-x-2">
        <div className={`w-3 h-3 rounded-full ${
          connectionStatus === 'connected' ? 'bg-green-500' :
          connectionStatus === 'disconnected' ? 'bg-red-500' : 'bg-yellow-500'
        }`} />
        <span className={`font-medium ${getStatusColor()}`}>
          {connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1)}
        </span>
      </div>
      <p className="text-sm text-gray-600 mt-2">
        Status changes every 5 seconds with toast notifications
      </p>
    </div>
  );
};

// Example 4: Batch Operations with Progress
const BatchOperationExample: React.FC = () => {
  const [processing, setProcessing] = useState(false);

  const processBatchOperation = async () => {
    setProcessing(true);
    
    const operations = [
      'Validating signatures',
      'Processing payments',
      'Updating balances',
      'Sending notifications',
      'Finalizing transactions'
    ];

    try {
      for (let i = 0; i < operations.length; i++) {
        // Show progress updates
        showToast.info(`${operations[i]}... (${i + 1}/${operations.length})`, {
          title: 'Processing Batch',
          duration: 1500
        });
        
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Success notification
      showToast.success('All operations completed successfully', {
        title: 'Batch Complete',
        duration: 4000,
        action: {
          label: 'View Results',
          onClick: () => console.log('Show batch results')
        }
      });
    } catch (error) {
      // Error notification
      showToast.error('Batch operation failed', {
        title: 'Processing Error',
        duration: 0,
        action: {
          label: 'Retry',
          onClick: () => processBatchOperation()
        }
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="p-4">
      <button
        onClick={processBatchOperation}
        disabled={processing}
        className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 disabled:opacity-50"
      >
        {processing ? 'Processing...' : 'Start Batch Operation'}
      </button>
      <p className="text-sm text-gray-600 mt-2">
        Demonstrates progress notifications and error handling
      </p>
    </div>
  );
};

// Example 5: Integration with Existing Components
const ExistingComponentMigration: React.FC = () => {
  // This shows how to migrate from inline error displays to toast notifications
  const [error, setError] = useState<string | null>(null);
  const [showInlineError, setShowInlineError] = useState(true);

  const simulateError = () => {
    const errorMessage = 'This is a simulated error message';
    setError(errorMessage);

    if (!showInlineError) {
      // Use toast instead of inline display
      showToast.error(errorMessage, {
        title: 'Operation Failed',
        duration: 0,
        action: {
          label: 'Clear',
          onClick: () => setError(null)
        }
      });
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center space-x-4">
        <button
          onClick={simulateError}
          className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
        >
          Simulate Error
        </button>
        
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={showInlineError}
            onChange={(e) => setShowInlineError(e.target.checked)}
          />
          <span>Show inline error (old pattern)</span>
        </label>
      </div>

      {/* Old pattern: Inline error display */}
      {error && showInlineError && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <strong>Error:</strong> {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-500 hover:text-red-700"
          >
            ✕
          </button>
        </div>
      )}

      <p className="text-sm text-gray-600">
        Toggle the checkbox to see the difference between inline errors and toast notifications
      </p>
    </div>
  );
};

// Main demo component
const ToastIntegrationDemo: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Toast Integration Examples</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">API Error Handling</h2>
            <ApiIntegrationExample />
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Form Validation</h2>
            <FormValidationExample />
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Status Updates</h2>
            <StatusUpdatesExample />
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Batch Operations</h2>
            <BatchOperationExample />
          </div>

          <div className="bg-white rounded-lg shadow p-6 md:col-span-2">
            <h2 className="text-xl font-semibold mb-4">Migration Example</h2>
            <ExistingComponentMigration />
          </div>
        </div>
      </div>

      {/* Toast Container - positioned at the root level */}
      <ToastContainer position="top-right" maxToasts={5} />
    </div>
  );
};

export default ToastIntegrationDemo;
