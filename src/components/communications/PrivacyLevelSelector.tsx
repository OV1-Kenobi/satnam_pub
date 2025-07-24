/**
 * Enhanced Privacy Level Selector Component
 * 
 * Reusable component for selecting privacy levels across all communication modals:
 * - PrivateCommunicationModal
 * - PeerInvitationModal  
 * - FamilyFederationInvitationModal
 * - GiftwrappedOTPModal
 * 
 * Merged best features from both implementations with improved UX
 */

import { Check } from 'lucide-react'
import { PRIVACY_OPTIONS, PrivacyLevel, calculatePrivacyMetrics } from '../../types/privacy'

export interface PrivacyLevelSelectorProps {
  selectedLevel: PrivacyLevel
  onLevelChange: (level: PrivacyLevel) => void
  showMetrics?: boolean
  disabled?: boolean
  className?: string
  variant?: 'modal' | 'card' // modal = purple theme, card = white theme
}

export function PrivacyLevelSelector({
  selectedLevel,
  onLevelChange,
  showMetrics = false,
  disabled = false,
  className = "",
  variant = 'modal'
}: PrivacyLevelSelectorProps) {

  const isModal = variant === 'modal'

  const getColorClasses = (level: PrivacyLevel, isSelected: boolean) => {
    if (isModal) {
      // Purple theme for modals
      if (isSelected) {
        const colorMap = {
          [PrivacyLevel.GIFTWRAPPED]: 'border-green-500 bg-green-500/20 text-green-400',
          [PrivacyLevel.ENCRYPTED]: 'border-blue-500 bg-blue-500/20 text-blue-400',
          [PrivacyLevel.MINIMAL]: 'border-yellow-500 bg-yellow-500/20 text-yellow-400'
        }
        return colorMap[level] || 'border-purple-500 bg-purple-500/20 text-purple-400'
      }
      return 'border-white/20 bg-white/5 text-white/70 hover:bg-white/10'
    } else {
      // Clean theme for standalone cards
      if (isSelected) {
        return 'border-purple-500 bg-purple-50 text-purple-900'
      }
      return 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
    }
  }

  const textColors = isModal ? {
    primary: 'text-white',
    secondary: 'text-purple-200',
    muted: 'text-purple-300',
    label: 'text-purple-200'
  } : {
    primary: 'text-gray-900',
    secondary: 'text-gray-600',
    muted: 'text-gray-500',
    label: 'text-gray-900'
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <label className={`block text-sm font-medium ${textColors.label} mb-2`}>
          Privacy Protection Level
        </label>
        <p className={`text-xs ${textColors.muted}`}>
          Choose based on communication sensitivity
        </p>
      </div>

      <div className="space-y-3">
        {PRIVACY_OPTIONS.map((option) => {
          const isSelected = selectedLevel === option.privacyLevel
          const colorClasses = getColorClasses(option.privacyLevel, isSelected)
          const metrics = calculatePrivacyMetrics(option.privacyLevel)

          return (
            <div key={option.privacyLevel} className="privacy-option">
              <label className={`flex items-start space-x-4 p-4 border-2 rounded-lg cursor-pointer transition-all duration-300 ${colorClasses} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <input
                  type="radio"
                  name="privacy-level"
                  value={option.privacyLevel}
                  checked={isSelected}
                  onChange={() => !disabled && onLevelChange(option.privacyLevel)}
                  disabled={disabled}
                  className="sr-only" // Hide default radio, use custom styling
                />

                <div className="flex-shrink-0 mt-1">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected
                      ? (isModal ? 'border-current bg-current' : 'border-purple-500 bg-purple-500')
                      : (isModal ? 'border-white/40' : 'border-gray-300')
                    }`}>
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-3 mb-2">
                    <span className="text-2xl">{option.icon}</span>
                    <div>
                      <div className={`font-semibold ${textColors.primary}`}>
                        {option.privacyLevel.toUpperCase()}
                      </div>
                      <div className={`text-sm ${textColors.secondary}`}>
                        {option.description}
                      </div>
                    </div>
                  </div>

                  <div className={`text-sm ${textColors.muted} mb-3`}>
                    <strong>Use Case:</strong> {option.useCase}
                  </div>

                  <div className="flex flex-wrap gap-2 mb-3">
                    {option.features.map((feature, index) => (
                      <span
                        key={index}
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${isModal
                            ? 'bg-white/10 text-purple-200'
                            : 'bg-purple-100 text-purple-800'
                          }`}
                      >
                        {feature}
                      </span>
                    ))}
                  </div>

                  {showMetrics && isSelected && (
                    <div className={`mt-3 pt-3 border-t ${isModal ? 'border-white/20' : 'border-gray-200'}`}>
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <div className={`text-lg font-bold ${textColors.primary}`}>
                            {metrics.encryptionStrength}%
                          </div>
                          <div className={`text-xs ${textColors.muted}`}>Protection</div>
                        </div>
                        <div>
                          <div className={`text-lg font-bold ${textColors.primary}`}>
                            {metrics.metadataProtection}%
                          </div>
                          <div className={`text-xs ${textColors.muted}`}>Metadata</div>
                        </div>
                        <div>
                          <div className={`text-lg font-bold ${textColors.primary}`}>
                            {metrics.anonymityLevel}%
                          </div>
                          <div className={`text-xs ${textColors.muted}`}>Anonymity</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </label>
            </div>
          )
        })}
      </div>

      {!isModal && (
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <div className="text-sm text-blue-800">
            <strong>Bitcoin-Only Privacy:</strong> All privacy levels maintain your Bitcoin-only architecture while providing different levels of operational security for your family banking needs.
          </div>
        </div>
      )}
    </div>
  )
}

// Re-export from types for convenience
export { getDefaultPrivacyLevel } from '../../types/privacy'
export type { PrivacyLevel } from '../../types/privacy'

