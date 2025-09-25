// utils/nsec-security.ts

export interface SecureNsecValidator {
  isValidNsec: boolean;
  securityLevel: "high" | "medium" | "low";
  warnings: string[];
  recommendations: string[];
}

export function validateNsecSecurity(
  nsec: string,
  context: {
    userAgent?: string;
    isHttps?: boolean;
    hasExtension?: boolean;
  }
): SecureNsecValidator {
  const warnings: string[] = [];
  const recommendations: string[] = [];
  let securityLevel: "high" | "medium" | "low" = "high";

  // Basic nsec format validation
  let isValidNsec = false;
  try {
    const { central_event_publishing_service: CEPS } = await import(
      "../lib/central_event_publishing_service"
    );
    const bytes = CEPS.decodeNsec(nsec);
    isValidNsec = bytes instanceof Uint8Array && bytes.length > 0;
  } catch {
    isValidNsec = false;
  }

  if (!isValidNsec) {
    warnings.push("Invalid nsec format");
    securityLevel = "low";
    return { isValidNsec, securityLevel, warnings, recommendations };
  }

  // Security context checks
  if (!context.isHttps) {
    warnings.push("Nsec entered over unencrypted HTTP connection");
    recommendations.push("Only enter nsec on HTTPS websites");
    securityLevel = "low";
  }

  // Browser environment checks
  if (context.userAgent) {
    const ua = context.userAgent.toLowerCase();

    // Check for incognito/private browsing indicators
    if (ua.includes("private") || ua.includes("incognito")) {
      recommendations.push("Good: Using private browsing mode");
    } else {
      warnings.push("Consider using private/incognito browsing for nsec entry");
      securityLevel = securityLevel === "high" ? "medium" : securityLevel;
    }

    // Check for extension availability
    if (!context.hasExtension) {
      recommendations.push(
        "Consider using a Nostr browser extension for better security"
      );
      securityLevel = securityLevel === "high" ? "medium" : securityLevel;
    }
  }

  // Environment recommendations
  recommendations.push("Clear browser data after use");
  recommendations.push("Never share or store nsec in plaintext");
  recommendations.push("Consider using hardware signing devices");

  return {
    isValidNsec,
    securityLevel,
    warnings,
    recommendations,
  };
}

export function createSecureNsecInput(): {
  inputElement: HTMLInputElement | null;
  cleanup: () => void;
} {
  if (typeof window === "undefined") {
    return { inputElement: null, cleanup: () => {} };
  }

  const input = document.createElement("input");
  input.type = "password";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("data-lpignore", "true"); // LastPass ignore
  input.setAttribute("data-form-type", "other"); // Prevent form autofill

  // Security attributes
  input.style.fontFamily = "monospace";
  input.addEventListener("paste", (_e) => {
    // Allow paste but warn user
    setTimeout(() => {
      console.warn("⚠️ Nsec pasted. Ensure you trust this website.");
    }, 100);
  });

  const cleanup = () => {
    // Secure cleanup
    input.value = "";
    input.remove();
  };

  return { inputElement: input, cleanup };
}

export function generateSecurityWarnings(
  level: "high" | "medium" | "low"
): string[] {
  const baseWarnings = [
    "🔐 Your nsec is your master key - treat it like your bank password",
    "🚫 Never share your nsec with anyone",
    "💾 Store backups securely offline",
  ];

  const levelWarnings = {
    low: [
      "🚨 HIGH RISK: Unsecure environment detected",
      "🔒 Do not proceed unless absolutely necessary",
      "🌐 Switch to HTTPS and private browsing",
    ],
    medium: [
      "⚠️ MEDIUM RISK: Some security concerns detected",
      "🕵️ Consider using private browsing mode",
      "🔧 Browser extension recommended for better security",
    ],
    high: [
      "✅ Good security environment detected",
      "🛡️ Remember to clear browser data after use",
    ],
  };

  return [...baseWarnings, ...levelWarnings[level]];
}
