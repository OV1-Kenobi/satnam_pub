/**
 * Shared type definitions for Agent blind token system
 * Used across issuance, redemption, and client libraries
 */

export type BlindTokenType =
  | "event_post"
  | "task_create"
  | "contact_add"
  | "dm_send";

export interface ActionPayload {
  event_post?: {
    kind: number;
    content: string;
    tags: string[][];
  };
  task_create?: {
    title: string;
    description: string;
    assignee_npub?: string;
  };
  contact_add?: {
    contact_npub: string;
    contact_name?: string;
  };
  dm_send?: {
    recipient_npub: string;
    content: string;
  };
}

export interface ActionResult {
  token_valid: boolean;
  action_performed: boolean;
  result_data?: {
    event_id?: string;
    task_id?: string;
    contact_id?: string;
    dm_id?: string;
  };
  error?: string;
}
