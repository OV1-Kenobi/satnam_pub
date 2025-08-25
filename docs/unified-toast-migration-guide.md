# Unified Toast Notification System - Migration Guide

## Overview

This guide helps migrate existing notification systems to the new unified toast notification system, consolidating multiple approaches into a single, consistent user experience.

## Architecture

### Core Components

1. **`src/services/toastService.ts`** - Centralized toast management service
2. **`src/components/ToastContainer.tsx`** - React component for displaying toasts
3. **Unified API** - Consistent interface across all components

### Key Features

- **Type Safety**: Full TypeScript support with proper interfaces
- **Auto-dismissal**: Configurable timeout for different message types
- **Action Support**: Optional action buttons (retry, undo, etc.)
- **Accessibility**: ARIA attributes and keyboard navigation
- **Privacy-First**: No sensitive data logging
- **Memory Efficient**: Automatic cleanup and limited queue size

## Migration Steps

### 1. Replace Existing Notification Systems

#### From P2PPaymentModal.tsx
```typescript
// OLD: Custom useToast hook
const useToast = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  // ... custom implementation
};

// NEW: Use unified system
import { showToast } from '../services/toastService';

// Usage
showToast.error('Payment failed', {
  title: 'Transaction Error',
  action: {
    label: 'Retry',
    onClick: () => retryPayment()
  }
});
```

#### From MessagingIntegration.tsx
```typescript
// OLD: Custom notification state
const addNotification = (type: 'success' | 'error' | 'warning' | 'info', message: string) => {
  const notification = {
    id: Math.random().toString(36).substring(2, 11),
    type,
    message,
    timestamp: new Date(),
  }
  setNotifications(prev => [notification, ...prev].slice(0, 10))
  setTimeout(() => {
    setNotifications(prev => prev.filter(n => n.id !== notification.id))
  }, 5000)
}

// NEW: Use unified system
import { showToast } from '../services/toastService';

const addNotification = (type: 'success' | 'error' | 'warning' | 'info', message: string) => {
  showToast[type](message);
};
```

#### From Error Display Components
```typescript
// OLD: Inline error displays
{error && (
  <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-6">
    <div className="flex items-center space-x-2">
      <AlertTriangle className="h-5 w-5 text-red-400" />
      <p className="text-red-300 font-medium">API Error</p>
    </div>
    <p className="text-red-200 text-sm mt-1">{error}</p>
  </div>
)}

// NEW: Use toast notifications
useEffect(() => {
  if (error) {
    showToast.error(error, {
      title: 'API Error',
      duration: 0, // Don't auto-dismiss errors
      action: {
        label: 'Retry',
        onClick: () => window.location.reload()
      }
    });
  }
}, [error]);
```

### 2. Add ToastContainer to Root Components

#### App.tsx or Main Layout
```typescript
import ToastContainer from './components/ToastContainer';

function App() {
  return (
    <div className="app">
      {/* Your app content */}
      
      {/* Add toast container at the root level */}
      <ToastContainer position="top-right" maxToasts={5} />
    </div>
  );
}
```

#### Component-Specific Integration
```typescript
// For components that need their own toast positioning
import ToastContainer from './ToastContainer';

const MyComponent = () => {
  return (
    <div className="component-container">
      {/* Component content */}
      
      {/* Component-specific toast container */}
      <ToastContainer position="bottom-center" maxToasts={3} />
    </div>
  );
};
```

### 3. Update API Error Handling

#### Family Wallet APIs
```typescript
// OLD: Console logging only
catch (error) {
  console.error('API error:', error);
  throw error;
}

// NEW: User-visible feedback
import { showToast } from '../services/toastService';

catch (error) {
  console.error('API error:', error);
  showToast.error(
    error instanceof Error ? error.message : 'An unexpected error occurred',
    {
      title: 'API Error',
      duration: 0,
      action: {
        label: 'Contact Support',
        onClick: () => window.open('mailto:support@satnam.pub')
      }
    }
  );
  throw error;
}
```

#### FROST Signature Operations
```typescript
// Already implemented in FamilyFinancialsDashboard.tsx
const handleFrostTransactionApprovalWrapper = async (transactionId: string) => {
  const result = await handleFrostTransactionApproval(transactionId);

  if (!result.success && result.error) {
    showToast.error(result.error, {
      title: 'Transaction Approval Failed',
      duration: 0,
      action: {
        label: 'Retry',
        onClick: () => handleFrostTransactionApprovalWrapper(transactionId)
      }
    });
  } else if (result.success) {
    showToast.success('Transaction signature submitted successfully', {
      title: 'Signature Approved',
      duration: 4000
    });
  }
};
```

## API Reference

### showToast Functions

```typescript
// Success notifications
showToast.success(message: string, options?: ToastOptions)

// Error notifications  
showToast.error(message: string, options?: ToastOptions)

// Warning notifications
showToast.warning(message: string, options?: ToastOptions)

// Info notifications
showToast.info(message: string, options?: ToastOptions)

// Generic function
showToast.show(message: string, options: ToastOptions)
```

### ToastOptions Interface

```typescript
interface ToastOptions {
  type?: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  duration?: number; // 0 = no auto-dismiss
  action?: {
    label: string;
    onClick: () => void;
  };
}
```

### ToastContainer Props

```typescript
interface ToastContainerProps {
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
  maxToasts?: number;
}
```

## Best Practices

### 1. Message Types
- **Success**: Confirmations, completed actions
- **Error**: Failures that require user attention (no auto-dismiss)
- **Warning**: Important information that needs attention
- **Info**: General information and status updates

### 2. Duration Guidelines
- **Success**: 4 seconds
- **Error**: 0 (no auto-dismiss)
- **Warning**: 6 seconds
- **Info**: 5 seconds

### 3. Action Buttons
- Use for recoverable errors (Retry, Undo)
- Provide helpful next steps (Contact Support, Learn More)
- Keep labels short and actionable

### 4. Privacy Compliance
- Never include sensitive data in toast messages
- Use generic error messages for security-related failures
- Log detailed errors to console for debugging

## Testing

### Unit Tests
```typescript
import { showToast, toastManager } from '../services/toastService';

describe('Toast Service', () => {
  it('should add and remove toasts', () => {
    const id = showToast.success('Test message');
    expect(toastManager.getAll()).toHaveLength(1);
    
    toastManager.remove(id);
    expect(toastManager.getAll()).toHaveLength(0);
  });
});
```

### Integration Tests
```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { showToast } from '../services/toastService';
import ToastContainer from '../components/ToastContainer';

test('displays toast notifications', () => {
  render(<ToastContainer />);
  
  showToast.error('Test error message');
  
  expect(screen.getByText('Test error message')).toBeInTheDocument();
  expect(screen.getByText('Error')).toBeInTheDocument();
});
```

## Migration Checklist

- [ ] Install unified toast system
- [ ] Add ToastContainer to root component
- [ ] Replace custom notification hooks
- [ ] Update API error handling
- [ ] Remove inline error displays
- [ ] Update component-specific notifications
- [ ] Test all notification scenarios
- [ ] Update documentation
- [ ] Train team on new API

## Rollback Plan

If issues arise, the old notification systems can be temporarily restored by:

1. Commenting out ToastContainer imports
2. Reverting to previous error handling patterns
3. Re-enabling inline error displays
4. Using console.log for debugging

The unified system is designed to be additive, so existing systems can coexist during migration.
