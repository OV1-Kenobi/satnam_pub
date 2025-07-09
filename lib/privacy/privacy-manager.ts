// Browser-compatible privacy manager for handling privacy controls and data sanitization
// NO Node.js dependencies - uses browser APIs and Web Crypto API

import { vault } from '../vault';
import { encryptSensitiveData, decryptSensitiveData, logPrivacyOperation } from './encryption';
import { sessionManager } from '../security/session-manager';

// Privacy levels
export enum PrivacyLevel {
  MINIMAL = 'minimal',
  STANDARD = 'standard',
  MAXIMUM = 'maximum'
}

// Privacy settings interface
export interface PrivacySettings {
  level: PrivacyLevel;
  dataRetention: number; // days
  allowAnalytics: boolean;
  allowTracking: boolean;
  encryptPersonalData: boolean;
  anonymizeTransactions: boolean;
  familyVisibility: 'public' | 'private' | 'federated';
}

// Privacy operation interface
export interface PrivacyOperation {
  action: string;
  dataType: string;
  privacyLevel: PrivacyLevel;
  timestamp: string;
  success: boolean;
  error?: string;
}

// Privacy manager class
export class PrivacyManager {
  private settingsKey = 'satnam_privacy_settings';
  private defaultSettings: PrivacySettings = {
    level: PrivacyLevel.STANDARD,
    dataRetention: 30,
    allowAnalytics: false,
    allowTracking: false,
    encryptPersonalData: true,
    anonymizeTransactions: true,
    familyVisibility: 'private'
  };

  constructor() {
    this.initializePrivacySettings();
  }

  /**
   * Initialize privacy settings
   */
  private initializePrivacySettings(): void {
    const stored = localStorage.getItem(this.settingsKey);
    if (!stored) {
      this.savePrivacySettings(this.defaultSettings);
    }
  }

  /**
   * Get current privacy settings
   */
  getPrivacySettings(): PrivacySettings {
    try {
      const stored = localStorage.getItem(this.settingsKey);
      if (!stored) {
        return this.defaultSettings;
      }
      return JSON.parse(stored);
    } catch (error) {
      console.error('Failed to load privacy settings:', error);
      return this.defaultSettings;
    }
  }

  /**
   * Save privacy settings
   */
  savePrivacySettings(settings: PrivacySettings): void {
    try {
      localStorage.setItem(this.settingsKey, JSON.stringify(settings));
      logPrivacyOperation({
        action: 'privacy_settings_updated',
        dataType: 'settings',
        success: true
      });
    } catch (error) {
      console.error('Failed to save privacy settings:', error);
      logPrivacyOperation({
        action: 'privacy_settings_update_failed',
        dataType: 'settings',
        success: false
      });
    }
  }

  /**
   * Update privacy level
   */
  updatePrivacyLevel(level: PrivacyLevel): void {
    const settings = this.getPrivacySettings();
    settings.level = level;
    
    // Adjust other settings based on privacy level
    switch (level) {
      case PrivacyLevel.MINIMAL:
        settings.encryptPersonalData = false;
        settings.anonymizeTransactions = false;
        settings.allowAnalytics = true;
        settings.allowTracking = true;
        break;
      case PrivacyLevel.STANDARD:
        settings.encryptPersonalData = true;
        settings.anonymizeTransactions = true;
        settings.allowAnalytics = false;
        settings.allowTracking = false;
        break;
      case PrivacyLevel.MAXIMUM:
        settings.encryptPersonalData = true;
        settings.anonymizeTransactions = true;
        settings.allowAnalytics = false;
        settings.allowTracking = false;
        settings.familyVisibility = 'private';
        break;
    }
    
    this.savePrivacySettings(settings);
  }

  /**
   * Sanitize personal data based on privacy level
   */
  async sanitizePersonalData(data: any, dataType: string): Promise<any> {
    const settings = this.getPrivacySettings();
    
    if (!settings.encryptPersonalData) {
      return data;
    }

    try {
      const session = await sessionManager.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      // Encrypt sensitive fields
      const sanitizedData = { ...data };
      
      if (dataType === 'user_profile') {
        if (sanitizedData.email) {
          sanitizedData.email = await this.encryptField(sanitizedData.email);
        }
        if (sanitizedData.phone) {
          sanitizedData.phone = await this.encryptField(sanitizedData.phone);
        }
        if (sanitizedData.address) {
          sanitizedData.address = await this.encryptField(sanitizedData.address);
        }
      }

      if (dataType === 'transaction') {
        if (settings.anonymizeTransactions) {
          sanitizedData.recipient = await this.anonymizeField(sanitizedData.recipient);
          sanitizedData.description = await this.anonymizeField(sanitizedData.description);
        }
      }

      logPrivacyOperation({
        action: 'data_sanitized',
        dataType,
        success: true
      });

      return sanitizedData;
    } catch (error) {
      console.error('Failed to sanitize data:', error);
      logPrivacyOperation({
        action: 'data_sanitization_failed',
        dataType,
        success: false
      });
      return data;
    }
  }

  /**
   * Encrypt a field value
   */
  private async encryptField(value: string): Promise<string> {
    const encrypted = await encryptSensitiveData(value);
    return `encrypted:${encrypted.encrypted}:${encrypted.iv}`;
  }

  /**
   * Anonymize a field value
   */
  private async anonymizeField(value: string): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    const hashArray = Array.from(new Uint8Array(hash));
    return hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Check if analytics are allowed
   */
  isAnalyticsAllowed(): boolean {
    const settings = this.getPrivacySettings();
    return settings.allowAnalytics;
  }

  /**
   * Check if tracking is allowed
   */
  isTrackingAllowed(): boolean {
    const settings = this.getPrivacySettings();
    return settings.allowTracking;
  }

  /**
   * Get data retention period
   */
  getDataRetentionPeriod(): number {
    const settings = this.getPrivacySettings();
    return settings.dataRetention;
  }

  /**
   * Clear old data based on retention policy
   */
  async clearOldData(): Promise<void> {
    const retentionPeriod = this.getDataRetentionPeriod();
    const cutoffDate = Date.now() - (retentionPeriod * 24 * 60 * 60 * 1000);

    try {
      // Clear old audit logs
      const auditLogs = JSON.parse(localStorage.getItem('privacy_audit_logs') || '[]');
      const filteredLogs = auditLogs.filter((log: any) => {
        const logDate = new Date(log.timestamp).getTime();
        return logDate > cutoffDate;
      });
      localStorage.setItem('privacy_audit_logs', JSON.stringify(filteredLogs));

      // Clear old session data
      const session = await sessionManager.getSession();
      if (session && session.lastActivity < cutoffDate) {
        await sessionManager.destroySession();
      }

      logPrivacyOperation({
        action: 'old_data_cleared',
        dataType: 'retention_cleanup',
        success: true
      });
    } catch (error) {
      console.error('Failed to clear old data:', error);
      logPrivacyOperation({
        action: 'old_data_clear_failed',
        dataType: 'retention_cleanup',
        success: false
      });
    }
  }

  /**
   * Export privacy audit log
   */
  exportPrivacyAuditLog(): string {
    try {
      const auditLogs = localStorage.getItem('privacy_audit_logs');
      if (!auditLogs) {
        return JSON.stringify([]);
      }
      return auditLogs;
    } catch (error) {
      console.error('Failed to export audit log:', error);
      return JSON.stringify([]);
    }
  }

  /**
   * Reset privacy settings to default
   */
  resetPrivacySettings(): void {
    this.savePrivacySettings(this.defaultSettings);
  }
}

// Export singleton instance
export const privacyManager = new PrivacyManager();
export default privacyManager; 