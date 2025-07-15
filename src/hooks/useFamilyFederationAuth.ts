/**
 * Family Federation Authentication Hook
 * @description Hook to use the Family Federation Auth context
 * ✅ Master Context Compliance: Using lib hook instead of component import
 */

import { useFamilyFederationAuth as useLibFamilyFederationAuth } from "../lib";

export const useFamilyFederationAuth = () => {
  return useLibFamilyFederationAuth();
};

export default useFamilyFederationAuth;
