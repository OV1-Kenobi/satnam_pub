// Main components export file - All 40+ recovered components
// Family Banking & Dashboard Components
export { default as EnhancedFamilyDashboard } from "./EnhancedFamilyDashboard.tsx";
export { default as FamilyFinancialsDashboard } from "./FamilyFinancialsDashboard.tsx";
export { default as FamilyLightningDashboard } from "./FamilyLightningDashboard.tsx";
export { default as FamilyLightningTreasury } from "./FamilyLightningTreasury.tsx";
export { default as IndividualFinancesDashboard } from "./IndividualFinancesDashboard.tsx";
export { default as SovereignFamilyBanking } from "./SovereignFamilyBanking.tsx";

// Communications & Messaging
export { default as FamilyFederationInvitationModal } from "./communications/FamilyFederationInvitationModal.tsx";
export { default as GiftwrappedMessaging } from "./communications/GiftwrappedMessaging.tsx";
export { default as GiftwrappedOTPModal } from "./communications/GiftwrappedOTPModal.tsx";
export { default as MessagingIntegration } from "./communications/MessagingIntegration.tsx";
export { default as PeerInvitationModal } from "./communications/PeerInvitationModal.tsx";
export { default as PrivateCommunicationModal } from "./communications/PrivateCommunicationModal.tsx";
export { default as PrivacyFirstMessaging } from "./PrivacyFirstMessaging.tsx";

// Authentication Components
export { default as FamilyFederationAuth } from "./auth/FamilyFederationAuth.tsx";
export { default as FamilyFederationSignIn } from "./auth/FamilyFederationSignIn.tsx";
export { default as NWCOTPSignIn } from "./auth/NWCOTPSignIn.tsx";
export { default as AuthTestingPanel } from "./AuthTestingPanel.tsx";
export { default as IndividualAuth } from "./IndividualAuth.tsx";
export { default as MaxPrivacyAuth } from "./MaxPrivacyAuth.tsx";
export { default as PrivacyFirstAuthDemo } from "./PrivacyFirstAuthDemo.tsx";

// Fedimint & Governance
export { default as FamilyCoordination } from "./FamilyCoordination.tsx";
export { default as FamilyFedimintGovernance } from "./FamilyFedimintGovernance.tsx";

// Lightning & Payments
export { default as EnhancedLiquidityDashboard } from "./EnhancedLiquidityDashboard";
export { default as PhoenixDNodeStatus } from "./PhoenixDNodeStatus.tsx";
export { default as SmartPaymentModal } from "./SmartPaymentModal.tsx";
export { default as SmartPaymentModalDemo } from "./SmartPaymentModalDemo.tsx";
export { default as UnifiedFamilyPayments } from "./UnifiedFamilyPayments.tsx";

// Privacy & Enhanced Features
export { default as PrivacyLevelSelector } from "./communications/PrivacyLevelSelector.tsx";
export { default as PrivacyDashboardIndicators } from "./enhanced/PrivacyDashboardIndicators.tsx";
export { default as PrivacyEnhancedIndividualDashboard } from "./enhanced/PrivacyEnhancedIndividualDashboard.tsx";
export { default as PrivacyEnhancedPaymentModal } from "./enhanced/PrivacyEnhancedPaymentModal.tsx";
export { default as PrivacyIntegrationDemo } from "./enhanced/PrivacyIntegrationDemo.tsx";
export { default as PrivacyPreferencesModal } from "./enhanced/PrivacyPreferencesModal.tsx";
export { default as PrivacyControls } from "./PrivacyControls.tsx";
export { default as PrivacyFirstIdentityManager } from "./PrivacyFirstIdentityManager.tsx";

// Modals & UI Components
export { default as AtomicSwapModal } from "./AtomicSwapModal.tsx";
export { default as ContactsManagerModal } from "./ContactsManagerModal.tsx";
export { default as NWCModal } from "./NWCModal.tsx";
export { default as PostAuthInvitationModal } from "./PostAuthInvitationModal.tsx";
export { default as SignInModal } from "./SignInModal.tsx";

// Wallet & Card Components
export { default as CreditsBalance } from "./CreditsBalance.tsx";
export { default as FamilyWalletCard } from "./FamilyWalletCard.tsx";
export { default as FamilyWalletDemo } from "./FamilyWalletDemo.tsx";

// Contact Management
export { default as AddContactForm } from "./AddContactForm.tsx";
export { default as ContactCard } from "./ContactCard.tsx";
export { default as ContactsList } from "./ContactsList.tsx";
export { default as EditContactForm } from "./EditContactForm.tsx";

// Onboarding & Education
export { default as EducationPlatform } from "./EducationPlatform.tsx";
export { default as FamilyOnboarding } from "./FamilyOnboarding.tsx";
export { default as IdentityForge } from "./IdentityForge.tsx";

// Crypto & System Components
export { default as CryptoPreloader } from "./CryptoPreloader.tsx";
export { default as CryptoProvider } from "./CryptoProvider.tsx";
export { default as NostrEcosystem } from "./NostrEcosystem.tsx";

// Status & Monitoring
export { default as ApiDebug } from "./ApiDebug.tsx";
export { default as ApiStatus } from "./ApiStatus.tsx";
export { default as ApiTestPage } from "./ApiTestPage.tsx";
export { default as ServerStatus } from "./ServerStatus.tsx";

// Utility Components
export { default as ErrorBoundary } from "./ErrorBoundary.tsx";
export { default as OperationTypeBadge } from "./OperationTypeBadge.tsx";
export { default as ProtectedRoute } from "./ProtectedRoute.tsx";
export { default as TransactionHistory } from "./TransactionHistory.tsx";

// Route Protection
export { default as AuthProtectedRoute } from "./auth/AuthProtectedRoute.tsx";
export { default as DashboardAuthWrapper } from "./auth/DashboardAuthWrapper.tsx";
export { default as FamilyAuthRoute } from "./auth/FamilyAuthRoute.tsx";
export { default as ProtectedFamilyRoute } from "./auth/ProtectedFamilyRoute.tsx";

// Example Components
export { default as AuthExamples } from "./examples/AuthExamples.tsx";
export { default as FamilyDashboardExample } from "./examples/FamilyDashboardExample.tsx";
export { default as OperationStyleGuide } from "./examples/OperationStyleGuide.tsx";

// Re-export from shared and specialized directories
export * from "./FamilyLightningDashboard";
export * from "./privacy-messaging";
export * from "./shared";
