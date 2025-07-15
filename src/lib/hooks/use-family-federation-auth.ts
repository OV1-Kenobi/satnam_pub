/**
 * Family Federation Authentication Hook
 * @description Hook for accessing Family Federation authentication context
 * ✅ Master Context Compliance: Hooks separated from React components
 */

import { useContext } from "react";
import { FamilyFederationAuthContext } from "../contexts/family-federation-auth-context";

export const useFamilyFederationAuth = () => {
  const context = useContext(FamilyFederationAuthContext);
  if (!context) {
    throw new Error(
      "useFamilyFederationAuth must be used within FamilyFederationAuthProvider"
    );
  }
  return context;
};

// Internal hook for components in the same file
export const useInternalFamilyFederationAuth = () => {
  const context = useContext(FamilyFederationAuthContext);
  if (!context) {
    throw new Error("useAuth must be used within FamilyFederationAuthProvider");
  }
  return context;
};
