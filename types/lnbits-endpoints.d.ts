// Type declarations for client-side LNbits endpoint helpers implemented in api/endpoints/lnbits.js
// Enables static imports from TS/TSX files without implicit any warnings

declare namespace LNBitsClient {
  interface Response<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    total?: number;
  }
  interface CreateBoltcardParams {
    label: string;
    spend_limit_sats: number;
  }
  interface CreateBoltcardResult {
    cardId: string;
    authQr?: string | null;
    // Encryption keys for programming the NFC card (only available at creation)
    k0?: string; // Authentication key
    k1?: string; // Encryption key
    k2?: string; // SUN/SDM CMAC key
    lnurlw?: string; // LNURL-withdraw base URL
    keysAvailable?: boolean; // Whether encryption keys were returned
  }
  interface BoltcardLnurlResult {
    lnurl: string;
  }
  interface PaymentHistoryParams {
    page?: number;
    limit?: number;
  }
  interface LightningAddressBody {
    externalLightningAddress?: string;
  }
  interface PayInvoiceOptions {
    walletId?: string;
    maxFeeSats?: number;
  }
  interface PayInvoiceResult {
    payment_hash: string;
    checking_id?: string;
    amount_sats: number;
    fee?: number;
    raw?: any;
  }
}

declare module "@/api/endpoints/lnbits.js" {
  export function provisionWallet(): Promise<LNBitsClient.Response<any>>;
  export function createLightningAddress(
    body?: LNBitsClient.LightningAddressBody
  ): Promise<LNBitsClient.Response<any>>;
  export function createBoltcard(
    params: LNBitsClient.CreateBoltcardParams
  ): Promise<LNBitsClient.Response<LNBitsClient.CreateBoltcardResult>>;
  export function getPaymentHistory(
    params?: LNBitsClient.PaymentHistoryParams
  ): Promise<LNBitsClient.Response<any>>;
  export function getBoltcardLnurl(): Promise<
    LNBitsClient.Response<LNBitsClient.BoltcardLnurlResult>
  >;
  export function getLNbitsWalletUrl(): Promise<
    LNBitsClient.Response<{
      walletUrl: string;
      walletId: string;
      baseUrl: string;
    }>
  >;
  export function payInvoice(
    invoice: string,
    options?: LNBitsClient.PayInvoiceOptions
  ): Promise<LNBitsClient.Response<LNBitsClient.PayInvoiceResult>>;
}

// Support relative imports from TSX using ../../api/endpoints/lnbits.js
declare module "../../api/endpoints/lnbits.js" {
  export function provisionWallet(): Promise<LNBitsClient.Response<any>>;
  export function createLightningAddress(
    body?: LNBitsClient.LightningAddressBody
  ): Promise<LNBitsClient.Response<any>>;
  export function createBoltcard(
    params: LNBitsClient.CreateBoltcardParams
  ): Promise<LNBitsClient.Response<LNBitsClient.CreateBoltcardResult>>;
  export function getPaymentHistory(
    params?: LNBitsClient.PaymentHistoryParams
  ): Promise<LNBitsClient.Response<any>>;
  export function getBoltcardLnurl(): Promise<
    LNBitsClient.Response<LNBitsClient.BoltcardLnurlResult>
  >;
  export function getLNbitsWalletUrl(): Promise<
    LNBitsClient.Response<{
      walletUrl: string;
      walletId: string;
      baseUrl: string;
    }>
  >;
  export function payInvoice(
    invoice: string,
    options?: LNBitsClient.PayInvoiceOptions
  ): Promise<LNBitsClient.Response<LNBitsClient.PayInvoiceResult>>;
}

// Payments client declarations for relative imports in TSX
declare module "../../lib/api/paymentsClient.js" {
  export class ApiError extends Error {
    constructor(message: string, statusCode?: number);
    getUserFriendlyMessage(): string;
  }

  export const paymentsClient: {
    sendPayment(request: unknown): Promise<unknown>;
    sendP2PPayment(request: unknown): Promise<unknown>;
    getBalance(): Promise<unknown>;
    getTransactionHistory(): Promise<unknown>;
    getNodeHealthStatus(): Promise<unknown>;
  };
}
