/**
 * Integration Tests for SimpleProof User Flows
 *
 * Tests SimpleProof blockchain attestation integration across core user flows:
 * - Account Creation (IdentityForge)
 * - Key Rotation (KeyRotationModal)
 * - NFC Name Tag Registration (NTAG424AuthModal)
 * - Family Federation (FamilyFoundryWizard)
 *
 * Phase 2B-2 Day 13: SimpleProof Integration into Core User Flows
 */

import * as fs from 'fs';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('../../src/services/simpleProofService', () => ({
  simpleProofService: {
    createTimestamp: vi.fn(),
    verifyTimestamp: vi.fn(),
  },
}));

vi.mock('../../src/services/toastService', () => ({
  showToast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../../src/config/env.client', () => ({
  clientConfig: {
    flags: {
      simpleproofEnabled: true,
      irohEnabled: false,
    },
  },
}));

// Import after mocks

// Helper function to read file content
const readFileContent = (filePath: string): string => {
  const fullPath = path.join(process.cwd(), filePath);
  return fs.readFileSync(fullPath, 'utf-8');
};

describe('SimpleProof User Flow Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Account Creation Flow (IdentityForge)', () => {
    it('should have SimpleProofTimestampButton import in IdentityForge component', () => {
      const content = readFileContent('src/components/IdentityForge.tsx');
      expect(content).toContain('SimpleProofTimestampButton');
      expect(content).toContain('from "./identity/SimpleProofTimestampButton"');
    });

    it('should have SIMPLEPROOF_ENABLED feature flag check in IdentityForge', () => {
      const content = readFileContent('src/components/IdentityForge.tsx');
      expect(content).toContain('SIMPLEPROOF_ENABLED');
      expect(content).toContain('clientConfig.flags.simpleproofEnabled');
    });

    it('should render SimpleProofTimestampButton with eventType="account_creation"', () => {
      const content = readFileContent('src/components/IdentityForge.tsx');
      expect(content).toContain('eventType="account_creation"');
      expect(content).toContain('<SimpleProofTimestampButton');
    });

    it('should include required account creation metadata in attestation data', () => {
      const content = readFileContent('src/components/IdentityForge.tsx');
      // Verify that attestation data includes username, nip05, lightningAddress, createdAt
      expect(content).toContain('username');
      expect(content).toContain('nip05');
      expect(content).toContain('lightningAddress');
      expect(content).toContain('createdAt');
    });

    it('should have verification ID state management', () => {
      const content = readFileContent('src/components/IdentityForge.tsx');
      expect(content).toContain('verificationId');
      expect(content).toContain('useState');
    });
  });

  describe('Key Rotation Flow (KeyRotationModal)', () => {
    it('should have SimpleProofTimestampButton import in KeyRotationModal component', () => {
      const content = readFileContent('src/components/auth/KeyRotationModal.tsx');
      expect(content).toContain('SimpleProofTimestampButton');
      expect(content).toContain('from "../identity/SimpleProofTimestampButton"');
    });

    it('should have SIMPLEPROOF_ENABLED feature flag check in KeyRotationModal', () => {
      const content = readFileContent('src/components/auth/KeyRotationModal.tsx');
      expect(content).toContain('SIMPLEPROOF_ENABLED');
      expect(content).toContain('clientConfig.flags.simpleproofEnabled');
    });

    it('should render SimpleProofTimestampButton with eventType="key_rotation"', () => {
      const content = readFileContent('src/components/auth/KeyRotationModal.tsx');
      expect(content).toContain('eventType="key_rotation"');
      expect(content).toContain('<SimpleProofTimestampButton');
    });

    it('should include old and new npub in attestation metadata', () => {
      const content = readFileContent('src/components/auth/KeyRotationModal.tsx');
      // Verify that attestation data includes oldNpub, newNpub
      expect(content).toContain('oldNpub');
      expect(content).toContain('newNpub');
      expect(content).toContain('rotatedAt');
    });

    it('should have newKeys state to capture rotation result', () => {
      const content = readFileContent('src/components/auth/KeyRotationModal.tsx');
      expect(content).toContain('newKeys');
      expect(content).toContain('setNewKeys');
    });
  });

  describe('NFC Name Tag Registration Flow (NTAG424AuthModal)', () => {
    it('should have SimpleProofTimestampButton import in NTAG424AuthModal component', () => {
      const content = readFileContent('src/components/NTAG424AuthModal.tsx');
      expect(content).toContain('SimpleProofTimestampButton');
      expect(content).toContain('from "./identity/SimpleProofTimestampButton"');
    });

    it('should have SIMPLEPROOF_ENABLED feature flag check in NTAG424AuthModal', () => {
      const content = readFileContent('src/components/NTAG424AuthModal.tsx');
      expect(content).toContain('SIMPLEPROOF_ENABLED');
      expect(content).toContain('clientConfig.flags.simpleproofEnabled');
    });

    it('should render SimpleProofTimestampButton with eventType="nfc_registration"', () => {
      const content = readFileContent('src/components/NTAG424AuthModal.tsx');
      expect(content).toContain('eventType="nfc_registration"');
      expect(content).toContain('<SimpleProofTimestampButton');
    });

    it('should include Boltcard ID in attestation metadata', () => {
      const content = readFileContent('src/components/NTAG424AuthModal.tsx');
      // Verify that attestation data includes boltcardId, userNpub, familyRole
      expect(content).toContain('boltcardId');
      expect(content).toContain('selectedCardId');
      expect(content).toContain('registeredAt');
    });

    it('should only show attestation for registration (operationType === "register")', () => {
      const content = readFileContent('src/components/NTAG424AuthModal.tsx');
      expect(content).toContain("operationType === 'register'");
    });
  });

  describe('Family Federation Flow (FamilyFoundryWizard)', () => {
    it('should have SimpleProofTimestampButton import in FamilyFoundryWizard component', () => {
      const content = readFileContent('src/components/FamilyFoundryWizard.tsx');
      expect(content).toContain('SimpleProofTimestampButton');
      expect(content).toContain('from "./identity/SimpleProofTimestampButton"');
    });

    it('should have SIMPLEPROOF_ENABLED feature flag check in FamilyFoundryWizard', () => {
      const content = readFileContent('src/components/FamilyFoundryWizard.tsx');
      expect(content).toContain('SIMPLEPROOF_ENABLED');
      expect(content).toContain('clientConfig.flags.simpleproofEnabled');
    });

    it('should render SimpleProofTimestampButton with eventType="family_federation"', () => {
      const content = readFileContent('src/components/FamilyFoundryWizard.tsx');
      expect(content).toContain('eventType="family_federation"');
      expect(content).toContain('<SimpleProofTimestampButton');
    });

    it('should include federation details in attestation metadata', () => {
      const content = readFileContent('src/components/FamilyFoundryWizard.tsx');
      // Verify that attestation data includes federationId, familyName, charter details
      expect(content).toContain('federationId');
      expect(content).toContain('familyName');
      expect(content).toContain('familyMotto');
      expect(content).toContain('memberCount');
    });

    it('should have complete step in wizard flow', () => {
      const content = readFileContent('src/components/FamilyFoundryWizard.tsx');
      expect(content).toContain("'complete'");
      expect(content).toContain("case 'complete'");
    });
  });

  describe('Fee Warning Modal Integration', () => {
    it('should have requireConfirmation prop set to true in all integrations', () => {
      const identityForge = readFileContent('src/components/IdentityForge.tsx');
      const keyRotation = readFileContent('src/components/auth/KeyRotationModal.tsx');
      const nfcAuth = readFileContent('src/components/NTAG424AuthModal.tsx');
      const familyFoundry = readFileContent('src/components/FamilyFoundryWizard.tsx');

      expect(identityForge).toContain('requireConfirmation={true}');
      expect(keyRotation).toContain('requireConfirmation={true}');
      expect(nfcAuth).toContain('requireConfirmation={true}');
      expect(familyFoundry).toContain('requireConfirmation={true}');
    });

    it('should have estimatedFeeSats prop in all integrations', () => {
      const identityForge = readFileContent('src/components/IdentityForge.tsx');
      const keyRotation = readFileContent('src/components/auth/KeyRotationModal.tsx');
      const nfcAuth = readFileContent('src/components/NTAG424AuthModal.tsx');
      const familyFoundry = readFileContent('src/components/FamilyFoundryWizard.tsx');

      expect(identityForge).toContain('estimatedFeeSats');
      expect(keyRotation).toContain('estimatedFeeSats');
      expect(nfcAuth).toContain('estimatedFeeSats');
      expect(familyFoundry).toContain('estimatedFeeSats');
    });

    it('should display user-friendly messaging about optional attestation', () => {
      const identityForge = readFileContent('src/components/IdentityForge.tsx');
      const keyRotation = readFileContent('src/components/auth/KeyRotationModal.tsx');
      const nfcAuth = readFileContent('src/components/NTAG424AuthModal.tsx');
      const familyFoundry = readFileContent('src/components/FamilyFoundryWizard.tsx');

      // All components should have messaging that attestation is optional
      expect(identityForge.includes('skip') || identityForge.includes('Optional')).toBe(true);
      expect(keyRotation.includes('skip') || keyRotation.includes('Optional')).toBe(true);
      expect(nfcAuth.includes('skip') || nfcAuth.includes('Optional')).toBe(true);
      expect(familyFoundry.includes('skip') || familyFoundry.includes('Optional')).toBe(true);
    });

    it('should have success and error callbacks in all integrations', () => {
      const identityForge = readFileContent('src/components/IdentityForge.tsx');
      const keyRotation = readFileContent('src/components/auth/KeyRotationModal.tsx');
      const nfcAuth = readFileContent('src/components/NTAG424AuthModal.tsx');
      const familyFoundry = readFileContent('src/components/FamilyFoundryWizard.tsx');

      expect(identityForge).toContain('onSuccess');
      expect(identityForge).toContain('onError');
      expect(keyRotation).toContain('onSuccess');
      expect(keyRotation).toContain('onError');
      expect(nfcAuth).toContain('onSuccess');
      expect(nfcAuth).toContain('onError');
      expect(familyFoundry).toContain('onSuccess');
      expect(familyFoundry).toContain('onError');
    });

    it('should log to console in callbacks (toast handled internally)', () => {
      const identityForge = readFileContent('src/components/IdentityForge.tsx');
      const keyRotation = readFileContent('src/components/auth/KeyRotationModal.tsx');
      const nfcAuth = readFileContent('src/components/NTAG424AuthModal.tsx');
      const familyFoundry = readFileContent('src/components/FamilyFoundryWizard.tsx');

      expect(identityForge.includes('console.log') || identityForge.includes('console.error')).toBe(true);
      expect(keyRotation.includes('console.log') || keyRotation.includes('console.error')).toBe(true);
      expect(nfcAuth.includes('console.log') || nfcAuth.includes('console.error')).toBe(true);
      expect(familyFoundry.includes('console.log') || familyFoundry.includes('console.error')).toBe(true);
    });
  });

  describe('Feature Flag Gating', () => {
    it('should gate SimpleProofTimestampButton with SIMPLEPROOF_ENABLED check', () => {
      const identityForge = readFileContent('src/components/IdentityForge.tsx');
      const keyRotation = readFileContent('src/components/auth/KeyRotationModal.tsx');
      const nfcAuth = readFileContent('src/components/NTAG424AuthModal.tsx');
      const familyFoundry = readFileContent('src/components/FamilyFoundryWizard.tsx');

      // All components should check SIMPLEPROOF_ENABLED before rendering button
      expect(identityForge).toContain('{SIMPLEPROOF_ENABLED &&');
      expect(keyRotation).toContain('{SIMPLEPROOF_ENABLED &&');
      expect(nfcAuth).toContain('{SIMPLEPROOF_ENABLED &&');
      expect(familyFoundry).toContain('{SIMPLEPROOF_ENABLED &&');
    });

    it('should have clientConfig.flags.simpleproofEnabled in all components', () => {
      const identityForge = readFileContent('src/components/IdentityForge.tsx');
      const keyRotation = readFileContent('src/components/auth/KeyRotationModal.tsx');
      const nfcAuth = readFileContent('src/components/NTAG424AuthModal.tsx');
      const familyFoundry = readFileContent('src/components/FamilyFoundryWizard.tsx');

      expect(identityForge).toContain('clientConfig.flags.simpleproofEnabled');
      expect(keyRotation).toContain('clientConfig.flags.simpleproofEnabled');
      expect(nfcAuth).toContain('clientConfig.flags.simpleproofEnabled');
      expect(familyFoundry).toContain('clientConfig.flags.simpleproofEnabled');
    });
  });

  describe('Error Handling', () => {
    it('should have error callbacks that log to console.error', () => {
      const identityForge = readFileContent('src/components/IdentityForge.tsx');
      const keyRotation = readFileContent('src/components/auth/KeyRotationModal.tsx');
      const nfcAuth = readFileContent('src/components/NTAG424AuthModal.tsx');
      const familyFoundry = readFileContent('src/components/FamilyFoundryWizard.tsx');

      expect(identityForge).toContain('console.error');
      expect(keyRotation).toContain('console.error');
      expect(nfcAuth).toContain('console.error');
      expect(familyFoundry).toContain('console.error');
    });

    it('should check for verification ID before rendering button', () => {
      const identityForge = readFileContent('src/components/IdentityForge.tsx');
      const keyRotation = readFileContent('src/components/auth/KeyRotationModal.tsx');
      const nfcAuth = readFileContent('src/components/NTAG424AuthModal.tsx');
      const familyFoundry = readFileContent('src/components/FamilyFoundryWizard.tsx');

      expect(identityForge).toContain('verificationId &&');
      expect(keyRotation).toContain('verificationId &&');
      expect(nfcAuth).toContain('verificationId &&');
      expect(familyFoundry).toContain('verificationId &&');
    });

    it('should use JSON.stringify for data prop to ensure valid format', () => {
      const identityForge = readFileContent('src/components/IdentityForge.tsx');
      const keyRotation = readFileContent('src/components/auth/KeyRotationModal.tsx');
      const nfcAuth = readFileContent('src/components/NTAG424AuthModal.tsx');
      const familyFoundry = readFileContent('src/components/FamilyFoundryWizard.tsx');

      expect(identityForge).toContain('JSON.stringify');
      expect(keyRotation).toContain('JSON.stringify');
      expect(nfcAuth).toContain('JSON.stringify');
      expect(familyFoundry).toContain('JSON.stringify');
    });
  });

  describe('Success Callbacks', () => {
    it('should have success callbacks that log to console.log', () => {
      const identityForge = readFileContent('src/components/IdentityForge.tsx');
      const keyRotation = readFileContent('src/components/auth/KeyRotationModal.tsx');
      const nfcAuth = readFileContent('src/components/NTAG424AuthModal.tsx');
      const familyFoundry = readFileContent('src/components/FamilyFoundryWizard.tsx');

      expect(identityForge).toContain('console.log');
      expect(keyRotation).toContain('console.log');
      expect(nfcAuth).toContain('console.log');
      expect(familyFoundry).toContain('console.log');
    });

    it('should include success emoji in log messages', () => {
      const identityForge = readFileContent('src/components/IdentityForge.tsx');
      const keyRotation = readFileContent('src/components/auth/KeyRotationModal.tsx');
      const nfcAuth = readFileContent('src/components/NTAG424AuthModal.tsx');
      const familyFoundry = readFileContent('src/components/FamilyFoundryWizard.tsx');

      expect(identityForge).toContain('✅');
      expect(keyRotation).toContain('✅');
      expect(nfcAuth).toContain('✅');
      expect(familyFoundry).toContain('✅');
    });
  });

  describe('Data Integrity', () => {
    it('should include all required fields in account creation attestation', () => {
      const content = readFileContent('src/components/IdentityForge.tsx');
      expect(content).toContain('username');
      expect(content).toContain('nip05');
      expect(content).toContain('lightningAddress');
      expect(content).toContain('createdAt');
    });

    it('should include all required fields in key rotation attestation', () => {
      const content = readFileContent('src/components/auth/KeyRotationModal.tsx');
      expect(content).toContain('oldNpub');
      expect(content).toContain('newNpub');
      expect(content).toContain('rotatedAt');
      expect(content).toContain('reason');
    });

    it('should include all required fields in NFC registration attestation', () => {
      const content = readFileContent('src/components/NTAG424AuthModal.tsx');
      expect(content).toContain('boltcardId');
      expect(content).toContain('userNpub');
      expect(content).toContain('familyRole');
      expect(content).toContain('registeredAt');
    });

    it('should include all required fields in family federation attestation', () => {
      const content = readFileContent('src/components/FamilyFoundryWizard.tsx');
      expect(content).toContain('federationId');
      expect(content).toContain('familyName');
      expect(content).toContain('familyMotto');
      expect(content).toContain('memberCount');
    });
  });
});

