/**
 * Import Test Component
 * 
 * Simple component to test that the SecureNsecManager import fix works correctly.
 * This component can be temporarily added to verify the ES module export/import issue is resolved.
 */

import React from 'react';
import { SecureNsecManager } from '../../lib/secure-nsec-manager';
import { hybridMessageSigning } from '../../lib/messaging/hybrid-message-signing';
import { nsecSessionBridge } from '../../lib/auth/nsec-session-bridge';

export const ImportTestComponent: React.FC = () => {
  const testImports = () => {
    try {
      // Test SecureNsecManager class import
      const nsecManager = SecureNsecManager.getInstance();
      console.log('✅ SecureNsecManager import successful:', !!nsecManager);
      
      // Test HybridMessageSigning import
      console.log('✅ HybridMessageSigning import successful:', !!hybridMessageSigning);
      
      // Test NSECSessionBridge import
      console.log('✅ NSECSessionBridge import successful:', !!nsecSessionBridge);
      
      return true;
    } catch (error) {
      console.error('❌ Import test failed:', error);
      return false;
    }
  };

  const testAvailability = async () => {
    try {
      // Test hybrid signing methods availability
      const methods = await hybridMessageSigning.getAvailableSigningMethods();
      console.log('✅ Signing methods check successful:', methods.length, 'methods found');
      
      // Test session bridge status
      const status = nsecSessionBridge.getSessionStatus();
      console.log('✅ Session bridge status check successful:', status);
      
      return true;
    } catch (error) {
      console.error('❌ Availability test failed:', error);
      return false;
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 bg-white rounded-lg shadow-lg">
      <h3 className="text-lg font-bold text-gray-900 mb-4">
        🧪 Import Test Component
      </h3>
      
      <div className="space-y-3">
        <button
          onClick={testImports}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Test Imports
        </button>
        
        <button
          onClick={testAvailability}
          className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          Test Availability
        </button>
      </div>
      
      <div className="mt-4 text-xs text-gray-500">
        <p>Check browser console for test results.</p>
        <p>This component can be removed after testing.</p>
      </div>
    </div>
  );
};

export default ImportTestComponent;
