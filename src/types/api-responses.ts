/**
 * API Response Types for Satnam.pub
 *
 * Type definitions to replace explicit 'any' types throughout the codebase
 * and provide better type safety for API responses.
 */

export interface BaseApiResponse {
  success: boolean;
  message?: string;
  timestamp?: string;
}

export interface ErrorApiResponse extends BaseApiResponse {
  success: false;
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface SuccessApiResponse<T = unknown> extends BaseApiResponse {
  success: true;
  data: T;
}

export type ApiResponse<T = unknown> = SuccessApiResponse<T> | ErrorApiResponse;

// Authentication Types
export interface AuthUser {
  id: string;
  npub: string;
  username?: string;
  familyName?: string;
  role?: "adult" | "child" | "guardian";
  permissions?: string[];
  lastLogin?: string;
}

export interface AuthChallenge {
  challenge: string;
  expiresAt: string;
  npub: string;
}

export interface AuthToken {
  token: string;
  expiresAt: string;
  user: AuthUser;
}

export interface MockRequest {
  method: string;
  body: Record<string, unknown>;
  query: Record<string, unknown>;
  headers: Record<string, string>;
  url?: string;
}

export interface MockResponse {
  status: (code: number) => MockResponse;
  json: (data: unknown) => MockResponse;
  setHeader: (name: string, value: string) => MockResponse;
  send: (data?: unknown) => MockResponse;
  end: () => MockResponse;
}

// Generic HTTP Response
export interface HttpResponse<T = unknown> {
  status: number;
  data?: T;
  error?: string;
  headers?: Record<string, string>;
}
