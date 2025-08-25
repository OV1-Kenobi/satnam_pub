/**
 * Unified Toast Container Component
 * 
 * Centralized toast notification display that integrates with the existing
 * toast service and provides consistent styling across the application.
 * 
 * MASTER CONTEXT COMPLIANCE:
 * - Privacy-first message handling
 * - Accessible notifications with ARIA attributes
 * - Consistent styling with application theme
 * - Integration with existing notification systems
 */

import React from 'react';
import { AlertTriangle, CheckCircle, Info, X, Zap } from 'lucide-react';
import { useToasts, type ToastMessage } from '../services/toastService';

interface ToastItemProps {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
  const getToastStyles = (type: ToastMessage['type']) => {
    switch (type) {
      case 'success':
        return {
          container: 'bg-green-500/90 border-green-400 text-green-100',
          icon: <CheckCircle className="w-5 h-5 text-green-200" />,
          iconBg: 'bg-green-600/50'
        };
      case 'error':
        return {
          container: 'bg-red-500/90 border-red-400 text-red-100',
          icon: <AlertTriangle className="w-5 h-5 text-red-200" />,
          iconBg: 'bg-red-600/50'
        };
      case 'warning':
        return {
          container: 'bg-yellow-500/90 border-yellow-400 text-yellow-100',
          icon: <Zap className="w-5 h-5 text-yellow-200" />,
          iconBg: 'bg-yellow-600/50'
        };
      case 'info':
      default:
        return {
          container: 'bg-blue-500/90 border-blue-400 text-blue-100',
          icon: <Info className="w-5 h-5 text-blue-200" />,
          iconBg: 'bg-blue-600/50'
        };
    }
  };

  const styles = getToastStyles(toast.type);

  return (
    <div
      className={`
        ${styles.container}
        backdrop-blur-sm border rounded-lg p-4 shadow-lg
        animate-in slide-in-from-top-2 duration-300
        max-w-md w-full
      `}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`${styles.iconBg} rounded-full p-1 flex-shrink-0 mt-0.5`}>
          {styles.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{toast.title}</p>
          <p className="text-xs mt-1 opacity-90">{toast.message}</p>
          
          {/* Action button if provided */}
          {toast.action && (
            <button
              onClick={toast.action.onClick}
              className="mt-2 text-xs underline hover:no-underline transition-all"
            >
              {toast.action.label}
            </button>
          )}
        </div>

        {/* Dismiss button */}
        <button
          onClick={() => onDismiss(toast.id)}
          className="text-current hover:opacity-70 transition-opacity flex-shrink-0"
          aria-label="Dismiss notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

interface ToastContainerProps {
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
  maxToasts?: number;
}

const ToastContainer: React.FC<ToastContainerProps> = ({ 
  position = 'top-right',
  maxToasts = 5 
}) => {
  const { toasts, removeToast } = useToasts();

  const getPositionStyles = (pos: string) => {
    switch (pos) {
      case 'top-left':
        return 'top-4 left-4';
      case 'top-center':
        return 'top-4 left-1/2 transform -translate-x-1/2';
      case 'top-right':
        return 'top-4 right-4';
      case 'bottom-left':
        return 'bottom-4 left-4';
      case 'bottom-center':
        return 'bottom-4 left-1/2 transform -translate-x-1/2';
      case 'bottom-right':
        return 'bottom-4 right-4';
      default:
        return 'top-4 right-4';
    }
  };

  // Limit the number of toasts displayed
  const displayedToasts = toasts.slice(0, maxToasts);

  if (displayedToasts.length === 0) {
    return null;
  }

  return (
    <div
      className={`
        fixed z-50 pointer-events-none
        ${getPositionStyles(position)}
      `}
    >
      <div className="flex flex-col gap-2 pointer-events-auto">
        {displayedToasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={removeToast}
          />
        ))}
      </div>
    </div>
  );
};

export default ToastContainer;
