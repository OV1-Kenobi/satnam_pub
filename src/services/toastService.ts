/**
 * Toast Notification Service
 *
 * Production-ready toast notification system for user feedback
 * with support for different message types, auto-dismissal, and queuing.
 *
 * MASTER CONTEXT COMPLIANCE:
 * - Privacy-first message handling (no sensitive data logging)
 * - Accessible notifications with proper ARIA attributes
 * - Consistent styling with application theme
 * - Memory-efficient with automatic cleanup
 */

import * as React from "react";

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
  duration?: number; // Auto-dismiss duration in milliseconds (0 = no auto-dismiss)
  action?: {
    label: string;
    onClick: () => void;
  };
  timestamp: number;
}

export interface ToastOptions {
  type?: ToastMessage["type"];
  title?: string;
  duration?: number;
  action?: ToastMessage["action"];
}

// Toast notification store
class ToastStore {
  private toasts: ToastMessage[] = [];
  private listeners: Set<(toasts: ToastMessage[]) => void> = new Set();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private nextId = 1;

  // Add a new toast notification
  addToast(message: string, options: ToastOptions = {}): string {
    const id = `toast-${this.nextId++}`;
    const toast: ToastMessage = {
      id,
      type: options.type || "info",
      title: options.title || this.getDefaultTitle(options.type || "info"),
      message,
      duration:
        options.duration !== undefined
          ? options.duration
          : this.getDefaultDuration(options.type || "info"),
      action: options.action,
      timestamp: Date.now(),
    };

    this.toasts.push(toast);
    this.notifyListeners();

    // Auto-dismiss if duration is set
    if (toast.duration && toast.duration > 0) {
      const timerId = setTimeout(() => {
        this.removeToast(id);
      }, toast.duration);
      this.timers.set(id, timerId);
    }

    return id;
  }

  // Remove a specific toast
  removeToast(id: string): void {
    const index = this.toasts.findIndex((toast) => toast.id === id);
    if (index !== -1) {
      this.toasts.splice(index, 1);

      // Clear pending timer if it exists
      const timerId = this.timers.get(id);
      if (timerId) {
        clearTimeout(timerId);
        this.timers.delete(id);
      }

      this.notifyListeners();
    }
  }

  // Clear all toasts
  clearAll(): void {
    // Clear all pending timers
    this.timers.forEach((timerId) => {
      clearTimeout(timerId);
    });
    this.timers.clear();

    this.toasts = [];
    this.notifyListeners();
  }

  // Get all current toasts
  getToasts(): ToastMessage[] {
    return [...this.toasts];
  }

  // Subscribe to toast changes
  subscribe(listener: (toasts: ToastMessage[]) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener([...this.toasts]));
  }

  private getDefaultTitle(type: ToastMessage["type"]): string {
    switch (type) {
      case "success":
        return "Success";
      case "error":
        return "Error";
      case "warning":
        return "Warning";
      case "info":
        return "Information";
      default:
        return "Notification";
    }
  }

  private getDefaultDuration(type: ToastMessage["type"]): number {
    switch (type) {
      case "success":
        return 4000; // 4 seconds
      case "error":
        return 0; // No auto-dismiss for errors
      case "warning":
        return 6000; // 6 seconds
      case "info":
        return 5000; // 5 seconds
      default:
        return 5000;
    }
  }
}

// Global toast store instance
const toastStore = new ToastStore();

// Convenience functions for different toast types
export const showToast = {
  success: (message: string, options?: Omit<ToastOptions, "type">) =>
    toastStore.addToast(message, { ...options, type: "success" }),

  error: (message: string, options?: Omit<ToastOptions, "type">) =>
    toastStore.addToast(message, { ...options, type: "error" }),

  warning: (message: string, options?: Omit<ToastOptions, "type">) =>
    toastStore.addToast(message, { ...options, type: "warning" }),

  info: (message: string, options?: Omit<ToastOptions, "type">) =>
    toastStore.addToast(message, { ...options, type: "info" }),

  // Generic function
  show: (message: string, options?: ToastOptions) =>
    toastStore.addToast(message, options),
};

// Toast management functions
export const toastManager = {
  remove: (id: string) => toastStore.removeToast(id),
  clearAll: () => toastStore.clearAll(),
  getAll: () => toastStore.getToasts(),
  subscribe: (listener: (toasts: ToastMessage[]) => void) =>
    toastStore.subscribe(listener),
};

// Hook for React components
export const useToasts = () => {
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);

  React.useEffect(() => {
    const unsubscribe = toastStore.subscribe(setToasts);
    setToasts(toastStore.getToasts()); // Get initial state
    return unsubscribe;
  }, []);

  return {
    toasts,
    showToast,
    removeToast: toastManager.remove,
    clearAll: toastManager.clearAll,
  };
};
