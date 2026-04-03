export const TASK_CLOSE_FEEDBACK_KIND = 7000;

export const TASK_CLOSE_STATUS_SUCCESS = "success";
export const TASK_CLOSE_STATUS_ERROR = "error";
export const TASK_CLOSE_STATUS_PARTIAL = "partial";
export const TASK_CLOSE_STATUS_PROCESSING = "processing";

export type TaskCloseStatus =
  | typeof TASK_CLOSE_STATUS_SUCCESS
  | typeof TASK_CLOSE_STATUS_ERROR
  | typeof TASK_CLOSE_STATUS_PARTIAL
  | typeof TASK_CLOSE_STATUS_PROCESSING;

export type FinalTaskChallengeOutcome = "SUCCESS" | "FAILURE" | "CANCELLED";

export function mapTaskCloseStatusToFinalOutcome(
  status: TaskCloseStatus,
): FinalTaskChallengeOutcome | null {
  if (status === TASK_CLOSE_STATUS_SUCCESS) {
    return "SUCCESS";
  }

  if (status === TASK_CLOSE_STATUS_ERROR) {
    return "FAILURE";
  }

  return null;
}