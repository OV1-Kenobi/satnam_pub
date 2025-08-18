import React, { useEffect } from "react";

interface GuardProps {
  children: React.ReactNode;
}

// Pre-render guard to block any NIP-07 calls during Identity Forge registration
// Sets a global flag and synchronously patches window.nostr methods before children mount
const IdentityForgeGuard: React.FC<GuardProps> = ({ children }) => {
  if (typeof window !== "undefined") {
    try {
      const win: any = window as any;
      // Mark registration flow immediately
      win.__identityForgeRegFlow = true;
      // Synchronous patch to block extension calls as early as possible
      const blocked = ["getPublicKey", "signEvent", "signSchnorr"];
      if (win.nostr) {
        blocked.forEach((m) => {
          const fn = win.nostr?.[m];
          if (typeof fn === "function") {
            win.nostr[m] = async (...args: any[]) => {
              const msg = `[IdentityForgeGuard] Blocked ${m} during registration`;
              try {
                console.warn(msg, { args });
                if (typeof console?.trace === "function") console.trace(msg);
              } catch {}
              throw new Error("NIP-07 disabled during registration");
            };
          }
        });
      }
    } catch {}
  }

  useEffect(() => {
    return () => {
      try {
        delete (window as any).__identityForgeRegFlow;
      } catch {}
    };
  }, []);

  return <>{children}</>;
};

export default IdentityForgeGuard;

