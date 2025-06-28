/**
 * Production Integration Component for Privacy-First Messaging
 * 
 * This component demonstrates how to integrate the PrivacyFirstIdentityManager
 * into a real messaging application with proper state management and callbacks.
 */

import React, { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import PrivacyFirstIdentityManager from './PrivacyFirstIdentityManager'

interface MessagingIntegrationProps {
  className?: string
}

interface MessagingState {
  sessionId: string | null
  identityDisclosureEnabled: boolean
  identityDisclosureScope: string | null
  lastError: string | null
  auditLog: Array<{
    timestamp: Date
    event: string
    details?: any
  }>
}

export const MessagingIntegration: React.FC<MessagingIntegrationProps> = ({
  className = '',
}) => {
  const { user, nsec } = useAuth() // Assuming you have an auth hook
  
  const [messagingState, setMessagingState] = useState<MessagingState>({
    sessionId: null,
    identityDisclosureEnabled: false,
    identityDisclosureScope: null,
    lastError: null,
    auditLog: [],
  })

  const [showIntegration, setShowIntegration] = useState(false)
  const [notifications, setNotifications] = useState<Array<{
    id: string
    type: 'success' | 'error' | 'warning' | 'info'
    message: string
    timestamp: Date
  }>>([])

  // Add audit log entry
  const addAuditEntry = (event: string, details?: any) => {
    setMessagingState(prev => ({
      ...prev,
      auditLog: [
        {
          timestamp: new Date(),
          event,
          details,
        },
        ...prev.auditLog,
      ].slice(0, 50), // Keep last 50 entries
    }))
  }

  // Add notification
  const addNotification = (type: 'success' | 'error' | 'warning' | 'info', message: string) => {
    const notification = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      message,
      timestamp: new Date(),
    }
    
    setNotifications(prev => [notification, ...prev].slice(0, 10))
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notification.id))
    }, 5000)
  }

  // Handle session creation
  const handleSessionCreated = (sessionId: string) => {
    setMessagingState(prev => ({ ...prev, sessionId }))
    addAuditEntry('messaging_session_created', { sessionId: sessionId.slice(0, 8) + '...' })
    addNotification('success', 'Secure messaging session established')
    
    // Optionally store session ID securely for restoration
    try {
      sessionStorage.setItem('satnam_messaging_session', sessionId)
    } catch (error) {
      console.warn('Failed to store session ID:', error)
    }
  }

  // Handle session destruction
  const handleSessionDestroyed = () => {
    setMessagingState(prev => ({ 
      ...prev, 
      sessionId: null,
      identityDisclosureEnabled: false,
      identityDisclosureScope: null,
    }))
    addAuditEntry('messaging_session_destroyed')
    addNotification('info', 'Messaging session ended - returned to private mode')
    
    // Clear stored session
    try {
      sessionStorage.removeItem('satnam_messaging_session')
    } catch (error) {
      console.warn('Failed to clear session storage:', error)
    }
  }

  // Handle identity disclosure changes
  const handleIdentityDisclosureChanged = (enabled: boolean, scope?: string) => {
    setMessagingState(prev => ({
      ...prev,
      identityDisclosureEnabled: enabled,
      identityDisclosureScope: scope || null,
    }))
    
    if (enabled) {
      addAuditEntry('identity_disclosure_enabled', { scope })
      addNotification('warning', `NIP-05 identity disclosure enabled for ${scope} messages`)
    } else {
      addAuditEntry('identity_disclosure_disabled')
      addNotification('success', 'Returned to private messaging - identity disclosure disabled')
    }
  }

  // Handle errors with proper logging
  const handleError = (error: string) => {
    setMessagingState(prev => ({ ...prev, lastError: error }))
    addAuditEntry('error', { error })
    addNotification('error', error)
    
    // Report to monitoring service in production
    if (import.meta.env.MODE === 'production') {
      // Example: reportError(error, { context: 'messaging_integration' })
      console.error('Messaging Integration Error:', error)
    }
  }

  // Try to restore session on mount
  useEffect(() => {
    if (nsec && showIntegration) {
      try {
        const storedSessionId = sessionStorage.getItem('satnam_messaging_session')
        if (storedSessionId) {
          addAuditEntry('session_restoration_attempted', { sessionId: storedSessionId.slice(0, 8) + '...' })
        }
      } catch (error) {
        console.warn('Failed to check stored session:', error)
      }
    }
  }, [nsec, showIntegration])

  // Clear error after some time
  useEffect(() => {
    if (messagingState.lastError) {
      const timer = setTimeout(() => {
        setMessagingState(prev => ({ ...prev, lastError: null }))
      }, 10000)
      return () => clearTimeout(timer)
    }
  }, [messagingState.lastError])

  return (
    <div className={`messaging-integration ${className}`}>
      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {notifications.map(notification => (
            <div
              key={notification.id}
              className={`p-3 rounded-lg shadow-lg max-w-sm ${
                notification.type === 'success' ? 'bg-green-100 border border-green-400 text-green-700' :
                notification.type === 'error' ? 'bg-red-100 border border-red-400 text-red-700' :
                notification.type === 'warning' ? 'bg-yellow-100 border border-yellow-400 text-yellow-700' :
                'bg-blue-100 border border-blue-400 text-blue-700'
              }`}
            >
              <div className="flex justify-between items-start">
                <p className="text-sm">{notification.message}</p>
                <button
                  onClick={() => setNotifications(prev => prev.filter(n => n.id !== notification.id))}
                  className="ml-2 text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
              <p className="text-xs mt-1 opacity-70">
                {notification.timestamp.toLocaleTimeString()}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Main Interface */}
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Privacy-First Messaging System
              </h1>
              <p className="text-gray-600 mt-1">
                Secure communications with optional NIP-05 identity disclosure
              </p>
            </div>
            
            <button
              onClick={() => setShowIntegration(!showIntegration)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                showIntegration
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {showIntegration ? 'Hide Integration' : 'Show Integration'}
            </button>
          </div>

          {/* Status Overview */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold text-gray-700">Session Status</h3>
              <p className={`text-sm mt-1 ${
                messagingState.sessionId ? 'text-green-600' : 'text-gray-500'
              }`}>
                {messagingState.sessionId ? 'Active' : 'No Session'}
              </p>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold text-gray-700">Identity Disclosure</h3>
              <p className={`text-sm mt-1 ${
                messagingState.identityDisclosureEnabled ? 'text-yellow-600' : 'text-green-600'
              }`}>
                {messagingState.identityDisclosureEnabled 
                  ? `Enabled (${messagingState.identityDisclosureScope})` 
                  : 'Private (Default)'
                }
              </p>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold text-gray-700">User Status</h3>
              <p className={`text-sm mt-1 ${user ? 'text-green-600' : 'text-red-600'}`}>
                {user ? 'Authenticated' : 'Not Authenticated'}
              </p>
            </div>
          </div>
        </div>

        {/* Authentication Required */}
        {!user && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-yellow-800 mb-2">
              Authentication Required
            </h2>
            <p className="text-yellow-700">
              Please authenticate to access privacy-first messaging features.
            </p>
          </div>
        )}

        {/* Privacy-First Identity Manager */}
        {user && nsec && showIntegration && (
          <PrivacyFirstIdentityManager
            userNsec={nsec}
            onSessionCreated={handleSessionCreated}
            onSessionDestroyed={handleSessionDestroyed}
            onIdentityDisclosureChanged={handleIdentityDisclosureChanged}
            onError={handleError}
            className="transition-all duration-300"
          />
        )}

        {/* Audit Log */}
        {messagingState.auditLog.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Privacy & Security Audit Log
            </h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {messagingState.auditLog.map((entry, index) => (
                <div key={index} className="flex justify-between items-start text-sm border-b border-gray-100 pb-2">
                  <div>
                    <span className="font-medium text-gray-700">{entry.event}</span>
                    {entry.details && (
                      <pre className="text-xs text-gray-500 mt-1">
                        {JSON.stringify(entry.details, null, 2)}
                      </pre>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap ml-4">
                    {entry.timestamp.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Development Info */}
        {import.meta.env.MODE === 'development' && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-700 mb-4">
              Development Information
            </h2>
            <div className="space-y-2 text-sm">
              <div><strong>Environment:</strong> {import.meta.env.MODE}</div>
              <div><strong>User ID:</strong> {user?.id || 'Not authenticated'}</div>
              <div><strong>Session ID:</strong> {messagingState.sessionId || 'No session'}</div>
              <div><strong>Last Error:</strong> {messagingState.lastError || 'None'}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default MessagingIntegration