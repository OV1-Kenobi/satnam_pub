export interface GroupData {
  id: string;
  name: string;
  group_type: string;
  encryption_type: string;
  member_count: number;
  lastActivity: string;
  role: string;
  avatar_url?: string | null;
  muted?: boolean;
}

export function deleteMessage(
  messageId: string
): Promise<{ success: boolean; error?: string }>;
export function blockSender(
  senderPubkey: string
): Promise<{ success: boolean; error?: string }>;
export function listUserGroups(): Promise<{
  success: boolean;
  data?: GroupData[];
  error?: string;
}>;

export interface GroupCreateResponse {
  id: string;
}
export interface GroupMember {
  member_hash: string;
  role?: string;
  muted?: boolean;
  is_admin?: boolean;
}
export interface GroupTopic {
  id: number;
  topic_name: string;
  description?: string | null;
  created_by_hash: string;
  created_at: string;
  updated_at: string;
}
export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}
export interface GroupDetails {
  members: GroupMember[];
  topics: GroupTopic[];
  membersMeta: PageMeta;
  topicsMeta: PageMeta;
}

export function leaveGroup(
  groupId: string
): Promise<{ success: boolean; error?: string }>;
export function createGroup(
  name: string,
  groupType: string,
  encryptionType: string,
  avatarUrl?: string | null,
  groupDescription?: string | null
): Promise<{ success: boolean; data?: GroupCreateResponse; error?: string }>;
export function addGroupMember(
  groupId: string,
  memberHash: string
): Promise<{ success: boolean; error?: string }>;
export function removeGroupMember(
  groupId: string,
  memberHash: string
): Promise<{ success: boolean; error?: string }>;
export function createGroupTopic(
  groupId: string,
  topicName: string,
  description?: string | null
): Promise<{ success: boolean; data?: { id: number }; error?: string }>;
export function getGroupDetails(
  groupId: string,
  page?: number,
  pageSize?: number
): Promise<{ success: boolean; data?: GroupDetails; error?: string }>;

export function updateGroupPreferences(
  groupId: string,
  muted: boolean
): Promise<{ success: boolean; error?: string }>;
