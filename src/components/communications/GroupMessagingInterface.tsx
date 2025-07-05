/**
 * @fileoverview Group Messaging Interface Component
 * @description Provides UI for NIP-28/29/59 group messaging with gift-wrapping and guardian approval
 */

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  MessageSquare, 
  Shield, 
  Plus, 
  Send, 
  UserPlus, 
  Settings,
  CheckCircle,
  XCircle,
  Clock,
  Lock,
  Unlock
} from 'lucide-react';

interface GroupMessagingInterfaceProps {
  userNsec: string;
  guardianNsec?: string;
  onMessageSent?: (groupId: string, messageId: string) => void;
  onGroupCreated?: (groupId: string) => void;
}

interface Group {
  id: string;
  name: string;
  description?: string;
  groupType: 'family' | 'business' | 'friends' | 'advisors';
  memberCount: number;
  encryptionType: 'gift-wrap' | 'nip04';
}

interface PendingApproval {
  id: string;
  groupId: string;
  messageContent: string;
  messageType: string;
  requesterPubkey: string;
  created_at: number;
}

export function GroupMessagingInterface({ 
  userNsec, 
  guardianNsec, 
  onMessageSent, 
  onGroupCreated 
}: GroupMessagingInterfaceProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [messageType, setMessageType] = useState<'text' | 'file' | 'payment' | 'credential' | 'sensitive'>('text');
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showInviteMember, setShowInviteMember] = useState(false);

  // Form states
  const [newGroupData, setNewGroupData] = useState({
    name: '',
    description: '',
    groupType: 'family' as const,
    encryptionType: 'gift-wrap' as const,
  });

  const [inviteData, setInviteData] = useState({
    inviteeNpub: '',
    role: 'member' as const,
    message: '',
  });

  useEffect(() => {
    loadGroups();
    loadPendingApprovals();
  }, []);

  const loadGroups = async () => {
    try {
      const response = await fetch('/.netlify/functions/group-messaging', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userNsec}`, // In production, use proper JWT
        },
        body: JSON.stringify({ action: 'get_user_groups' }),
      });

      if (response.ok) {
        const { data } = await response.json();
        setGroups(data.groups || []);
        if (data.groups?.length > 0 && !selectedGroup) {
          setSelectedGroup(data.groups[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to load groups:', error);
      setError('Failed to load groups');
    }
  };

  const loadPendingApprovals = async () => {
    try {
      const response = await fetch('/.netlify/functions/group-messaging', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userNsec}`,
        },
        body: JSON.stringify({ action: 'get_pending_approvals' }),
      });

      if (response.ok) {
        const { data } = await response.json();
        setPendingApprovals(data.approvals || []);
      }
    } catch (error) {
      console.error('Failed to load approvals:', error);
    }
  };

  const createGroup = async () => {
    if (!newGroupData.name.trim()) {
      setError('Group name is required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/.netlify/functions/group-messaging', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userNsec}`,
        },
        body: JSON.stringify({
          action: 'create_group',
          ...newGroupData,
        }),
      });

      if (response.ok) {
        const { data } = await response.json();
        setShowCreateGroup(false);
        setNewGroupData({ name: '', description: '', groupType: 'family', encryptionType: 'gift-wrap' });
        await loadGroups();
        onGroupCreated?.(data.groupId);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to create group');
      }
    } catch (error) {
      console.error('Failed to create group:', error);
      setError('Failed to create group');
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!selectedGroup || !newMessage.trim()) {
      setError('Please select a group and enter a message');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/.netlify/functions/group-messaging', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userNsec}`,
        },
        body: JSON.stringify({
          action: 'send_message',
          groupId: selectedGroup,
          content: newMessage,
          messageType,
        }),
      });

      if (response.ok) {
        const { data } = await response.json();
        setNewMessage('');
        onMessageSent?.(selectedGroup, data.messageId);
        
        // If it's a sensitive message, refresh approvals
        if (messageType === 'sensitive') {
          await loadPendingApprovals();
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to send message');
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      setError('Failed to send message');
    } finally {
      setIsLoading(false);
    }
  };

  const inviteMember = async () => {
    if (!selectedGroup || !inviteData.inviteeNpub.trim()) {
      setError('Please select a group and enter invitee npub');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/.netlify/functions/group-messaging', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userNsec}`,
        },
        body: JSON.stringify({
          action: 'invite_member',
          groupId: selectedGroup,
          ...inviteData,
        }),
      });

      if (response.ok) {
        setShowInviteMember(false);
        setInviteData({ inviteeNpub: '', role: 'member', message: '' });
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to invite member');
      }
    } catch (error) {
      console.error('Failed to invite member:', error);
      setError('Failed to invite member');
    } finally {
      setIsLoading(false);
    }
  };

  const processGuardianApproval = async (approvalId: string, approved: boolean) => {
    if (!guardianNsec) {
      setError('Guardian credentials required for approval');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/.netlify/functions/group-messaging', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${guardianNsec}`,
        },
        body: JSON.stringify({
          action: 'process_guardian_approval',
          approvalId,
          guardianPubkey: guardianNsec, // In production, get pubkey from nsec
          approved,
          reason: approved ? 'Approved by guardian' : 'Rejected by guardian',
        }),
      });

      if (response.ok) {
        await loadPendingApprovals();
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to process approval');
      }
    } catch (error) {
      console.error('Failed to process approval:', error);
      setError('Failed to process approval');
    } finally {
      setIsLoading(false);
    }
  };

  const selectedGroupData = groups.find(g => g.id === selectedGroup);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">🏛️ Group Messaging</h2>
            <p className="text-gray-600">Secure family and peer group communications with NIP-28/29/59</p>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowCreateGroup(true)}
              className="flex items-center space-x-2 bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Create Group</span>
            </button>
            <button
              onClick={() => setShowInviteMember(true)}
              disabled={!selectedGroup}
              className="flex items-center space-x-2 bg-green-500 hover:bg-green-600 text-white font-medium py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <UserPlus className="h-4 w-4" />
              <span>Invite Member</span>
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <div className="flex items-center space-x-2">
              <XCircle className="h-5 w-5 text-red-500" />
              <span className="text-red-700">{error}</span>
            </div>
          </div>
        )}

        {/* Groups List */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {groups.map(group => (
            <div
              key={group.id}
              onClick={() => setSelectedGroup(group.id)}
              className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                selectedGroup === group.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-900">{group.name}</h3>
                <div className="flex items-center space-x-1">
                  {group.encryptionType === 'gift-wrap' ? (
                    <Lock className="h-4 w-4 text-green-600" />
                  ) : (
                    <Unlock className="h-4 w-4 text-orange-600" />
                  )}
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-2">{group.description}</p>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{group.groupType}</span>
                <span>{group.memberCount} members</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Messaging Interface */}
      {selectedGroupData && (
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{selectedGroupData.name}</h3>
              <p className="text-sm text-gray-600">{selectedGroupData.description}</p>
            </div>
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-gray-500" />
              <span className="text-sm text-gray-600">{selectedGroupData.memberCount} members</span>
            </div>
          </div>

          {/* Message Input */}
          <div className="space-y-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <select
                value={messageType}
                onChange={(e) => setMessageType(e.target.value as any)}
                className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="text">Text Message</option>
                <option value="file">File</option>
                <option value="payment">Payment</option>
                <option value="credential">Credential</option>
                <option value="sensitive">Sensitive (Requires Guardian Approval)</option>
              </select>
              <div className="flex items-center space-x-2">
                {messageType === 'sensitive' && (
                  <div className="flex items-center space-x-1 text-orange-600">
                    <Shield className="h-4 w-4" />
                    <span className="text-sm">Guardian approval required</span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex space-x-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={isLoading}
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !newMessage.trim()}
                className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-3 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
              >
                <Send className="h-4 w-4" />
                <span>Send</span>
              </button>
            </div>
          </div>

          {/* Messages Display */}
          <div className="bg-gray-50 rounded-lg p-4 min-h-64">
            <h4 className="font-medium text-gray-900 mb-3">Recent Messages</h4>
            {messages.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No messages yet. Start the conversation!</p>
            ) : (
              <div className="space-y-3">
                {messages.map((message, index) => (
                  <div key={index} className="bg-white rounded-lg p-3 border border-gray-200">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium text-sm text-gray-900">
                        {message.sender === userNsec ? 'You' : 'Member'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">{message.content}</p>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-xs text-purple-600">
                        {message.giftWrapped ? '🔒 Gift Wrapped' : '📝 Regular'}
                      </span>
                      {message.guardianApproved && (
                        <span className="text-xs text-green-600">✅ Guardian Approved</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pending Approvals */}
      {pendingApprovals.length > 0 && (
        <div className="bg-yellow-50 rounded-xl p-6 border border-yellow-200 shadow-sm">
          <h3 className="text-lg font-semibold text-yellow-900 mb-4">
            ⏳ Pending Guardian Approvals ({pendingApprovals.length})
          </h3>
          <div className="space-y-3">
            {pendingApprovals.map(approval => (
              <div key={approval.id} className="bg-white rounded-lg p-4 border border-yellow-200">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-medium text-gray-900">
                      {approval.messageType} message in group {approval.groupId.substring(0, 8)}...
                    </p>
                    <p className="text-sm text-gray-600">
                      {approval.messageContent.substring(0, 100)}...
                    </p>
                    <p className="text-xs text-gray-500">
                      Requested by {approval.requesterPubkey.substring(0, 16)}...
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => processGuardianApproval(approval.id, true)}
                      disabled={isLoading || !guardianNsec}
                      className="bg-green-500 hover:bg-green-600 text-white text-sm px-3 py-1 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-1"
                    >
                      <CheckCircle className="h-3 w-3" />
                      <span>Approve</span>
                    </button>
                    <button
                      onClick={() => processGuardianApproval(approval.id, false)}
                      disabled={isLoading || !guardianNsec}
                      className="bg-red-500 hover:bg-red-600 text-white text-sm px-3 py-1 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-1"
                    >
                      <XCircle className="h-3 w-3" />
                      <span>Reject</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New Group</h3>
            <div className="space-y-4">
              <input
                type="text"
                value={newGroupData.name}
                onChange={(e) => setNewGroupData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Group name"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <textarea
                value={newGroupData.description}
                onChange={(e) => setNewGroupData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Group description (optional)"
                rows={3}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <select
                value={newGroupData.groupType}
                onChange={(e) => setNewGroupData(prev => ({ ...prev, groupType: e.target.value as any }))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="family">Family</option>
                <option value="business">Business</option>
                <option value="friends">Friends</option>
                <option value="advisors">Advisors</option>
              </select>
              <select
                value={newGroupData.encryptionType}
                onChange={(e) => setNewGroupData(prev => ({ ...prev, encryptionType: e.target.value as any }))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="gift-wrap">Gift Wrap (Recommended)</option>
                <option value="nip04">NIP-04</option>
              </select>
            </div>
            <div className="flex space-x-2 mt-6">
              <button
                onClick={createGroup}
                disabled={isLoading || !newGroupData.name.trim()}
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Create Group
              </button>
              <button
                onClick={() => setShowCreateGroup(false)}
                className="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Member Modal */}
      {showInviteMember && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Invite Member</h3>
            <div className="space-y-4">
              <input
                type="text"
                value={inviteData.inviteeNpub}
                onChange={(e) => setInviteData(prev => ({ ...prev, inviteeNpub: e.target.value }))}
                placeholder="Invitee npub"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <select
                value={inviteData.role}
                onChange={(e) => setInviteData(prev => ({ ...prev, role: e.target.value as any }))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                <option value="viewer">Viewer</option>
              </select>
              <textarea
                value={inviteData.message}
                onChange={(e) => setInviteData(prev => ({ ...prev, message: e.target.value }))}
                placeholder="Personal message (optional)"
                rows={3}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex space-x-2 mt-6">
              <button
                onClick={inviteMember}
                disabled={isLoading || !inviteData.inviteeNpub.trim()}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white font-medium py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Send Invitation
              </button>
              <button
                onClick={() => setShowInviteMember(false)}
                className="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 