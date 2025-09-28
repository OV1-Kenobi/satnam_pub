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
  }
  interface PaymentHistoryParams {
    page?: number;
    limit?: number;
  }
  interface LightningAddressBody {
    externalLightningAddress?: string;
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
}
