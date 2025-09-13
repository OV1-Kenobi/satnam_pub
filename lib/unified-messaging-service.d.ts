import type { UnifiedMessagingConfig as _UnifiedMessagingConfig } from "./central_event_publishing_service";
import { CentralEventPublishingService } from "./central_event_publishing_service";

export { DEFAULT_UNIFIED_CONFIG } from "./central_event_publishing_service";
export type { UnifiedMessagingConfig } from "./central_event_publishing_service";

/** Literal message types supported by unified messaging helpers */
export type UnifiedMessageType =
  | "text"
  | "file"
  | "payment"
  | "credential"
  | "sensitive";

/** Minimal shapes used by the hook and API helpers */
export interface AddContactInput {
  npub: string;
  displayName: string;
  trustLevel?: string;
}

export interface CreateGroupInput {
  name: string;
  description?: string;
  groupType?: string;
  encryptionType?: string;
  initialMembers?: string[];
}

export interface Nip05DisclosureStatus {
  enabled: boolean;
  nip05?: string;
  scope?: "direct" | "groups" | "specific-groups";
  specificGroupIds?: string[];
}

/**
 * Facade class re-exported as UnifiedMessagingService.
 * Accepts an optional config for type compatibility; extra constructor args are ignored at runtime.
 */
export declare class UnifiedMessagingService extends CentralEventPublishingService {
  constructor(config?: _UnifiedMessagingConfig);

  // Session lifecycle
  destroySession(): Promise<void>;

  // Contacts & Groups
  addContact(contact: AddContactInput): Promise<string>;
  createGroup(group: CreateGroupInput): Promise<string>;

  // Direct & Group messaging
  sendDirectMessage(
    recipientNpub: string,
    content: string,
    messageType?: UnifiedMessageType
  ): Promise<string>;
  sendGroupMessage(
    groupId: string,
    content: string,
    messageType?: UnifiedMessageType
  ): Promise<string>;

  // NIP-05 disclosure controls
  enableNip05Disclosure(
    nip05: string,
    scope: "direct" | "groups" | "specific-groups",
    specificGroupIds?: string[]
  ): Promise<{ success: boolean; error?: string }>;
  disableNip05Disclosure(): Promise<{ success: boolean; error?: string }>;
  getNip05DisclosureStatus(): Promise<Nip05DisclosureStatus>;
}

export * as central_event_publishing_service from "./central_event_publishing_service";
