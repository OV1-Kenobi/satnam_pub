/**
 * Family-related type definitions
 */

/**
 * Represents a family member
 */
export interface FamilyMember {
  id: string;
  name: string;
  role: "parent" | "child" | "guardian" | "other";
  avatar?: string;
}

/**
 * Represents a family profile in the system
 */
export interface FamilyProfile {
  id: string;
  name: string;
  members: FamilyMember[];
  createdAt?: string;
  updatedAt?: string;
}
