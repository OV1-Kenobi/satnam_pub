/**
 * Privacy-First Service for Gift-Wrapped Messaging
 *
 * Consolidated service that combines all messaging functionality for Satnam.pub
 * Integrates with the PrivateCommunicationModal for seamless messaging experience.
 */

export interface PrivacyConsentResponse {
  consentGiven: boolean;
  warningAcknowledged: boolean;
  selectedScope: "direct" | "groups" | "specific-groups" | "none";
  specificGroupIds?: string[];
  nip05?: string;
  timestamp: Date;
}

export interface ISatnamPrivacyFirstCommunications {
  sessionId: string;
  isConnected: boolean;
  sendGiftwrappedMessage: (
    config: GiftwrappedMessageConfig
  ) => Promise<MessageResponse>;
  enableNip05Disclosure: (config: Nip05DisclosureConfig) => Promise<void>;
  destroySession: () => Promise<void>;
}

export interface GiftwrappedMessageConfig {
  content: string;
  recipient: string;
  sender: string;
  encryptionLevel: "standard" | "enhanced" | "maximum";
  communicationType: "family" | "individual";
  messageType?: "direct" | "group";
}

export interface MessageResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  encryptionUsed?: string;
  deliveryMethod?: string;
}

export interface Nip05DisclosureConfig {
  nip05: string;
  scope: "direct" | "groups" | "specific-groups";
  specificGroupIds?: string[];
}

export interface MessagingConfig {
  relays: string[];
  defaultEncryptionLevel: "standard" | "enhanced" | "maximum";
  privacyWarnings: {
    enabled: boolean;
    showForNewContacts: boolean;
    showForGroupMessages: boolean;
  };
}

export interface IdentityDisclosureStatus {
  hasNip05: boolean;
  isDisclosureEnabled: boolean;
  directMessagesEnabled: boolean;
  groupMessagesEnabled: boolean;
  specificGroupsCount: number;
  lastUpdated?: Date;
}

export interface PrivacyWarningContent {
  title: string;
  message: string;
  risks: string[];
  recommendations: string[];
  severity: "low" | "medium" | "high";
}

export interface DisclosureWorkflowResult {
  requiresUserConfirmation: boolean;
  warningContent?: PrivacyWarningContent;
  error?: string;
}

export interface SessionInitializationOptions {
  relays?: string[];
  encryptionLevel?: "standard" | "enhanced" | "maximum";
  enablePrivacyWarnings?: boolean;
  sessionTimeout?: number;
}

export interface ContactData {
  npub: string;
  nip05?: string;
  displayName: string;
  // Master Context Role Hierarchy
  familyRole?: "private" | "offspring" | "adult" | "steward" | "guardian";
  trustLevel: "family" | "trusted" | "known" | "unverified";
  preferredEncryption: "gift-wrap" | "nip04" | "auto";
  notes?: string;
  tags: string[];
}

export const MESSAGING_CONFIG: MessagingConfig = {
  relays: ["wss://relay.satnam.pub", "wss://relay.damus.io", "wss://nos.lol"],
  defaultEncryptionLevel: "enhanced",
  privacyWarnings: {
    enabled: true,
    showForNewContacts: true,
    showForGroupMessages: true,
  },
};

export class PrivacyFirstMessagingService
  implements ISatnamPrivacyFirstCommunications
{
  public sessionId: string;
  public isConnected: boolean = false;
  private apiBaseUrl: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.apiBaseUrl = import.meta.env.VITE_API_URL || "/api";
  }

  async sendGiftwrappedMessage(
    config: GiftwrappedMessageConfig
  ): Promise<MessageResponse> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/communications/giftwrapped`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...config,
            sessionId: this.sessionId,
            timestamp: new Date().toISOString(),
          }),
        }
      );

      const result = await response.json();

      if (response.ok) {
        return {
          success: true,
          messageId: result.messageId,
          encryptionUsed: result.encryptionUsed,
          deliveryMethod: result.deliveryMethod,
        };
      } else {
        return {
          success: false,
          error: result.error || "Failed to send message",
        };
      }
    } catch (error) {
      console.error("Privacy-first messaging error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async enableNip05Disclosure(config: Nip05DisclosureConfig): Promise<void> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/communications/enable-nip05-disclosure`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...config,
            sessionId: this.sessionId,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to enable NIP-05 disclosure");
      }
    } catch (error) {
      console.error("NIP-05 disclosure error:", error);
      throw error;
    }
  }

  async destroySession(): Promise<void> {
    try {
      await fetch(`${this.apiBaseUrl}/communications/destroy-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: this.sessionId,
        }),
      });
      this.isConnected = false;
    } catch (error) {
      console.error("Failed to destroy session:", error);
    }
  }

  async initializeSession(
    nsecBuffer: ArrayBuffer,
    options?: SessionInitializationOptions
  ): Promise<string> {
    try {
      // Convert ArrayBuffer to secure format for transmission
      const nsecArray = new Uint8Array(nsecBuffer);

      const response = await fetch(
        `${this.apiBaseUrl}/communications/create-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            nsecArray: Array.from(nsecArray), // Convert to serializable format
            options: options || {},
          }),
        }
      );

      // Immediately clear the nsec from memory
      nsecArray.fill(0);

      const result = await response.json();

      if (response.ok && result.sessionId) {
        this.sessionId = result.sessionId;
        this.isConnected = true;
        return result.sessionId;
      }

      throw new Error(result.error || "Failed to create session");
    } catch (error) {
      console.error("Failed to initialize session:", error);
      throw error;
    }
  }

  async getIdentityDisclosureStatus(): Promise<IdentityDisclosureStatus> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/communications/identity-disclosure-status`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.sessionId}`,
          },
        }
      );

      const result = await response.json();

      if (response.ok) {
        return {
          hasNip05: result.hasNip05 || false,
          isDisclosureEnabled: result.isDisclosureEnabled || false,
          directMessagesEnabled: result.directMessagesEnabled || false,
          groupMessagesEnabled: result.groupMessagesEnabled || false,
          specificGroupsCount: result.specificGroupsCount || 0,
          lastUpdated: result.lastUpdated
            ? new Date(result.lastUpdated)
            : undefined,
        };
      }

      throw new Error(
        result.error || "Failed to get identity disclosure status"
      );
    } catch (error) {
      console.error("Failed to get identity disclosure status:", error);
      return {
        hasNip05: false,
        isDisclosureEnabled: false,
        directMessagesEnabled: false,
        groupMessagesEnabled: false,
        specificGroupsCount: 0,
      };
    }
  }

  async enableNip05DisclosureWorkflow(
    nip05: string,
    scope: "direct" | "groups" | "specific-groups",
    specificGroupIds?: string[]
  ): Promise<DisclosureWorkflowResult> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/communications/enable-nip05-disclosure-workflow`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            nip05,
            scope,
            specificGroupIds,
            sessionId: this.sessionId,
          }),
        }
      );

      const result = await response.json();

      if (response.ok) {
        return {
          requiresUserConfirmation: result.requiresUserConfirmation || false,
          warningContent: result.warningContent,
          error: result.error,
        };
      }

      return {
        requiresUserConfirmation: false,
        error: result.error || "Failed to start disclosure workflow",
      };
    } catch (error) {
      console.error("Failed to start disclosure workflow:", error);
      return {
        requiresUserConfirmation: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async updateIdentityDisclosurePreferences(
    consent: PrivacyConsentResponse,
    nip05?: string
  ): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/communications/update-identity-disclosure-preferences`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            consent,
            nip05,
            sessionId: this.sessionId,
          }),
        }
      );

      const result = await response.json();
      return response.ok && result.success;
    } catch (error) {
      console.error("Failed to update identity disclosure preferences:", error);
      return false;
    }
  }

  async disableIdentityDisclosure(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/communications/disable-identity-disclosure`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId: this.sessionId,
          }),
        }
      );

      const result = await response.json();
      return response.ok && result.success;
    } catch (error) {
      console.error("Failed to disable identity disclosure:", error);
      return false;
    }
  }

  async addContact(contactData: ContactData): Promise<string | null> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/communications/add-contact`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contactData,
            sessionId: this.sessionId,
          }),
        }
      );

      const result = await response.json();

      if (response.ok && result.contactId) {
        return result.contactId;
      }

      return null;
    } catch (error) {
      console.error("Failed to add contact:", error);
      return null;
    }
  }

  static async createSession(
    nsecBuffer: ArrayBuffer,
    options?: SessionInitializationOptions
  ): Promise<PrivacyFirstMessagingService | null> {
    try {
      // Convert ArrayBuffer to secure format for transmission
      const nsecArray = new Uint8Array(nsecBuffer);

      const response = await fetch("/api/communications/create-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nsecArray: Array.from(nsecArray),
          options: options || {},
        }),
      });

      // Immediately clear the nsec from memory
      nsecArray.fill(0);

      const result = await response.json();

      if (response.ok && result.sessionId) {
        const service = new PrivacyFirstMessagingService(result.sessionId);
        service.isConnected = true;
        return service;
      }

      return null;
    } catch (error) {
      console.error("Failed to create session:", error);
      return null;
    }
  }
}

// Main production class used by components
export class SatnamPrivacyFirstCommunications extends PrivacyFirstMessagingService {
  constructor(sessionId?: string) {
    super(sessionId || "");
  }

  static async createSession(
    nsecBuffer: ArrayBuffer,
    options?: SessionInitializationOptions
  ): Promise<SatnamPrivacyFirstCommunications | null> {
    try {
      // Convert ArrayBuffer to secure format for transmission
      const nsecArray = new Uint8Array(nsecBuffer);

      const response = await fetch("/api/communications/create-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nsecArray: Array.from(nsecArray),
          options: options || {},
        }),
      });

      // Immediately clear the nsec from memory
      nsecArray.fill(0);

      const result = await response.json();

      if (response.ok && result.sessionId) {
        const service = new SatnamPrivacyFirstCommunications(result.sessionId);
        service.isConnected = true;
        return service;
      }

      return null;
    } catch (error) {
      console.error("Failed to create session:", error);
      return null;
    }
  }
}
