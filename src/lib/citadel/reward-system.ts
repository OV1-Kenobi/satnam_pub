/**
 * Browser-compatible Citadel Academy Rewards System
 * Bitcoin-only reward system for educational achievements
 */

export type RewardType = 
  | 'lightning-sats'
  | 'family-credits'
  | 'achievement-nft'
  | 'premium-access'
  | 'mentorship-time'
  | 'hardware-discount'
  | 'conference-access'
  | 'citadel-equity';

export interface RewardConfig {
  id: string;
  type: RewardType;
  name: string;
  description: string;
  value: number;
  currency: 'sats' | 'credits' | 'usd';
  requirements: {
    minPoints: number;
    minAttendance: number;
    minContributions: number;
  };
  isAvailable: boolean;
  expiresAt?: Date;
  maxRedemptions?: number;
  currentRedemptions: number;
}

export interface RewardRedemption {
  id: string;
  rewardType: RewardType;
  rewardName: string;
  studentPubkey: string;
  familyId?: string;
  status: 'pending' | 'completed' | 'failed' | 'expired';
  requestedAt: Date;
  completedAt?: Date;
  value: number;
  currency: 'sats' | 'credits' | 'usd';
  transactionId?: string;
  notes?: string;
  redemption_proof?: string;
  created_at?: number;
  processed_at?: number;
  expires_at?: number;
}

export interface RewardPoints {
  studentPubkey: string;
  totalPoints: number;
  attendancePoints: number;
  contributionPoints: number;
  bonusPoints: number;
  lastUpdated: Date;
}

export interface RewardStats {
  totalRewards: number;
  totalValue: number;
  averageValue: number;
  mostPopularType: RewardType;
  redemptionRate: number;
}

export interface StudentProgress {
  studentPubkey: string;
  totalPoints: number;
  attendancePoints: number;
  contributionPoints: number;
  bonusPoints: number;
  achievements: string[];
  lastUpdated: Date;
}

export interface ApprovalRequest {
  id: string;
  student_pubkey: string;
  guardian_pubkey: string;
  reward_type: RewardType;
  message: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  created_at: number;
}

export class RewardSystem {
  private apiBaseUrl: string;

  constructor() {
    this.apiBaseUrl = import.meta.env.VITE_API_URL || "/api";
  }

  /**
   * Get available rewards for a student
   */
  async getAvailableRewards(
    studentPubkey: string,
    progress?: StudentProgress
  ): Promise<RewardConfig[]> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/citadel/rewards?action=available&studentPubkey=${studentPubkey}`
      );
      
      if (response.ok) {
        const result = await response.json();
        return result.success ? result.data : [];
      }
      
      return [];
    } catch (error) {
      console.error("Failed to get available rewards:", error);
      return [];
    }
  }

  /**
   * Get student redemptions
   */
  async getStudentRedemptions(studentPubkey: string): Promise<RewardRedemption[]> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/citadel/rewards?action=history&studentPubkey=${studentPubkey}`
      );
      
      if (response.ok) {
        const result = await response.json();
        return result.success ? result.data : [];
      }
      
      return [];
    } catch (error) {
      console.error("Failed to get student redemptions:", error);
      return [];
    }
  }

  /**
   * Get reward configuration
   */
  getRewardConfig(rewardType: RewardType): RewardConfig | null {
    // Mock configurations - in production these would come from API
    const configs: Record<RewardType, RewardConfig> = {
      'lightning-sats': {
        id: 'lightning-sats',
        type: 'lightning-sats',
        name: 'Lightning Sats',
        description: 'Direct Lightning Network satoshis',
        value: 10000,
        currency: 'sats',
        requirements: { minPoints: 100, minAttendance: 5, minContributions: 3 },
        isAvailable: true,
        currentRedemptions: 0
      },
      'family-credits': {
        id: 'family-credits',
        type: 'family-credits',
        name: 'Family Treasury Credits',
        description: 'Credits for family treasury',
        value: 5000,
        currency: 'credits',
        requirements: { minPoints: 200, minAttendance: 10, minContributions: 5 },
        isAvailable: true,
        currentRedemptions: 0
      },
      'achievement-nft': {
        id: 'achievement-nft',
        type: 'achievement-nft',
        name: 'Achievement NFT',
        description: 'Non-fungible token for achievements',
        value: 1,
        currency: 'usd',
        requirements: { minPoints: 500, minAttendance: 20, minContributions: 10 },
        isAvailable: true,
        currentRedemptions: 0
      },
      'premium-access': {
        id: 'premium-access',
        type: 'premium-access',
        name: 'Premium Access',
        description: 'Access to premium features',
        value: 50,
        currency: 'usd',
        requirements: { minPoints: 300, minAttendance: 15, minContributions: 8 },
        isAvailable: true,
        currentRedemptions: 0
      },
      'mentorship-time': {
        id: 'mentorship-time',
        type: 'mentorship-time',
        name: 'Mentorship Time',
        description: 'One-on-one mentorship session',
        value: 100,
        currency: 'usd',
        requirements: { minPoints: 400, minAttendance: 18, minContributions: 12 },
        isAvailable: true,
        currentRedemptions: 0
      },
      'hardware-discount': {
        id: 'hardware-discount',
        type: 'hardware-discount',
        name: 'Hardware Discount',
        description: 'Discount on Bitcoin hardware',
        value: 25,
        currency: 'usd',
        requirements: { minPoints: 250, minAttendance: 12, minContributions: 6 },
        isAvailable: true,
        currentRedemptions: 0
      },
      'conference-access': {
        id: 'conference-access',
        type: 'conference-access',
        name: 'Conference Access',
        description: 'Access to Bitcoin conferences',
        value: 200,
        currency: 'usd',
        requirements: { minPoints: 600, minAttendance: 25, minContributions: 15 },
        isAvailable: true,
        currentRedemptions: 0
      },
      'citadel-equity': {
        id: 'citadel-equity',
        type: 'citadel-equity',
        name: 'Citadel Equity',
        description: 'Equity in Citadel Academy',
        value: 1000,
        currency: 'usd',
        requirements: { minPoints: 1000, minAttendance: 50, minContributions: 25 },
        isAvailable: true,
        currentRedemptions: 0
      }
    };

    return configs[rewardType] || null;
  }

  /**
   * Redeem a reward
   */
  async redeemReward(
    studentPubkey: string,
    rewardType: RewardType,
    guardianApproval?: boolean
  ): Promise<RewardRedemption> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/citadel/rewards?action=redeem`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rewardType,
          guardianApproval,
          studentPubkey
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          return result.data;
        }
      }

      throw new Error('Failed to redeem reward');
    } catch (error) {
      console.error("Failed to redeem reward:", error);
      throw error;
    }
  }

  /**
   * Request guardian approval
   */
  async requestGuardianApproval(
    studentPubkey: string,
    rewardType: RewardType,
    guardianPubkey: string,
    message?: string
  ): Promise<ApprovalRequest> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/citadel/rewards?action=request-approval`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rewardType,
          guardianPubkey,
          message,
          studentPubkey
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          return result.data;
        }
      }

      throw new Error('Failed to request guardian approval');
    } catch (error) {
      console.error("Failed to request guardian approval:", error);
      throw error;
    }
  }

  /**
   * Update reward configuration (admin only)
   */
  updateRewardConfig(rewardType: RewardType, updates: Partial<RewardConfig>): void {
    // This would be implemented to update configurations
    console.log(`Updating reward config for ${rewardType}:`, updates);
  }

  /**
   * Get redemption status
   */
  async getRedemptionStatus(redemptionId: string): Promise<RewardRedemption | null> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/citadel/rewards?action=status&redemptionId=${redemptionId}`
      );
      
      if (response.ok) {
        const result = await response.json();
        return result.success ? result.data : null;
      }
      
      return null;
    } catch (error) {
      console.error("Failed to get redemption status:", error);
      return null;
    }
  }

  /**
   * Get Lightning reward details
   */
  async getLightningRewardDetails(redemptionId: string): Promise<any> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/citadel/rewards/lightning?redemptionId=${redemptionId}`
      );
      
      if (response.ok) {
        const result = await response.json();
        return result.success ? result.data : null;
      }
      
      return null;
    } catch (error) {
      console.error("Failed to get Lightning reward details:", error);
      return null;
    }
  }

  /**
   * Get family treasury reward details
   */
  async getFamilyTreasuryRewardDetails(redemptionId: string): Promise<any> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/citadel/rewards/family-treasury?redemptionId=${redemptionId}`
      );
      
      if (response.ok) {
        const result = await response.json();
        return result.success ? result.data : null;
      }
      
      return null;
    } catch (error) {
      console.error("Failed to get family treasury reward details:", error);
      return null;
    }
  }
}

// Export default instance
export const rewardSystem = new RewardSystem(); 