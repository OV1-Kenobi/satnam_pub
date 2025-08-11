/**
 * Recovery and Rotation Page Component
 * 
 * Standalone page component for Nostr key recovery and rotation.
 * Can be used as a dedicated page or integrated into existing auth flows.
 */

import React from 'react';
import { RecoveryAndRotationInterface } from './RecoveryAndRotationInterface';

export const RecoveryAndRotationPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <RecoveryAndRotationInterface className="bg-white rounded-lg shadow-xl p-8" />
      </div>
    </div>
  );
};

// Export the interface component for integration
export { RecoveryAndRotationInterface } from './RecoveryAndRotationInterface';
