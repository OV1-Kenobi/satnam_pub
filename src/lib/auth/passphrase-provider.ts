/**
 * Passphrase Provider - Standalone module to break circular dependencies
 * 
 * This module manages the passphrase provider functionality separately from
 * ClientSessionVault to prevent circular import issues that cause production
 * bundle loading problems.
 */

export type PassphraseProvider = () => Promise<string | null>;

let passphraseProvider: PassphraseProvider | null = null;

/**
 * Set the passphrase provider function
 * This is called by AuthProvider to install the UI passphrase modal
 */
export function setPassphraseProvider(provider: PassphraseProvider): void {
  passphraseProvider = provider;
}

/**
 * Get the current passphrase provider
 * This is called by ClientSessionVault when a passphrase is needed
 */
export function getPassphraseProvider(): PassphraseProvider | null {
  return passphraseProvider;
}

/**
 * Request a passphrase from the installed provider
 * Returns null if no provider is installed or user cancels
 */
export async function requestPassphrase(): Promise<string | null> {
  if (!passphraseProvider) {
    return null;
  }
  
  try {
    return await passphraseProvider();
  } catch (error) {
    console.error('Passphrase provider error:', error);
    return null;
  }
}
