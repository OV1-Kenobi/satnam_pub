import type { BlindTokenType } from "../../../types/agent-tokens";

export interface AgentActionPricing {
  label: string;
  description: string;
  singleFeeSats: number;
  bundleQuantity: number;
  bundleFeeSats: number;
}

export const AGENT_ACTION_PRICING: Record<BlindTokenType, AgentActionPricing> = {
  event_post: {
    label: "Event Publishing",
    description: "Publish agent status and work output updates.",
    singleFeeSats: 21,
    bundleQuantity: 10,
    bundleFeeSats: 210,
  },
  task_create: {
    label: "Task Creation",
    description: "Create verifiable task records for delegated work.",
    singleFeeSats: 150,
    bundleQuantity: 10,
    bundleFeeSats: 1500,
  },
  contact_add: {
    label: "Contact Addition",
    description: "Add new contacts and relay relationships.",
    singleFeeSats: 50,
    bundleQuantity: 10,
    bundleFeeSats: 500,
  },
  dm_send: {
    label: "Encrypted DM Bundles",
    description: "Send encrypted direct messages anonymously.",
    singleFeeSats: 21,
    bundleQuantity: 10,
    bundleFeeSats: 210,
  },
};
