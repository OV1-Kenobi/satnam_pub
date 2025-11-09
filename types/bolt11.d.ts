declare module "bolt11" {
  export type Network = "bitcoin" | "testnet" | "regtest" | "simnet";

  // TagData represents the data field within a tag object
  // Can be a hex string, plain string, or structured object (e.g., for fallback_address)
  export type TagData = string | Record<string, unknown>;

  export interface PaymentRequest {
    paymentRequest: string;
    complete: boolean;
    prefix: string;
    wordsTemp: string;
    network: Network;
    amount: number | null;
    timestamp?: number;
    timestampString?: string;
    payeeNodeKey?: string;
    signature?: string;
    recoveryFlag?: number;
    tags: Array<{
      tagName: string;
      data: TagData;
    }>;
  }

  export interface PaymentRequestObject {
    paymentRequest?: string;
    complete?: boolean;
    prefix?: string;
    wordsTemp?: string;
    network?: Network;
    amount?: number | null;
    timestamp?: number;
    timestampString?: string;
    payeeNodeKey?: string;
    signature?: string;
    recoveryFlag?: number;
    tags?: Array<{
      tagName?: string;
      data?: TagData;
    }>;
  }

  export function decode(paymentRequest: string): PaymentRequest;
  export function encode(
    paymentRequestObject: PaymentRequestObject
  ): PaymentRequest;
  export function sign(
    paymentRequestObject: PaymentRequestObject
  ): PaymentRequest;
}
