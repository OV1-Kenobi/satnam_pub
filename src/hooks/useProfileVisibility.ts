/**
 * useProfileVisibility Hook
 * Phase 3: Public Profile URL System - UI Integration
 * 
 * Custom hook for consuming ProfileVisibilityContext.
 * Provides easy access to profile visibility state and methods.
 */

import { useContext } from 'react';
import { ProfileVisibilityContext } from '../contexts/ProfileVisibilityContext';

/**
 * Custom hook to access profile visibility context
 * @throws Error if used outside ProfileVisibilityProvider
 */
export const useProfileVisibility = () => {
  const context = useContext(ProfileVisibilityContext);

  if (context === undefined) {
    throw new Error(
      'useProfileVisibility must be used within a ProfileVisibilityProvider'
    );
  }

  return context;
};

export default useProfileVisibility;

