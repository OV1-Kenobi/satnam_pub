/**
 * Browser-Compatible QR Code Generation Utility
 *
 * FIXED: Replaces Node.js-only QR libraries with browser-compatible solution
 * - No util._extend deprecation warnings
 * - Works in both development and production
 * - Lightweight and fast
 */

import qrcodeModule from "qrcode-generator";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const qrcode = (qrcodeModule as any).default ?? qrcodeModule;

export interface QRCodeOptions {
  size?: number;
  margin?: number;
  errorCorrectionLevel?: "L" | "M" | "Q" | "H";
  foregroundColor?: string;
  backgroundColor?: string;
}

/**
 * Generate QR code as Data URL (PNG format)
 * @param text - Text to encode in QR code
 * @param options - QR code generation options
 * @returns Promise<string> - Data URL of the QR code image
 */
export async function generateQRCodeDataURL(
  text: string,
  options: QRCodeOptions = {}
): Promise<string> {
  const {
    size = 256,
    margin = 4,
    errorCorrectionLevel = "M",
    foregroundColor = "#000000",
    backgroundColor = "#FFFFFF",
  } = options;

  try {
    // Check if running in browser
    if (typeof document === "undefined") {
      throw new Error(
        "generateQRCodeDataURL requires a browser environment with DOM support"
      );
    }

    // Create QR code instance
    const qr = qrcode(0, errorCorrectionLevel);
    qr.addData(text);
    qr.make();

    // Create canvas element
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get canvas context");
    }

    // Calculate dimensions
    const moduleCount = qr.getModuleCount();
    const cellSize = Math.floor((size - margin * 2) / moduleCount);
    const qrSize = cellSize * moduleCount;
    const totalSize = qrSize + margin * 2;

    canvas.width = totalSize;
    canvas.height = totalSize;

    // Fill background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, totalSize, totalSize);

    // Draw QR modules
    ctx.fillStyle = foregroundColor;
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (qr.isDark(row, col)) {
          ctx.fillRect(
            margin + col * cellSize,
            margin + row * cellSize,
            cellSize,
            cellSize
          );
        }
      }
    }

    // Convert to data URL
    return canvas.toDataURL("image/png");
  } catch (error) {
    console.error("Failed to generate QR code:", error);
    throw new Error(
      `QR code generation failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Generate QR code as SVG string
 * @param text - Text to encode in QR code
 * @param options - QR code generation options
 * @returns Promise<string> - SVG string of the QR code
 */
export async function generateQRCodeSVG(
  text: string,
  options: QRCodeOptions = {}
): Promise<string> {
  const {
    size = 256,
    margin = 4,
    errorCorrectionLevel = "M",
    foregroundColor = "#000000",
    backgroundColor = "#FFFFFF",
  } = options;

  try {
    // Validate input
    if (!validateQRText(text)) {
      throw new Error(
        "Invalid QR code text: text is empty, not a string, or exceeds maximum length"
      );
    }

    // Create QR code instance
    const qr = qrcode(0, errorCorrectionLevel);
    qr.addData(text);
    qr.make();

    // Calculate dimensions
    const moduleCount = qr.getModuleCount();
    const cellSize = Math.floor((size - margin * 2) / moduleCount);
    const qrSize = cellSize * moduleCount;
    const totalSize = qrSize + margin * 2;

    // Sanitize colors to prevent XSS
    const safeBackgroundColor = backgroundColor.replace(
      /[^#a-zA-Z0-9(),.\s]/g,
      ""
    );
    const safeForegroundColor = foregroundColor.replace(
      /[^#a-zA-Z0-9(),.\s]/g,
      ""
    );

    // Generate SVG
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalSize}" height="${totalSize}" viewBox="0 0 ${totalSize} ${totalSize}">`;

    // Background
    svg += `<rect width="${totalSize}" height="${totalSize}" fill="${safeBackgroundColor}"/>`;

    // QR modules
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (qr.isDark(row, col)) {
          const x = margin + col * cellSize;
          const y = margin + row * cellSize;
          svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${safeForegroundColor}"/>`;
        }
      }
    }

    svg += "</svg>";
    return svg;
  } catch (error) {
    console.error("Failed to generate QR code SVG:", error);
    throw new Error(
      `QR code SVG generation failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Generate QR code and return both data URL and SVG
 * @param text - Text to encode in QR code
 * @param options - QR code generation options
 * @returns Promise<{dataURL: string, svg: string}> - Both formats
 */
export async function generateQRCode(
  text: string,
  options: QRCodeOptions = {}
): Promise<{ dataURL: string; svg: string }> {
  const [dataURL, svg] = await Promise.all([
    generateQRCodeDataURL(text, options),
    generateQRCodeSVG(text, options),
  ]);

  return { dataURL, svg };
}

/**
 * Validate QR code text input
 * @param text - Text to validate
 * @returns boolean - True if valid
 */
export function validateQRText(text: string): boolean {
  if (!text || typeof text !== "string") {
    return false;
  }

  // Check length (QR codes have limits)
  if (text.length > 2953) {
    // Max for alphanumeric with error correction L
    return false;
  }

  return true;
}

/**
 * Get recommended error correction level based on use case
 * @param useCase - Use case for the QR code
 * @returns Error correction level
 */
export function getRecommendedErrorCorrection(
  useCase: "url" | "payment" | "text" | "critical"
): "L" | "M" | "Q" | "H" {
  switch (useCase) {
    case "critical":
    case "payment":
      return "H"; // High error correction for critical data
    case "url":
      return "M"; // Medium for URLs (balance of size and reliability)
    case "text":
    default:
      return "L"; // Low for general text (smaller size)
  }
}

// Export default configuration
export const DEFAULT_QR_OPTIONS: QRCodeOptions = {
  size: 256,
  margin: 4,
  errorCorrectionLevel: "M",
  foregroundColor: "#000000",
  backgroundColor: "#FFFFFF",
};
