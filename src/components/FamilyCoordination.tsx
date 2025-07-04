/**
 * FAMILY COORDINATION COMPONENT
 * 
 * Replaced with Enhanced Family Coordination Dashboard
 * This wrapper maintains API compatibility while providing superior features
 */

import React from 'react';
import EnhancedFamilyCoordination from './EnhancedFamilyCoordination';

interface FamilyCoordinationProps {
  onBack: () => void;
  familyId?: string; // Enhanced version requires familyId
}

const FamilyCoordination: React.FC<FamilyCoordinationProps> = ({ 
  onBack, 
  familyId = 'default_family' 
}) => {
  // Replace basic family coordination with enhanced intelligence dashboard
  return (
    <EnhancedFamilyCoordination 
      />
  );
}
export default FamilyCoordination;
