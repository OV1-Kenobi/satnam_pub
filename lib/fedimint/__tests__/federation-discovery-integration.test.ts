// lib/fedimint/__tests__/federation-discovery-integration.test.ts
import { FederationDiscovery } from "../discovery";
import { FederationManager } from "../federation-manager";

describe("Federation Manager + Discovery Service Integration", () => {
  let manager: FederationManager;

  beforeEach(() => {
    manager = new FederationManager();
  });

  describe("Federation Creation and Registration", () => {
    test("should register federation with discovery service when created", async () => {
      const federationId = await manager.createFederation(
        "Test Federation",
        "Test Description",
        ["https://guardian1.test.com", "https://guardian2.test.com"],
        1,
      );

      const federations = await manager.discoverFederations();
      expect(federations).toHaveLength(1);
      expect(federations[0].id).toBe(federationId);
      expect(federations[0].name).toBe("Test Federation");
    });
  });

  describe("Invite Management", () => {
    let federationId: string;

    beforeEach(async () => {
      federationId = await manager.createFederation(
        "Family Federation",
        "Family custody solution",
        ["https://guardian1.family.com", "https://guardian2.family.com"],
        1,
      );
    });

    test("should create and validate invites", async () => {
      const inviteCode = await manager.createInvite(federationId, "admin");
      expect(inviteCode).toMatch(/^fed_invite_/);

      const invite = await manager.validateInvite(inviteCode);
      expect(invite).not.toBeNull();
      expect(invite!.federationId).toBe(federationId);
      expect(invite!.name).toBe("Family Federation");
    });

    test("should handle expired invites", async () => {
      const inviteCode = await manager.createInvite(federationId, "admin", 1); // 1ms expiry

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 10));

      const invite = await manager.validateInvite(inviteCode);
      expect(invite).toBeNull();
    });

    test("should join federation via valid invite", async () => {
      const inviteCode = await manager.createInvite(federationId, "admin");
      const joinedFederationId = await manager.joinFederation(inviteCode);

      expect(joinedFederationId).toBe(federationId);
    });

    test("should reject invalid invite codes", async () => {
      await expect(manager.joinFederation("invalid_invite")).rejects.toThrow(
        "Invalid or expired invite code",
      );
    });
  });

  describe("Federation Discovery", () => {
    beforeEach(async () => {
      await manager.createFederation(
        "Family Federation",
        "Family custody solution",
        ["https://guardian1.family.com"],
        1,
      );
      await manager.createFederation(
        "Business Federation",
        "Corporate treasury management",
        ["https://guardian1.business.com"],
        1,
      );
    });

    test("should discover all federations", async () => {
      const federations = await manager.discoverFederations();
      expect(federations).toHaveLength(2);
    });

    test("should search federations by name", async () => {
      const familyFederations = await manager.discoverFederations("Family");
      expect(familyFederations).toHaveLength(1);
      expect(familyFederations[0].name).toBe("Family Federation");
    });

    test("should search federations by description", async () => {
      const corporateFederations =
        await manager.discoverFederations("Corporate");
      expect(corporateFederations).toHaveLength(1);
      expect(corporateFederations[0].name).toBe("Business Federation");
    });

    test("should return empty array for no matches", async () => {
      const noMatches = await manager.discoverFederations("NonExistent");
      expect(noMatches).toHaveLength(0);
    });
  });

  describe("Guardian Health Monitoring", () => {
    let federationId: string;

    beforeEach(async () => {
      federationId = await manager.createFederation(
        "Test Federation",
        "Test Description",
        ["https://guardian1.test.com", "https://guardian2.test.com"],
        1,
      );
    });

    test("should check guardian health", async () => {
      const guardianHealth = await manager.getGuardianHealth(federationId);
      expect(guardianHealth).toHaveLength(2);
      guardianHealth.forEach((guardian) => {
        expect(guardian.status).toMatch(/^(online|offline)$/);
        expect(guardian.lastSeen).toBeInstanceOf(Date);
      });
    });

    test("should get federation with health info", async () => {
      const federationWithHealth =
        await manager.getFederationWithHealth(federationId);
      expect(federationWithHealth).not.toBeNull();
      expect(federationWithHealth!.guardianHealth).toHaveLength(2);
      expect(federationWithHealth!.name).toBe("Test Federation");
    });

    test("should get all federations with health", async () => {
      const allFederationsWithHealth =
        await manager.getAllFederationsWithHealth();
      expect(allFederationsWithHealth).toHaveLength(1);
      expect(allFederationsWithHealth[0].guardianHealth).toHaveLength(2);
    });
  });

  describe("Discovery Service Access", () => {
    test("should provide access to discovery service", () => {
      const discoveryService = manager.getDiscoveryService();
      expect(discoveryService).toBeInstanceOf(FederationDiscovery);
    });
  });

  describe("Error Handling", () => {
    test("should throw error for invalid federation in invite creation", async () => {
      await expect(
        manager.createInvite("invalid_federation_id", "admin"),
      ).rejects.toThrow("Federation not found");
    });

    test("should throw error for invalid federation in health check", async () => {
      await expect(
        manager.getGuardianHealth("invalid_federation_id"),
      ).rejects.toThrow("Federation not found");
    });
  });
});
