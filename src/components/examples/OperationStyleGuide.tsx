import { CreditCard, Key, Shield, User, Zap } from 'lucide-react';
import React from 'react';
import {
    getOperationButtonClasses,
    getOperationIconGradient,
    getOperationInputClasses,
    getOperationModalClasses
} from '../../utils/operationStyles';
import OperationTypeBadge from '../OperationTypeBadge';

/**
 * Style guide component demonstrating the proper usage of operation-based colors
 * 
 * This component serves as both documentation and a visual reference for developers
 * to understand when and how to use the different color schemes.
 */
const OperationStyleGuide: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">
            SatNam.Pub Operation Style Guide
          </h1>
          <p className="text-gray-300 text-lg max-w-3xl mx-auto">
            Consistent visual language for different types of operations across the platform.
            This ensures users can quickly identify and understand the context of their actions.
          </p>
        </div>

        {/* Color Scheme Overview */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {/* Identity Operations */}
          <div className="bg-white/10 rounded-2xl p-8 border border-purple-400/20">
            <div className="flex items-center space-x-4 mb-6">
              <div className={`w-16 h-16 ${getOperationIconGradient('identity')} rounded-full flex items-center justify-center`}>
                <Key className="h-8 w-8 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Identity Operations</h2>
                <OperationTypeBadge type="identity" />
              </div>
            </div>
            <p className="text-purple-200 mb-6">
              Purple color scheme for all Nostr identity-related operations including authentication, 
              key management, profile creation, and identity verification.
            </p>
            
            <div className="space-y-4">
              <h3 className="text-white font-semibold">Examples:</h3>
              <ul className="text-purple-200 space-y-2 text-sm">
                <li>• Nostr key generation and management</li>
                <li>• NIP-05 identity verification</li>
                <li>• Profile creation and editing</li>
                <li>• Authentication flows</li>
                <li>• Identity-related settings</li>
              </ul>
              
              <div className="pt-4">
                <button className={getOperationButtonClasses('identity')}>
                  <User className="h-4 w-4" />
                  <span>Manage Identity</span>
                </button>
              </div>
            </div>
          </div>

          {/* Payment Operations */}
          <div className="bg-white/10 rounded-2xl p-8 border border-orange-400/20">
            <div className="flex items-center space-x-4 mb-6">
              <div className={`w-16 h-16 ${getOperationIconGradient('payment')} rounded-full flex items-center justify-center`}>
                <Zap className="h-8 w-8 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Payment Operations</h2>
                <OperationTypeBadge type="payment" />
              </div>
            </div>
            <p className="text-orange-200 mb-6">
              Orange color scheme for all Lightning Network and financial operations including 
              payments, invoices, wallet management, and transaction history.
            </p>
            
            <div className="space-y-4">
              <h3 className="text-white font-semibold">Examples:</h3>
              <ul className="text-orange-200 space-y-2 text-sm">
                <li>• Lightning payments and invoices</li>
                <li>• Wallet balance and transactions</li>
                <li>• Payment routing and fees</li>
                <li>• Spending limits and controls</li>
                <li>• Financial reporting</li>
              </ul>
              
              <div className="pt-4">
                <button className={getOperationButtonClasses('payment')}>
                  <CreditCard className="h-4 w-4" />
                  <span>Send Payment</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Component Examples */}
        <div className="space-y-8">
          {/* Modal Examples */}
          <div>
            <h2 className="text-2xl font-bold text-white mb-6">Modal Examples</h2>
            <div className="grid md:grid-cols-2 gap-6">
              {/* Identity Modal */}
              <div className={getOperationModalClasses('identity')}>
                <div className="text-center mb-6">
                  <div className={`w-16 h-16 ${getOperationIconGradient('identity')} rounded-full flex items-center justify-center mx-auto mb-4`}>
                    <Shield className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Identity Verification</h3>
                  <OperationTypeBadge type="identity" />
                </div>
                <input 
                  type="text" 
                  placeholder="Enter your NIP-05 identifier"
                  className={getOperationInputClasses('identity')}
                />
                <div className="mt-4">
                  <button className={getOperationButtonClasses('identity')}>
                    <Key className="h-4 w-4" />
                    <span>Verify Identity</span>
                  </button>
                </div>
              </div>

              {/* Payment Modal */}
              <div className={getOperationModalClasses('payment')}>
                <div className="text-center mb-6">
                  <div className={`w-16 h-16 ${getOperationIconGradient('payment')} rounded-full flex items-center justify-center mx-auto mb-4`}>
                    <Zap className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Lightning Payment</h3>
                  <OperationTypeBadge type="payment" />
                </div>
                <input 
                  type="text" 
                  placeholder="Enter amount in sats"
                  className={getOperationInputClasses('payment')}
                />
                <div className="mt-4">
                  <button className={getOperationButtonClasses('payment')}>
                    <Zap className="h-4 w-4" />
                    <span>Send Payment</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Badge Variations */}
          <div>
            <h2 className="text-2xl font-bold text-white mb-6">Badge Variations</h2>
            <div className="bg-white/10 rounded-2xl p-8 border border-white/20">
              <div className="space-y-4">
                <div className="flex items-center space-x-4">
                  <span className="text-white font-medium w-20">Small:</span>
                  <OperationTypeBadge type="identity" size="sm" />
                  <OperationTypeBadge type="payment" size="sm" />
                  <OperationTypeBadge type="general" size="sm" />
                </div>
                <div className="flex items-center space-x-4">
                  <span className="text-white font-medium w-20">Medium:</span>
                  <OperationTypeBadge type="identity" size="md" />
                  <OperationTypeBadge type="payment" size="md" />
                  <OperationTypeBadge type="general" size="md" />
                </div>
                <div className="flex items-center space-x-4">
                  <span className="text-white font-medium w-20">Large:</span>
                  <OperationTypeBadge type="identity" size="lg" />
                  <OperationTypeBadge type="payment" size="lg" />
                  <OperationTypeBadge type="general" size="lg" />
                </div>
              </div>
            </div>
          </div>

          {/* Usage Guidelines */}
          <div>
            <h2 className="text-2xl font-bold text-white mb-6">Usage Guidelines</h2>
            <div className="bg-white/10 rounded-2xl p-8 border border-white/20">
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-lg font-bold text-white mb-4">✅ Do</h3>
                  <ul className="text-gray-300 space-y-2 text-sm">
                    <li>• Use purple for all Nostr identity operations</li>
                    <li>• Use orange for all Lightning payment operations</li>
                    <li>• Include operation type badges in modals and forms</li>
                    <li>• Maintain consistent color usage across components</li>
                    <li>• Use the utility functions for consistent styling</li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white mb-4">❌ Don't</h3>
                  <ul className="text-gray-300 space-y-2 text-sm">
                    <li>• Mix operation colors within the same context</li>
                    <li>• Use arbitrary colors for operation-specific UI</li>
                    <li>• Forget to include operation type indicators</li>
                    <li>• Use payment colors for identity operations</li>
                    <li>• Override the established color patterns</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OperationStyleGuide;