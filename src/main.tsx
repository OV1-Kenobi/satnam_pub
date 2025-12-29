import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { BrowserRouter } from "react-router-dom";
import { registerSecureNsecSessionProvider } from "../lib/secure-nsec-session-registry";
import AppWithErrorBoundary from './App';
import { AuthProvider } from "./components/auth/AuthProvider";
import { CryptoPreloader } from "./components/CryptoPreloader";
import { getEnvVar } from './config/env.client';
import "./index.css";
import { secureNsecSessionProvider } from "./lib/secure-nsec-manager";
import { initializeSentry } from "./lib/sentry";

// Initialize Sentry error tracking (Phase 2B-2 Day 15)
initializeSentry();

// Bridge SecureNsecManager into the CEPS secure session registry so that
// CentralEventPublishingService can use real secure nsec sessions.
registerSecureNsecSessionProvider(secureNsecSessionProvider);

// Early diagnostics: inspect React module shape in production builds
if (import.meta.env && import.meta.env.PROD) {
  import('react')
    .then((mod) => {
      const anyMod: any = mod as any;
      console.warn('[Diag] React module keys:', Object.keys(mod));
      console.warn('[Diag] React.version:', anyMod?.version ?? 'unknown');
      console.warn('[Diag] typeof createContext:', typeof anyMod?.createContext);
      console.warn('[Diag] typeof StrictMode:', typeof anyMod?.StrictMode);
    })
    .catch((e) => {
      console.error('[Diag] Failed dynamic import("react"):', e);
    });
}

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
    <BrowserRouter>
      <HelmetProvider>
        {/* Preload crypto modules immediately to avoid late dynamic import failures */}
        <CryptoPreloader immediate />
        <AuthProvider>
          <AppWithErrorBoundary />
        </AuthProvider>
      </HelmetProvider>
    </BrowserRouter>
  </StrictMode>,
);


// Register service worker for PWA (feature-flagged)
// CRITICAL FIX: Use getEnvVar() for module-level access to prevent TDZ errors
const ENABLE_PWA = (getEnvVar('VITE_ENABLE_PWA') || 'false') === 'true';

if (ENABLE_PWA && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
} else {
  // PWA temporarily disabled during active development; service worker not registered
  if ('serviceWorker' in navigator) {
    // Non-blocking cleanup of any previously-installed service workers and their caches
    window.addEventListener('load', () => {
      (async () => {
        try {
          console.info('[PWA] Disabled: attempting to unregister existing service workers and clear caches.');

          // Unregister all existing service workers for this origin
          try {
            const regs = await navigator.serviceWorker.getRegistrations();
            if (regs && regs.length > 0) {
              await Promise.all(
                regs.map(async (r) => {
                  try {
                    const ok = await r.unregister();
                    console.info(`[PWA] Unregister ${r.scope}: ${ok ? 'ok' : 'failed'}`);
                  } catch (e) {
                    console.warn('[PWA] Unregister failed:', e instanceof Error ? e.message : String(e));
                  }
                })
              );
            } else {
              console.info('[PWA] No existing service workers to unregister.');
            }
          } catch (e) {
            console.warn('[PWA] Failed to enumerate service workers:', e instanceof Error ? e.message : String(e));
          }

          // Clear all caches (including prior PWA caches like satnam-pwa-v1)
          try {
            if ('caches' in window) {
              const names = await caches.keys();
              await Promise.all(
                names.map(async (name) => {
                  try {
                    const deleted = await caches.delete(name);
                    console.info(`[PWA] Cache ${name} delete: ${deleted}`);
                  } catch (e) {
                    console.warn('[PWA] Cache delete failed:', e instanceof Error ? e.message : String(e));
                  }
                })
              );
            }
          } catch (e) {
            console.warn('[PWA] Failed to clear caches:', e instanceof Error ? e.message : String(e));
          }
        } catch (e) {
          console.warn('[PWA] Cleanup failed:', e instanceof Error ? e.message : String(e));
        }
      })();
    });
  }
}
