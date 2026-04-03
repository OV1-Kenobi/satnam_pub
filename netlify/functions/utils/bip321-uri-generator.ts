// BIP-321 Unified Payment URI Generator
// Generates standardized bitcoin: URIs with multi-protocol payment options
// Supports Lightning (BOLT11), Cashu, Fedimint, Ark, and on-chain fallback

export interface BIP321PaymentOptions {
  // Amount in satoshis (will be converted to BTC decimal format)
  amount_sats?: number;
  
  // Metadata
  label?: string; // Recipient identifier (e.g., agent-alice@ai.satnam.pub)
  message?: string; // Human-readable payment description
  
  // Payment method configurations (in priority order)
  lightning_invoice?: string; // BOLT11 invoice
  cashu_token?: string; // Cashu token (JSON or encoded)
  fedimint_address?: string; // Fedimint payment address
  ark_vtxo?: string; // Ark VTXO (future support)
  
  // Proof of payment callback (BIP-321 'pop' parameter)
  pop_callback_uri?: string; // e.g., satnam://payment-proof?envelope_id=123
  
  // Optional on-chain fallback address
  bitcoin_address?: string; // Base58/Bech32/Bech32m address
  
  // Required parameters (BIP-321 req- prefix)
  required_payment_methods?: ('lightning' | 'cashu' | 'fedimint' | 'ark')[];
}

export interface ParsedBIP321URI {
  bitcoin_address?: string;
  amount_btc?: number;
  amount_sats?: number;
  label?: string;
  message?: string;
  
  // Payment methods
  lightning_invoice?: string;
  cashu_token?: string;
  fedimint_address?: string;
  ark_vtxo?: string;
  
  // Proof of payment
  pop_callback_uri?: string;
  
  // Required methods
  required_payment_methods: string[];
  
  // All query parameters (for extensibility)
  raw_params: Record<string, string>;
}

/**
 * Generate BIP-321 compliant payment URI
 * @param options Payment configuration options
 * @returns BIP-321 formatted bitcoin: URI
 */
export function generateBIP321URI(options: BIP321PaymentOptions): string {
  const params = new URLSearchParams();
  
  // Add payment methods in priority order (Lightning, Cashu, Fedimint, Ark)
  if (options.lightning_invoice) {
    const key = options.required_payment_methods?.includes('lightning') 
      ? 'req-lightning' 
      : 'lightning';
    params.append(key, options.lightning_invoice);
  }
  
  if (options.cashu_token) {
    const key = options.required_payment_methods?.includes('cashu')
      ? 'req-cashu'
      : 'cashu';
    params.append(key, options.cashu_token);
  }
  
  if (options.fedimint_address) {
    const key = options.required_payment_methods?.includes('fedimint')
      ? 'req-fedimint'
      : 'fedimint';
    params.append(key, options.fedimint_address);
  }
  
  if (options.ark_vtxo) {
    const key = options.required_payment_methods?.includes('ark')
      ? 'req-ark'
      : 'ark';
    params.append(key, options.ark_vtxo);
  }
  
  // Add amount in BTC decimal format (BIP-321 requirement)
  if (options.amount_sats !== undefined && options.amount_sats > 0) {
    const btcAmount = (options.amount_sats / 100_000_000).toFixed(8);
    // Remove trailing zeros but keep at least one decimal place
    const cleanAmount = btcAmount.replace(/\.?0+$/, '');
    params.append('amount', cleanAmount || '0');
  }
  
  // Add metadata
  if (options.label) {
    params.append('label', options.label);
  }
  
  if (options.message) {
    params.append('message', options.message);
  }
  
  // Add proof of payment callback (percent-encoded per BIP-321)
  if (options.pop_callback_uri) {
    params.append('pop', encodeURIComponent(options.pop_callback_uri));
  }
  
  // Build URI: bitcoin:[address]?[params]
  const base = options.bitcoin_address || '';
  const queryString = params.toString();
  
  // BIP-321 allows empty address if payment methods are provided
  if (!base && queryString) {
    return `bitcoin:?${queryString}`;
  }
  
  return `bitcoin:${base}${queryString ? '?' + queryString : ''}`;
}

/**
 * Validate BIP-321 URI format
 * @param uri URI to validate
 * @returns true if valid BIP-321 URI
 */
export function validateBIP321URI(uri: string): boolean {
  if (!uri.startsWith('bitcoin:') && !uri.startsWith('BITCOIN:')) {
    return false;
  }
  
  try {
    const parsed = parseBIP321URI(uri);
    
    // Must have either address or at least one payment method
    const hasAddress = !!parsed.bitcoin_address;
    const hasPaymentMethod = !!(
      parsed.lightning_invoice ||
      parsed.cashu_token ||
      parsed.fedimint_address ||
      parsed.ark_vtxo
    );
    
    return hasAddress || hasPaymentMethod;
  } catch {
    return false;
  }
}

/**
 * Parse BIP-321 URI into structured object
 * @param uri BIP-321 formatted URI
 * @returns Parsed payment options
 */
export function parseBIP321URI(uri: string): ParsedBIP321URI {
  // Case-insensitive scheme (BIP-321 requirement)
  const normalizedUri = uri.replace(/^BITCOIN:/i, 'bitcoin:');
  
  if (!normalizedUri.startsWith('bitcoin:')) {
    throw new Error('Invalid BIP-321 URI: must start with bitcoin:');
  }
  
  // Split into address and query parts
  const withoutScheme = normalizedUri.slice(8); // Remove 'bitcoin:'
  const [addressPart, queryPart] = withoutScheme.split('?');
  
  const result: ParsedBIP321URI = {
    required_payment_methods: [],
    raw_params: {}
  };
  
  // Parse address (optional)
  if (addressPart && addressPart.trim()) {
    result.bitcoin_address = addressPart.trim();
  }
  
  // Parse query parameters
  if (queryPart) {
    const params = new URLSearchParams(queryPart);
    
    params.forEach((value, key) => {
      const lowerKey = key.toLowerCase(); // Case-insensitive keys (BIP-321)
      result.raw_params[key] = value;
      
      // Extract payment methods
      if (lowerKey === 'lightning' || lowerKey === 'req-lightning') {
        result.lightning_invoice = value;
        if (lowerKey.startsWith('req-')) {
          result.required_payment_methods.push('lightning');
        }
      } else if (lowerKey === 'cashu' || lowerKey === 'req-cashu') {
        result.cashu_token = value;
        if (lowerKey.startsWith('req-')) {
          result.required_payment_methods.push('cashu');
        }
      } else if (lowerKey === 'fedimint' || lowerKey === 'req-fedimint') {
        result.fedimint_address = value;
        if (lowerKey.startsWith('req-')) {
          result.required_payment_methods.push('fedimint');
        }
      } else if (lowerKey === 'ark' || lowerKey === 'req-ark') {
        result.ark_vtxo = value;
        if (lowerKey.startsWith('req-')) {
          result.required_payment_methods.push('ark');
        }
      } else if (lowerKey === 'amount') {
        result.amount_btc = parseFloat(value);
        result.amount_sats = Math.round(result.amount_btc * 100_000_000);
      } else if (lowerKey === 'label') {
        result.label = value;
      } else if (lowerKey === 'message') {
        result.message = value;
      } else if (lowerKey === 'pop' || lowerKey === 'req-pop') {
        result.pop_callback_uri = decodeURIComponent(value);
      }
    });
  }
  
  return result;
}

