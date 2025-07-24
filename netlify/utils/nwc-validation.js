/**
 * NWC Validation Utilities - JavaScript implementation
 * MASTER CONTEXT COMPLIANCE: NWC validation for Netlify Functions
 */

export function sanitizeNWCData(data) {
  if (!data || typeof data !== 'object') {
    return {};
  }

  // Remove potentially dangerous properties
  const sanitized = {};
  const allowedKeys = ['uri', 'pubkey', 'relay', 'secret', 'permissions'];
  
  for (const key of allowedKeys) {
    if (data[key] !== undefined) {
      sanitized[key] = String(data[key]).trim();
    }
  }

  return sanitized;
}

export function validateNWCUri(uri) {
  if (!uri || typeof uri !== 'string') {
    return false;
  }

  // Basic NWC URI validation
  const nwcPattern = /^nostr\+walletconnect:\/\/[a-f0-9]{64}\?relay=.+&secret=[a-f0-9]{64}$/i;
  return nwcPattern.test(uri.trim());
}

export function extractNWCComponents(uri) {
  if (!validateNWCUri(uri)) {
    return null;
  }

  try {
    const url = new URL(uri);
    const pubkey = url.hostname;
    const relay = url.searchParams.get('relay');
    const secret = url.searchParams.get('secret');

    return {
      pubkey,
      relay,
      secret,
      uri: uri.trim()
    };
  } catch (error) {
    return null;
  }
}

export function validateNWCPermissions(permissions) {
  if (!Array.isArray(permissions)) {
    return false;
  }

  const validPermissions = [
    'pay_invoice',
    'get_balance',
    'get_info',
    'make_invoice',
    'lookup_invoice',
    'list_transactions'
  ];

  return permissions.every(permission => 
    validPermissions.includes(permission)
  );
}
