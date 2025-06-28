import { IncomingMessage, ServerResponse } from "http";

/**
 * Custom API types for Vite project with Express-style handlers
 */

export interface ApiRequest extends IncomingMessage {
  query: { [key: string]: string | string[] | undefined };
  body: any;
  cookies: { [key: string]: string };
  method?: string;
  headers: IncomingMessage["headers"] & {
    authorization?: string;
    "content-type"?: string;
    origin?: string;
    cookie?: string;
  };
}

export interface ApiResponse<T = any> extends ServerResponse {
  status(statusCode: number): ApiResponse<T>;
  json(body: T): void;
  send(body: T): void;
  end(): void;
  setHeader(name: string, value: string | string[]): void;
  getHeader(name: string): string | string[] | undefined;
  removeHeader(name: string): void;
}

export type ApiHandler<T = any> = (
  req: ApiRequest,
  res: ApiResponse<T>
) => void | Promise<void>;
