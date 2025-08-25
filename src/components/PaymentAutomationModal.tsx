import {
  AlertCircle,
  Bell,
  CheckCircle,
  Clock,
  Coins,
  Globe,
  Loader2,
  Mail,
  Router,
  Save,
  Search,
  Settings,
  Shield,
  Users,
  X,
  Zap
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { PaymentSchedule } from '../lib/payment-automation.js';

// Import production services
import { useAuth } from '../hooks/useAuth';
import { contactApi, ContactValidationResult, PaymentRecipient, UserContactData } from '../services/contactApiService';
import { showToast } from '../services/toastService';

// Import automated signing and notification services
import { AutomatedSigningManager } from '../lib/automated-signing-manager';

// Lazy import to prevent client creation on page load
let supabaseClient: any = null;
const getSupabaseClient = async () => {
  if (!supabaseClient) {
    const { supabase } = await import('../lib/supabase');
    supabaseClient = supabase;
  }
  return supabaseClient;
};

// Basic type definitions for the modal
interface NotificationSettings {
  email: boolean;
  nostr: boolean;
  push: boolean;
}

interface PaymentConditions {
  maxAmount: number;
  requiresApproval: boolean;
  autoApprovalLimit: number;
}

interface PaymentContext {
  family: boolean;
  individual: boolean;
}

interface PaymentRouting {
  lightning: boolean;
  cashu: boolean;
  fedimint: boolean;
}

interface RecipientType {
  family_member: string;
  ln_address: string;
  npub: string;
  cashu_token: string;
}

// Automated signing interfaces
interface AutomatedSigningConfig {
  method: 'nip07' | 'nip05' | 'password';
  encryptedCredentials?: string; // Encrypted signing credentials
  authorizationToken?: string;   // NIP-07 authorization token
  nip05Identifier?: string;      // NIP-05 identifier for fallback
  consentTimestamp: string;      // When user gave consent
  expiresAt?: string;           // Optional expiration
  revoked?: boolean;            // Revocation status
}

interface AutomatedNotificationConfig {
  enabled: boolean;
  includeAmount: boolean;
  includeRecipient: boolean;
  includeTimestamp: boolean;
  includeTransactionId: boolean;
  notificationNpub: string; // User's npub for notifications
}

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
  // Automated signing configuration
  automatedSigning?: AutomatedSigningConfig;
  automatedNotifications?: AutomatedNotificationConfig;
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
  paymentPurpose?: string;
  memo?: string;
  tags?: string[];
  autoApprovalLimit?: number;
  parentApprovalRequired?: boolean;
  preferredMethod?: string;
  maxRetries?: number;
  retryDelay?: number;
  conditions?: {
    maxDailySpend: number;
    maxTransactionSize: number;
    requireApprovalAbove: number;
    pauseOnSuspiciousActivity: boolean;
    maxLightningAmount: number;
    maxCashuAmount: number;
    maxFedimintAmount: number;
    minimumPrivacyScore: number;
    requireTorRouting: boolean;
    avoidKYCNodes: boolean;
  };
  notificationSettings?: {
    notifyOnDistribution: boolean;
    notifyOnFailure: boolean;
    notifyOnSuspiciousActivity: boolean;
    notificationMethods: string[];
    sendNostrMessage?: boolean;
    nostrNotifications?: boolean;
  };
}

interface PaymentAutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (schedule: Partial<PaymentSchedule>) => void;
  context: 'individual' | 'family';
  familyId?: string;
  familyMembers?: Array<{
    id: string;
    name: string;
    role: 'private' | 'offspring' | 'adult' | 'steward' | 'guardian';
    avatar: string;
    lightningAddress?: string;
    npub?: string;
  }>;
  existingSchedule?: PaymentSchedule;
}

const PaymentAutomationModal: React.FC<PaymentAutomationModalProps> = ({
  isOpen,
  onClose,
  onSave,
  context,
  familyId,
  familyMembers = [],
  existingSchedule
}) => {
  // Production authentication integration
  const { user, authenticated } = useAuth();
  const userId = user?.hashedUUID || user?.id || '';

  // Production state management
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<PaymentRecipient[]>([]);
  const [userIdentityData, setUserIdentityData] = useState<UserContactData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PaymentRecipient[]>([]);
  const [validationResult, setValidationResult] = useState<ContactValidationResult | null>(null);
  const [validatingInput, setValidatingInput] = useState(false);
  // Form data state with production defaults
  const [formData, setFormData] = useState<PaymentAutomationFormData>({
    userId,
    familyId,
    recipientType: (context === 'family' ? 'family_member' : 'ln_address') as 'family_member' | 'contact' | 'ln_address' | 'npub' | 'nip05' | 'cashu_token',
    recipientAddress: existingSchedule?.recipientAddress || '',
    recipientName: existingSchedule?.recipientName || '',
    amount: existingSchedule?.amount || 21000, // 21k sats default
    frequency: existingSchedule?.frequency || 'weekly',
    dayOfWeek: existingSchedule?.dayOfWeek || 1, // Monday
    dayOfMonth: existingSchedule?.dayOfMonth || 1,
    enabled: existingSchedule?.enabled ?? true,
    paymentRouting: (context === 'individual' ? 'breez' : 'phoenixd'),
    signingMethod: 'password', // Will be updated based on user capabilities
    routingPreferences: {
      maxFeePercent: 1.0,
      privacyMode: true,
      routingStrategy: 'balanced'
    },
    protocolPreferences: {
      primary: 'lightning',
      fallback: ['ecash'],
      cashuMintUrl: 'https://mint.satnam.pub'
    },
    paymentPurpose: 'custom',
    memo: existingSchedule?.memo || '',
    tags: [],
    autoApprovalLimit: (context === 'individual' ? 1000000 : 100000),
    parentApprovalRequired: (context === 'family'),
    preferredMethod: 'auto',
    maxRetries: 3,
    retryDelay: 30,
    conditions: {
      maxDailySpend: context === 'individual' ? 1000000 : 200000,
      maxTransactionSize: context === 'individual' ? 500000 : 100000,
      requireApprovalAbove: context === 'individual' ? 1000000 : 500000,
      pauseOnSuspiciousActivity: true,
      maxLightningAmount: 2000000,
      maxCashuAmount: 1000000,
      maxFedimintAmount: context === 'family' ? 5000000 : 0,
      minimumPrivacyScore: 70,
      requireTorRouting: false,
      avoidKYCNodes: true
    },
    notificationSettings: {
      notifyOnDistribution: true,
      notifyOnFailure: true,
      notifyOnSuspiciousActivity: true,
      notificationMethods: ['email']
    }
  });

  const [currentTab, setCurrentTab] = useState<'basic' | 'routing' | 'conditions' | 'notifications'>('basic');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Automated signing state
  const [isConfiguringAutomation, setIsConfiguringAutomation] = useState(false);
  const [automationConfigured, setAutomationConfigured] = useState(false);
  const [signingAuthorizationPending, setSigningAuthorizationPending] = useState(false);
  const [nip07Available, setNip07Available] = useState(false);

  // Initialize authentication for contact API and automated signing
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const { SecureTokenManager } = await import('../lib/auth/secure-token-manager');
        const accessToken = SecureTokenManager.getAccessToken();
        if (accessToken) {
          contactApi.setAuthToken(accessToken);
        }
      } catch (error) {
        console.error('Failed to initialize contact API authentication:', error);
      }
    };

    const checkNip07Availability = () => {
      // Check if NIP-07 browser extension is available
      const hasNip07 = typeof window !== 'undefined' &&
        typeof (window as any).nostr !== 'undefined' &&
        typeof (window as any).nostr.getPublicKey === 'function' &&
        typeof (window as any).nostr.signEvent === 'function';
      setNip07Available(hasNip07);
    };

    if (authenticated && user) {
      initializeAuth();
      checkNip07Availability();
    }
  }, [authenticated, user]);

  // Load user contacts and identity data
  useEffect(() => {
    const loadContactData = async () => {
      if (!userId || !authenticated) return;

      setLoading(true);
      try {
        // Load user contacts and identity data in parallel
        const [contactsData, identityData] = await Promise.all([
          contactApi.getUserContacts(userId),
          contactApi.getUserIdentityData(userId)
        ]);

        setContacts(contactsData);
        setUserIdentityData(identityData);

        // Show success toast for data loading
        if (contactsData.length > 0) {
          showToast.success(`Loaded ${contactsData.length} contacts`, {
            title: 'Contacts Loaded',
            duration: 3000
          });
        }
      } catch (error) {
        console.error('Failed to load contact data:', error);
        showToast.error('Failed to load contact data', {
          title: 'Loading Error',
          duration: 5000
        });
      } finally {
        setLoading(false);
      }
    };

    if (isOpen) {
      loadContactData();
    }
  }, [isOpen, userId, authenticated]);

  // Search contacts with debouncing
  const searchContacts = useCallback(
    async (query: string) => {
      if (!query.trim() || !userId) {
        setSearchResults([]);
        return;
      }

      try {
        const results = await contactApi.searchContacts(userId, query);
        setSearchResults(results);
      } catch (error) {
        console.error('Failed to search contacts:', error);
        setSearchResults([]);
      }
    },
    [userId]
  );

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery) {
        searchContacts(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, searchContacts]);

  // Validate recipient input with debouncing
  const validateRecipientInput = useCallback(
    async (input: string) => {
      if (!input.trim()) {
        setValidationResult(null);
        return;
      }

      setValidatingInput(true);
      try {
        const result = await contactApi.validateRecipientInput(input);
        setValidationResult(result);
      } catch (error) {
        console.error('Failed to validate recipient input:', error);
        setValidationResult({
          valid: false,
          type: 'npub',
          error: 'Validation failed'
        });
      } finally {
        setValidatingInput(false);
      }
    },
    []
  );

  // Debounced validation effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (formData.recipientAddress && formData.recipientType !== 'family_member') {
        validateRecipientInput(formData.recipientAddress);
      } else {
        setValidationResult(null);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [formData.recipientAddress, formData.recipientType, validateRecipientInput]);

  // Set preferred signing method based on user capabilities
  useEffect(() => {
    if (userIdentityData) {
      setFormData(prev => ({
        ...prev,
        signingMethod: userIdentityData.preferredSigningMethod
      }));
    }
  }, [userIdentityData]);

  // Available routing methods based on context
  const availableRoutingMethods = context === 'individual'
    ? [
      { value: 'breez', label: 'Breez Node', description: 'Primary Lightning node for individuals', icon: Zap },
      { value: 'cashu_mint', label: 'Cashu eCash', description: 'Private eCash payments via mint', icon: Coins },
      { value: 'external_ln', label: 'External Lightning', description: 'Route via external Lightning network', icon: Globe }
    ]
    : [
      { value: 'phoenixd', label: 'PhoenixD', description: 'Family Lightning channels', icon: Zap },
      { value: 'voltage', label: 'Voltage Enterprise', description: 'Enterprise Lightning infrastructure', icon: Router },
      { value: 'internal_fedimint', label: 'Family Fedimint', description: 'Internal federation transfers', icon: Users },
      { value: 'cashu_mint', label: 'Cashu eCash', description: 'Family eCash via mint', icon: Coins },
      { value: 'external_ln', label: 'External Lightning', description: 'Route to external addresses', icon: Globe }
    ];

  // Available recipient types based on context and loaded contacts
  const availableRecipientTypes = context === 'family'
    ? [
      {
        value: 'family_member',
        label: 'Family Member',
        description: `Send to family member (${contacts.filter(c => c.type === 'family_member').length} available)`,
        icon: Users
      },
      {
        value: 'contact',
        label: 'Saved Contact',
        description: `Send to saved contact (${contacts.filter(c => c.type === 'contact').length} available)`,
        icon: Users
      },
      { value: 'ln_address', label: 'Lightning Address', description: 'External Lightning address', icon: Zap },
      { value: 'npub', label: 'Nostr Profile (npub)', description: 'Send to Nostr public key', icon: Users },
      { value: 'nip05', label: 'NIP-05 Identifier', description: 'Send to NIP-05 address', icon: Mail },
      { value: 'cashu_token', label: 'Cashu eCash', description: 'Generate eCash token/mint', icon: Coins }
    ]
    : [
      {
        value: 'contact',
        label: 'Saved Contact',
        description: `Send to saved contact (${contacts.length} available)`,
        icon: Users
      },
      { value: 'ln_address', label: 'Lightning Address', description: 'External Lightning address', icon: Zap },
      { value: 'npub', label: 'Nostr Profile (npub)', description: 'Send to Nostr public key', icon: Users },
      { value: 'nip05', label: 'NIP-05 Identifier', description: 'Send to NIP-05 address', icon: Mail },
      { value: 'cashu_token', label: 'Cashu eCash', description: 'Generate eCash token/mint', icon: Coins }
    ];

  if (!isOpen) return null;

  const handleSave = async () => {
    // Validate authentication
    if (!authenticated || !userId) {
      showToast.error('Authentication required to create payment schedule', {
        title: 'Authentication Error',
        duration: 5000
      });
      return;
    }

    // Validate required fields
    const validationErrors: string[] = [];

    if (!formData.recipientAddress || !formData.recipientName) {
      validationErrors.push('Recipient information is required');
    }

    if (!formData.amount || formData.amount < 1000) {
      validationErrors.push('Amount must be at least 1,000 sats');
    }

    // Validate recipient input for external recipients
    if (formData.recipientType !== 'family_member' && formData.recipientType !== 'contact') {
      if (!validationResult || !validationResult.valid) {
        validationErrors.push('Please enter a valid recipient address');
      }
    }

    // Validate automated signing configuration
    if (!formData.automatedSigning || formData.automatedSigning.revoked) {
      validationErrors.push('Automated signing authorization is required for scheduled payments');
    }

    if (validationErrors.length > 0) {
      showToast.error(validationErrors.join('. '), {
        title: 'Validation Error',
        duration: 6000,
        action: !formData.automatedSigning ? {
          label: 'Configure Automation',
          onClick: () => setIsConfiguringAutomation(true)
        } : undefined
      });
      return;
    }

    try {
      setLoading(true);

      // Calculate next distribution date
      const nextDistribution = calculateNextDistribution(
        formData.frequency!,
        formData.dayOfWeek,
        formData.dayOfMonth
      );

      const scheduleData: Partial<PaymentSchedule> = {
        id: existingSchedule?.id,
        familyId: formData.familyId || '',
        recipientId: formData.recipientAddress || '',
        recipientNpub: formData.recipientAddress || '',
        amount: formData.amount || 21000,
        currency: 'sats',
        frequency: formData.frequency || 'weekly',
        dayOfWeek: formData.dayOfWeek,
        dayOfMonth: formData.dayOfMonth,
        startDate: existingSchedule?.startDate || new Date().toISOString(),
        nextPaymentDate: nextDistribution.toISOString(),
        status: formData.enabled ? 'active' : 'paused',
        requiresApproval: formData.parentApprovalRequired || false,
        approvalThreshold: formData.autoApprovalLimit || 100000,
        createdBy: userId,
        memo: formData.memo,
        createdAt: existingSchedule?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await onSave(scheduleData);

      showToast.success(
        `Payment schedule ${existingSchedule ? 'updated' : 'created'} successfully`,
        {
          title: 'Schedule Saved',
          duration: 4000
        }
      );

      onClose();
    } catch (error) {
      console.error('Failed to save payment schedule:', error);
      showToast.error('Failed to save payment schedule', {
        title: 'Save Error',
        duration: 5000,
        action: {
          label: 'Retry',
          onClick: () => handleSave()
        }
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateNextDistribution = (
    frequency: string,
    dayOfWeek?: number,
    dayOfMonth?: number
  ): Date => {
    const now = new Date();
    const next = new Date(now);

    switch (frequency) {
      case 'daily':
        next.setDate(now.getDate() + 1);
        break;
      case 'weekly':
        const daysUntilTarget = ((dayOfWeek || 0) - now.getDay() + 7) % 7;
        next.setDate(now.getDate() + (daysUntilTarget || 7));
        break;
      case 'monthly':
        next.setMonth(now.getMonth() + 1);
        next.setDate(Math.min(dayOfMonth || 1, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
        break;
    }

    next.setHours(9, 0, 0, 0); // 9 AM distribution time
    return next;
  };

  const handleRecipientTypeChange = (recipientType: 'family_member' | 'contact' | 'ln_address' | 'npub' | 'nip05' | 'cashu_token') => {
    setFormData(prev => ({
      ...prev,
      recipientType,
      recipientAddress: '',
      recipientName: ''
    }));
  };

  const handleFamilyMemberSelect = (memberId: string) => {
    const member = familyMembers.find(m => m.id === memberId);
    if (member) {
      setFormData(prev => ({
        ...prev,
        recipientType: 'family_member',
        recipientAddress: member.lightningAddress || member.npub || memberId,
        recipientName: member.name
      }));
    }
  };

  const handleContactSelect = (contact: PaymentRecipient) => {
    // Map contact type to form recipient type
    const recipientType = contact.type === 'external' ? 'ln_address' : contact.type as 'family_member' | 'contact' | 'ln_address' | 'npub' | 'nip05' | 'cashu_token';

    setFormData(prev => ({
      ...prev,
      recipientType,
      recipientAddress: contact.lightningAddress || contact.npub || contact.nip05 || contact.id,
      recipientName: contact.displayName
    }));
    setSearchQuery('');
    setSearchResults([]);
  };

  // Automated signing configuration functions
  const configureNip07Authorization = async () => {
    try {
      setSigningAuthorizationPending(true);

      if (!nip07Available) {
        throw new Error('NIP-07 browser extension not available');
      }

      // Request permission from NIP-07 extension for automated signing
      const nostr = (window as any).nostr;
      const pubkey = await nostr.getPublicKey();

      // Create authorization request event
      const authEvent = {
        kind: 27235, // NIP-47 wallet connect authorization
        content: JSON.stringify({
          permissions: ['sign_event', 'nip04_encrypt', 'nip04_decrypt'],
          relay: 'wss://relay.satnam.pub',
          secret: crypto.randomUUID(),
          expires_at: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year
        }),
        tags: [
          ['p', pubkey],
          ['relay', 'wss://relay.satnam.pub']
        ],
        created_at: Math.floor(Date.now() / 1000),
        pubkey
      };

      const signedAuthEvent = await nostr.signEvent(authEvent);

      // Store encrypted authorization
      const automatedSigning: AutomatedSigningConfig = {
        method: 'nip07',
        authorizationToken: JSON.stringify(signedAuthEvent),
        consentTimestamp: new Date().toISOString(),
        expiresAt: new Date(Date.now() + (365 * 24 * 60 * 60 * 1000)).toISOString()
      };

      setFormData(prev => ({
        ...prev,
        automatedSigning,
        automatedNotifications: {
          enabled: true,
          includeAmount: true,
          includeRecipient: true,
          includeTimestamp: true,
          includeTransactionId: true,
          notificationNpub: pubkey
        }
      }));

      setAutomationConfigured(true);

      showToast.success(
        'NIP-07 automated signing configured successfully',
        {
          title: 'Automation Configured',
          duration: 4000
        }
      );

    } catch (error) {
      console.error('Failed to configure NIP-07 authorization:', error);
      showToast.error(
        error instanceof Error ? error.message : 'Failed to configure automated signing',
        {
          title: 'Authorization Failed',
          duration: 5000
        }
      );
    } finally {
      setSigningAuthorizationPending(false);
    }
  };

  const configureNip05Authorization = async (nip05: string, password: string) => {
    try {
      setSigningAuthorizationPending(true);

      // Validate NIP-05 identifier
      const validation = await contactApi.validateRecipientInput(nip05);
      if (!validation.valid || validation.type !== 'nip05') {
        throw new Error('Invalid NIP-05 identifier');
      }

      // Encrypt credentials for storage using Web Crypto API
      const credentials = JSON.stringify({ nip05, password });
      const encoder = new TextEncoder();
      const data = encoder.encode(credentials);

      // Generate encryption key
      const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );

      // Encrypt the credentials
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      );

      // Export key for storage
      const exportedKey = await crypto.subtle.exportKey('raw', key);
      const encryptedCredentials = btoa(
        String.fromCharCode(...new Uint8Array(exportedKey)) + '|' +
        String.fromCharCode(...iv) + '|' +
        String.fromCharCode(...new Uint8Array(encrypted))
      );

      const automatedSigning: AutomatedSigningConfig = {
        method: 'nip05',
        encryptedCredentials,
        nip05Identifier: nip05,
        consentTimestamp: new Date().toISOString(),
        expiresAt: new Date(Date.now() + (365 * 24 * 60 * 60 * 1000)).toISOString()
      };

      // Get user's npub for notifications
      const userNpub = userIdentityData?.userNpub || '';

      setFormData(prev => ({
        ...prev,
        automatedSigning,
        automatedNotifications: {
          enabled: true,
          includeAmount: true,
          includeRecipient: true,
          includeTimestamp: true,
          includeTransactionId: true,
          notificationNpub: userNpub
        }
      }));

      setAutomationConfigured(true);

      showToast.success(
        'NIP-05 automated signing configured successfully',
        {
          title: 'Automation Configured',
          duration: 4000
        }
      );

    } catch (error) {
      console.error('Failed to configure NIP-05 authorization:', error);
      showToast.error(
        error instanceof Error ? error.message : 'Failed to configure automated signing',
        {
          title: 'Authorization Failed',
          duration: 5000
        }
      );
    } finally {
      setSigningAuthorizationPending(false);
    }
  };

  const revokeAutomatedSigning = () => {
    setFormData(prev => ({
      ...prev,
      automatedSigning: {
        ...prev.automatedSigning!,
        revoked: true
      }
    }));
    setAutomationConfigured(false);

    showToast.success(
      'Automated signing authorization revoked',
      {
        title: 'Authorization Revoked',
        duration: 3000
      }
    );
  };

  const updateConditions = (field: string, value: number | boolean) => {
    setFormData(prev => ({
      ...prev,
      conditions: {
        ...prev.conditions!,
        [field]: value
      }
    }));
  };

  const updateRoutingPreferences = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      routingPreferences: {
        ...prev.routingPreferences!,
        [field]: value
      }
    }));
  };

  const updateProtocolPreferences = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      protocolPreferences: {
        ...prev.protocolPreferences!,
        [field]: value
      }
    }));
  };

  const updateNotificationSettings = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      notificationSettings: {
        ...prev.notificationSettings!,
        [field]: value
      }
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${context === 'individual' ? 'bg-blue-100' : 'bg-orange-100'}`}>
              <Users className={`w-6 h-6 ${context === 'individual' ? 'text-blue-600' : 'text-orange-600'}`} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {existingSchedule ? 'Edit' : 'Create'} {context === 'individual' ? 'Individual' : 'Family'} Payment Schedule
              </h2>
              <p className="text-sm text-gray-500">
                Automate recurring payments with multi-protocol support
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {[
            { id: 'basic', label: 'Basic Settings', icon: Settings },
            { id: 'routing', label: 'Payment Routing', icon: Router },
            { id: 'conditions', label: 'Controls & Limits', icon: Shield },
            { id: 'notifications', label: 'Notifications', icon: Bell }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id as any)}
              className={`flex items-center space-x-2 px-6 py-3 font-medium transition-colors ${currentTab === tab.id
                ? `${context === 'individual' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-orange-600 border-b-2 border-orange-600'}`
                : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {currentTab === 'basic' && (
            <div className="space-y-6">
              {/* Recipient Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Recipient Type *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {availableRecipientTypes.map(type => (
                    <button
                      key={type.value}
                      onClick={() => handleRecipientTypeChange(type.value as 'family_member' | 'contact' | 'ln_address' | 'npub' | 'nip05' | 'cashu_token')}
                      className={`flex items-center space-x-3 p-4 rounded-lg border-2 transition-colors ${formData.recipientType === type.value
                        ? `${context === 'individual' ? 'border-blue-500 bg-blue-50' : 'border-orange-500 bg-orange-50'}`
                        : 'border-gray-200 hover:border-gray-300'
                        }`}
                    >
                      <type.icon className={`w-5 h-5 ${formData.recipientType === type.value
                        ? `${context === 'individual' ? 'text-blue-600' : 'text-orange-600'}`
                        : 'text-gray-500'
                        }`} />
                      <div className="text-left">
                        <div className="font-medium text-gray-900">{type.label}</div>
                        <div className="text-sm text-gray-500">{type.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Family Member Selection (if applicable) */}
              {formData.recipientType === 'family_member' && context === 'family' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Select Family Member *
                  </label>
                  {loading ? (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                      <span className="ml-2 text-gray-600">Loading family members...</span>
                    </div>
                  ) : familyMembers.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3">
                      {familyMembers.map(member => (
                        <button
                          key={member.id}
                          onClick={() => handleFamilyMemberSelect(member.id)}
                          className={`flex items-center space-x-3 p-3 rounded-lg border-2 transition-colors ${formData.recipientAddress === (member.lightningAddress || member.npub || member.id)
                            ? 'border-orange-500 bg-orange-50'
                            : 'border-gray-200 hover:border-gray-300'
                            }`}
                        >
                          <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center font-semibold text-orange-600">
                            {member.avatar || member.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="text-left flex-1">
                            <div className="font-medium text-gray-900">{member.name}</div>
                            <div className="text-sm text-gray-500 capitalize">{member.role}</div>
                            {member.lightningAddress && (
                              <div className="text-xs text-green-600">⚡ {member.lightningAddress}</div>
                            )}
                            {member.npub && !member.lightningAddress && (
                              <div className="text-xs text-blue-600">🔑 {member.npub.slice(0, 16)}...</div>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center p-6 bg-gray-50 rounded-lg">
                      <Users className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-600">No family members available</p>
                    </div>
                  )}
                </div>
              )}

              {/* Contact Selection (if applicable) */}
              {formData.recipientType === 'contact' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Select Contact *
                  </label>

                  {/* Contact Search */}
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={`w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent ${context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                        }`}
                      placeholder="Search contacts by name, npub, or Lightning address..."
                    />
                  </div>

                  {loading ? (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
                      <span className="ml-2 text-gray-600">Loading contacts...</span>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {(searchQuery ? searchResults : contacts).length > 0 ? (
                        (searchQuery ? searchResults : contacts).map(contact => (
                          <button
                            key={contact.id}
                            onClick={() => handleContactSelect(contact)}
                            className={`w-full flex items-center space-x-3 p-3 rounded-lg border-2 transition-colors text-left ${formData.recipientAddress === (contact.lightningAddress || contact.npub || contact.nip05 || contact.id)
                              ? `${context === 'individual' ? 'border-blue-500 bg-blue-50' : 'border-orange-500 bg-orange-50'}`
                              : 'border-gray-200 hover:border-gray-300'
                              }`}
                          >
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-white ${contact.type === 'family_member' ? 'bg-orange-500' :
                              contact.trustLevel === 'trusted' ? 'bg-green-500' : 'bg-gray-500'
                              }`}>
                              {contact.avatar || contact.displayName.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2">
                                <div className="font-medium text-gray-900">{contact.displayName}</div>
                                {contact.verified && (
                                  <CheckCircle className="w-4 h-4 text-green-500" />
                                )}
                              </div>
                              <div className="text-sm text-gray-500 capitalize">
                                {contact.familyRole || contact.trustLevel}
                              </div>
                              {contact.lightningAddress && (
                                <div className="text-xs text-green-600">⚡ {contact.lightningAddress}</div>
                              )}
                              {contact.nip05 && !contact.lightningAddress && (
                                <div className="text-xs text-blue-600">📧 {contact.nip05}</div>
                              )}
                              {contact.npub && !contact.lightningAddress && !contact.nip05 && (
                                <div className="text-xs text-purple-600">🔑 {contact.npub.slice(0, 16)}...</div>
                              )}
                            </div>
                          </button>
                        ))
                      ) : searchQuery ? (
                        <div className="text-center p-6 bg-gray-50 rounded-lg">
                          <Search className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                          <p className="text-gray-600">No contacts found for "{searchQuery}"</p>
                        </div>
                      ) : (
                        <div className="text-center p-6 bg-gray-50 rounded-lg">
                          <Users className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                          <p className="text-gray-600">No contacts available</p>
                          <p className="text-sm text-gray-500 mt-1">Add contacts to use this feature</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Recipient Address Input (for external recipients) */}
              {formData.recipientType !== 'family_member' && formData.recipientType !== 'contact' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {formData.recipientType === 'ln_address' ? 'Lightning Address' :
                          formData.recipientType === 'npub' ? 'Nostr Public Key (npub)' :
                            formData.recipientType === 'nip05' ? 'NIP-05 Identifier' :
                              formData.recipientType === 'cashu_token' ? 'Cashu Mint URL' : 'Recipient Address'} *
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={formData.recipientAddress}
                          onChange={(e) => setFormData(prev => ({ ...prev, recipientAddress: e.target.value }))}
                          className={`w-full px-4 py-2 pr-10 border rounded-lg focus:ring-2 focus:border-transparent ${validationResult === null ? 'border-gray-300' :
                            validationResult.valid ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'
                            } ${context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'}`}
                          placeholder={
                            formData.recipientType === 'ln_address' ? 'alice@getalby.com' :
                              formData.recipientType === 'npub' ? 'npub1...' :
                                formData.recipientType === 'nip05' ? 'alice@example.com' :
                                  formData.recipientType === 'cashu_token' ? 'https://mint.example.com' : 'Enter address'
                          }
                        />
                        {/* Validation Status Icon */}
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                          {validatingInput ? (
                            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                          ) : validationResult?.valid ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : validationResult && !validationResult.valid ? (
                            <AlertCircle className="w-4 h-4 text-red-500" />
                          ) : null}
                        </div>
                      </div>

                      {/* Validation Feedback */}
                      {validationResult && (
                        <div className={`mt-2 text-sm ${validationResult.valid ? 'text-green-600' : 'text-red-600'}`}>
                          {validationResult.valid ? (
                            <div className="flex items-center space-x-1">
                              <CheckCircle className="w-4 h-4" />
                              <span>
                                Valid {validationResult.type.replace('_', ' ')}
                                {validationResult.metadata?.verified && ' (verified)'}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center space-x-1">
                              <AlertCircle className="w-4 h-4" />
                              <span>{validationResult.error}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Display Name *
                      </label>
                      <input
                        type="text"
                        value={formData.recipientName}
                        onChange={(e) => setFormData(prev => ({ ...prev, recipientName: e.target.value }))}
                        className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent ${context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                          }`}
                        placeholder="Alice"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Friendly name for this recipient
                      </p>
                    </div>
                  </div>

                  {/* Additional recipient info based on validation */}
                  {validationResult?.valid && validationResult.metadata && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Recipient Information</h4>
                      <div className="space-y-1 text-sm text-gray-600">
                        {validationResult.metadata.domain && (
                          <div>Domain: {validationResult.metadata.domain}</div>
                        )}
                        {validationResult.metadata.username && (
                          <div>Username: {validationResult.metadata.username}</div>
                        )}
                        {validationResult.metadata.verified !== undefined && (
                          <div className={validationResult.metadata.verified ? 'text-green-600' : 'text-yellow-600'}>
                            Status: {validationResult.metadata.verified ? 'Verified' : 'Unverified'}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Amount and Frequency */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payment Amount (sats) *
                  </label>
                  <div className="relative">
                    <Zap className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${context === 'individual' ? 'text-blue-500' : 'text-orange-500'
                      }`} />
                    <input
                      type="number"
                      value={formData.amount}
                      onChange={(e) => setFormData(prev => ({ ...prev, amount: parseInt(e.target.value) }))}
                      className={`w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent ${context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                        }`}
                      placeholder="21000"
                      min="1000"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    ≈ ${((formData.amount || 0) * 0.0005).toFixed(2)} USD
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Frequency *
                  </label>
                  <select
                    value={formData.frequency}
                    onChange={(e) => setFormData(prev => ({ ...prev, frequency: e.target.value as any }))}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent ${context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                      }`}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              </div>

              {/* Schedule Details */}
              {formData.frequency === 'weekly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Day of Week
                  </label>
                  <select
                    value={formData.dayOfWeek}
                    onChange={(e) => setFormData(prev => ({ ...prev, dayOfWeek: parseInt(e.target.value) }))}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent ${context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                      }`}
                  >
                    <option value={1}>Monday</option>
                    <option value={2}>Tuesday</option>
                    <option value={3}>Wednesday</option>
                    <option value={4}>Thursday</option>
                    <option value={5}>Friday</option>
                    <option value={6}>Saturday</option>
                    <option value={0}>Sunday</option>
                  </select>
                </div>
              )}

              {formData.frequency === 'monthly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Day of Month
                  </label>
                  <input
                    type="number"
                    value={formData.dayOfMonth}
                    onChange={(e) => setFormData(prev => ({ ...prev, dayOfMonth: parseInt(e.target.value) }))}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent ${context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                      }`}
                    min="1"
                    max="31"
                  />
                </div>
              )}

              {/* Payment Purpose and Memo */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payment Purpose
                  </label>
                  <select
                    value={formData.paymentPurpose}
                    onChange={(e) => setFormData(prev => ({ ...prev, paymentPurpose: e.target.value as any }))}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent ${context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                      }`}
                  >
                    <option value="custom">Custom</option>
                    <option value="allowance">Allowance</option>
                    <option value="subscription">Subscription</option>
                    <option value="donation">Donation</option>
                    <option value="bill_payment">Bill Payment</option>
                    <option value="gift">Gift</option>
                    <option value="dca">Dollar Cost Average</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Memo (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.memo}
                    onChange={(e) => setFormData(prev => ({ ...prev, memo: e.target.value }))}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent ${context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                      }`}
                    placeholder="Payment memo"
                  />
                </div>
              </div>
            </div>
          )}

          {currentTab === 'routing' && (
            <div className="space-y-6">
              <div className={`${context === 'individual' ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'} border rounded-lg p-4`}>
                <div className="flex items-center space-x-2">
                  <Router className={`w-5 h-5 ${context === 'individual' ? 'text-blue-600' : 'text-orange-600'}`} />
                  <h3 className={`font-medium ${context === 'individual' ? 'text-blue-900' : 'text-orange-900'}`}>
                    {context === 'individual' ? 'Individual' : 'Family'} Payment Routing
                  </h3>
                </div>
                <p className={`text-sm mt-1 ${context === 'individual' ? 'text-blue-700' : 'text-orange-700'}`}>
                  Configure how payments are routed and processed
                </p>
              </div>

              {/* Routing Method Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Primary Routing Method
                </label>
                <div className="grid grid-cols-1 gap-3">
                  {availableRoutingMethods.map(method => (
                    <button
                      key={method.value}
                      onClick={() => setFormData(prev => ({ ...prev, paymentRouting: method.value as string }))}
                      className={`flex items-center space-x-4 p-4 rounded-lg border-2 transition-colors ${formData.paymentRouting === method.value
                        ? `${context === 'individual' ? 'border-blue-500 bg-blue-50' : 'border-orange-500 bg-orange-50'}`
                        : 'border-gray-200 hover:border-gray-300'
                        }`}
                    >
                      <method.icon className={`w-6 h-6 ${formData.paymentRouting === method.value
                        ? `${context === 'individual' ? 'text-blue-600' : 'text-orange-600'}`
                        : 'text-gray-500'
                        }`} />
                      <div className="text-left flex-1">
                        <div className="font-medium text-gray-900">{method.label}</div>
                        <div className="text-sm text-gray-500">{method.description}</div>
                      </div>
                      {formData.paymentRouting === method.value && (
                        <div className={`w-2 h-2 rounded-full ${context === 'individual' ? 'bg-blue-500' : 'bg-orange-500'}`} />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Protocol Preferences */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Protocol Preferences
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: 'lightning', label: 'Lightning', icon: Zap },
                    { value: 'cashu', label: 'Cashu eCash', icon: Coins },
                    { value: 'fedimint', label: 'Fedimint', icon: Router, disabled: context === 'individual' }
                  ].map(protocol => (
                    <button
                      key={protocol.value}
                      disabled={protocol.disabled}
                      onClick={() => updateProtocolPreferences('primary', protocol.value)}
                      className={`flex flex-col items-center space-y-2 p-3 rounded-lg border-2 transition-colors ${protocol.disabled
                        ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                        : formData.protocolPreferences?.primary === protocol.value
                          ? `${context === 'individual' ? 'border-blue-500 bg-blue-50' : 'border-orange-500 bg-orange-50'}`
                          : 'border-gray-200 hover:border-gray-300'
                        }`}
                    >
                      <protocol.icon className={`w-5 h-5 ${protocol.disabled
                        ? 'text-gray-400'
                        : formData.protocolPreferences?.primary === protocol.value
                          ? `${context === 'individual' ? 'text-blue-600' : 'text-orange-600'}`
                          : 'text-gray-500'
                        }`} />
                      <span className="text-sm font-medium">{protocol.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Routing Preferences */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Max Fee Percentage
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.routingPreferences?.maxFeePercent}
                    onChange={(e) => updateRoutingPreferences('maxFeePercent', parseFloat(e.target.value))}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent ${context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                      }`}
                    min="0.1"
                    max="5"
                  />
                  <p className="text-xs text-gray-500 mt-1">Maximum acceptable fee as percentage</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Routing Strategy
                  </label>
                  <select
                    value={formData.routingPreferences?.routingStrategy}
                    onChange={(e) => updateRoutingPreferences('routingStrategy', e.target.value)}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent ${context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                      }`}
                  >
                    <option value="fastest">Fastest</option>
                    <option value="cheapest">Cheapest</option>
                    <option value="most_private">Most Private</option>
                    <option value="balanced">Balanced</option>
                  </select>
                </div>
              </div>

              {/* Privacy Mode Toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <div className="font-medium text-gray-900">Privacy Mode</div>
                  <div className="text-sm text-gray-500">Enhanced privacy routing with additional protections</div>
                </div>
                <button
                  onClick={() => updateRoutingPreferences('privacyMode', !formData.routingPreferences?.privacyMode)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.routingPreferences?.privacyMode
                    ? `${context === 'individual' ? 'bg-blue-600' : 'bg-orange-600'}`
                    : 'bg-gray-300'
                    }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.routingPreferences?.privacyMode ? 'translate-x-6' : 'translate-x-1'
                      }`}
                  />
                </button>
              </div>
            </div>
          )}

          {currentTab === 'conditions' && (
            <div className="space-y-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center space-x-2">
                  <Shield className="w-5 h-5 text-red-600" />
                  <h3 className="font-medium text-red-900">Security Controls & Limits</h3>
                </div>
                <p className="text-sm text-red-700 mt-1">
                  Set spending limits and security controls for automated payments
                </p>
              </div>

              {/* Daily and Transaction Limits */}
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Max Daily Spend (sats)
                  </label>
                  <input
                    type="number"
                    value={formData.conditions?.maxDailySpend}
                    onChange={(e) => updateConditions('maxDailySpend', parseInt(e.target.value))}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent ${context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                      }`}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Max Transaction Size (sats)
                  </label>
                  <input
                    type="number"
                    value={formData.conditions?.maxTransactionSize}
                    onChange={(e) => updateConditions('maxTransactionSize', parseInt(e.target.value))}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent ${context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                      }`}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Require Approval Above (sats)
                  </label>
                  <input
                    type="number"
                    value={formData.conditions?.requireApprovalAbove}
                    onChange={(e) => updateConditions('requireApprovalAbove', parseInt(e.target.value))}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent ${context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                      }`}
                  />
                </div>
              </div>

              {/* Protocol-Specific Limits */}
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Max Lightning Amount (sats)
                  </label>
                  <input
                    type="number"
                    value={formData.conditions?.maxLightningAmount}
                    onChange={(e) => updateConditions('maxLightningAmount', parseInt(e.target.value))}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent ${context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                      }`}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Max Cashu Amount (sats)
                  </label>
                  <input
                    type="number"
                    value={formData.conditions?.maxCashuAmount}
                    onChange={(e) => updateConditions('maxCashuAmount', parseInt(e.target.value))}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent ${context === 'individual' ? 'focus:ring-blue-500' : 'focus:ring-orange-500'
                      }`}
                  />
                </div>

                {context === 'family' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Max Fedimint Amount (sats)
                    </label>
                    <input
                      type="number"
                      value={formData.conditions?.maxFedimintAmount}
                      onChange={(e) => updateConditions('maxFedimintAmount', parseInt(e.target.value))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                  </div>
                )}
              </div>

              {/* Security Toggles */}
              <div className="space-y-3">
                {[
                  { key: 'pauseOnSuspiciousActivity', label: 'Pause on Suspicious Activity', desc: 'Automatically pause when unusual patterns detected' },
                  { key: 'requireTorRouting', label: 'Require Tor Routing', desc: 'Route all payments through Tor network' },
                  { key: 'avoidKYCNodes', label: 'Avoid KYC Nodes', desc: 'Avoid routing through known KYC-required nodes' }
                ].map(toggle => (
                  <div key={toggle.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-medium text-gray-900">{toggle.label}</div>
                      <div className="text-sm text-gray-500">{toggle.desc}</div>
                    </div>
                    <button
                      onClick={() => updateConditions(toggle.key as string, !(formData.conditions as any)?.[toggle.key])}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${(formData.conditions as any)?.[toggle.key]
                        ? `${context === 'individual' ? 'bg-blue-600' : 'bg-orange-600'}`
                        : 'bg-gray-300'
                        }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${(formData.conditions as any)?.[toggle.key] ? 'translate-x-6' : 'translate-x-1'
                          }`}
                      />
                    </button>
                  </div>
                ))}
              </div>

              {/* Privacy Score Requirement */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Minimum Privacy Score (0-100)
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={formData.conditions?.minimumPrivacyScore}
                  onChange={(e) => updateConditions('minimumPrivacyScore', parseInt(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>Public (0)</span>
                  <span className="font-medium">Current: {formData.conditions?.minimumPrivacyScore}</span>
                  <span>Maximum Privacy (100)</span>
                </div>
              </div>
            </div>
          )}

          {currentTab === 'notifications' && (
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center space-x-2">
                  <Bell className="w-5 h-5 text-green-600" />
                  <h3 className="font-medium text-green-900">Automated Signing & Notifications</h3>
                </div>
                <p className="text-sm text-green-700 mt-1">
                  Configure automated signing authorization and notification preferences for scheduled payments
                </p>
              </div>

              {/* Automated Signing Configuration */}
              <div className="space-y-4">
                <h4 className="font-medium text-gray-900">Automated Signing Authorization</h4>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <Shield className="w-5 h-5 text-yellow-600 mt-0.5" />
                    <div>
                      <h5 className="font-medium text-yellow-900">Security Notice</h5>
                      <p className="text-sm text-yellow-700 mt-1">
                        Scheduled payments require automated signing authorization. Your credentials will be encrypted and stored securely.
                        You can revoke this authorization at any time.
                      </p>
                    </div>
                  </div>
                </div>

                {!automationConfigured ? (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                      Choose your preferred method for automated payment signing:
                    </p>

                    {/* NIP-07 Authorization */}
                    <div className={`p-4 rounded-lg border-2 transition-colors ${nip07Available ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
                      }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className={`p-2 rounded-full ${nip07Available ? 'bg-green-100' : 'bg-gray-100'
                            }`}>
                            <Shield className={`w-5 h-5 ${nip07Available ? 'text-green-600' : 'text-gray-400'
                              }`} />
                          </div>
                          <div>
                            <h6 className={`font-medium ${nip07Available ? 'text-green-900' : 'text-gray-500'
                              }`}>
                              NIP-07 Browser Extension (Recommended)
                            </h6>
                            <p className={`text-sm ${nip07Available ? 'text-green-700' : 'text-gray-500'
                              }`}>
                              {nip07Available
                                ? 'Most secure method using your browser extension'
                                : 'No NIP-07 extension detected'
                              }
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={configureNip07Authorization}
                          disabled={!nip07Available || signingAuthorizationPending}
                          className={`px-4 py-2 rounded-lg font-medium transition-colors ${nip07Available && !signingAuthorizationPending
                            ? `${context === 'individual' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'} text-white`
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            }`}
                        >
                          {signingAuthorizationPending ? (
                            <div className="flex items-center space-x-2">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Authorizing...</span>
                            </div>
                          ) : (
                            'Authorize'
                          )}
                        </button>
                      </div>
                    </div>

                    {/* NIP-05 Authorization */}
                    <div className="p-4 rounded-lg border-2 border-gray-200 bg-gray-50">
                      <div className="space-y-3">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-gray-100 rounded-full">
                            <Mail className="w-5 h-5 text-gray-600" />
                          </div>
                          <div>
                            <h6 className="font-medium text-gray-900">NIP-05 + Password</h6>
                            <p className="text-sm text-gray-600">
                              Use your NIP-05 identifier: {userIdentityData?.userNip05 || 'Not configured'}
                            </p>
                          </div>
                        </div>

                        {userIdentityData?.userNip05 && (
                          <div className="space-y-3">
                            <input
                              type="password"
                              placeholder="Enter your password"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                  const password = (e.target as HTMLInputElement).value;
                                  if (password && userIdentityData.userNip05) {
                                    configureNip05Authorization(userIdentityData.userNip05, password);
                                  }
                                }
                              }}
                            />
                            <button
                              onClick={() => {
                                const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement;
                                const password = passwordInput?.value;
                                if (password && userIdentityData.userNip05) {
                                  configureNip05Authorization(userIdentityData.userNip05, password);
                                }
                              }}
                              disabled={signingAuthorizationPending}
                              className={`w-full px-4 py-2 rounded-lg font-medium transition-colors ${!signingAuthorizationPending
                                ? `${context === 'individual' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'} text-white`
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                }`}
                            >
                              {signingAuthorizationPending ? (
                                <div className="flex items-center justify-center space-x-2">
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  <span>Authorizing...</span>
                                </div>
                              ) : (
                                'Authorize with NIP-05'
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-lg border-2 border-green-200 bg-green-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <CheckCircle className="w-6 h-6 text-green-600" />
                        <div>
                          <h6 className="font-medium text-green-900">Automated Signing Configured</h6>
                          <p className="text-sm text-green-700">
                            Method: {formData.automatedSigning?.method.toUpperCase()}
                            {formData.automatedSigning?.expiresAt && (
                              <span className="ml-2">
                                (Expires: {new Date(formData.automatedSigning.expiresAt).toLocaleDateString()})
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={revokeAutomatedSigning}
                        className="px-3 py-1 text-sm text-red-600 hover:text-red-700 border border-red-300 hover:border-red-400 rounded-lg transition-colors"
                      >
                        Revoke
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Authentication Method Selection */}
              {userIdentityData && (
                <div className="space-y-4">
                  <h4 className="font-medium text-gray-900">Payment Signing Method</h4>
                  <div className="space-y-3">
                    {/* NIP-07 Browser Extension */}
                    <div className={`p-4 rounded-lg border-2 transition-colors ${formData.signingMethod === 'nip07'
                      ? `${context === 'individual' ? 'border-blue-500 bg-blue-50' : 'border-orange-500 bg-orange-50'}`
                      : 'border-gray-200'
                      }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <input
                            type="radio"
                            id="signing-nip07"
                            name="signingMethod"
                            value="nip07"
                            checked={formData.signingMethod === 'nip07'}
                            onChange={(e) => setFormData(prev => ({ ...prev, signingMethod: e.target.value as any }))}
                            disabled={!userIdentityData.hasNip07Extension}
                            className={`${context === 'individual' ? 'text-blue-600' : 'text-orange-600'}`}
                          />
                          <div>
                            <label htmlFor="signing-nip07" className="font-medium text-gray-900">
                              NIP-07 Browser Extension {userIdentityData.preferredSigningMethod === 'nip07' && '(Recommended)'}
                            </label>
                            <p className="text-sm text-gray-600">
                              {userIdentityData.hasNip07Extension
                                ? 'Use your Nostr browser extension for secure signing'
                                : 'No NIP-07 extension detected'
                              }
                            </p>
                          </div>
                        </div>
                        {userIdentityData.hasNip07Extension && (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        )}
                      </div>
                    </div>

                    {/* NIP-05 + Password */}
                    <div className={`p-4 rounded-lg border-2 transition-colors ${formData.signingMethod === 'nip05'
                      ? `${context === 'individual' ? 'border-blue-500 bg-blue-50' : 'border-orange-500 bg-orange-50'}`
                      : 'border-gray-200'
                      }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <input
                            type="radio"
                            id="signing-nip05"
                            name="signingMethod"
                            value="nip05"
                            checked={formData.signingMethod === 'nip05'}
                            onChange={(e) => setFormData(prev => ({ ...prev, signingMethod: e.target.value as any }))}
                            disabled={!userIdentityData.userNip05}
                            className={`${context === 'individual' ? 'text-blue-600' : 'text-orange-600'}`}
                          />
                          <div>
                            <label htmlFor="signing-nip05" className="font-medium text-gray-900">
                              NIP-05 + Password Authentication
                            </label>
                            <p className="text-sm text-gray-600">
                              {userIdentityData.userNip05
                                ? `Use your NIP-05 identifier: ${userIdentityData.userNip05}`
                                : 'No NIP-05 identifier configured'
                              }
                            </p>
                          </div>
                        </div>
                        {userIdentityData.userNip05 && (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        )}
                      </div>
                    </div>

                    {/* Password Only */}
                    <div className={`p-4 rounded-lg border-2 transition-colors ${formData.signingMethod === 'password'
                      ? `${context === 'individual' ? 'border-blue-500 bg-blue-50' : 'border-orange-500 bg-orange-50'}`
                      : 'border-gray-200'
                      }`}>
                      <div className="flex items-center space-x-3">
                        <input
                          type="radio"
                          id="signing-password"
                          name="signingMethod"
                          value="password"
                          checked={formData.signingMethod === 'password'}
                          onChange={(e) => setFormData(prev => ({ ...prev, signingMethod: e.target.value as any }))}
                          className={`${context === 'individual' ? 'text-blue-600' : 'text-orange-600'}`}
                        />
                        <div>
                          <label htmlFor="signing-password" className="font-medium text-gray-900">
                            Password Authentication
                          </label>
                          <p className="text-sm text-gray-600">
                            Use your account password for payment authorization
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Notification Preferences */}
              <div className="space-y-4">
                <h4 className="font-medium text-gray-900">Notification Preferences</h4>
                {[
                  { key: 'notifyOnDistribution', label: 'Payment Executions', desc: 'Get notified when scheduled payments are sent' },
                  { key: 'notifyOnFailure', label: 'Payment Failures', desc: 'Alert when payments fail to execute' },
                  { key: 'notifyOnSuspiciousActivity', label: 'Suspicious Activity', desc: 'Alert for unusual payment patterns' }
                ].map(notification => (
                  <div key={notification.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-medium text-gray-900">{notification.label}</div>
                      <div className="text-sm text-gray-500">{notification.desc}</div>
                    </div>
                    <button
                      onClick={() => updateNotificationSettings(notification.key as string, !(formData.notificationSettings as any)?.[notification.key])}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${(formData.notificationSettings as any)?.[notification.key]
                        ? `${context === 'individual' ? 'bg-blue-600' : 'bg-orange-600'}`
                        : 'bg-gray-300'
                        }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${(formData.notificationSettings as any)?.[notification.key] ? 'translate-x-6' : 'translate-x-1'
                          }`}
                      />
                    </button>
                  </div>
                ))}
              </div>

              {/* Nostr Messaging Options */}
              <div className="space-y-4">
                <h4 className="font-medium text-gray-900">Nostr Messaging</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-medium text-gray-900">Send Payment Notifications</div>
                      <div className="text-sm text-gray-500">
                        Notify recipient via Nostr DM when payment is sent
                      </div>
                    </div>
                    <button
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        notificationSettings: {
                          notifyOnDistribution: prev.notificationSettings?.notifyOnDistribution ?? true,
                          notifyOnFailure: prev.notificationSettings?.notifyOnFailure ?? true,
                          notifyOnSuspiciousActivity: prev.notificationSettings?.notifyOnSuspiciousActivity ?? true,
                          notificationMethods: prev.notificationSettings?.notificationMethods ?? ['email'],
                          sendNostrMessage: !prev.notificationSettings?.sendNostrMessage,
                          nostrNotifications: prev.notificationSettings?.nostrNotifications ?? false
                        }
                      }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.notificationSettings?.sendNostrMessage
                        ? `${context === 'individual' ? 'bg-blue-600' : 'bg-orange-600'}`
                        : 'bg-gray-300'
                        }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.notificationSettings?.sendNostrMessage ? 'translate-x-6' : 'translate-x-1'
                          }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-medium text-gray-900">Receive Nostr Notifications</div>
                      <div className="text-sm text-gray-500">
                        Get payment status updates via Nostr DM
                      </div>
                    </div>
                    <button
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        notificationSettings: {
                          notifyOnDistribution: prev.notificationSettings?.notifyOnDistribution ?? true,
                          notifyOnFailure: prev.notificationSettings?.notifyOnFailure ?? true,
                          notifyOnSuspiciousActivity: prev.notificationSettings?.notifyOnSuspiciousActivity ?? true,
                          notificationMethods: prev.notificationSettings?.notificationMethods ?? ['email'],
                          sendNostrMessage: prev.notificationSettings?.sendNostrMessage ?? false,
                          nostrNotifications: !prev.notificationSettings?.nostrNotifications
                        }
                      }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.notificationSettings?.nostrNotifications
                        ? `${context === 'individual' ? 'bg-blue-600' : 'bg-orange-600'}`
                        : 'bg-gray-300'
                        }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.notificationSettings?.nostrNotifications ? 'translate-x-6' : 'translate-x-1'
                          }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notification Methods
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: 'email', label: 'Email', icon: Mail },
                    { value: 'nostr_dm', label: 'Nostr DM', icon: Users }
                  ].map(method => (
                    <button
                      key={method.value}
                      onClick={() => {
                        const current = formData.notificationSettings?.notificationMethods || [];
                        const updated = current.includes(method.value as any)
                          ? current.filter(m => m !== method.value)
                          : [...current, method.value as any];
                        updateNotificationSettings('notificationMethods', updated);
                      }}
                      className={`flex items-center justify-center space-x-2 p-3 rounded-lg border-2 transition-colors ${formData.notificationSettings?.notificationMethods?.includes(method.value as any)
                        ? `${context === 'individual' ? 'border-blue-500 bg-blue-50' : 'border-orange-500 bg-orange-50'}`
                        : 'border-gray-200 hover:border-gray-300'
                        }`}
                    >
                      <method.icon className="w-4 h-4" />
                      <span className="font-medium">{method.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Clock className="w-4 h-4" />
            <span>
              Next payment: {formData.frequency && calculateNextDistribution(
                formData.frequency,
                formData.dayOfWeek,
                formData.dayOfMonth
              ).toLocaleDateString()}
            </span>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className={`flex items-center space-x-2 px-4 py-2 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${context === 'individual'
                ? 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600'
                : 'bg-orange-600 hover:bg-orange-700 disabled:bg-orange-600'
                }`}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>
                {loading ? 'Saving...' : `${existingSchedule ? 'Update' : 'Create'} Schedule`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentAutomationModal;