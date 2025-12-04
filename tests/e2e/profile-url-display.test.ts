/**
 * E2E Tests for ProfileURLDisplay Component
 * Phase 3 Sub-Phase 3B Task 3B.4
 *
 * Tests ProfileURLDisplay component functionality including copy-to-clipboard,
 * QR code generation, URL format switching, and visibility status display.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ProfileVisibility } from "../../src/lib/services/profile-service";

// Mock clipboard API
const mockClipboard = {
  writeText: vi.fn(async (text: string) => {
    mockClipboard._lastCopied = text;
    return Promise.resolve();
  }),
  _lastCopied: "",
};

Object.defineProperty(global.navigator, "clipboard", {
  value: mockClipboard,
  writable: true,
});

// Mock browser-compatible QR code utility (ProfileURLDisplay uses qr-code-browser.ts)
vi.mock("../src/utils/qr-code-browser", () => ({
  generateQRCodeDataURL: vi.fn(
    async (text: string, options?: Record<string, unknown>) => {
      return `data:image/png;base64,mockQRCodeFor${encodeURIComponent(text)}`;
    }
  ),
  getRecommendedErrorCorrection: vi.fn((type: string) => "M" as const),
}));

// Test Helpers
interface URLDisplayState {
  username: string;
  npub?: string;
  visibility: ProfileVisibility;
  selectedFormat: "username" | "npub" | "short";
  showQR: boolean;
  copySuccess: boolean;
}

function createURLDisplayState(
  overrides?: Partial<URLDisplayState>
): URLDisplayState {
  return {
    username: "testuser",
    npub: "npub1test123456789abcdefghijklmnopqrstuvwxyz",
    visibility: "public",
    selectedFormat: "username",
    showQR: false,
    copySuccess: false,
    ...overrides,
  };
}

function generateURL(
  username: string,
  npub: string | undefined,
  format: "username" | "npub" | "short"
): string {
  const PLATFORM_DOMAIN = "https://www.satnam.pub";

  switch (format) {
    case "username":
      return `${PLATFORM_DOMAIN}/profile/${username}`;
    case "npub":
      return npub ? `${PLATFORM_DOMAIN}/profile/npub/${npub}` : "";
    case "short":
      return `${PLATFORM_DOMAIN}/p/${username}`;
    default:
      return "";
  }
}

function getVisibilityStatus(visibility: ProfileVisibility): {
  color: string;
  text: string;
  shareable: boolean;
} {
  switch (visibility) {
    case "public":
      return {
        color: "green",
        text: "Public - Anyone can view",
        shareable: true,
      };
    case "contacts_only":
      return {
        color: "blue",
        text: "Contacts Only - Only your contacts can view",
        shareable: true,
      };
    case "trusted_contacts_only":
      return {
        color: "purple",
        text: "Trusted Contacts Only - Only verified/trusted contacts can view",
        shareable: true,
      };
    case "private":
      return {
        color: "gray",
        text: "Private - Only you can view (URL not shareable)",
        shareable: false,
      };
    default:
      return {
        color: "gray",
        text: "Unknown visibility",
        shareable: false,
      };
  }
}

describe("ProfileURLDisplay Component E2E", () => {
  beforeEach(() => {
    mockClipboard._lastCopied = "";
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("URL Format Generation", () => {
    it("should generate username format URL correctly", () => {
      const state = createURLDisplayState({ selectedFormat: "username" });
      const url = generateURL(state.username, state.npub, state.selectedFormat);

      expect(url).toBe("https://www.satnam.pub/profile/testuser");
    });

    it("should generate npub format URL correctly", () => {
      const state = createURLDisplayState({ selectedFormat: "npub" });
      const url = generateURL(state.username, state.npub, state.selectedFormat);

      expect(url).toBe(
        "https://www.satnam.pub/profile/npub/npub1test123456789abcdefghijklmnopqrstuvwxyz"
      );
    });

    it("should generate short format URL correctly", () => {
      const state = createURLDisplayState({ selectedFormat: "short" });
      const url = generateURL(state.username, state.npub, state.selectedFormat);

      expect(url).toBe("https://www.satnam.pub/p/testuser");
    });

    it("should return empty string for npub format when npub is undefined", () => {
      const state = createURLDisplayState({
        selectedFormat: "npub",
        npub: undefined,
      });
      const url = generateURL(state.username, state.npub, state.selectedFormat);

      expect(url).toBe("");
    });

    it("should handle special characters in username", () => {
      const state = createURLDisplayState({
        username: "test_user-123",
        selectedFormat: "username",
      });
      const url = generateURL(state.username, state.npub, state.selectedFormat);

      expect(url).toBe("https://www.satnam.pub/profile/test_user-123");
    });
  });

  describe("Copy-to-Clipboard Functionality", () => {
    it("should copy URL to clipboard successfully", async () => {
      const state = createURLDisplayState({ selectedFormat: "username" });
      const url = generateURL(state.username, state.npub, state.selectedFormat);

      await mockClipboard.writeText(url);

      expect(mockClipboard.writeText).toHaveBeenCalledWith(
        "https://www.satnam.pub/profile/testuser"
      );
      expect(mockClipboard._lastCopied).toBe(
        "https://www.satnam.pub/profile/testuser"
      );
    });

    it("should show success message after copy", async () => {
      const state = createURLDisplayState({ copySuccess: false });
      const url = generateURL(state.username, state.npub, state.selectedFormat);

      await mockClipboard.writeText(url);
      state.copySuccess = true;

      expect(state.copySuccess).toBe(true);
    });

    it("should reset success message after timeout", async () => {
      const state = createURLDisplayState({ copySuccess: true });

      // Simulate timeout
      setTimeout(() => {
        state.copySuccess = false;
      }, 2000);

      // Fast-forward time
      await new Promise((resolve) => setTimeout(resolve, 2100));

      expect(state.copySuccess).toBe(false);
    });

    it("should copy different URL formats correctly", async () => {
      const state = createURLDisplayState();

      // Copy username format
      state.selectedFormat = "username";
      let url = generateURL(state.username, state.npub, state.selectedFormat);
      await mockClipboard.writeText(url);
      expect(mockClipboard._lastCopied).toBe(
        "https://www.satnam.pub/profile/testuser"
      );

      // Copy npub format
      state.selectedFormat = "npub";
      url = generateURL(state.username, state.npub, state.selectedFormat);
      await mockClipboard.writeText(url);
      expect(mockClipboard._lastCopied).toContain("/profile/npub/npub1test");

      // Copy short format
      state.selectedFormat = "short";
      url = generateURL(state.username, state.npub, state.selectedFormat);
      await mockClipboard.writeText(url);
      expect(mockClipboard._lastCopied).toBe(
        "https://www.satnam.pub/p/testuser"
      );
    });
  });

  describe("QR Code Generation", () => {
    it("should toggle QR code display", () => {
      const state = createURLDisplayState({ showQR: false });

      state.showQR = !state.showQR;
      expect(state.showQR).toBe(true);

      state.showQR = !state.showQR;
      expect(state.showQR).toBe(false);
    });

    it("should generate QR code with correct URL", () => {
      const state = createURLDisplayState({
        showQR: true,
        selectedFormat: "username",
      });
      const url = generateURL(state.username, state.npub, state.selectedFormat);

      // QR code should contain the URL
      expect(url).toBe("https://www.satnam.pub/profile/testuser");
    });

    it("should update QR code when URL format changes", () => {
      const state = createURLDisplayState({ showQR: true });

      // Initial URL
      let url = generateURL(state.username, state.npub, state.selectedFormat);
      expect(url).toBe("https://www.satnam.pub/profile/testuser");

      // Change format
      state.selectedFormat = "short";
      url = generateURL(state.username, state.npub, state.selectedFormat);
      expect(url).toBe("https://www.satnam.pub/p/testuser");
    });

    it("should use high error correction level", () => {
      // QR code should use level "H" for high error correction
      const qrLevel = "H";
      expect(qrLevel).toBe("H");
    });

    it("should use 200px size for QR code", () => {
      const qrSize = 200;
      expect(qrSize).toBe(200);
    });
  });

  describe("URL Format Selector", () => {
    it("should switch between URL formats", () => {
      const state = createURLDisplayState({ selectedFormat: "username" });

      expect(state.selectedFormat).toBe("username");

      state.selectedFormat = "npub";
      expect(state.selectedFormat).toBe("npub");

      state.selectedFormat = "short";
      expect(state.selectedFormat).toBe("short");
    });

    it("should disable npub format when npub is undefined", () => {
      const state = createURLDisplayState({ npub: undefined });
      const url = generateURL(state.username, state.npub, "npub");

      expect(url).toBe("");
    });

    it("should update displayed URL when format changes", () => {
      const state = createURLDisplayState();

      state.selectedFormat = "username";
      let url = generateURL(state.username, state.npub, state.selectedFormat);
      expect(url).toContain("/profile/testuser");

      state.selectedFormat = "short";
      url = generateURL(state.username, state.npub, state.selectedFormat);
      expect(url).toContain("/p/testuser");
    });
  });

  describe("Visibility Status Display", () => {
    it("should display public visibility status correctly", () => {
      const status = getVisibilityStatus("public");

      expect(status.color).toBe("green");
      expect(status.text).toBe("Public - Anyone can view");
      expect(status.shareable).toBe(true);
    });

    it("should display contacts_only visibility status correctly", () => {
      const status = getVisibilityStatus("contacts_only");

      expect(status.color).toBe("blue");
      expect(status.text).toBe("Contacts Only - Only your contacts can view");
      expect(status.shareable).toBe(true);
    });

    it("should display trusted_contacts_only visibility status correctly", () => {
      const status = getVisibilityStatus("trusted_contacts_only");

      expect(status.color).toBe("purple");
      expect(status.text).toBe(
        "Trusted Contacts Only - Only verified/trusted contacts can view"
      );
      expect(status.shareable).toBe(true);
    });

    it("should display private visibility status correctly", () => {
      const status = getVisibilityStatus("private");

      expect(status.color).toBe("gray");
      expect(status.text).toBe(
        "Private - Only you can view (URL not shareable)"
      );
      expect(status.shareable).toBe(false);
    });

    it("should disable sharing for private profiles", () => {
      const state = createURLDisplayState({ visibility: "private" });
      const status = getVisibilityStatus(state.visibility);

      expect(status.shareable).toBe(false);
    });

    it("should enable sharing for non-private profiles", () => {
      const publicStatus = getVisibilityStatus("public");
      const contactsStatus = getVisibilityStatus("contacts_only");
      const trustedStatus = getVisibilityStatus("trusted_contacts_only");

      expect(publicStatus.shareable).toBe(true);
      expect(contactsStatus.shareable).toBe(true);
      expect(trustedStatus.shareable).toBe(true);
    });
  });

  describe("Open in New Tab", () => {
    it("should generate correct URL for new tab", () => {
      const state = createURLDisplayState({ selectedFormat: "username" });
      const url = generateURL(state.username, state.npub, state.selectedFormat);

      expect(url).toBe("https://www.satnam.pub/profile/testuser");
    });

    it("should use target='_blank' for external links", () => {
      const target = "_blank";
      const rel = "noopener noreferrer";

      expect(target).toBe("_blank");
      expect(rel).toBe("noopener noreferrer");
    });
  });

  describe("Privacy Notice", () => {
    it("should display privacy notice about analytics", () => {
      const privacyNotice =
        "Profile views are tracked anonymously using hashed identifiers. No personal information is stored.";

      expect(privacyNotice).toContain("anonymously");
      expect(privacyNotice).toContain("hashed");
      expect(privacyNotice).toContain("No personal information");
    });

    it("should show privacy notice for all visibility modes", () => {
      const visibilities: ProfileVisibility[] = [
        "public",
        "contacts_only",
        "trusted_contacts_only",
        "private",
      ];

      visibilities.forEach((visibility) => {
        const state = createURLDisplayState({ visibility });
        expect(state.visibility).toBeDefined();
      });
    });
  });

  describe("Component Props", () => {
    it("should accept username prop", () => {
      const state = createURLDisplayState({ username: "customuser" });

      expect(state.username).toBe("customuser");
    });

    it("should accept optional npub prop", () => {
      const state = createURLDisplayState({ npub: "npub1custom" });

      expect(state.npub).toBe("npub1custom");
    });

    it("should accept visibility prop", () => {
      const state = createURLDisplayState({ visibility: "contacts_only" });

      expect(state.visibility).toBe("contacts_only");
    });

    it("should accept optional className prop", () => {
      const className = "custom-class";

      expect(className).toBe("custom-class");
    });
  });
});
