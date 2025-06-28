/**
 * Family Federation Authentication Hook
 * @description Hook to use the Family Federation Auth context
 */

import { useContext } from "react";
import { AuthContext } from "../components/auth/FamilyFederationAuth";

export const useFamilyFederationAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error(
      "useFamilyFederationAuth must be used within FamilyFederationAuthProvider"
    );
  }
  return context;
};

export default useFamilyFederationAuth;
