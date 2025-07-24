/**
 * Type fixes for nostr-tools library
 * MASTER CONTEXT COMPLIANCE: Proper type definitions for Nostr operations
 */

declare module "nostr-tools" {
  export interface UnsignedEvent {
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
    pubkey?: string;
  }

  export interface Event extends UnsignedEvent {
    id: string;
    pubkey: string;
    sig: string;
  }

  // Fix function signatures to match actual usage patterns
  export function generatePrivateKey(): string;
  export function getPublicKey(privateKey: string | Uint8Array): string;
  export function finalizeEvent(
    event: UnsignedEvent,
    privateKey: string | Uint8Array
  ): Event;
  export function verifyEvent(event: Event): boolean;

  export function getEventHash(event: UnsignedEvent): string;
  export function signEvent(
    event: UnsignedEvent,
    privateKey: string | Uint8Array
  ): string;
  export function generateSecretKey(): string;
  export const finishEvent: typeof finalizeEvent;

  // Add missing exports
  export interface Filter {
    ids?: string[];
    authors?: string[];
    kinds?: number[];
    since?: number;
    until?: number;
    limit?: number;
    [key: string]: any;
  }

  export type NostrEvent = Event;

  // Export Filter as both type and value
  export const Filter: {
    new (): Filter;
  };

  export class SimplePool {
    constructor();
    subscribeMany(
      relays: string[],
      filters: Filter[],
      callbacks: {
        onevent?: (event: Event) => void;
        oneose?: () => void;
      }
    ): any;
    publish(relays: string[], event: Event): Promise<void>;
    close(relays: string[]): void;
  }

  export namespace nip04 {
    export function encrypt(
      privateKey: string,
      publicKey: string,
      text: string
    ): Promise<string>;
    export function decrypt(
      privateKey: string,
      publicKey: string,
      data: string
    ): Promise<string>;
  }

  export namespace nip05 {
    export function queryProfile(fullname: string): Promise<any>;
    export function verify(
      identifier: string,
      pubkey: string
    ): Promise<boolean>;
  }

  export namespace nip19 {
    export function npubEncode(pubkey: string): string;
    export function nsecEncode(privateKey: string): string;
    export function decode(nip19: string): { type: string; data: any };
  }

  export namespace nip44 {
    export function encrypt(
      privateKey: string,
      publicKey: string,
      text: string
    ): string;
    export function decrypt(
      privateKey: string,
      publicKey: string,
      data: string
    ): string;
  }

  export namespace nip59 {
    export function wrapEvent(
      event: Event,
      recipientPubkey: string,
      senderPrivkey: string
    ): Event;
    export function unwrapEvent(
      wrappedEvent: Event,
      recipientPrivkey: string
    ): Event | null;
  }

  export class Relay {
    constructor(url: string);
    connect(): Promise<void>;
    close(): void;
    publish(event: Event): Promise<void>;
    subscribe(filters: any[], opts?: any): any;
  }

  export function relayInit(url: string): Relay;
}

// Fix for crypto operations
declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: UnsignedEvent): Promise<Event>;
      getRelays?(): Promise<Record<string, { read: boolean; write: boolean }>>;
      nip04?: {
        encrypt(pubkey: string, plaintext: string): Promise<string>;
        decrypt(pubkey: string, ciphertext: string): Promise<string>;
      };
    };
  }
}

// Fix for WebSocket server types
declare module "ws" {
  export class WebSocketServer {
    constructor(options: any);
    on(event: string, callback: Function): void;
    close(): void;
  }

  export class WebSocket {
    constructor(url: string);
    on(event: string, callback: Function): void;
    send(data: string): void;
    close(): void;
    readyState: number;
  }
}

// Fix for missing types in shared modules
declare module "../../types/shared" {
  export interface FamilyMember {
    id: string;
    name?: string;
    username: string;
    lightningAddress?: string;
    role: "offspring" | "adult" | "steward" | "guardian";
    avatar?: string;
    spendingLimits?: {
      daily?: number;
      weekly?: number;
      monthly?: number;
      setBy?: string;
      lastUpdated?: Date;
    };
  }
}

// Fix for payment request conflicts
declare global {
  interface PaymentRequest {
    // Browser PaymentRequest API
    show(): Promise<any>;
    abort(): Promise<void>;
    canMakePayment(): Promise<boolean>;
  }
}

// Fix for supabase global reference
declare global {
  const supabase: any;
}
