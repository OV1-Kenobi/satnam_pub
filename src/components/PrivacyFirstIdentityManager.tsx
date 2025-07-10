/**
 * Production Component: Privacy-First Identity Manager
 * 
 * This component provides complete NIP-05 identity disclosure management for production use.
 * Features:
 * - Privacy-first defaults (private by default)
 * - Comprehensive privacy warnings
 * - Granular disclosure controls
 * - Production-ready error handling
 * - Accessibility compliance
 * - Security audit trails
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { usePrivacyFirstMessaging } from '../hooks/usePrivacyFirstMessaging';
import { PrivacyFirstMessagingService } from '../lib/gift-wrapped-messaging/privacy-first-service';
import { MESSAGING_CONFIG } from '../lib/gift-wrapped-messaging/privacy-first-service';
import ContactsManagerModal from './ContactsManagerModal';

interface PrivacyFirstIdentityManagerProps {
  userNsec?: string
  onSessionCreated?: (sessionId: string) => void
  onSessionDestroyed?: () => void
  onIdentityDisclosureChanged?: (enabled: boolean, scope?: string) => void
  onError?: (error: string) => void
  className?: string
}

interface PrivacyConsentFormState {
  warningRead: boolean
  consequencesAcknowledged: boolean
  recommendationsRead: boolean
  privacyCheckboxes: {
    understandImplications: boolean
    confirmPermanentLinkage: boolean
    acceptStorageByRecipients: boolean
    acknowledgeCannotRetract: boolean
  }
  readingTimeSeconds: number
}

export const PrivacyFirstIdentityManager: React.FC<PrivacyFirstIdentityManagerProps> = ({
  userNsec,
  onSessionCreated,
  onSessionDestroyed,
  onIdentityDisclosureChanged,
  onError,
  className = '',
}) => {
  const messaging = usePrivacyFirstMessaging()
  
  const [nip05Input, setNip05Input] = useState('')
  const [selectedScope, setSelectedScope] = useState<'direct' | 'groups' | 'specific-groups'>('direct')
  const [specificGroups, setSpecificGroups] = useState<string[]>([])
  const [consentForm, setConsentForm] = useState<PrivacyConsentFormState>({
    warningRead: false,
    consequencesAcknowledged: false,
    recommendationsRead: false,
    privacyCheckboxes: {
      understandImplications: false,
      confirmPermanentLinkage: false,
      acceptStorageByRecipients: false,
      acknowledgeCannotRetract: false,
    },
    readingTimeSeconds: 0,
  })
  
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false)
  const [readingTimer, setReadingTimer] = useState<NodeJS.Timeout | null>(null)
  const [showContactsModal, setShowContactsModal] = useState(false)

  // Initialize session on mount
  useEffect(() => {
    if (userNsec && !messaging.connected) {
      handleInitializeSession()
    }
  }, [userNsec, messaging.connected])

  // Start reading timer when privacy warning is shown
  useEffect(() => {
    if (messaging.showingPrivacyWarning && !readingTimer) {
      const timer = setInterval(() => {
        setConsentForm(prev => ({
          ...prev,
          readingTimeSeconds: prev.readingTimeSeconds + 1
        }))
      }, 1000)
      setReadingTimer(timer)
    } else if (!messaging.showingPrivacyWarning && readingTimer) {
      clearInterval(readingTimer)
      setReadingTimer(null)
    }

    return () => {
      if (readingTimer) {
        clearInterval(readingTimer)
      }
    }
  }, [messaging.showingPrivacyWarning])

  // Handle errors
  useEffect(() => {
    if (messaging.error) {
      onError?.(messaging.error)
    }
  }, [messaging.error, onError])

  const handleInitializeSession = async () => {
    if (!userNsec) return
    
    try {
      const sessionId = await messaging.initializeSession(userNsec, {
        userAgent: navigator.userAgent,
        ttlHours: 24, // Default session TTL
      })
      
      if (sessionId) {
        onSessionCreated?.(sessionId)
      }
    } catch (error) {
      console.error('Failed to initialize session:', error)
      onError?.(error instanceof Error ? error.message : 'Session initialization failed')
    }
  }

  const handleDestroySession = async () => {
    try {
      await messaging.destroySession()
      onSessionDestroyed?.()
      
      // Reset form state
      setConsentForm({
        warningRead: false,
        consequencesAcknowledged: false,
        recommendationsRead: false,
        privacyCheckboxes: {
          understandImplications: false,
          confirmPermanentLinkage: false,
          acceptStorageByRecipients: false,
          acknowledgeCannotRetract: false,
        },
        readingTimeSeconds: 0,
      })
    } catch (error) {
      console.error('Failed to destroy session:', error)
      onError?.(error instanceof Error ? error.message : 'Session destruction failed')
    }
  }

  const handleEnableDisclosure = async () => {
    if (!nip05Input.trim()) {
      onError?.('NIP-05 identifier is required')
      return
    }

    try {
      await messaging.enableNip05Disclosure(
        nip05Input.trim(),
        selectedScope,
        selectedScope === 'specific-groups' ? specificGroups : undefined
      )
    } catch (error) {
      console.error('Failed to enable disclosure:', error)
      onError?.(error instanceof Error ? error.message : 'Failed to enable disclosure')
    }
  }

  const handleDisableDisclosure = async () => {
    try {
      const success = await messaging.disableDisclosure()
      if (success) {
        onIdentityDisclosureChanged?.(false)
        setNip05Input('')
      }
    } catch (error) {
      console.error('Failed to disable disclosure:', error)
      onError?.(error instanceof Error ? error.message : 'Failed to disable disclosure')
    }
  }

  const handleConsentCheckboxChange = (
    checkbox: keyof PrivacyConsentFormState['privacyCheckboxes'],
    checked: boolean
  ) => {
    setConsentForm(prev => ({
      ...prev,
      privacyCheckboxes: {
        ...prev.privacyCheckboxes,
        [checkbox]: checked,
      },
    }))
  }

  const isConsentFormValid = () => {
    const minReadingTime = 15 // 15 seconds minimum
    const hasReadEnough = consentForm.readingTimeSeconds >= minReadingTime
    const hasAcknowledged = consentForm.warningRead && 
                           consentForm.consequencesAcknowledged && 
                           consentForm.recommendationsRead
    const hasCheckedAll = Object.values(consentForm.privacyCheckboxes).every(Boolean)
    
    return hasReadEnough && hasAcknowledged && hasCheckedAll
  }

  const handleConfirmConsent = async () => {
    if (!isConsentFormValid()) {
      onError?.('Please complete all privacy acknowledgments')
      return
    }

    try {
      const success = await messaging.confirmDisclosureConsent({
        consentGiven: true,
        warningAcknowledged: true,
      })
      
      if (success) {
        onIdentityDisclosureChanged?.(true, selectedScope)
      }
    } catch (error) {
      console.error('Failed to confirm consent:', error)
      onError?.(error instanceof Error ? error.message : 'Failed to confirm consent')
    }
  }

  const handleCancelConsent = () => {
    messaging.cancelDisclosure()
    setConsentForm({
      warningRead: false,
      consequencesAcknowledged: false,
      recommendationsRead: false,
      privacyCheckboxes: {
        understandImplications: false,
        confirmPermanentLinkage: false,
        acceptStorageByRecipients: false,
        acknowledgeCannotRetract: false,
      },
      readingTimeSeconds: 0,
    })
  }

  const formatReadingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
  }

  // Privacy Warning Modal
  const PrivacyWarningModal = () => {
    if (!messaging.showingPrivacyWarning || !messaging.privacyWarningContent) {
      return null
    }

    const warning = messaging.privacyWarningContent

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            {/* Header */}
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-red-600 mb-2">
                {warning.title}
              </h2>
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
                <p className="text-sm text-yellow-700">
                  <strong>Privacy First:</strong> This system defaults to private messaging. 
                  You are choosing to reveal your identity.
                </p>
              </div>
            </div>

            {/* Reading Timer */}
            <div className="mb-4 p-3 bg-gray-50 rounded">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Reading Time:</span>
                <span className="text-sm font-mono">
                  {formatReadingTime(consentForm.readingTimeSeconds)}
                  {consentForm.readingTimeSeconds < 15 && (
                    <span className="text-red-500 ml-2">
                      (minimum 15s required)
                    </span>
                  )}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min((consentForm.readingTimeSeconds / 15) * 100, 100)}%` }}
                />
              </div>
            </div>

            {/* Warning Message */}
            <div className="mb-6">
              <div className="p-4 border rounded-lg bg-gray-50">
                <pre className="whitespace-pre-wrap text-sm text-gray-700">
                  {warning.message}
                </pre>
              </div>
              <label className="flex items-center mt-3">
                <input
                  type="checkbox"
                  checked={consentForm.warningRead}
                  onChange={(e) => setConsentForm(prev => ({ ...prev, warningRead: e.target.checked }))}
                  className="mr-2"
                />
                <span className="text-sm">I have read and understood the warning message</span>
              </label>
            </div>

            {/* Privacy Consequences */}
            <div className="mb-6">
              <h3 className="font-semibold text-red-600 mb-3">Privacy Consequences:</h3>
              <ul className="list-disc list-inside space-y-2 text-sm">
                {warning.consequences?.map((consequence: string, index: number) => (
                  <li key={index} className="text-gray-700">{consequence}</li>
                ))}
              </ul>
              <label className="flex items-center mt-3">
                <input
                  type="checkbox"
                  checked={consentForm.consequencesAcknowledged}
                  onChange={(e) => setConsentForm(prev => ({ ...prev, consequencesAcknowledged: e.target.checked }))}
                  className="mr-2"
                />
                <span className="text-sm">I acknowledge these privacy consequences</span>
              </label>
            </div>

            {/* Recommendations */}
            <div className="mb-6">
              <h3 className="font-semibold text-green-600 mb-3">Privacy Recommendations:</h3>
              <ul className="list-disc list-inside space-y-2 text-sm">
                {warning.recommendations?.map((recommendation: string, index: number) => (
                  <li key={index} className="text-gray-700">{recommendation}</li>
                ))}
              </ul>
              <label className="flex items-center mt-3">
                <input
                  type="checkbox"
                  checked={consentForm.recommendationsRead}
                  onChange={(e) => setConsentForm(prev => ({ ...prev, recommendationsRead: e.target.checked }))}
                  className="mr-2"
                />
                <span className="text-sm">I have read the privacy recommendations</span>
              </label>
            </div>

            {/* Consent Checkboxes */}
            <div className="mb-6 p-4 border-2 border-red-200 rounded-lg bg-red-50">
              <h3 className="font-semibold text-red-700 mb-3">Required Consent:</h3>
              <div className="space-y-3">
                <label className="flex items-start">
                  <input
                    type="checkbox"
                    checked={consentForm.privacyCheckboxes.understandImplications}
                    onChange={(e) => handleConsentCheckboxChange('understandImplications', e.target.checked)}
                    className="mr-2 mt-1"
                  />
                  <span className="text-sm">I understand the privacy implications of enabling NIP-05 disclosure</span>
                </label>
                
                <label className="flex items-start">
                  <input
                    type="checkbox"
                    checked={consentForm.privacyCheckboxes.confirmPermanentLinkage}
                    onChange={(e) => handleConsentCheckboxChange('confirmPermanentLinkage', e.target.checked)}
                    className="mr-2 mt-1"
                  />
                  <span className="text-sm">I confirm this creates a permanent linkage between my identity and messages</span>
                </label>
                
                <label className="flex items-start">
                  <input
                    type="checkbox"
                    checked={consentForm.privacyCheckboxes.acceptStorageByRecipients}
                    onChange={(e) => handleConsentCheckboxChange('acceptStorageByRecipients', e.target.checked)}
                    className="mr-2 mt-1"
                  />
                  <span className="text-sm">I accept that recipients may store this identity information</span>
                </label>
                
                <label className="flex items-start">
                  <input
                    type="checkbox"
                    checked={consentForm.privacyCheckboxes.acknowledgeCannotRetract}
                    onChange={(e) => handleConsentCheckboxChange('acknowledgeCannotRetract', e.target.checked)}
                    className="mr-2 mt-1"
                  />
                  <span className="text-sm">I acknowledge that disclosed identity information cannot be completely retracted</span>
                </label>
              </div>
            </div>

            {/* Scope Description */}
            <div className="mb-6 p-3 bg-blue-50 rounded">
              <h3 className="font-semibold text-blue-700 mb-2">Disclosure Scope:</h3>
              <p className="text-sm text-blue-600">{warning.scopeDescription}</p>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between">
              <button
                onClick={handleCancelConsent}
                className="px-6 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
              >
                Keep Private (Cancel)
              </button>
              
              <button
                onClick={handleConfirmConsent}
                disabled={!isConsentFormValid() || messaging.loading}
                className={`px-6 py-2 rounded transition-colors ${
                  isConsentFormValid() && !messaging.loading
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {messaging.loading ? 'Processing...' : 'Enable NIP-05 Disclosure'}
              </button>
            </div>

            {/* Validation Status */}
            {!isConsentFormValid() && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                <p className="text-sm text-yellow-700">
                  <strong>Please complete:</strong>
                  {consentForm.readingTimeSeconds < 15 && ' • Read for at least 15 seconds'}
                  {!consentForm.warningRead && ' • Acknowledge reading the warning'}
                  {!consentForm.consequencesAcknowledged && ' • Accept privacy consequences'}
                  {!consentForm.recommendationsRead && ' • Review recommendations'}
                  {!Object.values(consentForm.privacyCheckboxes).every(Boolean) && ' • Check all consent boxes'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`privacy-first-identity-manager ${className}`}>
      {/* Privacy Warning Modal */}
      <PrivacyWarningModal />

      {/* Contacts Manager Modal */}
      <ContactsManagerModal
        isOpen={showContactsModal}
        onClose={() => setShowContactsModal(false)}
        userNsec={userNsec}
      />

      {/* Main Interface */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Privacy-First Identity Management
          </h2>
          <p className="text-sm text-gray-600">
            Manage NIP-05 identity disclosure with privacy-first defaults
          </p>
        </div>

        {/* Connection Status */}
        <div className="mb-6">
          <div className={`p-3 rounded-lg ${
            messaging.connected 
              ? 'bg-green-50 border border-green-200' 
              : 'bg-red-50 border border-red-200'
          }`}>
            <div className="flex items-center">
              <div className={`w-3 h-3 rounded-full mr-2 ${
                messaging.connected ? 'bg-green-500' : 'bg-red-500'
              }`} />
              <span className={`text-sm font-medium ${
                messaging.connected ? 'text-green-700' : 'text-red-700'
              }`}>
                {messaging.connected ? 'Connected' : 'Disconnected'}
              </span>
              {messaging.sessionId && (
                <span className="ml-2 text-xs text-gray-500 font-mono">
                  Session: {messaging.sessionId.slice(0, 8)}...
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Current Identity Status */}
        <div className="mb-6">
          <h3 className="font-semibold text-gray-700 mb-3">Current Identity Status</h3>
          <div className="space-y-2">
            <div className={`p-3 rounded ${
              messaging.identityStatus.isDisclosureEnabled 
                ? 'bg-yellow-50 border border-yellow-200' 
                : 'bg-green-50 border border-green-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {messaging.identityStatus.isDisclosureEnabled 
                    ? '⚠️ NIP-05 Disclosure Enabled' 
                    : '🔒 Private Messaging (Default)'
                  }
                </span>
                {messaging.identityStatus.isDisclosureEnabled && (
                  <button
                    onClick={handleDisableDisclosure}
                    disabled={messaging.loading}
                    className="text-xs bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {messaging.loading ? 'Disabling...' : 'Disable & Return to Private'}
                  </button>
                )}
              </div>
              
              {messaging.identityStatus.isDisclosureEnabled && (
                <div className="mt-2 text-xs text-gray-600">
                  <div>Direct Messages: {messaging.identityStatus.directMessagesEnabled ? '✓ Enabled' : '✗ Disabled'}</div>
                  <div>Group Messages: {messaging.identityStatus.groupMessagesEnabled ? '✓ Enabled' : '✗ Disabled'}</div>
                  {messaging.identityStatus.specificGroupsCount > 0 && (
                    <div>Specific Groups: {messaging.identityStatus.specificGroupsCount} groups</div>
                  )}
                  {messaging.identityStatus.lastUpdated && (
                    <div>Last Updated: {messaging.identityStatus.lastUpdated.toLocaleDateString()}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Enable NIP-05 Disclosure */}
        {!messaging.identityStatus.isDisclosureEnabled && messaging.connected && (
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-700">Enable NIP-05 Identity Disclosure</h3>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-700 mb-3">
                <strong>Privacy Notice:</strong> This system defaults to private messaging. 
                Enabling NIP-05 disclosure will make your verified identity visible to recipients.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                NIP-05 Identifier
              </label>
              <input
                type="text"
                value={nip05Input}
                onChange={(e) => setNip05Input(e.target.value)}
                placeholder="yourname@domain.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Disclosure Scope
              </label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="scope"
                    value="direct"
                    checked={selectedScope === 'direct'}
                    onChange={(e) => setSelectedScope(e.target.value as 'direct')}
                    className="mr-2"
                  />
                  <span className="text-sm">Direct messages only (recommended)</span>
                </label>
                
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="scope"
                    value="groups"
                    checked={selectedScope === 'groups'}
                    onChange={(e) => setSelectedScope(e.target.value as 'groups')}
                    className="mr-2"
                  />
                  <span className="text-sm">All group messages (higher privacy risk)</span>
                </label>
                
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="scope"
                    value="specific-groups"
                    checked={selectedScope === 'specific-groups'}
                    onChange={(e) => setSelectedScope(e.target.value as 'specific-groups')}
                    className="mr-2"
                  />
                  <span className="text-sm">Specific groups only</span>
                </label>
              </div>
              
              {/* Specific Groups Input */}
              {selectedScope === 'specific-groups' && (
                <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Group IDs (one per line)
                  </label>
                  <textarea
                    value={specificGroups.join('\n')}
                    onChange={(e) => setSpecificGroups(e.target.value.split('\n').filter(id => id.trim()))}
                    placeholder="Enter group IDs separated by new lines..."
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter the specific group IDs where you want to enable NIP-05 disclosure.
                    {specificGroups.length > 0 && ` (${specificGroups.length} group${specificGroups.length === 1 ? '' : 's'} selected)`}
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={handleEnableDisclosure}
              disabled={!nip05Input.trim() || messaging.loading || (selectedScope === 'specific-groups' && specificGroups.length === 0)}
              className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                nip05Input.trim() && !messaging.loading && (selectedScope !== 'specific-groups' || specificGroups.length > 0)
                  ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {messaging.loading ? 'Processing...' : 'Show Privacy Warning & Configure'}
            </button>
            
            {/* Validation Error Messages */}
            {selectedScope === 'specific-groups' && specificGroups.length === 0 && (
              <p className="text-sm text-red-600 mt-2">
                Please specify at least one group ID when using "Specific groups only" option.
              </p>
            )}
          </div>
        )}

        {/* Contacts Management */}
        {messaging.connected && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-gray-700">Privacy-First Contacts</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Manage your encrypted contact network securely
                </p>
              </div>
              <button
                onClick={() => setShowContactsModal(true)}
                disabled={messaging.loading}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span>Manage Contacts</span>
              </button>
            </div>
          </div>
        )}

        {/* Session Management */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-gray-700">Session Management</h3>
            <div className="space-x-2">
              {!messaging.connected ? (
                <button
                  onClick={handleInitializeSession}
                  disabled={!userNsec || messaging.loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {messaging.loading ? 'Connecting...' : 'Initialize Session'}
                </button>
              ) : (
                <button
                  onClick={handleDestroySession}
                  disabled={messaging.loading}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {messaging.loading ? 'Disconnecting...' : 'Destroy Session'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Error Display */}
        {messaging.error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
            <p className="text-sm text-red-700">{messaging.error}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default PrivacyFirstIdentityManager