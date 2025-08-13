import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AppWithErrorBoundary from './App';
import { AuthProvider } from "./components/auth/AuthProvider";
import { CryptoPreloader } from "./components/CryptoPreloader";
import "./index.css";

// Global error handler for browser extension communication errors
window.addEventListener('error', (event) => {
  // Suppress browser extension communication errors that don't affect functionality
  if (event.error && event.error.message) {
    const message = event.error.message.toLowerCase();
    if (message.includes('message channel closed') ||
      message.includes('dynastic-sovereignty') ||
      message.includes('extension') ||
      message.includes('listener indicated an asynchronous response')) {
      console.warn('Browser extension communication error (suppressed):', event.error.message);
      event.preventDefault();
      return false;
    }
  }
});

// Global unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && event.reason.message) {
    const message = event.reason.message.toLowerCase();
    if (message.includes('message channel closed') ||
      message.includes('dynastic-sovereignty') ||
      message.includes('extension') ||
      message.includes('listener indicated an asynchronous response')) {
      console.warn('Browser extension promise rejection (suppressed):', event.reason.message);
      event.preventDefault();
      return false;
    }
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Preload crypto modules immediately to avoid late dynamic import failures */}
    <CryptoPreloader immediate />
    <AuthProvider>
      <AppWithErrorBoundary />
    </AuthProvider>
  </StrictMode>,
);
