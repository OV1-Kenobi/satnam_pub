import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import TaskChallengeDialog from "../../src/components/agents/TaskChallengeDialog";

describe("TaskChallengeDialog", () => {
  it("requires a 20 character explanation before confirming override and forwards it when provided", () => {
    const onOverride = vi.fn();

    render(
      <TaskChallengeDialog
        agentName="Satnam Agent"
        challenge={{
          task_id: "task-1",
          challenge_reason: "AMBIGUOUS_SPEC",
          agent_concern: "The task has no measurable acceptance criteria.",
          requires_clarification: true,
          suggested_modification: "Add tests or measurable outcomes.",
          confidence_in_challenge: 85,
        }}
        onRevise={vi.fn()}
        onOverride={onOverride}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Override with Explanation" }));

    const confirmOverrideButton = screen.getByRole("button", { name: "Confirm Override" });
    expect(confirmOverrideButton).toHaveProperty("disabled", true);

    fireEvent.change(
      screen.getByPlaceholderText("Provide clear reasoning for overriding the agent's concern..."),
      {
        target: { value: "Too short" },
      },
    );
    expect(confirmOverrideButton).toHaveProperty("disabled", true);

    fireEvent.change(
      screen.getByPlaceholderText("Provide clear reasoning for overriding the agent's concern..."),
      {
        target: { value: "The delegator has supplied the missing acceptance criteria." },
      },
    );

    fireEvent.click(confirmOverrideButton);

    expect(onOverride).toHaveBeenCalledWith(
      "The delegator has supplied the missing acceptance criteria.",
    );
  });

  it("lets the delegator back out of override mode and revise or cancel", () => {
    const onRevise = vi.fn();
    const onCancel = vi.fn();

    render(
      <TaskChallengeDialog
        agentName="Satnam Agent"
        challenge={{
          task_id: "task-2",
          challenge_reason: "RESOURCE_EXCEED",
          agent_concern: "This task exceeds the current budget envelope.",
          requires_clarification: true,
          suggested_modification: "Increase budget or reduce scope.",
          confidence_in_challenge: 90,
        }}
        onRevise={onRevise}
        onOverride={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Override with Explanation" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Revise Task" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel Task" }));

    expect(onRevise).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
