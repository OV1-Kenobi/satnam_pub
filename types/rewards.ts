// Rewards types for the Satnam.pub platform
// This file contains type definitions for the reward system

export interface Reward {
  id: string;
  type: 'achievement' | 'milestone' | 'participation';
  title: string;
  description: string;
  amount: number; // in satoshis
  currency: 'sats' | 'ecash' | 'fedimint';
  requirements: string[];
  claimed: boolean;
  claimedAt?: string;
  createdAt: string;
}

export interface RewardSystem {
  totalRewards: number;
  claimedRewards: number;
  pendingRewards: number;
  rewards: Reward[];
}

// Export empty object to make this a module
export {};
