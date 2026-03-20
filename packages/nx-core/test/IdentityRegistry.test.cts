import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

// Entity types mirror Solidity enum
const EntityType = { Human: 0, VirtualAgent: 1, PhysicalAgent: 2, Organization: 3 };
const EntityStatus = { Active: 0, Suspended: 1, Revoked: 2 };

describe("IdentityRegistry", function () {
  async function deployFixture() {
    const [deployer, operator, operator2, agentAddr, agentAddr2, stranger] =
      await hre.ethers.getSigners();

    const IdentityRegistry = await hre.ethers.getContractFactory("IdentityRegistry");
    const registry = await IdentityRegistry.deploy();

    // Authorize deployer as registrar (all registration goes through registrar)
    await registry.connect(deployer).setRegistrar(deployer.address, true);

    const metadataHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("metadata-v1"));
    const metadataHash2 = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("metadata-v2"));

    return { registry, deployer, operator, operator2, agentAddr, agentAddr2, stranger, metadataHash, metadataHash2 };
  }

  /** Helper: register an operator via the registrar (deployer) */
  async function registerOperator(
    registry: Awaited<ReturnType<typeof deployFixture>>["registry"],
    deployer: Awaited<ReturnType<typeof deployFixture>>["deployer"],
    operator: Awaited<ReturnType<typeof deployFixture>>["operator"],
    entityType: number,
    metadataHash: string
  ) {
    return registry.connect(deployer).registerIdentityFor(operator.address, entityType, metadataHash);
  }

  // ─── Registration (Registrar-Only) ─────────────────────

  describe("Operator Registration (via Registrar)", function () {
    it("should not have a registerIdentity function (self-registration removed)", async function () {
      const { registry } = await loadFixture(deployFixture);

      // Verify that registerIdentity does not exist on the contract
      expect(registry.registerIdentity).to.be.undefined;
    });

    it("should set isRegistered correctly after registrar registration", async function () {
      const { registry, deployer, operator, stranger, metadataHash } = await loadFixture(deployFixture);

      await registry.connect(deployer).setRegistrar(deployer.address, true);

      expect(await registry.isRegistered(operator.address)).to.be.false;
      await registry.connect(deployer).registerIdentityFor(operator.address, EntityType.Human, metadataHash);
      expect(await registry.isRegistered(operator.address)).to.be.true;
      expect(await registry.isRegistered(stranger.address)).to.be.false;
    });

    it("should set ownerOf to self for operators registered by registrar", async function () {
      const { registry, deployer, operator, metadataHash } = await loadFixture(deployFixture);

      await registry.connect(deployer).setRegistrar(deployer.address, true);
      await registry.connect(deployer).registerIdentityFor(operator.address, EntityType.Human, metadataHash);
      expect(await registry.ownerOf(operator.address)).to.equal(operator.address);
    });
  });

  // ─── Agent Creation ────────────────────────────────────

  describe("Agent Identity Creation", function () {
    it("should let an operator create a VirtualAgent", async function () {
      const { registry, deployer, operator, agentAddr, metadataHash } = await loadFixture(deployFixture);

      await registerOperator(registry, deployer, operator, EntityType.Human, metadataHash);

      const agentMeta = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("agent-metadata"));
      await expect(
        registry.connect(operator).createAgentIdentity(agentAddr.address, EntityType.VirtualAgent, agentMeta)
      )
        .to.emit(registry, "IdentityRegistered")
        .withArgs(agentAddr.address, EntityType.VirtualAgent, operator.address, agentMeta);

      const record = await registry.getIdentity(agentAddr.address);
      expect(record.entityType).to.equal(EntityType.VirtualAgent);
      expect(record.status).to.equal(EntityStatus.Active);
      expect(record.owner).to.equal(operator.address);
    });

    it("should let an operator create a PhysicalAgent", async function () {
      const { registry, deployer, operator, agentAddr, metadataHash } = await loadFixture(deployFixture);

      await registerOperator(registry, deployer, operator, EntityType.Human, metadataHash);
      await registry.connect(operator).createAgentIdentity(agentAddr.address, EntityType.PhysicalAgent, metadataHash);

      const record = await registry.getIdentity(agentAddr.address);
      expect(record.entityType).to.equal(EntityType.PhysicalAgent);
    });

    it("should let an Organization create agents", async function () {
      const { registry, deployer, operator, agentAddr, metadataHash } = await loadFixture(deployFixture);

      await registerOperator(registry, deployer, operator, EntityType.Organization, metadataHash);
      await registry.connect(operator).createAgentIdentity(agentAddr.address, EntityType.VirtualAgent, metadataHash);

      expect(await registry.ownerOf(agentAddr.address)).to.equal(operator.address);
    });

    it("should set agent ownerOf to the operator", async function () {
      const { registry, deployer, operator, agentAddr, metadataHash } = await loadFixture(deployFixture);

      await registerOperator(registry, deployer, operator, EntityType.Human, metadataHash);
      await registry.connect(operator).createAgentIdentity(agentAddr.address, EntityType.VirtualAgent, metadataHash);

      expect(await registry.ownerOf(agentAddr.address)).to.equal(operator.address);
    });

    it("should reject agent creation from unregistered caller", async function () {
      const { registry, stranger, agentAddr, metadataHash } = await loadFixture(deployFixture);

      await expect(
        registry.connect(stranger).createAgentIdentity(agentAddr.address, EntityType.VirtualAgent, metadataHash)
      ).to.be.revertedWith("Identity not registered");
    });

    it("should reject agent creation with Human type", async function () {
      const { registry, deployer, operator, agentAddr, metadataHash } = await loadFixture(deployFixture);

      await registerOperator(registry, deployer, operator, EntityType.Human, metadataHash);

      await expect(
        registry.connect(operator).createAgentIdentity(agentAddr.address, EntityType.Human, metadataHash)
      ).to.be.revertedWith("Agent must be VirtualAgent or PhysicalAgent");
    });

    it("should reject agent creation with Organization type", async function () {
      const { registry, deployer, operator, agentAddr, metadataHash } = await loadFixture(deployFixture);

      await registerOperator(registry, deployer, operator, EntityType.Human, metadataHash);

      await expect(
        registry.connect(operator).createAgentIdentity(agentAddr.address, EntityType.Organization, metadataHash)
      ).to.be.revertedWith("Agent must be VirtualAgent or PhysicalAgent");
    });

    it("should reject creating agent if operator is suspended", async function () {
      const { registry, deployer, operator, agentAddr, metadataHash } = await loadFixture(deployFixture);

      await registerOperator(registry, deployer, operator, EntityType.Human, metadataHash);
      await registry.connect(operator).updateStatus(operator.address, EntityStatus.Suspended);

      await expect(
        registry.connect(operator).createAgentIdentity(agentAddr.address, EntityType.VirtualAgent, metadataHash)
      ).to.be.revertedWith("Identity not active");
    });

    it("should reject duplicate agent address", async function () {
      const { registry, deployer, operator, agentAddr, metadataHash } = await loadFixture(deployFixture);

      await registerOperator(registry, deployer, operator, EntityType.Human, metadataHash);
      await registry.connect(operator).createAgentIdentity(agentAddr.address, EntityType.VirtualAgent, metadataHash);

      await expect(
        registry.connect(operator).createAgentIdentity(agentAddr.address, EntityType.VirtualAgent, metadataHash)
      ).to.be.revertedWith("Agent already registered");
    });

    it("should let an operator create multiple agents", async function () {
      const { registry, deployer, operator, agentAddr, agentAddr2, metadataHash } = await loadFixture(deployFixture);

      await registerOperator(registry, deployer, operator, EntityType.Human, metadataHash);
      await registry.connect(operator).createAgentIdentity(agentAddr.address, EntityType.VirtualAgent, metadataHash);
      await registry.connect(operator).createAgentIdentity(agentAddr2.address, EntityType.PhysicalAgent, metadataHash);

      expect(await registry.ownerOf(agentAddr.address)).to.equal(operator.address);
      expect(await registry.ownerOf(agentAddr2.address)).to.equal(operator.address);
    });

    it("should not allow an agent to create sub-agents directly via createAgentIdentity", async function () {
      const { registry, deployer, operator, agentAddr, agentAddr2, metadataHash } = await loadFixture(deployFixture);

      await registerOperator(registry, deployer, operator, EntityType.Human, metadataHash);
      await registry.connect(operator).createAgentIdentity(agentAddr.address, EntityType.VirtualAgent, metadataHash);

      // Agent tries to create a sub-agent — should fail because VirtualAgent is not Human or Org
      await expect(
        registry.connect(agentAddr).createAgentIdentity(agentAddr2.address, EntityType.VirtualAgent, metadataHash)
      ).to.be.revertedWith("Only Human or Organization can create agents");
    });
  });

  // ─── Status Transitions ────────────────────────────────

  describe("Status Transitions", function () {
    it("Active → Suspended (by self)", async function () {
      const { registry, deployer, operator, metadataHash } = await loadFixture(deployFixture);

      await registerOperator(registry, deployer, operator, EntityType.Human, metadataHash);

      await expect(registry.connect(operator).updateStatus(operator.address, EntityStatus.Suspended))
        .to.emit(registry, "IdentityStatusUpdated")
        .withArgs(operator.address, EntityStatus.Active, EntityStatus.Suspended);

      const record = await registry.getIdentity(operator.address);
      expect(record.status).to.equal(EntityStatus.Suspended);
    });

    it("Suspended → Active (reactivation)", async function () {
      const { registry, deployer, operator, metadataHash } = await loadFixture(deployFixture);

      await registerOperator(registry, deployer, operator, EntityType.Human, metadataHash);
      await registry.connect(operator).updateStatus(operator.address, EntityStatus.Suspended);

      await expect(registry.connect(operator).updateStatus(operator.address, EntityStatus.Active))
        .to.emit(registry, "IdentityStatusUpdated")
        .withArgs(operator.address, EntityStatus.Suspended, EntityStatus.Active);

      const record = await registry.getIdentity(operator.address);
      expect(record.status).to.equal(EntityStatus.Active);
    });

    it("Active → Revoked (permanent)", async function () {
      const { registry, deployer, operator, metadataHash } = await loadFixture(deployFixture);

      await registerOperator(registry, deployer, operator, EntityType.Human, metadataHash);

      await expect(registry.connect(operator).updateStatus(operator.address, EntityStatus.Revoked))
        .to.emit(registry, "IdentityStatusUpdated")
        .withArgs(operator.address, EntityStatus.Active, EntityStatus.Revoked);
    });

    it("Suspended → Revoked", async function () {
      const { registry, deployer, operator, metadataHash } = await loadFixture(deployFixture);

      await registerOperator(registry, deployer, operator, EntityType.Human, metadataHash);
      await registry.connect(operator).updateStatus(operator.address, EntityStatus.Suspended);
      await registry.connect(operator).updateStatus(operator.address, EntityStatus.Revoked);

      const record = await registry.getIdentity(operator.address);
      expect(record.status).to.equal(EntityStatus.Revoked);
    });

    it("Revoked is terminal — cannot unsuspend", async function () {
      const { registry, deployer, operator, metadataHash } = await loadFixture(deployFixture);

      await registerOperator(registry, deployer, operator, EntityType.Human, metadataHash);
      await registry.connect(operator).updateStatus(operator.address, EntityStatus.Revoked);

      await expect(
        registry.connect(operator).updateStatus(operator.address, EntityStatus.Active)
      ).to.be.revertedWith("Cannot update revoked identity");
    });

    it("Revoked is terminal — cannot re-suspend", async function () {
      const { registry, deployer, operator, metadataHash } = await loadFixture(deployFixture);

      await registerOperator(registry, deployer, operator, EntityType.Human, metadataHash);
      await registry.connect(operator).updateStatus(operator.address, EntityStatus.Revoked);

      await expect(
        registry.connect(operator).updateStatus(operator.address, EntityStatus.Suspended)
      ).to.be.revertedWith("Cannot update revoked identity");
    });

    it("Active → Active should fail", async function () {
      const { registry, deployer, operator, metadataHash } = await loadFixture(deployFixture);

      await registerOperator(registry, deployer, operator, EntityType.Human, metadataHash);

      await expect(
        registry.connect(operator).updateStatus(operator.address, EntityStatus.Active)
      ).to.be.revertedWith("Can only reactivate suspended identity");
    });

    it("Suspended → Suspended should fail", async function () {
      const { registry, deployer, operator, metadataHash } = await loadFixture(deployFixture);

      await registerOperator(registry, deployer, operator, EntityType.Human, metadataHash);
      await registry.connect(operator).updateStatus(operator.address, EntityStatus.Suspended);

      await expect(
        registry.connect(operator).updateStatus(operator.address, EntityStatus.Suspended)
      ).to.be.revertedWith("Can only suspend active identity");
    });

    it("operator can suspend/revoke their agent", async function () {
      const { registry, deployer, operator, agentAddr, metadataHash } = await loadFixture(deployFixture);

      await registerOperator(registry, deployer, operator, EntityType.Human, metadataHash);
      await registry.connect(operator).createAgentIdentity(agentAddr.address, EntityType.VirtualAgent, metadataHash);

      // Operator (owner) suspends the agent
      await registry.connect(operator).updateStatus(agentAddr.address, EntityStatus.Suspended);
      expect((await registry.getIdentity(agentAddr.address)).status).to.equal(EntityStatus.Suspended);

      // Operator reactivates
      await registry.connect(operator).updateStatus(agentAddr.address, EntityStatus.Active);
      expect((await registry.getIdentity(agentAddr.address)).status).to.equal(EntityStatus.Active);

      // Operator revokes
      await registry.connect(operator).updateStatus(agentAddr.address, EntityStatus.Revoked);
      expect((await registry.getIdentity(agentAddr.address)).status).to.equal(EntityStatus.Revoked);
    });

    it("stranger cannot update another identity's status", async function () {
      const { registry, deployer, operator, stranger, metadataHash } = await loadFixture(deployFixture);

      await registerOperator(registry, deployer, operator, EntityType.Human, metadataHash);

      await expect(
        registry.connect(stranger).updateStatus(operator.address, EntityStatus.Suspended)
      ).to.be.revertedWith("Not authorized");
    });
  });

  // ─── Metadata ──────────────────────────────────────────

  describe("Metadata Updates", function () {
    it("should update metadata hash and emit event", async function () {
      const { registry, deployer, operator, metadataHash, metadataHash2 } = await loadFixture(deployFixture);

      await registerOperator(registry, deployer, operator, EntityType.Human, metadataHash);

      await expect(registry.connect(operator).updateMetadata(operator.address, metadataHash2))
        .to.emit(registry, "MetadataUpdated")
        .withArgs(operator.address, metadataHash, metadataHash2);

      const record = await registry.getIdentity(operator.address);
      expect(record.metadataHash).to.equal(metadataHash2);
    });

    it("operator can update agent metadata", async function () {
      const { registry, deployer, operator, agentAddr, metadataHash, metadataHash2 } = await loadFixture(deployFixture);

      await registerOperator(registry, deployer, operator, EntityType.Human, metadataHash);
      await registry.connect(operator).createAgentIdentity(agentAddr.address, EntityType.VirtualAgent, metadataHash);

      await registry.connect(operator).updateMetadata(agentAddr.address, metadataHash2);
      expect((await registry.getIdentity(agentAddr.address)).metadataHash).to.equal(metadataHash2);
    });

    it("stranger cannot update metadata", async function () {
      const { registry, deployer, operator, stranger, metadataHash, metadataHash2 } = await loadFixture(deployFixture);

      await registerOperator(registry, deployer, operator, EntityType.Human, metadataHash);

      await expect(
        registry.connect(stranger).updateMetadata(operator.address, metadataHash2)
      ).to.be.revertedWith("Not authorized");
    });
  });

  // ─── View Functions ────────────────────────────────────

  describe("View Functions", function () {
    it("getIdentity should revert for unregistered address", async function () {
      const { registry, stranger } = await loadFixture(deployFixture);

      await expect(registry.getIdentity(stranger.address)).to.be.revertedWith("Identity not registered");
    });

    it("ownerOf should revert for unregistered address", async function () {
      const { registry, stranger } = await loadFixture(deployFixture);

      await expect(registry.ownerOf(stranger.address)).to.be.revertedWith("Identity not registered");
    });
  });

  // ─── Admin & Registrar ──────────────────────────────────

  describe("Admin", function () {
    it("deployer should be the initial admin", async function () {
      const { registry, deployer } = await loadFixture(deployFixture);

      expect(await registry.admin()).to.equal(deployer.address);
    });

    it("admin can transfer admin role", async function () {
      const { registry, deployer, operator } = await loadFixture(deployFixture);

      await expect(registry.connect(deployer).transferAdmin(operator.address))
        .to.emit(registry, "AdminTransferred")
        .withArgs(deployer.address, operator.address);

      expect(await registry.admin()).to.equal(operator.address);
    });

    it("non-admin cannot transfer admin role", async function () {
      const { registry, stranger, operator } = await loadFixture(deployFixture);

      await expect(
        registry.connect(stranger).transferAdmin(operator.address)
      ).to.be.revertedWith("Not admin");
    });

    it("cannot transfer admin to zero address", async function () {
      const { registry, deployer } = await loadFixture(deployFixture);

      await expect(
        registry.connect(deployer).transferAdmin(hre.ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid admin address");
    });

    it("old admin loses privileges after transfer", async function () {
      const { registry, deployer, operator, stranger } = await loadFixture(deployFixture);

      await registry.connect(deployer).transferAdmin(operator.address);

      // Old admin can no longer manage registrars
      await expect(
        registry.connect(deployer).setRegistrar(stranger.address, true)
      ).to.be.revertedWith("Not admin");

      // New admin can
      await registry.connect(operator).setRegistrar(stranger.address, true);
      expect(await registry.isRegistrar(stranger.address)).to.be.true;
    });
  });

  describe("Registrar Management", function () {
    it("admin can add a registrar", async function () {
      const { registry, deployer, operator } = await loadFixture(deployFixture);

      await expect(registry.connect(deployer).setRegistrar(operator.address, true))
        .to.emit(registry, "RegistrarUpdated")
        .withArgs(operator.address, true);

      expect(await registry.isRegistrar(operator.address)).to.be.true;
    });

    it("admin can remove a registrar", async function () {
      const { registry, deployer, operator } = await loadFixture(deployFixture);

      await registry.connect(deployer).setRegistrar(operator.address, true);
      await expect(registry.connect(deployer).setRegistrar(operator.address, false))
        .to.emit(registry, "RegistrarUpdated")
        .withArgs(operator.address, false);

      expect(await registry.isRegistrar(operator.address)).to.be.false;
    });

    it("non-admin cannot manage registrars", async function () {
      const { registry, stranger, operator } = await loadFixture(deployFixture);

      await expect(
        registry.connect(stranger).setRegistrar(operator.address, true)
      ).to.be.revertedWith("Not admin");
    });

    it("cannot set zero address as registrar", async function () {
      const { registry, deployer } = await loadFixture(deployFixture);

      await expect(
        registry.connect(deployer).setRegistrar(hre.ethers.ZeroAddress, true)
      ).to.be.revertedWith("Invalid registrar address");
    });
  });

  describe("Registrar Registration (registerIdentityFor)", function () {
    it("registrar can register a Human identity for a user", async function () {
      const { registry, deployer, operator, stranger, metadataHash } = await loadFixture(deployFixture);

      // deployer (admin) authorizes operator as registrar
      await registry.connect(deployer).setRegistrar(operator.address, true);

      // registrar registers identity for stranger's address (e.g., their Safe)
      await expect(
        registry.connect(operator).registerIdentityFor(stranger.address, EntityType.Human, metadataHash)
      )
        .to.emit(registry, "IdentityRegistered")
        .withArgs(stranger.address, EntityType.Human, stranger.address, metadataHash);

      const record = await registry.getIdentity(stranger.address);
      expect(record.entityType).to.equal(EntityType.Human);
      expect(record.status).to.equal(EntityStatus.Active);
      expect(record.owner).to.equal(stranger.address); // Owner is the user, not registrar
    });

    it("registrar can register an Organization identity for a user", async function () {
      const { registry, deployer, operator, stranger, metadataHash } = await loadFixture(deployFixture);

      await registry.connect(deployer).setRegistrar(operator.address, true);

      await registry.connect(operator).registerIdentityFor(stranger.address, EntityType.Organization, metadataHash);

      const record = await registry.getIdentity(stranger.address);
      expect(record.entityType).to.equal(EntityType.Organization);
      expect(record.owner).to.equal(stranger.address);
    });

    it("non-registrar cannot call registerIdentityFor", async function () {
      const { registry, stranger, agentAddr, metadataHash } = await loadFixture(deployFixture);

      await expect(
        registry.connect(stranger).registerIdentityFor(agentAddr.address, EntityType.Human, metadataHash)
      ).to.be.revertedWith("Not registrar");
    });

    it("registrar cannot register agent types", async function () {
      const { registry, deployer, operator, stranger, metadataHash } = await loadFixture(deployFixture);

      await registry.connect(deployer).setRegistrar(operator.address, true);

      await expect(
        registry.connect(operator).registerIdentityFor(stranger.address, EntityType.VirtualAgent, metadataHash)
      ).to.be.revertedWith("Only Human or Organization can be registered");

      await expect(
        registry.connect(operator).registerIdentityFor(stranger.address, EntityType.PhysicalAgent, metadataHash)
      ).to.be.revertedWith("Only Human or Organization can be registered");
    });

    it("registrar cannot register for zero address", async function () {
      const { registry, deployer, operator, metadataHash } = await loadFixture(deployFixture);

      await registry.connect(deployer).setRegistrar(operator.address, true);

      await expect(
        registry.connect(operator).registerIdentityFor(hre.ethers.ZeroAddress, EntityType.Human, metadataHash)
      ).to.be.revertedWith("Invalid owner address");
    });

    it("registrar cannot register duplicate identity", async function () {
      const { registry, deployer, operator, stranger, metadataHash } = await loadFixture(deployFixture);

      await registry.connect(deployer).setRegistrar(operator.address, true);

      await registry.connect(operator).registerIdentityFor(stranger.address, EntityType.Human, metadataHash);

      await expect(
        registry.connect(operator).registerIdentityFor(stranger.address, EntityType.Human, metadataHash)
      ).to.be.revertedWith("Already registered");
    });

    it("identity registered by registrar can still self-manage", async function () {
      const { registry, deployer, operator, stranger, metadataHash, metadataHash2 } = await loadFixture(deployFixture);

      await registry.connect(deployer).setRegistrar(operator.address, true);
      await registry.connect(operator).registerIdentityFor(stranger.address, EntityType.Human, metadataHash);

      // User (stranger) can update their own metadata
      await registry.connect(stranger).updateMetadata(stranger.address, metadataHash2);
      expect((await registry.getIdentity(stranger.address)).metadataHash).to.equal(metadataHash2);

      // User can suspend themselves
      await registry.connect(stranger).updateStatus(stranger.address, EntityStatus.Suspended);
      expect((await registry.getIdentity(stranger.address)).status).to.equal(EntityStatus.Suspended);
    });

    it("identity registered by registrar can create agents", async function () {
      const { registry, deployer, operator, stranger, agentAddr, metadataHash } = await loadFixture(deployFixture);

      await registry.connect(deployer).setRegistrar(operator.address, true);
      await registry.connect(operator).registerIdentityFor(stranger.address, EntityType.Human, metadataHash);

      // User creates their own agent
      await registry.connect(stranger).createAgentIdentity(agentAddr.address, EntityType.VirtualAgent, metadataHash);

      expect(await registry.ownerOf(agentAddr.address)).to.equal(stranger.address);
    });

    it("revoked registrar cannot register new identities", async function () {
      const { registry, deployer, operator, stranger, metadataHash } = await loadFixture(deployFixture);

      await registry.connect(deployer).setRegistrar(operator.address, true);
      await registry.connect(deployer).setRegistrar(operator.address, false);

      await expect(
        registry.connect(operator).registerIdentityFor(stranger.address, EntityType.Human, metadataHash)
      ).to.be.revertedWith("Not registrar");
    });
  });
});
