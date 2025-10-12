import * as bolt11 from "bolt11";
import { resolvePlatformLightningDomain } from "../src/config/domain.client";

// Parse a Lightning invoice
const parseInvoice = (invoice: string) => {
  if (!invoice || typeof invoice !== "string") {
    throw new Error("Invoice parameter is required and must be a string");
  }
  try {
    return bolt11.decode(invoice);
  } catch (error) {
    throw new Error(
      `Invalid Lightning invoice: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
};

// Validate a Lightning address (user@domain.com format)
const validateLightningAddress = (address: string): boolean => {
  if (!address || typeof address !== "string") {
    return false;
  }
  // Lightning address should be more restrictive than general email
  const regex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return regex.test(address);
};

// Generate a Lightning address for a user
const generateLightningAddress = (username: string): string => {
  if (!username || typeof username !== "string") {
    throw new Error("Username parameter is required and must be a string");
  }
  const platformDomain = resolvePlatformLightningDomain();
  if (
    !platformDomain ||
    typeof platformDomain !== "string" ||
    !platformDomain.trim()
  ) {
    throw new Error("Failed to resolve platform Lightning domain");
  }
  const address = `${username}@${platformDomain}`;
  if (!validateLightningAddress(address)) {
    throw new Error("Generated Lightning address is invalid");
  }
  return address;
};

export { generateLightningAddress, parseInvoice, validateLightningAddress };
