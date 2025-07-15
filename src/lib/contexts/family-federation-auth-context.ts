/**
 * Family Federation Authentication Context
 * @description Context for Family Federation authentication state
 * ✅ Master Context Compliance: Contexts separated from React components
 */

import { createContext } from "react";
import { AuthContextType } from "../../types/auth";

// Create authentication context
export const FamilyFederationAuthContext =
  createContext<AuthContextType | null>(null);

// Export context name for debugging
export const CONTEXT_NAME = "FamilyFederationAuthContext";
