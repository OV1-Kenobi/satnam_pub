import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AppWithErrorBoundary from './App';
import { AuthProvider } from "./components/auth/AuthProvider";
import { CryptoPreloader } from "./components/CryptoPreloader";
import "./index.css";

// Global NIP-07 guard: wrap extension methods before any React render
(function initNip07GlobalGuard() {
  try {
    const win: any = window as any;
    const METHODS = ['getPublicKey', 'signEvent', 'signSchnorr'];
    const originals: Record<string, any> = (win.__nip07_originals ||= {});
    const alreadyPatched: Set<string> = (win.__nip07_patched ||= new Set());

    const patch = () => {
      if (!win.nostr) return;
      METHODS.forEach((m) => {
        const fn = win.nostr?.[m];
        if (typeof fn === 'function' && !originals[m]) {
          originals[m] = fn;
          alreadyPatched.add(m);
          win.nostr[m] = async (...args: any[]) => {
            const inReg = !!win.__identityForgeRegFlow;
            if (inReg) {
              const msg = `[Global:NIP07-guard] Blocked ${m} during registration`;
              console.warn(msg, { args });
              if (typeof console?.trace === 'function') console.trace(msg);
              return Promise.reject(new Error('NIP-07 disabled during registration'));
            }
            try {
              return await originals[m].apply(win.nostr, args);
            } catch (err) {
              throw err;
            }
          };
        }
      });
    };

    // Patch immediately and keep trying for a few seconds to catch late injection
    patch();
    const intervalId = setInterval(patch, 300);
    setTimeout(() => clearInterval(intervalId), 10000);

    // Expose a small diagnostic helper
    win.__nip07_guard_info = () => ({
      patched: Array.from(alreadyPatched.values()),
      inRegistration: !!win.__identityForgeRegFlow,
    });
  } catch (e) {
    console.warn('Failed to initialize global NIP-07 guard:', e);
  }
})();

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
