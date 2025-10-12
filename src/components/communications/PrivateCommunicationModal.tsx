/**
 * PrivateCommunicationModal Component
 *
 * MASTER CONTEXT COMPLIANCE: Privacy-first communication modal with NIP-59 gift-wrapped messaging
 * CRITICAL SECURITY: Zero-knowledge Nsec management, user-controlled data storage, role-based access
 */

import {
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  Gift,
  History,
  Lock,
  MessageSquare,
  Plus,
  Send,
  Shield,
  Trash2,
  Users,
  X,
  Zap
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Contact } from '../../types/contacts'
import { PrivacyLevel, calculatePrivacyMetrics, getDefaultPrivacyLevel } from '../../types/privacy'
import { ContactsManagerModal } from '../ContactsManagerModal'
import SignInModal from '../SignInModal'
import { PrivacyLevelSelector } from './PrivacyLevelSelector'

import { resolvePlatformLightningDomain } from '../../config/domain.client'

import { central_event_publishing_service as CEPS } from '../../../lib/central_event_publishing_service'
import type { MessageSendResult } from '../../lib/messaging/client-message-service'
import { getPrivacyMethodLabel } from '../../lib/messaging/utils'
import { PeerInvitationModal } from './PeerInvitationModal'




interface PrivateCommunicationModalProps {
  isOpen: boolean
  onClose: () => void
  communicationType: 'family' | 'individual'
  userProfile: {
    username: string
    npub: string
    familyRole: 'private' | 'offspring' | 'adult' | 'steward' | 'guardian'
  }
  preSelectedRecipient?: Contact
}

interface MessageHistory {
  id: string
  content: string
  recipient: string
  recipientDisplay: string
  timestamp: Date
  privacyLevel: PrivacyLevel
  messageType: 'individual' | 'group'
  groupId?: string
  groupName?: string
  status: 'sent' | 'delivered' | 'failed'
  canDelete: boolean
}

interface GroupInfo {
  id: string
  name: string
  description?: string
  memberCount: number
  encryptionType: 'gift-wrap' | 'nip04'
  groupType: 'family' | 'business' | 'friends' | 'advisors'
}

interface PrivacyMetrics {
  encryptionStrength: number
  metadataProtection: number
  anonymityLevel: number
}

export function PrivateCommunicationModal({
  isOpen,
  onClose,
  communicationType,
  userProfile,
  preSelectedRecipient
}: PrivateCommunicationModalProps) {
  const [isClosing, setIsClosing] = useState(false)
  const [modalStep, setModalStep] = useState<'compose' | 'contacts' | 'auth' | 'groups' | 'history'>('compose')

  // Authentication state
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authType, setAuthType] = useState<'family' | 'individual'>('individual')
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  // Message composition state
  const [message, setMessage] = useState('')
  const [recipient, setRecipient] = useState(preSelectedRecipient?.npub || '')
  const [recipientDisplay, setRecipientDisplay] = useState(preSelectedRecipient?.displayName || '')
  const [privacyLevel, setPrivacyLevel] = useState<PrivacyLevel>(getDefaultPrivacyLevel())
  const [messageType, setMessageType] = useState<'individual' | 'group'>('individual')

  // Group messaging state
  const [selectedGroup, setSelectedGroup] = useState<string>('')
  const [groups, setGroups] = useState<GroupInfo[]>([])
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [newGroupData, setNewGroupData] = useState({
    name: '',
    description: '',
    groupType: 'family' as const,
    encryptionType: 'gift-wrap' as const,
  })

  // Message history state
  const [messageHistory, setMessageHistory] = useState<MessageHistory[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [selectedMessageForDeletion, setSelectedMessageForDeletion] = useState<string | null>(null)

  // UI state
  const [sendingMessage, setSendingMessage] = useState(false)
  const [showPrivacyDetails, setShowPrivacyDetails] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showContactsModal, setShowContactsModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showPeerInvitationModal, setShowPeerInvitationModal] = useState(false)

  // Zap functionality state
  const [showZapModal, setShowZapModal] = useState(false)
  const [zapAmount, setZapAmount] = useState('')
  const [zapMemo, setZapMemo] = useState('')
  const [zapRecipient, setZapRecipient] = useState<Contact | null>(null)
  const [sendingZap, setSendingZap] = useState(false)

  // Pending action state for post-authentication
  const [pendingAction, setPendingAction] = useState<'zap' | 'message' | null>(null)
  const [pendingContact, setPendingContact] = useState<Contact | null>(null)

  // Privacy metrics
  const [privacyMetrics, setPrivacyMetrics] = useState<PrivacyMetrics>({
    encryptionStrength: 0,
    metadataProtection: 0,
    anonymityLevel: 0
  })



  /**
   * MASTER CONTEXT COMPLIANCE: User-controlled local communication operation logging
   * Stores communication operations in user's local encrypted storage (localStorage)
   * NEVER stored in external databases - user maintains full control
   */
  const logCommunicationOperation = async (operationData: {
    operation: string;
    details: any;
    timestamp: Date;
  }): Promise<void> => {
    try {
      const existingHistory = localStorage.getItem("satnam_communication_history");
      const operationHistory = existingHistory ? JSON.parse(existingHistory) : [];

      const operationRecord = {
        id: crypto.randomUUID(),
        type: "communication_operation",
        ...operationData,
        timestamp: operationData.timestamp.toISOString(),
      };

      operationHistory.push(operationRecord);

      // Keep only last 1000 operations to prevent localStorage bloat
      if (operationHistory.length > 1000) {
        operationHistory.splice(0, operationHistory.length - 1000);
      }

      localStorage.setItem("satnam_communication_history", JSON.stringify(operationHistory));
    } catch (error) {
      // Silent fail for privacy - no external logging
    }
  }

  // Calculate privacy metrics based on privacy level
  useEffect(() => {
    setPrivacyMetrics(calculatePrivacyMetrics(privacyLevel))
  }, [privacyLevel])

  // Load groups and message history on mount
  useEffect(() => {
    if (isOpen && isAuthenticated) {
      loadGroups()
      loadMessageHistory()
    }
  }, [isOpen, isAuthenticated])

  // Load user groups
  const loadGroups = async () => {
    try {
      setLoading(true)
      // This would call the group messaging API
      const response = await fetch('/.netlify/functions/group-messaging', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userProfile.npub}`, // In production, use proper JWT
        },
        body: JSON.stringify({ action: 'get_user_groups' }),
      })

      if (response.ok) {
        const { data } = await response.json()
        setGroups(data.groups || [])
      }
    } catch (error) {
      // MASTER CONTEXT COMPLIANCE: User-controlled logging
      await logCommunicationOperation({
        operation: "load_groups_failed",
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
        timestamp: new Date(),
      });
    } finally {
      setLoading(false)
    }
  }

  // Load message history
  const loadMessageHistory = async () => {
    try {
      setLoading(true)
      // This would load from local storage or API
      const storedHistory = localStorage.getItem(`satnam_messages_${userProfile.npub}`)
      if (storedHistory) {
        const history = JSON.parse(storedHistory).map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }))
        setMessageHistory(history)
      }
    } catch (error) {
      // MASTER CONTEXT COMPLIANCE: User-controlled logging
      await logCommunicationOperation({
        operation: "load_message_history_failed",
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
        timestamp: new Date(),
      });
    } finally {
      setLoading(false)
    }
  }

  // Save message to history
  const saveMessageToHistory = async (messageData: Omit<MessageHistory, 'id' | 'timestamp'>) => {
    const newMessage: MessageHistory = {
      ...messageData,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    }

    setMessageHistory(prev => [newMessage, ...prev])

    // Save to localStorage
    try {
      const storedHistory = localStorage.getItem(`satnam_messages_${userProfile.npub}`) || '[]'
      const history = JSON.parse(storedHistory)
      history.unshift(newMessage)
      localStorage.setItem(`satnam_messages_${userProfile.npub}`, JSON.stringify(history.slice(0, 100))) // Keep last 100
    } catch (error) {
      // MASTER CONTEXT COMPLIANCE: User-controlled logging
      await logCommunicationOperation({
        operation: "save_message_history_failed",
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
        timestamp: new Date(),
      });
    }
  }

  // Delete message
  const deleteMessage = async (messageId: string) => {
    try {
      setMessageHistory(prev => prev.filter(msg => msg.id !== messageId))

      // Update localStorage
      const storedHistory = localStorage.getItem(`satnam_messages_${userProfile.npub}`) || '[]'
      const history = JSON.parse(storedHistory)
      const updatedHistory = history.filter((msg: any) => msg.id !== messageId)
      localStorage.setItem(`satnam_messages_${userProfile.npub}`, JSON.stringify(updatedHistory))

      setSuccess('Message deleted successfully')
      setSelectedMessageForDeletion(null)
    } catch (error) {
      setError('Failed to delete message')
    }
  }

  // Create new group
  const createGroup = async () => {
    if (!newGroupData.name.trim()) {
      setError('Group name is required')
      return
    }

    try {
      setLoading(true)
      const response = await fetch('/.netlify/functions/group-messaging', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userProfile.npub}`,
        },
        body: JSON.stringify({
          action: 'create_group',
          ...newGroupData,
        }),
      })

      if (response.ok) {
        await response.json()
        setShowCreateGroup(false)
        setNewGroupData({ name: '', description: '', groupType: 'family', encryptionType: 'gift-wrap' })
        await loadGroups()
        setSuccess('Group created successfully')
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to create group')
      }
    } catch (error) {
      // MASTER CONTEXT COMPLIANCE: User-controlled logging
      await logCommunicationOperation({
        operation: "create_group_failed",
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
        timestamp: new Date(),
      });
      setError('Failed to create group')
    } finally {
      setLoading(false)
    }
  }

  // Handle modal close
  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => {
      setIsClosing(false)
      setModalStep('compose')
      setMessage('')
      setRecipient(preSelectedRecipient?.npub || '')
      setRecipientDisplay(preSelectedRecipient?.displayName || '')
      setError(null)
      setSuccess(null)
      setMessageType('individual')
      setSelectedGroup('')
      onClose()
    }, 150)
  }

  // Handle contact selection
  /**
   * MASTER CONTEXT COMPLIANCE: Authentication-gated access control
   * Ensures user is authenticated before accessing messaging functionality
   */
  const requireAuthentication = (action: 'zap' | 'message', contact?: Contact): boolean => {
    if (!isAuthenticated) {
      setPendingAction(action)
      if (contact) setPendingContact(contact)
      setShowAuthModal(true)
      return false
    }
    return true
  }

  const handleContactSelect = (contact: Contact) => {
    if (!requireAuthentication('message', contact)) return

    setRecipient(contact.npub)
    setRecipientDisplay(contact.displayName)
    setShowContactsModal(false)
    setModalStep('compose')
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Handle contact Zap with authentication gating and role-based limits
   * Integrates with enhanced PhoenixD manager for internal Satnam payments
   */
  const handleContactZap = (contact: Contact) => {
    if (!requireAuthentication('zap', contact)) return

    setZapRecipient(contact)
    setShowZapModal(true)
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Send Lightning Zap with privacy-first logging
   */
  const handleSendZap = async () => {
    if (!zapRecipient || !zapAmount || parseInt(zapAmount) <= 0) {
      setError('Please enter a valid amount')
      return
    }

    setSendingZap(true)
    setError(null)

    try {
      // Check role-based payment limits (only for offspring)
      const amount = parseInt(zapAmount)

      if (userProfile.familyRole === 'offspring') {
        const maxAmount = getRoleBasedZapLimit(userProfile.familyRole)
        if (amount > maxAmount) {
          setError(`Amount exceeds supervised limit of ${maxAmount.toLocaleString()} sats`)
          return
        }
      }
      // All other roles (guardian, steward, adult, private) have unlimited spending

      // Select optimal Lightning provider based on recipient
      const provider = selectLightningProvider(zapRecipient)
      const apiEndpoint = getLightningApiEndpoint(provider)

      // Log provider selection for transparency
      await logCommunicationOperation({
        operation: "lightning_provider_selected",
        details: {
          provider,
          recipient: zapRecipient.displayName,
          reason: provider === 'phoenixd' ? 'Internal Satnam ecosystem' : 'External Lightning network',
        },
        timestamp: new Date(),
      })

      // Send Zap via selected Lightning provider
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: userProfile.npub,
          amount,
          recipient: zapRecipient.npub,
          memo: zapMemo || `Zap from ${userProfile.username}`,
          provider, // Include provider information
        }),
      })

      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          // Log successful Zap to user's local history
          await logCommunicationOperation({
            operation: "lightning_zap_sent",
            details: {
              recipient: zapRecipient.displayName,
              amount,
              memo: zapMemo,
              provider,
              paymentHash: result.data.paymentHash,
              userRole: userProfile.familyRole,
              limitApplied: userProfile.familyRole === 'offspring',
            },
            timestamp: new Date(),
          })

          setSuccess(`⚡ Zapped ${amount} sats to ${zapRecipient.displayName}!`)
          setShowZapModal(false)
          setZapAmount('')
          setZapMemo('')
          setZapRecipient(null)
        } else {
          setError(result.error || 'Zap failed')
        }
      } else {
        setError('Failed to send Zap')
      }
    } catch (error) {
      // MASTER CONTEXT COMPLIANCE: User-controlled logging
      await logCommunicationOperation({
        operation: "lightning_zap_failed",
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          recipient: zapRecipient.displayName,
          amount: parseInt(zapAmount),
        },
        timestamp: new Date(),
      })
      setError('Zap failed. Please try again.')
    } finally {
      setSendingZap(false)
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Role-based Zap limits
   * FAMILY BANKING PRINCIPLE: Only "offspring" role has spending restrictions for parental supervision
   * All other roles have sovereign access to their full Bitcoin balances
   */
  const getRoleBasedZapLimit = (role: 'private' | 'offspring' | 'adult' | 'steward' | 'guardian'): number => {
    switch (role) {
      case 'offspring':
        return 10000 // 10k sats default for supervised users (modifiable by supervising adults)
      case 'guardian':
      case 'steward':
      case 'adult':
      case 'private':
      default:
        return Number.MAX_SAFE_INTEGER // No spending restrictions - sovereign access to full balance
    }
  }



  /**
   * MASTER CONTEXT COMPLIANCE: Intelligent Lightning provider selection
   * Priority: PhoenixD (internal) → NWC (sovereign) → Voltage (external)
   */
  const selectLightningProvider = (recipient: Contact): 'phoenixd' | 'nwc' | 'voltage' => {
    // Priority 1: Internal Satnam ecosystem payments
    if (recipient.nip05?.endsWith(`@${resolvePlatformLightningDomain()}`) || recipient.nip05?.endsWith('@citadel.academy')) {
      return 'phoenixd'
    }

    // Priority 2: User's sovereign Lightning node via NWC (future implementation)
    // if (userConfig.hasOwnNode && userConfig.nwcConnectionString) return 'nwc'

    // Priority 3: Default external Lightning provider
    return 'voltage'
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Get API endpoint based on Lightning provider
   */
  const getLightningApiEndpoint = (provider: 'phoenixd' | 'nwc' | 'voltage'): string => {
    switch (provider) {
      case 'phoenixd':
        return '/.netlify/functions/phoenixd-dual-mode-payments'
      case 'nwc':
        return '/.netlify/functions/nwc-lightning-payment'
      case 'voltage':
      default:
        return '/.netlify/functions/individual-lightning-zap'
    }
  }

  // Convert PrivacyLevel to encryption level
  const getEncryptionLevel = (level: PrivacyLevel): "standard" | "enhanced" | "maximum" => {
    switch (level) {
      case PrivacyLevel.MINIMAL:
        return "standard"
      case PrivacyLevel.ENCRYPTED:
        return "enhanced"
      case PrivacyLevel.GIFTWRAPPED:
        return "maximum"
      default:
        return "enhanced"
    }
  }

  // Handle message sending
  const handleSendMessage = async () => {
    if (!message.trim()) {
      setError('Please enter a message')
      return
    }

    if (messageType === 'individual' && !recipient.trim()) {
      setError('Please enter a recipient for individual messages')
      return
    }

    if (messageType === 'group' && !selectedGroup) {
      setError('Please select a group for group messages')
      return
    }

    if (!isAuthenticated) {
      setError('Please authenticate before sending messages')
      return
    }

    setSendingMessage(true)
    setError(null)

    try {
      let result: MessageSendResult;

      if (messageType === 'individual') {
        // Send individual message using CEPS gift-wrapped pathway (with nip04 fallback inside CEPS)
        const sendRes = await CEPS.sendGiftWrappedDirectMessage(
          {
            sessionId: 'client-ui', // UI-scoped; CEPS uses internal userSession
            displayNameHash: recipientDisplay || 'recipient',
            encryptedNpub: recipient, // CEPS will npubToHex inside
            familyRole: 'private',
            trustLevel: 'known',
            supportsGiftWrap: true,
            preferredEncryption: 'auto',
            addedByHash: 'client-ui'
          } as any,
          {
            type: 'text',
            content: message,
            meta: { privacyLevel, messageType: 'message' }
          }
        );
        result = sendRes;

        if (result.success) {
          // Save to history
          await saveMessageToHistory({
            content: message,
            recipient,
            recipientDisplay: recipientDisplay || recipient,
            privacyLevel,
            messageType: 'individual',
            status: 'sent',
            canDelete: true
          });

          setMessage('');
          const privacyMethod = getPrivacyMethodLabel(result.signingMethod);
          setSuccess(`Individual message sent successfully!\nMethod: ${privacyMethod}`);
        } else {
          setError(`Failed to send message: ${result.error}`);
        }
      } else {
        // Send group message via CEPS group announcement (or group messaging service)
        const group = groups.find(g => g.id === selectedGroup);
        if (!group) throw new Error('Group not found');
        result = await CEPS.publishGroupAnnouncement('', selectedGroup, message);

        if (result.success) {
          // Save to history
          await saveMessageToHistory({
            content: message,
            recipient: selectedGroup,
            recipientDisplay: group?.name || 'Group',
            privacyLevel,
            messageType: 'group',
            groupId: selectedGroup,
            groupName: group?.name,
            status: 'sent',
            canDelete: true
          });

          setMessage('');
          const privacyMethod = getPrivacyMethodLabel(result.signingMethod);
          setSuccess(`Group message sent successfully!\nMethod: ${privacyMethod}`);
        } else {
          setError(`Failed to send group message: ${result.error}`);
        }
      }

      // Auto-close after success
      setTimeout(() => {
        handleClose()
      }, 2000)
    } catch (error) {
      // MASTER CONTEXT COMPLIANCE: User-controlled logging
      await logCommunicationOperation({
        operation: "send_message_failed",
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          messageType,
          communicationType
        },
        timestamp: new Date(),
      });
      setError('Communication failed. Please check your connection and try again.')
    } finally {
      setSendingMessage(false)
    }
  }

  const handleAuthSuccess = () => {
    setIsAuthenticated(true)
    setShowAuthModal(false)
    setSuccess('Authentication successful! You can now send private messages.')

    // Handle pending actions after authentication
    if (pendingAction && pendingContact) {
      if (pendingAction === 'zap') {
        setZapRecipient(pendingContact)
        setShowZapModal(true)
      } else if (pendingAction === 'message') {
        setRecipient(pendingContact.npub)
        setRecipientDisplay(pendingContact.displayName)
        setShowContactsModal(false)
        setModalStep('compose')
      }

      // Clear pending state
      setPendingAction(null)
      setPendingContact(null)
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Main Modal */}
      <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${isClosing ? 'animate-fadeOut' : 'animate-scaleIn'}`}>
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

        <div className={`relative w-full max-w-4xl max-h-[90vh] bg-gradient-to-br from-purple-900 via-purple-800 to-purple-900 rounded-2xl shadow-2xl overflow-hidden ${isClosing ? 'animate-scaleOut' : 'animate-scaleIn'}`}>
          {/* Header */}
          <div className="bg-white/10 backdrop-blur-sm border-b border-white/20 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
                  {communicationType === 'family' ? (
                    <Users className="h-6 w-6 text-white" />
                  ) : (
                    <MessageSquare className="h-6 w-6 text-white" />
                  )}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">
                    {communicationType === 'family' ? 'Family Federation Communication' : 'Private Communication'}
                  </h2>
                  <p className="text-purple-200 text-sm">
                    Secure, encrypted messaging with sealed privacy protection
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all duration-300"
                  title="Message History"
                >
                  <History className="h-5 w-5 text-white" />
                </button>
                <button
                  onClick={handleClose}
                  className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all duration-300"
                >
                  <X className="h-6 w-6 text-white" />
                </button>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="p-6 max-h-[calc(90vh-120px)] overflow-y-auto">
            {/* Authentication Status */}
            {!isAuthenticated && (
              <div className="mb-6 p-4 bg-blue-500/20 border border-blue-500/30 rounded-lg">
                <div className="flex items-start space-x-3">
                  <Shield className="h-5 w-5 text-blue-400 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-blue-400 mb-2">Secure Authentication Required</h3>
                    <p className="text-blue-300 text-sm mb-3">
                      Sealed communications require authenticated access to ensure message integrity and sender verification.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          setAuthType('individual')
                          setShowAuthModal(true)
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                      >
                        Individual Signin
                      </button>
                      <button
                        onClick={() => {
                          setAuthType('family')
                          setShowAuthModal(true)
                        }}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                      >
                        Family Federation Signin
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div className="mb-6 p-4 bg-green-500/20 border border-green-500/30 rounded-lg">
                <div className="flex items-center space-x-2">
                  <Check className="h-5 w-5 text-green-400" />
                  <span className="text-green-400 font-medium">Success</span>
                </div>
                <p className="text-green-300 text-sm mt-1">{success}</p>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-lg">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                  <span className="text-red-400 font-medium">Error</span>
                </div>
                <p className="text-red-300 text-sm mt-1">{error}</p>
              </div>
            )}

            {/* Message History Panel */}
            {showHistory && (
              <div className="mb-6 bg-white/5 rounded-lg p-4 border border-white/20">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-white">Message History</h3>
                  <button
                    onClick={() => setShowHistory(false)}
                    className="text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {messageHistory.length === 0 ? (
                  <p className="text-purple-300 text-sm text-center py-4">No message history yet</p>
                ) : (
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {messageHistory.map((msg) => (
                      <div key={msg.id} className="bg-white/10 rounded-lg p-3 border border-white/20">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="text-sm font-medium text-white">
                                {msg.messageType === 'group' ? `📢 ${msg.groupName}` : `👤 ${msg.recipientDisplay}`}
                              </span>
                              <span className="text-xs text-purple-300">
                                {msg.timestamp.toLocaleString()}
                              </span>
                              <span className={`text-xs px-2 py-1 rounded-full ${msg.status === 'sent' ? 'bg-green-500/20 text-green-400' :
                                msg.status === 'delivered' ? 'bg-blue-500/20 text-blue-400' :
                                  'bg-red-500/20 text-red-400'
                                }`}>
                                {msg.status}
                              </span>
                            </div>
                            <p className="text-sm text-purple-200 mb-2">{msg.content}</p>
                            <div className="flex items-center space-x-2">
                              <span className="text-xs text-purple-400">
                                {msg.privacyLevel === PrivacyLevel.GIFTWRAPPED ? '🔒 Sealed' :
                                  msg.privacyLevel === PrivacyLevel.ENCRYPTED ? '🛡️ Encrypted' : '👁️ Standard'}
                              </span>
                            </div>
                          </div>
                          {msg.canDelete && (
                            <button
                              onClick={() => setSelectedMessageForDeletion(msg.id)}
                              className="p-1 text-red-400 hover:text-red-300 transition-colors"
                              title="Delete message"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Message Composition */}
            <div className="space-y-6">
              {/* Message Type Selection */}
              <div>
                <label className="block text-sm font-medium text-purple-200 mb-2">
                  Message Type
                </label>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setMessageType('individual')}
                    className={`flex-1 px-4 py-3 rounded-lg border transition-colors ${messageType === 'individual'
                      ? 'bg-purple-600 border-purple-500 text-white'
                      : 'bg-white/10 border-white/20 text-purple-300 hover:bg-white/20'
                      }`}
                  >
                    <MessageSquare className="h-4 w-4 inline mr-2" />
                    Individual Message
                  </button>
                  <button
                    onClick={() => setMessageType('group')}
                    className={`flex-1 px-4 py-3 rounded-lg border transition-colors ${messageType === 'group'
                      ? 'bg-purple-600 border-purple-500 text-white'
                      : 'bg-white/10 border-white/20 text-purple-300 hover:bg-white/20'
                      }`}
                  >
                    <Users className="h-4 w-4 inline mr-2" />
                    Group Message
                  </button>
                </div>
              </div>

              {/* Recipient/Group Selection */}
              {messageType === 'individual' ? (
                <div>
                  <label className="block text-sm font-medium text-purple-200 mb-2">
                    Recipient
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={recipientDisplay || recipient}
                      onChange={(e) => {
                        const value = e.target.value
                        if (value.startsWith('npub1')) {
                          setRecipient(value)
                          setRecipientDisplay('')
                        } else {
                          setRecipientDisplay(value)
                        }
                      }}
                      placeholder="npub1... or username@my.satnam.pub"
                      className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                    <button
                      onClick={() => setShowContactsModal(true)}
                      className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center space-x-2"
                    >
                      <Users className="h-4 w-4" />
                      <span>Contacts</span>
                    </button>
                    <button
                      onClick={() => setShowPeerInvitationModal(true)}
                      className="px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center space-x-2"
                      title="Invite new peers via standard Nostr messaging (NIP-04/44)"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Invite Peers</span>
                    </button>
                    <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800">1 credit each</span>
                  </div>
                  <div className="mt-2 text-xs text-blue-200 bg-blue-500/10 border border-blue-500/20 rounded-md p-2">
                    Note: Messages to non-Satnam Nostr users may not be delivered unless their client and relays support advanced private messaging protocols (NIP-17/NIP-59).
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-purple-200 mb-2">
                    Group
                  </label>
                  <div className="flex space-x-2">
                    <select
                      value={selectedGroup}
                      onChange={(e) => setSelectedGroup(e.target.value)}
                      className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      <option value="">Select a group...</option>
                      {groups.map(group => (
                        <option key={group.id} value={group.id}>
                          {group.name} ({group.memberCount} members)
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => setShowCreateGroup(true)}
                      className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
                    >
                      <Plus className="h-4 w-4" />
                      <span>New Group</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Privacy Level Selection */}
              <PrivacyLevelSelector
                selectedLevel={privacyLevel}
                onLevelChange={setPrivacyLevel}
                showMetrics={false}
                variant="modal"
              />

              {/* Privacy Metrics */}
              <div className="bg-white/5 rounded-lg p-4 border border-white/20">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-white">Privacy Protection Metrics</h4>
                  <button
                    onClick={() => setShowPrivacyDetails(!showPrivacyDetails)}
                    className="text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    {showPrivacyDetails ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-green-400">{privacyMetrics.encryptionStrength}%</div>
                    <div className="text-xs text-purple-300">Encryption</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-400">{privacyMetrics.metadataProtection}%</div>
                    <div className="text-xs text-purple-300">Metadata</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-purple-400">{privacyMetrics.anonymityLevel}%</div>
                    <div className="text-xs text-purple-300">Anonymity</div>
                  </div>
                </div>

                {showPrivacyDetails && (
                  <div className="mt-4 pt-4 border-t border-white/20">
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center space-x-2">
                        <Check className="h-4 w-4 text-green-400" />
                        <span className="text-green-300">End-to-end encryption active</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Gift className="h-4 w-4 text-blue-400" />
                        <span className="text-blue-300">Sealed messaging enabled</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Zap className="h-4 w-4 text-purple-400" />
                        <span className="text-purple-300">Ephemeral keys in use</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Shield className="h-4 w-4 text-yellow-400" />
                        <span className="text-yellow-300">No server-side storage</span>
                      </div>
                      {privacyLevel === PrivacyLevel.GIFTWRAPPED && (
                        <>
                          <div className="flex items-center space-x-2">
                            <Lock className="h-4 w-4 text-green-400" />
                            <span className="text-green-300">Timing delays active</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Eye className="h-4 w-4 text-blue-400" />
                            <span className="text-blue-300">Decoy messages enabled</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Message Input */}
              <div>
                <label className="block text-sm font-medium text-purple-200 mb-2">
                  {messageType === 'group' ? 'Group Message' : 'Private Message'}
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={messageType === 'group'
                    ? "Your message will be sent to all group members with sealed privacy protection..."
                    : "Your message will be encrypted and sealed for maximum privacy..."
                  }
                  rows={6}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                />
                <div className="mt-2 text-sm text-purple-300">
                  {message.length}/1000 characters
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4 pt-4">
                <button
                  onClick={handleClose}
                  disabled={sendingMessage}
                  className="flex-1 px-6 py-3 bg-white/10 border border-white/20 hover:bg-white/20 text-white font-medium rounded-lg transition-all duration-300 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendMessage}
                  disabled={sendingMessage || !message.trim() || !isAuthenticated ||
                    (messageType === 'individual' && !recipient.trim()) ||
                    (messageType === 'group' && !selectedGroup)}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 disabled:from-gray-500 disabled:to-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
                >
                  {sendingMessage ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Encrypting & Sending...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5" />
                      <span>Send {messageType === 'group' ? 'Group' : 'Private'} Message</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contacts Modal */}
      {showContactsModal && (
        <ContactsManagerModal
          isOpen={showContactsModal}
          onClose={() => setShowContactsModal(false)}
          onContactSelect={handleContactSelect}
          onZapContact={isAuthenticated ? handleContactZap : undefined}
          selectionMode={true}
        />
      )}

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCreateGroup(false)} />
          <div className="relative w-full max-w-md bg-gradient-to-br from-purple-900 via-purple-800 to-purple-900 rounded-2xl shadow-2xl p-6">
            <h3 className="text-xl font-bold text-white mb-4">Create New Group</h3>
            <div className="space-y-4">
              <input
                type="text"
                value={newGroupData.name}
                onChange={(e) => setNewGroupData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Group name"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <textarea
                value={newGroupData.description}
                onChange={(e) => setNewGroupData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Group description (optional)"
                rows={3}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <select
                value={newGroupData.groupType}
                onChange={(e) => setNewGroupData(prev => ({ ...prev, groupType: e.target.value as any }))}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="family">Family</option>
                <option value="business">Business</option>
                <option value="friends">Friends</option>
                <option value="advisors">Advisors</option>
              </select>
              <select
                value={newGroupData.encryptionType}
                onChange={(e) => setNewGroupData(prev => ({ ...prev, encryptionType: e.target.value as any }))}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="gift-wrap">Sealed (Recommended)</option>
                <option value="nip04">NIP-04</option>
              </select>
            </div>
            <div className="flex space-x-2 mt-6">
              <button
                onClick={() => setShowCreateGroup(false)}
                className="flex-1 px-4 py-2 bg-white/10 border border-white/20 text-white rounded-lg hover:bg-white/20 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createGroup}
                disabled={loading || !newGroupData.name.trim()}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Message Confirmation Modal */}
      {selectedMessageForDeletion && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedMessageForDeletion(null)} />
          <div className="relative w-full max-w-md bg-gradient-to-br from-red-900 via-red-800 to-red-900 rounded-2xl shadow-2xl p-6">
            <h3 className="text-xl font-bold text-white mb-4">Delete Message</h3>
            <p className="text-red-200 mb-6">
              Are you sure you want to delete this message? This action cannot be undone.
            </p>
            <div className="flex space-x-2">
              <button
                onClick={() => setSelectedMessageForDeletion(null)}
                className="flex-1 px-4 py-2 bg-white/10 border border-white/20 text-white rounded-lg hover:bg-white/20 transition-colors"
              >
                Cancel


              </button>
              <button
                onClick={() => deleteMessage(selectedMessageForDeletion)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Zap Modal */}
      {showZapModal && zapRecipient && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowZapModal(false)} />
          <div className="relative w-full max-w-md bg-gradient-to-br from-orange-900 via-orange-800 to-orange-900 rounded-2xl shadow-2xl p-6">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center space-x-2">
              <Zap className="h-5 w-5 text-orange-400" />
              <span>⚡ Zap {zapRecipient.displayName}</span>


            </h3>

            <div className="space-y-4">
              {/* Amount Input */}
              <div>
                <label className="block text-sm font-medium text-orange-200 mb-2">
                  Amount (sats)
                </label>
                <input
                  type="number"
                  value={zapAmount}
                  onChange={(e) => setZapAmount(e.target.value)}
                  placeholder="Enter amount in sats"
                  min="1"
                  max={userProfile.familyRole === 'offspring' ? getRoleBasedZapLimit(userProfile.familyRole) : undefined}
                  className="w-full px-3 py-2 bg-white/10 border border-orange-500/30 rounded-lg text-white placeholder-orange-300 focus:outline-none focus:border-orange-400"
                />
                <p className="text-xs text-orange-300 mt-1">
                  {userProfile.familyRole === 'offspring'
                    ? `Max: ${getRoleBasedZapLimit(userProfile.familyRole).toLocaleString()} sats (supervised limit)`
                    : `No limit - sovereign access to full balance (${userProfile.familyRole})`
                  }
                </p>
              </div>

              {/* Memo Input */}
              <div>
                <label className="block text-sm font-medium text-orange-200 mb-2">
                  Memo (optional)
                </label>
                <input
                  type="text"
                  value={zapMemo}
                  onChange={(e) => setZapMemo(e.target.value)}
                  placeholder="Add a message..."
                  className="w-full px-3 py-2 bg-white/10 border border-orange-500/30 rounded-lg text-white placeholder-orange-300 focus:outline-none focus:border-orange-400"
                />
              </div>

              {/* Recipient Info */}
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
                <p className="text-sm text-orange-200">
                  <span className="font-medium">To:</span> {zapRecipient.displayName}
                </p>
                <p className="text-xs text-orange-300 truncate">
                  {zapRecipient.npub}
                </p>
                <div className="mt-2 flex items-center space-x-2">
                  <span className="text-xs text-orange-400 font-medium">Provider:</span>
                  <span className="text-xs text-orange-300 bg-orange-500/20 px-2 py-1 rounded">
                    {selectLightningProvider(zapRecipient) === 'phoenixd' ? '⚡ PhoenixD (Internal)' :
                      selectLightningProvider(zapRecipient) === 'nwc' ? '🔗 NWC (Sovereign)' :
                        '🌐 Voltage (External)'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setShowZapModal(false)}
                disabled={sendingZap}
                className="flex-1 px-4 py-2 bg-white/10 border border-white/20 text-white rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSendZap}
                disabled={sendingZap || !zapAmount || parseInt(zapAmount) <= 0 ||
                  (userProfile.familyRole === 'offspring' && parseInt(zapAmount) > getRoleBasedZapLimit(userProfile.familyRole))}
                className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                {sendingZap ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Zapping...</span>
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    <span>Send Zap</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Peer Invitation Modal */}
      {showPeerInvitationModal && (
        <PeerInvitationModal
          isOpen={showPeerInvitationModal}
          onClose={() => setShowPeerInvitationModal(false)}
          onSendInvitation={() => { }}
          senderProfile={{ npub: userProfile.npub, username: userProfile.username }}
        />
      )}


      {/* Authentication Modal */}
      {showAuthModal && (
        <SignInModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSignInSuccess={handleAuthSuccess}
          onCreateNew={() => {
            setShowAuthModal(false)


            // You could redirect to Identity Forge here if needed
          }}
          destination={authType}
        />
      )}
    </>
  )
}

export default PrivateCommunicationModal