/**
 * GiftwrappedOTPModal Component
 * 
 * One-Time Password authentication modal for secure giftwrapped communications.
 * Provides multi-factor authentication before allowing high-privacy message sending.
 * Compatible with family federation and individual authentication flows.
 */

import {
  AlertTriangle,
  Check,
  Key,
  Lock,
  Shield,
  Timer,
  X,
  Zap
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { calculatePrivacyMetrics } from '../../types/privacy'
import { PrivacyLevel, PrivacyLevelSelector, getDefaultPrivacyLevel } from './PrivacyLevelSelector.tsx'

interface GiftwrappedOTPModalProps {
  isOpen: boolean
  onClose: () => void
  onOTPVerified: (verificationResult: OTPVerificationResult) => void
  authType: 'family' | 'individual'
  userProfile: {
    username: string
    npub: string
    familyRole?: 'adult' | 'child' | 'guardian'
  }
  preSelectedPrivacyLevel?: PrivacyLevel
}

interface OTPVerificationResult {
  success: boolean
  privacyLevel: PrivacyLevel
  authMethod: 'family' | 'individual'
  sessionToken?: string
  expiresAt?: Date
  error?: string
}

interface PrivacyMetrics {
  encryptionStrength: number
  metadataProtection: number
  anonymityLevel: number
}

export function GiftwrappedOTPModal({
  isOpen,
  onClose,
  onOTPVerified,
  authType,
  userProfile,
  preSelectedPrivacyLevel
}: GiftwrappedOTPModalProps) {
  // Lifecycle guards
  const mountedRef = useRef(true)
  const otpSendAbortRef = useRef<AbortController | null>(null)
  const otpVerifyAbortRef = useRef<AbortController | null>(null)
  const successTimerRef = useRef<number | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (otpSendAbortRef.current) {
        otpSendAbortRef.current.abort()
        otpSendAbortRef.current = null
      }
      if (otpVerifyAbortRef.current) {
        otpVerifyAbortRef.current.abort()
        otpVerifyAbortRef.current = null
      }
      if (successTimerRef.current !== null) {
        clearTimeout(successTimerRef.current)
        successTimerRef.current = null
      }
    }
  }, [])

  // Modal state management
  const [isClosing, setIsClosing] = useState(false)
  const [currentStep, setCurrentStep] = useState<'privacy' | 'otp' | 'verification'>('privacy')

  // OTP state
  const [otpCode, setOtpCode] = useState('')
  const [otpMethod, setOtpMethod] = useState<'sms' | 'email' | 'totp' | 'hardware'>('totp')
  const [isVerifying, setIsVerifying] = useState(false)
  const [verificationAttempts, setVerificationAttempts] = useState(0)
  const [timeRemaining, setTimeRemaining] = useState(300) // 5 minutes

  // Privacy settings
  const [privacyLevel, setPrivacyLevel] = useState<PrivacyLevel>(
    preSelectedPrivacyLevel || getDefaultPrivacyLevel()
  )
  const [showPrivacyDetails, setShowPrivacyDetails] = useState(false)
  const [privacyMetrics, setPrivacyMetrics] = useState<PrivacyMetrics>({
    encryptionStrength: 0,
    metadataProtection: 0,
    anonymityLevel: 0
  })

  // UI state
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isOTPSent, setIsOTPSent] = useState(false)

  // Calculate privacy metrics when level changes
  useEffect(() => {
    setPrivacyMetrics(calculatePrivacyMetrics(privacyLevel))
  }, [privacyLevel])

  // OTP timer countdown
  useEffect(() => {
    if (isOTPSent && timeRemaining > 0) {
      const timer = setTimeout(() => {
        setTimeRemaining(prev => prev - 1)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [isOTPSent, timeRemaining])

  // Handle modal close
  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => {
      setIsClosing(false)
      setCurrentStep('privacy')
      setOtpCode('')
      setError(null)
      setSuccess(null)
      setIsOTPSent(false)
      setVerificationAttempts(0)
      setTimeRemaining(300)
      if (otpSendAbortRef.current) { otpSendAbortRef.current.abort(); otpSendAbortRef.current = null }
      if (otpVerifyAbortRef.current) { otpVerifyAbortRef.current.abort(); otpVerifyAbortRef.current = null }
      if (successTimerRef.current !== null) { clearTimeout(successTimerRef.current); successTimerRef.current = null }
      onClose()
    }, 150)
  }

  // Send OTP code
  const handleSendOTP = async () => {
    setError(null)
    setIsVerifying(true)

    try {
      if (otpSendAbortRef.current) {
        otpSendAbortRef.current.abort()
      }
      const controller = new AbortController()
      otpSendAbortRef.current = controller

      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          method: otpMethod,
          userNpub: userProfile.npub,
          authType: authType,
          privacyLevel: privacyLevel
        })
      })

      if (!mountedRef.current) return

      if (response.ok) {
        setIsOTPSent(true)
        setCurrentStep('otp')
        setSuccess(`OTP sent to your ${otpMethod.toUpperCase()} device`)
        setTimeRemaining(300) // Reset timer
      } else {
        const errorResp = await response.json()
        setError(`Failed to send OTP: ${errorResp.message}`)
      }
    } catch (error) {
      if ((error as any)?.name === 'AbortError') {
        return
      }
      console.error('OTP send error:', error)
      if (!mountedRef.current) return
      setError('Failed to send OTP. Please check your connection and try again.')
    } finally {
      if (!mountedRef.current) return
      setIsVerifying(false)
    }
  }

  // Verify OTP code
  const handleVerifyOTP = async () => {
    if (!otpCode.trim() || otpCode.length < 6) {
      setError('Please enter a valid 6-digit OTP code')
      return
    }

    setIsVerifying(true)
    setError(null)

    try {
      if (otpVerifyAbortRef.current) {
        otpVerifyAbortRef.current.abort()
      }
      const controller = new AbortController()
      otpVerifyAbortRef.current = controller

      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          code: otpCode,
          method: otpMethod,
          userNpub: userProfile.npub,
          authType: authType,
          privacyLevel: privacyLevel
        })
      })

      if (!mountedRef.current) return

      const result = await response.json()

      if (response.ok && result.success) {
        setCurrentStep('verification')
        setSuccess('OTP verified successfully! Giftwrapped communications are now enabled.')

        const verificationResult: OTPVerificationResult = {
          success: true,
          privacyLevel: privacyLevel,
          authMethod: authType,
          sessionToken: result.sessionToken,
          expiresAt: new Date(result.expiresAt)
        }

        successTimerRef.current = window.setTimeout(() => {
          if (!mountedRef.current) return
          onOTPVerified(verificationResult)
          handleClose()
        }, 2000)
      } else {
        setVerificationAttempts(prev => prev + 1)
        setError(result.error || 'Invalid OTP code. Please try again.')

        if (verificationAttempts >= 2) {
          setError('Too many failed attempts. Please request a new OTP code.')
          setIsOTPSent(false)
          setCurrentStep('privacy')
        }
      }
    } catch (error) {
      if ((error as any)?.name === 'AbortError') {
        return
      }
      console.error('OTP verification error:', error)
      if (!mountedRef.current) return
      setError('Verification failed. Please check your connection and try again.')
    } finally {
      if (!mountedRef.current) return
      setIsVerifying(false)
    }
  }

  // Handle privacy level confirmation
  const handlePrivacyConfirmed = () => {
    setCurrentStep('otp')
    handleSendOTP()
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (!isOpen) return null

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${isClosing ? 'animate-fadeOut' : 'animate-fadeIn'}`}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      <div className={`relative w-full max-w-2xl max-h-[90vh] bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 rounded-2xl shadow-2xl overflow-hidden ${isClosing ? 'animate-scaleOut' : 'animate-scaleIn'}`}>
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-sm border-b border-white/20 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                <Key className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">
                  Giftwrapped OTP Authentication
                </h2>
                <p className="text-indigo-200 text-sm">
                  Secure verification for maximum privacy communications
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
          {/* Step Indicator */}
          <div className="flex items-center justify-center mb-8">
            <div className="flex items-center space-x-4">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full ${currentStep === 'privacy' ? 'bg-indigo-500 text-white' :
                  currentStep === 'otp' || currentStep === 'verification' ? 'bg-green-500 text-white' : 'bg-white/20 text-white/60'
                }`}>
                <Shield className="h-4 w-4" />
              </div>
              <div className={`w-12 h-0.5 ${currentStep === 'otp' || currentStep === 'verification' ? 'bg-green-500' : 'bg-white/20'}`} />
              <div className={`flex items-center justify-center w-8 h-8 rounded-full ${currentStep === 'otp' ? 'bg-indigo-500 text-white' :
                  currentStep === 'verification' ? 'bg-green-500 text-white' : 'bg-white/20 text-white/60'
                }`}>
                <Key className="h-4 w-4" />
              </div>
              <div className={`w-12 h-0.5 ${currentStep === 'verification' ? 'bg-green-500' : 'bg-white/20'}`} />
              <div className={`flex items-center justify-center w-8 h-8 rounded-full ${currentStep === 'verification' ? 'bg-green-500 text-white' : 'bg-white/20 text-white/60'
                }`}>
                <Check className="h-4 w-4" />
              </div>
            </div>
          </div>

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

          {/* Step 1: Privacy Level Selection */}
          {currentStep === 'privacy' && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h3 className="text-xl font-semibold text-white mb-2">
                  Select Your Privacy Level
                </h3>
                <p className="text-indigo-200 text-sm">
                  Choose the appropriate privacy level for your giftwrapped communications
                </p>
              </div>

              <PrivacyLevelSelector
                selectedLevel={privacyLevel}
                onLevelChange={setPrivacyLevel}
                showMetrics={true}
                variant="modal"
              />

              <div className="flex justify-center">
                <button
                  onClick={handlePrivacyConfirmed}
                  disabled={isVerifying}
                  className="px-8 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isVerifying ? 'Sending OTP...' : 'Confirm & Send OTP'}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: OTP Input */}
          {currentStep === 'otp' && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h3 className="text-xl font-semibold text-white mb-2">
                  Enter Verification Code
                </h3>
                <p className="text-indigo-200 text-sm">
                  Enter the 6-digit code sent to your {otpMethod.toUpperCase()} device
                </p>
              </div>

              {/* OTP Method Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-indigo-200 mb-3">
                  Verification Method
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: 'totp', label: 'Authenticator App', icon: <Shield className="h-4 w-4" /> },
                    { value: 'sms', label: 'SMS', icon: <Zap className="h-4 w-4" /> },
                    { value: 'email', label: 'Email', icon: <Key className="h-4 w-4" /> },
                    { value: 'hardware', label: 'Hardware Key', icon: <Lock className="h-4 w-4" /> }
                  ].map((method) => (
                    <button
                      key={method.value}
                      onClick={() => setOtpMethod(method.value as any)}
                      className={`p-3 rounded-lg border transition-all duration-300 ${otpMethod === method.value
                          ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400'
                          : 'bg-white/5 border-white/20 text-white/70 hover:bg-white/10'
                        }`}
                    >
                      <div className="flex items-center space-x-2">
                        {method.icon}
                        <span className="text-sm">{method.label}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* OTP Input */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-indigo-200 mb-3">
                  Verification Code
                </label>
                <input
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white text-center text-2xl font-mono tracking-widest placeholder-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  maxLength={6}
                />
              </div>

              {/* Timer */}
              {timeRemaining > 0 && (
                <div className="text-center mb-6">
                  <div className="flex items-center justify-center space-x-2 text-indigo-300">
                    <Timer className="h-4 w-4" />
                    <span className="text-sm">Code expires in {formatTime(timeRemaining)}</span>
                  </div>
                </div>
              )}

              <div className="flex justify-center space-x-4">
                <button
                  onClick={() => setCurrentStep('privacy')}
                  className="px-6 py-3 bg-white/10 text-white rounded-lg font-medium hover:bg-white/20 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleVerifyOTP}
                  disabled={isVerifying || otpCode.length < 6}
                  className="px-8 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isVerifying ? 'Verifying...' : 'Verify Code'}
                </button>
              </div>

              {!isOTPSent && (
                <div className="text-center">
                  <button
                    onClick={handleSendOTP}
                    className="text-indigo-400 hover:text-indigo-300 text-sm underline transition-colors"
                  >
                    Resend OTP Code
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Verification Success */}
          {currentStep === 'verification' && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
                <Check className="h-10 w-10 text-green-400" />
              </div>

              <div>
                <h3 className="text-xl font-semibold text-white mb-2">
                  Authentication Successful!
                </h3>
                <p className="text-indigo-200 text-sm">
                  Your giftwrapped communications are now secured with {privacyLevel} privacy level
                </p>
              </div>

              {/* Privacy Summary */}
              <div className="bg-white/5 rounded-lg p-4 border border-white/20">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-green-400">{privacyMetrics.encryptionStrength}%</div>
                    <div className="text-xs text-indigo-300">Protection</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-400">{privacyMetrics.metadataProtection}%</div>
                    <div className="text-xs text-indigo-300">Metadata</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-purple-400">{privacyMetrics.anonymityLevel}%</div>
                    <div className="text-xs text-indigo-300">Anonymity</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default GiftwrappedOTPModal