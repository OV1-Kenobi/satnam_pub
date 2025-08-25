# Payment Automation Modal - Production Integration Guide

## Overview

The PaymentAutomationModal component has been completely redesigned as a production-ready solution that integrates with the existing contact system, authentication infrastructure, and notification services. This guide covers the implementation details, integration requirements, and usage patterns.

## Architecture

### **Production Integration Points**

1. **Contact System Integration** (`src/services/contactApiService.ts`)
   - Real-time contact loading and search
   - Contact validation and verification
   - Family member and external contact support

2. **Authentication Integration** (`useAuth` hook)
   - Production user authentication
   - JWT token management
   - Role-based access control

3. **Input Validation System**
   - Real-time npub, NIP-05, and Lightning address validation
   - Domain verification for external addresses
   - Cashu token/mint URL validation

4. **Notification Integration** (`toastService`)
   - User-friendly error and success feedback
   - Loading state management
   - Retry mechanisms for failed operations

## Key Features

### **✅ Contact System Integration**

#### **Supported Recipient Types**
- **Family Members**: Direct selection from family federation
- **Saved Contacts**: Search and select from user's contact list
- **External Lightning Addresses**: Manual input with validation
- **External Npubs**: Manual input with format and network verification
- **NIP-05 Identifiers**: Manual input with domain verification
- **Cashu eCash**: Mint URL input with validation

#### **Contact Data Sources**
```typescript
// Family members from props
familyMembers: Array<{
  id: string;
  name: string;
  role: 'private' | 'offspring' | 'adult' | 'steward' | 'guardian';
  lightningAddress?: string;
  npub?: string;
}>

// Contacts from API
contacts: PaymentRecipient[] = [
  {
    id: string;
    type: 'family_member' | 'contact' | 'external';
    displayName: string;
    npub?: string;
    nip05?: string;
    lightningAddress?: string;
    familyRole?: string;
    trustLevel?: 'family' | 'trusted' | 'known' | 'unverified';
    verified?: boolean;
  }
]
```

### **✅ Authentication & Signing Methods**

#### **NIP-07 Browser Extension (Preferred)**
- Automatic detection of browser extension
- Secure signing without exposing private keys
- Recommended for users with compatible extensions

#### **NIP-05 + Password Authentication**
- Uses user's verified NIP-05 identifier
- Password-based authentication for signing
- Fallback when NIP-07 unavailable

#### **Password-Only Authentication**
- Standard password-based authentication
- Available for all users
- Secure but less convenient than NIP-07

### **✅ Input Validation & Verification**

#### **Real-Time Validation**
```typescript
// Validation results with metadata
interface ContactValidationResult {
  valid: boolean;
  type: 'npub' | 'nip05' | 'lightning_address' | 'cashu_token';
  error?: string;
  normalizedValue?: string;
  metadata?: {
    domain?: string;
    username?: string;
    verified?: boolean;
  };
}
```

#### **Validation Features**
- **Format Validation**: Proper npub, NIP-05, Lightning address formats
- **Network Verification**: Verify npub exists on Nostr network
- **Domain Verification**: Verify NIP-05 domains and LNURL endpoints
- **Visual Feedback**: Real-time validation status with icons and messages

### **✅ Enhanced User Experience**

#### **Loading States**
- Contact loading with spinner
- Form validation with debounced input
- Save operation with disabled button and loading indicator

#### **Error Handling**
- Toast notifications for all error states
- Retry mechanisms for failed operations
- Graceful degradation when services unavailable

#### **Search & Discovery**
- Real-time contact search with debouncing
- Fuzzy search across names, npubs, and addresses
- Empty state handling with helpful messages

## Usage Examples

### **Basic Integration**

```typescript
import PaymentAutomationModal from './components/PaymentAutomationModal';
import { PaymentSchedule } from './lib/payment-automation';

const MyComponent = () => {
  const [showModal, setShowModal] = useState(false);
  
  const handleSave = async (schedule: Partial<PaymentSchedule>) => {
    try {
      // Save to backend
      await savePaymentSchedule(schedule);
      console.log('Schedule saved:', schedule);
    } catch (error) {
      throw error; // Modal will handle error display
    }
  };

  return (
    <>
      <button onClick={() => setShowModal(true)}>
        Create Payment Schedule
      </button>
      
      <PaymentAutomationModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleSave}
        context="individual" // or "family"
        familyMembers={familyMembers} // for family context
      />
    </>
  );
};
```

### **Family Context Integration**

```typescript
const FamilyPaymentModal = () => {
  const familyMembers = [
    {
      id: 'member-1',
      name: 'Alice',
      role: 'adult',
      lightningAddress: 'alice@family.com',
      npub: 'npub1alice123...'
    },
    {
      id: 'member-2', 
      name: 'Bob',
      role: 'offspring',
      npub: 'npub1bob456...'
    }
  ];

  return (
    <PaymentAutomationModal
      isOpen={true}
      onClose={() => {}}
      onSave={handleSave}
      context="family"
      familyId="family-federation-123"
      familyMembers={familyMembers}
    />
  );
};
```

### **Advanced Configuration**

```typescript
const AdvancedPaymentModal = () => {
  const existingSchedule = {
    recipientType: 'contact',
    recipientAddress: 'alice@getalby.com',
    recipientName: 'Alice Bitcoin',
    amount: 50000,
    frequency: 'weekly',
    signingMethod: 'nip07',
    notificationSettings: {
      sendNostrMessage: true,
      nostrNotifications: true
    }
  };

  return (
    <PaymentAutomationModal
      isOpen={true}
      onClose={() => {}}
      onSave={handleSave}
      context="individual"
      existingSchedule={existingSchedule} // Pre-populate form
    />
  );
};
```

## API Integration

### **Contact API Service**

The modal integrates with the production contact API service:

```typescript
// Load user contacts
const contacts = await contactApi.getUserContacts(userId);

// Get user identity data
const identityData = await contactApi.getUserIdentityData(userId);

// Validate external input
const validation = await contactApi.validateRecipientInput(input);

// Search contacts
const results = await contactApi.searchContacts(userId, query);
```

### **Authentication Integration**

Automatic authentication setup:

```typescript
// Authentication is handled automatically
useEffect(() => {
  const initializeAuth = async () => {
    const { SecureTokenManager } = await import('../lib/auth/secure-token-manager');
    const accessToken = SecureTokenManager.getAccessToken();
    if (accessToken) {
      contactApi.setAuthToken(accessToken);
    }
  };

  if (authenticated && user) {
    initializeAuth();
  }
}, [authenticated, user]);
```

## Form Data Structure

### **Complete PaymentAutomationFormData Interface**

```typescript
interface PaymentAutomationFormData {
  userId?: string;
  familyId?: string;
  recipientType?: 'family_member' | 'contact' | 'ln_address' | 'npub' | 'nip05' | 'cashu_token';
  recipientAddress?: string;
  recipientName?: string;
  amount?: number;
  frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  dayOfWeek?: number;
  dayOfMonth?: number;
  enabled?: boolean;
  paymentRouting?: string;
  signingMethod?: 'nip07' | 'nip05' | 'password';
  routingPreferences?: {
    maxFeePercent: number;
    privacyMode: boolean;
    routingStrategy: 'balanced' | 'privacy' | 'speed';
  };
  protocolPreferences?: {
    primary: 'lightning' | 'ecash' | 'fedimint';
    fallback: ('lightning' | 'ecash' | 'fedimint')[];
    cashuMintUrl?: string;
  };
  notificationSettings?: {
    notifyOnDistribution?: boolean;
    notifyOnFailure?: boolean;
    notifyOnSuspiciousActivity?: boolean;
    sendNostrMessage?: boolean;
    nostrNotifications?: boolean;
  };
}
```

## Error Handling

### **Validation Errors**
- Required field validation
- Format validation for addresses
- Amount validation (minimum 1,000 sats)
- Network verification failures

### **API Errors**
- Contact loading failures
- Authentication errors
- Network connectivity issues
- Save operation failures

### **User Feedback**
All errors are displayed via toast notifications with:
- Clear error messages
- Retry actions where applicable
- Loading state management
- Graceful degradation

## Testing

### **Comprehensive Test Coverage**
- Authentication integration tests
- Contact system integration tests
- Input validation tests
- Form submission tests
- Error handling tests
- Loading state tests

### **Test Utilities**
```typescript
// Mock contact API responses
mockContactApi.getUserContacts.mockResolvedValue(mockContacts);
mockContactApi.validateRecipientInput.mockResolvedValue({
  valid: true,
  type: 'npub',
  normalizedValue: 'npub1test123'
});

// Test form interactions
await userEvent.type(screen.getByPlaceholderText('npub1...'), 'npub1test123');
fireEvent.click(screen.getByText('Create Schedule'));

// Verify API calls
expect(mockContactApi.validateRecipientInput).toHaveBeenCalledWith('npub1test123');
```

## Performance Considerations

### **Optimization Features**
- **Debounced Search**: 300ms delay for contact search
- **Debounced Validation**: 500ms delay for input validation
- **Lazy Loading**: Contact API only loaded when modal opens
- **Efficient Re-renders**: Proper React state management
- **Memory Management**: Cleanup of timeouts and subscriptions

### **Bundle Size**
- **Minimal Dependencies**: Uses existing services and hooks
- **Tree Shaking**: Only imports needed functions
- **Code Splitting**: Lazy imports for heavy dependencies

## Security Considerations

### **Data Privacy**
- **No Sensitive Data Logging**: Error messages contain no private keys or sensitive data
- **Secure Token Management**: JWT tokens handled via SecureTokenManager
- **Input Sanitization**: All user inputs validated and sanitized

### **Authentication Security**
- **NIP-07 Preference**: Prioritizes secure browser extension signing
- **Token Validation**: All API calls include proper authentication
- **Permission Checks**: User permissions validated before operations

## Migration from Mock Implementation

### **Removed Mock Features**
- Hardcoded `userId="current_user_id"`
- Mock npub generation (`npub1${member.id}`)
- Simulated validation responses
- Alert() fallback notifications

### **Added Production Features**
- Real contact API integration
- Production authentication
- Real-time input validation
- Professional toast notifications
- Comprehensive error handling
- Loading state management

The PaymentAutomationModal is now production-ready and provides a comprehensive, secure, and user-friendly interface for creating automated payment schedules with full integration into the existing Satnam platform infrastructure.
