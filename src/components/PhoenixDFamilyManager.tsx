/**
 * PHOENIXD FAMILY MANAGER
 * 
 * Replaced with Enhanced Liquidity Dashboard
 * This wrapper maintains API compatibility while providing superior features
 */

import React from 'react';
import EnhancedLiquidityDashboard from './EnhancedLiquidityDashboard';

interface PhoenixDFamilyManagerProps {
  familyId: string;
  onChannelAction?: (action: string, channelId: string) => void;
}

export default function PhoenixDFamilyManager({ 
  familyId, 
  onChannelAction 
}: PhoenixDFamilyManagerProps) {
  // Replace basic liquidity monitoring with enhanced intelligence dashboard
  return (
    <EnhancedLiquidityDashboard 
      familyId={familyId} 
      onChannelAction={onChannelAction}
    />
  );
}
