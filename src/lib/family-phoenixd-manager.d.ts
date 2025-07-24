/**
 * Type declarations for src/lib/family-phoenixd-manager
 * CRITICAL: Family PhoenixD Manager type definitions
 */

export interface PhoenixDStatus {
  status: 'online' | 'offline' | 'error';
  version?: string;
  nodeId?: string;
  channels?: number;
  balance?: number;
  lastUpdate?: string;
}

export interface FamilyPhoenixDConfig {
  familyId: string;
  nodeUrl: string;
  apiKey: string;
  channels: {
    minCapacity: number;
    maxCapacity: number;
    targetChannels: number;
  };
}

export class FamilyPhoenixDManager {
  constructor(config: FamilyPhoenixDConfig);
  
  async getStatus(): Promise<PhoenixDStatus>;
  async getBalance(): Promise<number>;
  async createInvoice(amount: number, memo?: string): Promise<string>;
  async payInvoice(invoice: string): Promise<any>;
  async getChannels(): Promise<any[]>;
  async openChannel(nodeId: string, amount: number): Promise<any>;
  async closeChannel(channelId: string): Promise<any>;
  async healthCheck(): Promise<boolean>;
}

export function createFamilyPhoenixDManager(config: FamilyPhoenixDConfig): FamilyPhoenixDManager;
