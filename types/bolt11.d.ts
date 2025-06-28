declare module "bolt11" {
  export interface PaymentRequest {
    paymentRequest: string;
    complete: boolean;
    prefix: string;
    wordsTemp: string;
    network: any;
    amount: number | null;
    timestamp?: number;
    timestampString?: string;
    payeeNodeKey?: string;
    signature?: string;
    recoveryFlag?: number;
    tags: Array<{
      tagName: string;
      data: any;
    }>;
  }

  export interface PaymentRequestObject {
    paymentRequest?: string;
    complete?: boolean;
    prefix?: string;
    wordsTemp?: string;
    network?: any;
    amount?: number | null;
    timestamp?: number;
    timestampString?: string;
    payeeNodeKey?: string;
    signature?: string;
    recoveryFlag?: number;
    tags?: Array<{
      tagName?: string;
      data?: any;
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
