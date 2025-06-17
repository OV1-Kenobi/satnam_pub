/**
 * @fileoverview Simple Family eCash Wallet Component Test
 * @description Basic test to verify the component renders
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, vi } from "vitest";
import { FamilyMember } from "../../../types/family";

// Mock the federation service
vi.mock("../../../lib/family-nostr-federation", () => ({
  FamilyNostrFederation: vi.fn().mockImplementation(() => ({
    getFamilyEcashBalances: vi.fn().mockResolvedValue({}),
    transferLightningToEcash: vi.fn().mockResolvedValue(true),
    transferEcashToLightning: vi.fn().mockResolvedValue(true),
    checkSpendingLimits: vi.fn().mockResolvedValue(true),
  })),
}));

// Import after mocking
import { FamilyEcashWallet } from "../FamilyEcashWallet";

const mockMember: FamilyMember = {
  id: "test-1",
  name: "Test User",
  role: "parent",
  username: "test@example.com",
};

describe("FamilyEcashWallet - Basic Tests", () => {
  it("should render without crashing", () => {
    render(<FamilyEcashWallet familyMember={mockMember} />);
    expect(
      screen.getByText("Test User - Federated Banking"),
    ).toBeInTheDocument();
  });

  it("should display federation protection indicator", () => {
    render(<FamilyEcashWallet familyMember={mockMember} />);
    expect(screen.getByText("Federation Protected")).toBeInTheDocument();
  });
});
