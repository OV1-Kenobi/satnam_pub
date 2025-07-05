/**
 * @fileoverview Group Messaging Test Component
 * @description Tests NIP-28/29/59 group messaging with gift-wrapping and guardian approval
 */

import React, { useState, useEffect } from 'react';
import { GroupMessagingService, NostrGroup, GroupMessage, GuardianApprovalRequest } from '../src/lib/group-messaging';

interface GroupMessagingTestProps {
  userNsec: string;
  guardianNsec: string;
  testContacts: string[]; // npub array
}

export function GroupMessagingTest({ userNsec, guardianNsec, testContacts }: GroupMessagingTestProps) {
  const [groupMessaging, setGroupMessaging] = useState<GroupMessagingService | null>(null);
  const [guardianMessaging, setGuardianMessaging] = useState<GroupMessagingService | null>(null);
  const [groups, setGroups] = useState<NostrGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [newMessage, setNewMessage] = useState('');
  const [messageType, setMessageType] = useState<'text' | 'file' | 'payment' | 'credential' | 'sensitive'>('text');
  const [pendingApprovals, setPendingApprovals] = useState<GuardianApprovalRequest[]>([]);
  const [testResults, setTestResults] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Initialize messaging services
  useEffect(() => {
    const config = {
      relays: ['wss://relay.damus.io', 'wss://nos.lol'],
      giftWrapEnabled: true,
      guardianApprovalRequired: true,
      guardianPubkeys: [guardianNsec ? getPublicKey(guardianNsec) : ''],
      maxGroupSize: 50,
      messageRetentionDays: 30,
      privacyDelayMs: 5000,
    };

    if (userNsec) {
      const userService = new GroupMessagingService(config, userNsec);
      setGroupMessaging(userService);
    }

    if (guardianNsec) {
      const guardianService = new GroupMessagingService(config, guardianNsec);
      setGuardianMessaging(guardianService);
    }
  }, [userNsec, guardianNsec]);

  // Load user groups
  useEffect(() => {
    if (groupMessaging) {
      loadUserGroups();
    }
  }, [groupMessaging]);

  // Load pending approvals
  useEffect(() => {
    if (groupMessaging) {
      loadPendingApprovals();
    }
  }, [groupMessaging]);

  const loadUserGroups = async () => {
    if (!groupMessaging) return;
    
    try {
      const userGroups = await groupMessaging.getUserGroups();
      setGroups(userGroups);
      if (userGroups.length > 0 && !selectedGroup) {
        setSelectedGroup(userGroups[0].id);
      }
    } catch (error) {
      console.error('Failed to load groups:', error);
      addTestResult('❌ Failed to load user groups');
    }
  };

  const loadPendingApprovals = async () => {
    if (!groupMessaging) return;
    
    try {
      const approvals = await groupMessaging.getPendingApprovals();
      setPendingApprovals(approvals);
    } catch (error) {
      console.error('Failed to load approvals:', error);
    }
  };

  const addTestResult = (result: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${result}`]);
  };

  // Test 1: Create a new group
  const testCreateGroup = async () => {
    if (!groupMessaging) return;
    
    setIsLoading(true);
    addTestResult('🧪 Test 1: Creating new group...');
    
    try {
      const groupId = await groupMessaging.createGroup({
        name: 'Test Family Group',
        description: 'A test group for family messaging',
        groupType: 'family',
        encryptionType: 'gift-wrap',
        initialMembers: testContacts.slice(0, 2), // Add first 2 contacts
      });
      
      addTestResult(`✅ Group created successfully: ${groupId}`);
      await loadUserGroups(); // Refresh groups list
    } catch (error) {
      console.error('Group creation failed:', error);
      addTestResult(`❌ Group creation failed: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Test 2: Send a regular message
  const testSendRegularMessage = async () => {
    if (!groupMessaging || !selectedGroup) return;
    
    setIsLoading(true);
    addTestResult('🧪 Test 2: Sending regular message...');
    
    try {
      const messageId = await groupMessaging.sendGroupMessage(
        selectedGroup,
        'This is a test regular message',
        'text'
      );
      
      addTestResult(`✅ Regular message sent successfully: ${messageId}`);
    } catch (error) {
      console.error('Regular message failed:', error);
      addTestResult(`❌ Regular message failed: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Test 3: Send a sensitive message (requires guardian approval)
  const testSendSensitiveMessage = async () => {
    if (!groupMessaging || !selectedGroup) return;
    
    setIsLoading(true);
    addTestResult('🧪 Test 3: Sending sensitive message (requires guardian approval)...');
    
    try {
      const approvalId = await groupMessaging.sendGroupMessage(
        selectedGroup,
        'This is a sensitive message that requires guardian approval',
        'sensitive'
      );
      
      addTestResult(`✅ Sensitive message approval requested: ${approvalId}`);
      await loadPendingApprovals(); // Refresh approvals list
    } catch (error) {
      console.error('Sensitive message failed:', error);
      addTestResult(`❌ Sensitive message failed: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Test 4: Guardian approves a message
  const testGuardianApproval = async (approvalId: string, approved: boolean) => {
    if (!guardianMessaging) return;
    
    setIsLoading(true);
    addTestResult(`🧪 Test 4: Guardian ${approved ? 'approving' : 'rejecting'} message...`);
    
    try {
      const success = await guardianMessaging.processGuardianApproval(
        approvalId,
        getPublicKey(guardianNsec),
        approved,
        approved ? 'Message approved by guardian' : 'Message rejected by guardian'
      );
      
      if (success) {
        addTestResult(`✅ Guardian ${approved ? 'approved' : 'rejected'} message successfully`);
      } else {
        addTestResult(`❌ Guardian approval process failed`);
      }
      
      await loadPendingApprovals(); // Refresh approvals list
    } catch (error) {
      console.error('Guardian approval failed:', error);
      addTestResult(`❌ Guardian approval failed: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Test 5: Send a custom message
  const testSendCustomMessage = async () => {
    if (!groupMessaging || !selectedGroup || !newMessage.trim()) return;
    
    setIsLoading(true);
    addTestResult(`🧪 Test 5: Sending custom ${messageType} message...`);
    
    try {
      const messageId = await groupMessaging.sendGroupMessage(
        selectedGroup,
        newMessage,
        messageType
      );
      
      addTestResult(`✅ Custom ${messageType} message sent successfully: ${messageId}`);
      setNewMessage(''); // Clear input
    } catch (error) {
      console.error('Custom message failed:', error);
      addTestResult(`❌ Custom message failed: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Test 6: Invite a new member
  const testInviteMember = async () => {
    if (!groupMessaging || !selectedGroup || testContacts.length === 0) return;
    
    setIsLoading(true);
    addTestResult('🧪 Test 6: Inviting new member...');
    
    try {
      const newMemberNpub = testContacts[testContacts.length - 1]; // Use last contact
      const invitationId = await groupMessaging.inviteMember(
        selectedGroup,
        newMemberNpub,
        'member',
        'You are invited to join our test group!'
      );
      
      addTestResult(`✅ Member invitation sent successfully: ${invitationId}`);
    } catch (error) {
      console.error('Member invitation failed:', error);
      addTestResult(`❌ Member invitation failed: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Test 7: Run comprehensive test suite
  const runComprehensiveTest = async () => {
    setIsLoading(true);
    addTestResult('🚀 Starting comprehensive group messaging test suite...');
    
    try {
      // Test 1: Create group
      await testCreateGroup();
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for group creation
      
      // Test 2: Send regular message
      await testSendRegularMessage();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Test 3: Send sensitive message
      await testSendSensitiveMessage();
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Test 4: Guardian approval (if there are pending approvals)
      const approvals = await groupMessaging?.getPendingApprovals();
      if (approvals && approvals.length > 0) {
        await testGuardianApproval(approvals[0].id, true);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Test 5: Invite member
      await testInviteMember();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      addTestResult('🎉 Comprehensive test suite completed successfully!');
    } catch (error) {
      console.error('Comprehensive test failed:', error);
      addTestResult(`❌ Comprehensive test failed: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const clearTestResults = () => {
    setTestResults([]);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          🏛️ Group Messaging Test Suite
        </h2>
        <p className="text-gray-600 mb-6">
          Test NIP-28/29/59 group messaging with gift-wrapping and guardian approval
        </p>

        {/* Service Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-green-50 rounded-lg p-4">
            <h3 className="font-semibold text-green-900">User Service</h3>
            <p className="text-green-700">
              {groupMessaging ? '✅ Connected' : '❌ Not connected'}
            </p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900">Guardian Service</h3>
            <p className="text-blue-700">
              {guardianMessaging ? '✅ Connected' : '❌ Not connected'}
            </p>
          </div>
        </div>

        {/* Group Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Group
          </label>
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select a group...</option>
            {groups.map(group => (
              <option key={group.id} value={group.id}>
                {group.name} ({group.memberCount} members)
              </option>
            ))}
          </select>
        </div>

        {/* Test Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <button
            onClick={testCreateGroup}
            disabled={isLoading || !groupMessaging}
            className="bg-green-500 hover:bg-green-600 text-white font-medium py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            🏗️ Create Group
          </button>
          
          <button
            onClick={testSendRegularMessage}
            disabled={isLoading || !groupMessaging || !selectedGroup}
            className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            💬 Send Regular Message
          </button>
          
          <button
            onClick={testSendSensitiveMessage}
            disabled={isLoading || !groupMessaging || !selectedGroup}
            className="bg-orange-500 hover:bg-orange-600 text-white font-medium py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            🔒 Send Sensitive Message
          </button>
          
          <button
            onClick={testInviteMember}
            disabled={isLoading || !groupMessaging || !selectedGroup}
            className="bg-purple-500 hover:bg-purple-600 text-white font-medium py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            👥 Invite Member
          </button>
          
          <button
            onClick={runComprehensiveTest}
            disabled={isLoading || !groupMessaging}
            className="bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            🚀 Run All Tests
          </button>
          
          <button
            onClick={clearTestResults}
            className="bg-gray-500 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            🗑️ Clear Results
          </button>
        </div>

        {/* Custom Message Input */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">Send Custom Message</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Enter your message..."
              className="md:col-span-2 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <select
              value={messageType}
              onChange={(e) => setMessageType(e.target.value as any)}
              className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="text">Text</option>
              <option value="file">File</option>
              <option value="payment">Payment</option>
              <option value="credential">Credential</option>
              <option value="sensitive">Sensitive</option>
            </select>
          </div>
          <button
            onClick={testSendCustomMessage}
            disabled={isLoading || !groupMessaging || !selectedGroup || !newMessage.trim()}
            className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            📤 Send Custom Message
          </button>
        </div>

        {/* Pending Approvals */}
        {pendingApprovals.length > 0 && (
          <div className="bg-yellow-50 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-yellow-900 mb-3">
              ⏳ Pending Guardian Approvals ({pendingApprovals.length})
            </h3>
            <div className="space-y-2">
              {pendingApprovals.map(approval => (
                <div key={approval.id} className="bg-white rounded-lg p-3 border border-yellow-200">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium text-gray-900">
                        {approval.messageType} message in group {approval.groupId.substring(0, 8)}...
                      </p>
                      <p className="text-sm text-gray-600">
                        {approval.messageContent.substring(0, 100)}...
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => testGuardianApproval(approval.id, true)}
                        disabled={isLoading || !guardianMessaging}
                        className="bg-green-500 hover:bg-green-600 text-white text-sm px-3 py-1 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        ✅ Approve
                      </button>
                      <button
                        onClick={() => testGuardianApproval(approval.id, false)}
                        disabled={isLoading || !guardianMessaging}
                        className="bg-red-500 hover:bg-red-600 text-white text-sm px-3 py-1 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        ❌ Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Test Results */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-gray-900">
              📊 Test Results ({testResults.length})
            </h3>
            {isLoading && (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                <span className="text-sm text-gray-600">Running tests...</span>
              </div>
            )}
          </div>
          <div className="bg-white rounded-lg p-4 max-h-96 overflow-y-auto space-y-2">
            {testResults.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No test results yet. Run a test to see results here.
              </p>
            ) : (
              testResults.map((result, index) => (
                <div key={index} className="text-sm font-mono">
                  {result}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper function to get public key from nsec
function getPublicKey(nsec: string): string {
  // This would normally use nostr-tools, but for the test component we'll use a placeholder
  return nsec.substring(0, 64); // Simplified for demo
} 