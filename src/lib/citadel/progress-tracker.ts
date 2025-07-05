/**
 * Browser-compatible Progress Tracker for Citadel Academy
 * Tracks student progress for reward eligibility
 */

import { StudentProgress } from './reward-system';

export class ProgressTracker {
  private apiBaseUrl: string;

  constructor() {
    this.apiBaseUrl = import.meta.env.VITE_API_URL || "/api";
  }

  /**
   * Get student progress
   */
  async getStudentProgress(studentPubkey: string): Promise<StudentProgress | null> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/citadel/progress?studentPubkey=${studentPubkey}`
      );
      
      if (response.ok) {
        const result = await response.json();
        return result.success ? result.data : null;
      }
      
      return null;
    } catch (error) {
      console.error("Failed to get student progress:", error);
      return null;
    }
  }

  /**
   * Update student progress
   */
  async updateStudentProgress(
    studentPubkey: string,
    updates: Partial<StudentProgress>
  ): Promise<StudentProgress | null> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/citadel/progress`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          studentPubkey,
          ...updates
        }),
      });

      if (response.ok) {
        const result = await response.json();
        return result.success ? result.data : null;
      }

      return null;
    } catch (error) {
      console.error("Failed to update student progress:", error);
      return null;
    }
  }

  /**
   * Add points to student progress
   */
  async addPoints(
    studentPubkey: string,
    points: {
      attendance?: number;
      contribution?: number;
      bonus?: number;
    }
  ): Promise<StudentProgress | null> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/citadel/progress/add-points`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          studentPubkey,
          points
        }),
      });

      if (response.ok) {
        const result = await response.json();
        return result.success ? result.data : null;
      }

      return null;
    } catch (error) {
      console.error("Failed to add points:", error);
      return null;
    }
  }

  /**
   * Add achievement to student
   */
  async addAchievement(
    studentPubkey: string,
    achievement: string
  ): Promise<StudentProgress | null> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/citadel/progress/add-achievement`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          studentPubkey,
          achievement
        }),
      });

      if (response.ok) {
        const result = await response.json();
        return result.success ? result.data : null;
      }

      return null;
    } catch (error) {
      console.error("Failed to add achievement:", error);
      return null;
    }
  }
}

// Export default instance
export const progressTracker = new ProgressTracker(); 