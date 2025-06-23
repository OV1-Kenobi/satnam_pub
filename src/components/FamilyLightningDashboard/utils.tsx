import { CheckCircle, Clock, XCircle } from "lucide-react";

export const formatSats = (sats: number): string => {
  return new Intl.NumberFormat().format(sats);
};

export const formatDollars = (sats: number, satsToDollars: number): string => {
  const dollars = sats * satsToDollars;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(dollars);
};

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

export const getStatusIcon = (status: string) => {
  switch (status) {
    case "connected":
    case "verified":
    case "completed":
    case "operational":
    case "active":
      return <CheckCircle className="h-4 w-4" />;
    case "pending":
      return <Clock className="h-4 w-4" />;
    default:
      return <XCircle className="h-4 w-4" />;
  }
};

export const formatTimeAgo = (date: Date): string => {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return `${seconds} seconds ago`;
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
};

export const copyToClipboard = async (text: string, setCopiedAddress: (text: string | null) => void) => {
  try {
    if (!navigator.clipboard) {
      throw new Error('Clipboard API not available');
    }

    if (!text || typeof text !== 'string') {
      throw new Error('Invalid text to copy');
    }

    await navigator.clipboard.writeText(text);
    setCopiedAddress(text);
    setTimeout(() => setCopiedAddress(null), 2000);
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    // Fallback for older browsers
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedAddress(text);
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch (fallbackError) {
      console.error('Fallback copy failed:', fallbackError);
    }
  }
};