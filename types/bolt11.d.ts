declare module "bolt11" {
  export type Network = "bitcoin" | "testnet" | "regtest" | "simnet";
  export type TagData = string | number | Uint8Array;

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
