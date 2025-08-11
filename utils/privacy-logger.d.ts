/**
 * Type definitions for the privacy-aware logger utility
 */

export type LogLevel = "log" | "warn" | "error";

export interface PrivacyLogger {
  setDevMode(value: boolean): void;
  log(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
}

export const redactLogger: PrivacyLogger;
export function setDevMode(value: boolean): void;
export function log(...args: any[]): void;
export function warn(...args: any[]): void;
export function error(...args: any[]): void;

