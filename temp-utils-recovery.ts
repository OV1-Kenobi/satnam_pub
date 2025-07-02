import { type ClassValue, clsx } from "clsx";
import { CheckCircle, Clock, LucideIcon, XCircle } from "lucide-react";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format satoshis with proper number formatting
 */
export const formatSats = (sats: number): string => {
  return new Intl.NumberFormat().format(sats);
};

/**
 * Format satoshis to dollars with proper currency formatting
 */
export const formatDollars = (sats: number, satsToDollars: number): string => {
  const dollars = sats * satsToDollars;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(dollars);
};

/**
 * Get status color based on status string
 */
export const getStatusColor = (status: string): string => {
  switch (status) {
    case "connected":
    case "verified":
    case "completed":
    case "operational":
    case "active":
      return "text-green-400";
    case "pending":
      return "text-yellow-400";
    default:
      return "text-red-400";
  }
};

/**
 * Get status icon component type based on status string
 */
export const getStatusIcon = (status: string): LucideIcon => {
  switch (status) {
    case "connected":
    case "verified":
    case "completed":
    case "operational":
    case "active":
      return CheckCircle;
    case "pending":
      return Clock;
    default:
      return XCircle;
  }
};

/**
 * Format time ago from date
 */
export const formatTimeAgo = (date: Date): string => {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds} seconds ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
};

/**
 * Copy text to clipboard with callback
 */
export const copyToClipboard = (
  text: string,
  setCopiedAddress: (text: string | null) => void
) => {
  navigator.clipboard.writeText(text);
  setCopiedAddress(text);
  setTimeout(() => setCopiedAddress(null), 2000);
};

/**
 * Simple copy to clipboard function
 */
export const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error("Failed to copy to clipboard:", error);
    return false;
  }
};

/**
 * Validate Lightning address format
 */
export const isValidLightningAddress = (address: string): boolean => {
  return address.includes("@") || address.toLowerCase().startsWith("lnbc");
};

/**
 * Validate amount is positive number
 */
export const isValidAmount = (amount: string): boolean => {
  const num = Number(amount);
  return !isNaN(num) && num > 0;
};

/**
 * Convert sats to USD
 */
export const satsToUsd = (sats: number, rate: number): number => {
  return sats * rate;
};

/**
 * Convert USD to sats
 */
export const usdToSats = (usd: number, rate: number): number => {
  return Math.round(usd / rate);
};
