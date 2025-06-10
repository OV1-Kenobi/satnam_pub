import * as bolt11 from "bolt11";
import { config } from "../config";

// Parse a Lightning invoice
const parseInvoice = (invoice: string) => {
  try {
    return bolt11.decode(invoice);
  } catch (error) {
    throw new Error("Invalid Lightning invoice");
  }
};

// Validate a Lightning address (user@domain.com format)
const validateLightningAddress = (address: string): boolean => {
  const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return regex.test(address);
};

// Generate a Lightning address for a user
const generateLightningAddress = (username: string): string => {
  return `${username}@${config.nip05.domain}`;
};

export { parseInvoice, validateLightningAddress, generateLightningAddress };
