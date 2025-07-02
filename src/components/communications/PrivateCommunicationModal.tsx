/**
 * PrivateCommunicationModal Component
 * 
 * Private communications modal for gift-wrapped messaging with full privacy protection.
 * Integrates with the existing Contacts Manager and follows Satnam.pub styling patterns.
 * Compatible with Bolt.new and Netlify serverless deployments.
 */

import {
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  Gift,
  Lock,
  MessageSquare,
  Send,
  Shield,
  Users,
  X,
  Zap
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { usePrivacyFirstMessaging } from '../../hooks/usePrivacyFirstMessaging'
import { GiftwrappedCommunicationService } from '../../lib/giftwrapped-communication-service'
import { Contact } from '../../types/contacts'
import { calculatePrivacyMetrics } from '../../types/privacy'
import { ContactsManagerModal } from '../ContactsManagerModal.tsx'
import SignInModal from '../SignInModal.tsx'
import { PrivacyLevel, PrivacyLevelSelector, getDefaultPrivacyLevel } from './PrivacyLevelSelector.tsx'

interface PrivateCommunicationModalProps {
  isOpen: boolean
  onClose: () => void
  communicationType: 'family' | 'individual'
  userProfile: {
    username: string
    npub: string
    familyRole: 'adult' | 'child' | 'guardian'
  }
  preSelectedRecipient?: Contact
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
  // Modal state management
  const [isClosing, setIsClosing] = useState(false)
  const [modalStep, setModalStep] = useState<'compose' | 'contacts' | 'auth'>('compose')
  
  // Authentication state
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authType, setAuthType] = useState<'family' | 'individual'>('individual')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  
  // Message composition state
  const [message, setMessage] = useState('')
  const [recipient, setRecipient] = useState(preSelectedRecipient?.npub || '')
  const [recipientDisplay, setRecipientDisplay] = useState(preSelectedRecipient?.displayName || '')
  const [privacyLevel, setPrivacyLevel] = useState<PrivacyLevel>(getDefaultPrivacyLevel())
  
  // UI state
  const [sendingMessage, setSendingMessage] = useState(false)
  const [showPrivacyDetails, setShowPrivacyDetails] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showContactsModal, setShowContactsModal] = useState(false)
  
  // Privacy metrics
  const [privacyMetrics, setPrivacyMetrics] = useState<PrivacyMetrics>({
    encryptionStrength: 0,
    metadataProtection: 0,
    anonymityLevel: 0
  })

  // Hooks
  const messaging = usePrivacyFirstMessaging()



  // Calculate privacy metrics based on privacy level
  useEffect(() => {
    setPrivacyMetrics(calculatePrivacyMetrics(privacyLevel))
  }, [privacyLevel])

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
      onClose()
    }, 150)
  }

  // Handle contact selection
  const handleContactSelect = (contact: Contact) => {
    setRecipient(contact.npub)
    setRecipientDisplay(contact.displayName)
    setShowContactsModal(false)
    setModalStep('compose')
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
    if (!message.trim() || !recipient.trim()) {
      setError('Please enter both a recipient and message')
      return
    }

    if (!isAuthenticated) {
      setError('Please authenticate before sending messages')
      return
    }

    setSendingMessage(true)
    setError(null)
    
    try {
      const communicationService = new GiftwrappedCommunicationService()
      
      const result = await communicationService.sendGiftwrappedMessage({
        content: message,
        recipient: recipient,
        sender: userProfile.npub,
        encryptionLevel: getEncryptionLevel(privacyLevel),
        communicationType: communicationType
      })

      if (result.success) {
        setMessage('')
        setSuccess('Message sent successfully with full privacy protection!')
        
        // Auto-close after success
        setTimeout(() => {
          handleClose()
        }, 2000)
      } else {
        setError(`Failed to send message: ${result.error}`)
      }
    } catch (error) {
      console.error('Communication error:', error)
      setError('Communication failed. Please check your connection and try again.')
    } finally {
      setSendingMessage(false)
    }
  }

  // Handle authentication success
  const handleAuthSuccess = (destination?: 'individual' | 'family') => {
    setIsAuthenticated(true)
    setShowAuthModal(false)
    setSuccess('Authentication successful! You can now send private messages.')
  }

  if (!isOpen) return null

  return (
    <>
      {/* Main Modal */}
      <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${isClosing ? 'animate-fadeOut' : 'animate-fadeIn'}`}>
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
        
        <div className={`relative w-full max-w-3xl max-h-[90vh] bg-gradient-to-br from-purple-900 via-purple-800 to-purple-900 rounded-2xl shadow-2xl overflow-hidden ${isClosing ? 'animate-scaleOut' : 'animate-scaleIn'}`}>
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
                    Secure, encrypted messaging with gift-wrapped privacy protection
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all duration-300"
              >
                <X className="h-6 w-6 text-white" />
              </button>
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
                      Gift Wrapped communications require authenticated access to ensure message integrity and sender verification.
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

            {/* Message Composition */}
            <div className="space-y-6">
              {/* Recipient Selection */}
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
                    placeholder="npub1... or username@satnam.pub"
                    className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                  <button
                    onClick={() => setShowContactsModal(true)}
                    className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center space-x-2"
                  >
                    <Users className="h-4 w-4" />
                    <span>Contacts</span>
                  </button>
                </div>
              </div>

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
                        <span className="text-blue-300">Gift wrapping enabled</span>
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
                  Private Message
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Your message will be encrypted and gift-wrapped for maximum privacy..."
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
                  disabled={sendingMessage || !message.trim() || !recipient.trim() || !isAuthenticated}
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
                      <span>Send Private Message</span>
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
          selectionMode={true}
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