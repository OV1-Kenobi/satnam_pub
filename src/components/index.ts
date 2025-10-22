// Main components export file - All recovered components
// Family Banking & Dashboard Components
export { default as EnhancedFamilyDashboard } from "./EnhancedFamilyDashboard";
export { default as FamilyFinancialsDashboard } from "./FamilyFinancialsDashboard";
export { default as FamilyLightningDashboard } from "./FamilyLightningDashboard";
export { default as FamilyLightningTreasury } from "./FamilyLightningTreasury";
export { default as IndividualFinancesDashboard } from "./IndividualFinancesDashboard";
export { default as SovereignFamilyBanking } from "./SovereignFamilyBanking";

// Admin Components
export { default as HierarchicalAdminDashboard } from "./admin/HierarchicalAdminDashboard";

// Communications & Messaging
export { FamilyFederationInvitationModal } from "./communications/FamilyFederationInvitationModal";
export { GiftwrappedMessaging } from "./communications/GiftwrappedMessaging";
export { default as GiftwrappedOTPModal } from "./communications/GiftwrappedOTPModal";
export { default as MessagingIntegration } from "./communications/MessagingIntegration";
export { PeerInvitationModal } from "./communications/PeerInvitationModal";
export { default as PrivateCommunicationModal } from "./communications/PrivateCommunicationModal";
export { PrivacyFirstMessaging } from "./PrivacyFirstMessaging";

// Authentication Components
export {
  FamilyFederationAuthProvider,
  FamilyFederationAuthWrapper,
} from "./auth/FamilyFederationAuth";
export { default as FamilyFederationSignIn } from "./auth/FamilyFederationSignIn";
export { WebAuthnAuthentication } from "./auth/WebAuthnAuthentication";
export { WebAuthnRegistration } from "./auth/WebAuthnRegistration";
export { default as AuthTestingPanel } from "./AuthTestingPanel";
export { default as IndividualAuth } from "./IndividualAuth";
export { MaxPrivacyAuth } from "./MaxPrivacyAuth";
export { PrivacyFirstAuthDemo } from "./PrivacyFirstAuthDemo";

// Fedimint & Governance
export { default as FamilyCoordination } from "./FamilyCoordination";
export { default as FamilyFedimintGovernance } from "./FamilyFedimintGovernance";

// Lightning & Payments
export { default as EnhancedLiquidityDashboard } from "./EnhancedLiquidityDashboard";
export { default as PhoenixDNodeStatus } from "./PhoenixDNodeStatus";
export { default as SmartPaymentModal } from "./SmartPaymentModal";
export { default as SmartPaymentModalDemo } from "./SmartPaymentModalDemo";
export { default as UnifiedFamilyPayments } from "./UnifiedFamilyPayments";

// Privacy & Enhanced Features
export { PrivacyLevelSelector } from "./communications/PrivacyLevelSelector";
export { default as PrivacyDashboardIndicators } from "./enhanced/PrivacyDashboardIndicators";
export { default as PrivacyEnhancedIndividualDashboard } from "./enhanced/PrivacyEnhancedIndividualDashboard";
export { default as PrivacyEnhancedPaymentModal } from "./enhanced/PrivacyEnhancedPaymentModal";
export { default as PrivacyIntegrationDemo } from "./enhanced/PrivacyIntegrationDemo";
export { default as PrivacyPreferencesModal } from "./enhanced/PrivacyPreferencesModal";
export { default as PrivacyControls } from "./PrivacyControls";
export { default as PrivacyFirstIdentityManager } from "./PrivacyFirstIdentityManager";

// Modals & UI Components
export { default as AtomicSwapModal } from "./AtomicSwapModal";
export { default as ContactsManagerModal } from "./ContactsManagerModal";
export { default as NWCModal } from "./NWCModal";
export { PostAuthInvitationModal } from "./PostAuthInvitationModal";
export { default as SignInModal } from "./SignInModal";

// Wallet & Card Components
export { CreditsBalance } from "./CreditsBalance";
export { default as FamilyWalletCard } from "./FamilyWalletCard";
export { default as FamilyWalletDemo } from "./FamilyWalletDemo";

// Contact Management
export { default as AddContactForm } from "./AddContactForm";
export { default as ContactCard } from "./ContactCard";
export { default as ContactsList } from "./ContactsList";
export { default as EditContactForm } from "./EditContactForm";

// Onboarding & Education
export { default as EducationPlatform } from "./EducationPlatform";
export { default as FamilyOnboarding } from "./FamilyOnboarding";
export { default as IdentityForge } from "./IdentityForge";
export { default as KeyRotationWizard } from "./KeyRotationWizard";
export { default as Settings } from "./Settings";

// Crypto & System Components
export { CryptoPreloader } from "./CryptoPreloader";
export { CryptoProvider } from "./CryptoProvider";
export { default as NostrEcosystem } from "./NostrEcosystem";

// Status & Monitoring
export { default as ApiDebug } from "./ApiDebug";
export { default as ApiStatus } from "./ApiStatus";
export { default as ApiTestPage } from "./ApiTestPage";
export { default as ServerStatus } from "./ServerStatus";

// Utility Components
export { default as ErrorBoundary } from "./ErrorBoundary";
export { default as OperationTypeBadge } from "./OperationTypeBadge";
export { default as ProtectedRoute } from "./ProtectedRoute";
export { default as TransactionHistory } from "./TransactionHistory";

// Route Protection
export { default as AuthProtectedRoute } from "./auth/AuthProtectedRoute";
export { default as DashboardAuthWrapper } from "./auth/DashboardAuthWrapper";
export { default as FamilyAuthRoute } from "./auth/FamilyAuthRoute";
export { default as ProtectedFamilyRoute } from "./auth/ProtectedFamilyRoute";

// Example Components
export { default as AuthExamples } from "./examples/AuthExamples";
export { default as FamilyDashboardExample } from "./examples/FamilyDashboardExample";
export { default as OperationStyleGuide } from "./examples/OperationStyleGuide";

// Re-export from shared directory
export * from "./shared";
