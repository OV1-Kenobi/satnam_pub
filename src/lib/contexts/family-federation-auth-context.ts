/**
 * Family Federation Authentication Context
 * @description Context for Family Federation authentication state
 * ✅ Master Context Compliance: Contexts separated from React components
 */

import React from "react";
import { AuthContextType } from "../../types/auth";

// Create authentication context
// Use React.createContext instead of destructured createContext to prevent TDZ errors
// when chunks load before React is fully initialized
export const FamilyFederationAuthContext =
  React.createContext<AuthContextType | null>(null);

// Export context name for debugging
export const CONTEXT_NAME = "FamilyFederationAuthContext";
