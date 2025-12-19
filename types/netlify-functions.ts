/**
 * Express-style type definitions for Netlify Functions middleware layer.
 *
 * NOTE: These types are used by middleware files (netlify/functions/middleware/,
 * netlify/functions/security/) that implement Express-style req/res patterns
 * with methods like req.get(), res.status().json(), etc.
 *
 * Actual Netlify Function handlers in netlify/functions_active/ should use
 * the native Handler type from @netlify/functions instead, which provides
 * the raw event structure (event.httpMethod, event.path, event.headers).
 *
 * See also: types/global-fixes.d.ts for the raw Netlify Event interface.
 */

export interface NetlifyRequest {
  body: any;
  headers: Record<string, string>;
  query: Record<string, string>;
  params: Record<string, string>;
  method: string;
  url: string;
  cookies: Record<string, string>;
  ip?: string;
  get: (header: string) => string | undefined;
  route?: { path?: string };
  path: string;
  user?: any;
}

export interface NetlifyResponse {
  status: (code: number) => NetlifyResponse;
  json: (data: any) => NetlifyResponse;
  send: (data: any) => NetlifyResponse;
  setHeader: (name: string, value: string) => NetlifyResponse;
  set: ((name: string, value: string) => NetlifyResponse) &
    ((headers: Record<string, string>) => NetlifyResponse);
  end: (data?: any) => NetlifyResponse;
  headers: Record<string, string>;
  statusCode: number;
}

export interface NetlifyContext {
  clientContext?: {
    user?: {
      sub: string;
      email: string;
    };
  };
  functionName: string;
  functionVersion: string;
  invokedFunctionArn: string;
  memoryLimitInMB: string;
  awsRequestId: string;
  logGroupName: string;
  logStreamName: string;
  deadlineMs: number;
  remainingTimeInMs: () => number;
  callbackWaitsForEmptyEventLoop: boolean;
  getRemainingTimeInMillis: () => number;
}

export type NetlifyHandler = (
  event: any,
  context: NetlifyContext,
  callback?: (error: any, result: any) => void
) => Promise<any> | void;

// For backward compatibility with existing code
export type Request = NetlifyRequest;
export type Response = NetlifyResponse;
export type NextFunction = (error?: any) => void;
