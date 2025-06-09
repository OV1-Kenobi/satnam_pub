/**
 * User-related type definitions
 */

/**
 * Represents a user profile in the system
 */
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  familyId?: string;
  avatar?: string;
  role?: 'admin' | 'user';
}
