/**
 * @fileoverview Family eCash Wallet Component Tests
 * @description Tests for the FamilyEcashWallet component
 */

import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FamilyMember } from "../../../types/family";
import { FamilyEcashWallet } from "../FamilyEcashWallet";

// Mock the federation service
jest.mock("../../../lib/family-nostr-federation", () => ({
  FamilyNostrFederation: jest.fn().mockImplementation(() => ({
    getFamilyEcashBalances: jest.fn().mockResolvedValue({
      "test-member-1": {
        ecash: 50000,
        lightning: 100000,
        lastUpdated: new Date(),
      },
    }),
    transferLightningToEcash: jest.fn().mockResolvedValue(true),
    transferEcashToLightning: jest.fn().mockResolvedValue(true),
    checkSpendingLimits: jest.fn().mockResolvedValue(true),
  })),
}));

const mockParentMember: FamilyMember = {
  id: "test-member-1",
  name: "Test Parent",
  username: "parent@test.com",
  role: "parent",
  avatar: "P",
  spendingLimits: {
    daily: 1000000,
  },
};

const mockChildMember: FamilyMember = {
  id: "test-member-2",
  name: "Test Child",
  username: "child@test.com",
  role: "child",
  avatar: "C",
  spendingLimits: {
    daily: 10000,
  },
};

describe("FamilyEcashWallet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders wallet component for parent member", async () => {
    render(<FamilyEcashWallet familyMember={mockParentMember} />);

    expect(
      screen.getByText("Test Parent - Federated Banking"),
    ).toBeInTheDocument();
    expect(screen.getByText("Federation Protected")).toBeInTheDocument();

    // Wait for balances to load
    await waitFor(() => {
      expect(screen.getByText("100,000 sats")).toBeInTheDocument(); // Lightning balance
      expect(screen.getByText("50,000 sats")).toBeInTheDocument(); // eCash balance
    });
  });

  it("renders wallet component for child member with spending limits", async () => {
    render(<FamilyEcashWallet familyMember={mockChildMember} />);

    expect(
      screen.getByText("Test Child - Federated Banking"),
    ).toBeInTheDocument();
    expect(screen.getByText("Guardian Protection:")).toBeInTheDocument();
    expect(screen.getByText("Daily limit: 10,000 sats")).toBeInTheDocument();
  });

  it("displays correct balance information", async () => {
    render(<FamilyEcashWallet familyMember={mockParentMember} />);

    await waitFor(() => {
      expect(screen.getByText("Lightning")).toBeInTheDocument();
      expect(screen.getByText("eCash")).toBeInTheDocument();
      expect(screen.getByText("Public payments")).toBeInTheDocument();
      expect(screen.getByText("Private payments")).toBeInTheDocument();
    });
  });

  it("allows transfer direction selection", () => {
    render(<FamilyEcashWallet familyMember={mockParentMember} />);

    const selectElement = screen.getByDisplayValue(
      "Lightning → eCash (for privacy)",
    );
    expect(selectElement).toBeInTheDocument();

    fireEvent.change(selectElement, {
      target: { value: "ecash-to-lightning" },
    });
    expect(
      screen.getByDisplayValue("eCash → Lightning (for external payments)"),
    ).toBeInTheDocument();
  });

  it("handles transfer amount input", () => {
    render(<FamilyEcashWallet familyMember={mockParentMember} />);

    const amountInput = screen.getByPlaceholderText("Amount in sats");
    fireEvent.change(amountInput, { target: { value: "25000" } });

    expect(amountInput).toHaveValue(25000);
  });

  it("enables transfer button when valid amount is entered", async () => {
    render(<FamilyEcashWallet familyMember={mockParentMember} />);

    // Wait for balances to load
    await waitFor(() => {
      expect(screen.getByText("100,000 sats")).toBeInTheDocument();
    });

    const amountInput = screen.getByPlaceholderText("Amount in sats");
    const transferButton = screen.getByRole("button", { name: /Transfer/i });

    // Initially disabled without amount
    expect(transferButton).toBeDisabled();

    // Enter valid amount
    fireEvent.change(amountInput, { target: { value: "25000" } });

    // Should be enabled with valid amount
    await waitFor(() => {
      expect(transferButton).not.toBeDisabled();
    });
  });

  it("shows error message when transfer fails", async () => {
    const mockFederation = {
      getFamilyEcashBalances: jest.fn().mockResolvedValue({
        "test-member-1": {
          ecash: 50000,
          lightning: 100000,
          lastUpdated: new Date(),
        },
      }),
      transferLightningToEcash: jest
        .fn()
        .mockRejectedValue(new Error("Insufficient balance")),
      checkSpendingLimits: jest.fn().mockResolvedValue(true),
    };

    // Mock the federation to throw an error
    jest.doMock("../../../lib/family-nostr-federation", () => ({
      FamilyNostrFederation: jest.fn().mockImplementation(() => mockFederation),
    }));

    render(<FamilyEcashWallet familyMember={mockParentMember} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText("100,000 sats")).toBeInTheDocument();
    });

    const amountInput = screen.getByPlaceholderText("Amount in sats");
    const transferButton = screen.getByRole("button", { name: /Transfer/i });

    fireEvent.change(amountInput, { target: { value: "25000" } });
    fireEvent.click(transferButton);

    await waitFor(() => {
      expect(screen.getByText("Insufficient balance")).toBeInTheDocument();
    });
  });

  it("displays username when available, falls back to name", () => {
    const memberWithUsername = {
      ...mockParentMember,
      username: "parent@satnam.pub",
    };
    render(<FamilyEcashWallet familyMember={memberWithUsername} />);

    expect(
      screen.getByText("parent@satnam.pub - Federated Banking"),
    ).toBeInTheDocument();
  });

  it("displays name when username is not available", () => {
    const memberWithoutUsername = { ...mockParentMember, username: undefined };
    render(<FamilyEcashWallet familyMember={memberWithoutUsername} />);

    expect(
      screen.getByText("Test Parent - Federated Banking"),
    ).toBeInTheDocument();
  });
});
