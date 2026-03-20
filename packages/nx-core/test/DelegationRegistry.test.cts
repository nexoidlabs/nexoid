import { expect } from "chai";
import hre from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

const EntityType = { Human: 0, VirtualAgent: 1, PhysicalAgent: 2, Organization: 3 };
const EntityStatus = { Active: 0, Suspended: 1, Revoked: 2 };
const DelegationStatus = { Active: 0, Suspended: 1, Revoked: 2 };

describe("DelegationRegistry", function () {
  async function deployFixture() {
    const [deployer, operator, agentAddr, subAgentAddr, stranger, operator2] =
      await hre.ethers.getSigners();

    // Deploy IdentityRegistry
    const IdentityRegistry = await hre.ethers.getContractFactory("IdentityRegistry");
    const registry = await IdentityRegistry.deploy();

    // Authorize deployer as registrar (all registration goes through registrar)
    await registry.connect(deployer).setRegistrar(deployer.address, true);

    // Deploy DelegationRegistry linked to registry
    const DelegationRegistry = await hre.ethers.getContractFactory("DelegationRegistry");
    const module = await DelegationRegistry.deploy(await registry.getAddress());

    const metadataHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("meta"));
    const credentialHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("cred-vc-v1"));
    const scopeHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("scope-budget-100"));

    // 1 year from now
    const futureTimestamp = BigInt((await time.latest()) + 365 * 24 * 3600);

    return {
      registry,
      module,
      deployer,
      operator,
      operator2,
      agentAddr,
      subAgentAddr,
      stranger,
      metadataHash,
      credentialHash,
      scopeHash,
      futureTimestamp,
    };
  }

  /**
   * Helper: sets up operator + agent + root delegation (common scenario).
   */
  async function setupWithDelegation() {
    const fixture = await loadFixture(deployFixture);
    const { registry, module, deployer, operator, agentAddr, metadataHash, credentialHash, scopeHash, futureTimestamp } = fixture;

    // Register operator, create agent
    await registry.connect(deployer).registerIdentityFor(operator.address, EntityType.Human, metadataHash);
    await registry.connect(operator).createAgentIdentity(agentAddr.address, EntityType.VirtualAgent, metadataHash);

    // Root delegation: operator → agent, depth 2
    await module.connect(operator).delegateWithScope(
      agentAddr.address,
      credentialHash,
      scopeHash,
      futureTimestamp,
      0,  // root — no parent
      2   // delegationDepth = 2 (allows sub-delegation)
    );

    return { ...fixture, delegationId: 1n };
  }

  // ─── Delegation Creation ───────────────────────────────

  describe("Root Delegation (operator → agent)", function () {
    it("should create a root delegation and emit event", async function () {
      const { registry, module, deployer, operator, agentAddr, metadataHash, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(deployFixture);

      await registry.connect(deployer).registerIdentityFor(operator.address, EntityType.Human, metadataHash);
      await registry.connect(operator).createAgentIdentity(agentAddr.address, EntityType.VirtualAgent, metadataHash);

      await expect(
        module.connect(operator).delegateWithScope(agentAddr.address, credentialHash, scopeHash, futureTimestamp, 0, 1)
      )
        .to.emit(module, "DelegationCreated")
        .withArgs(1, operator.address, agentAddr.address, scopeHash, 1, futureTimestamp);

      const record = await module.getDelegation(1);
      expect(record.issuer).to.equal(operator.address);
      expect(record.subject).to.equal(agentAddr.address);
      expect(record.credentialHash).to.equal(credentialHash);
      expect(record.scopeHash).to.equal(scopeHash);
      expect(record.parentDelegationId).to.equal(0);
      expect(record.delegationDepth).to.equal(1);
      expect(record.status).to.equal(DelegationStatus.Active);
    });

    it("should increment delegation IDs", async function () {
      const { registry, module, deployer, operator, agentAddr, subAgentAddr, metadataHash, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(deployFixture);

      await registry.connect(deployer).registerIdentityFor(operator.address, EntityType.Human, metadataHash);
      await registry.connect(operator).createAgentIdentity(agentAddr.address, EntityType.VirtualAgent, metadataHash);
      await registry.connect(operator).createAgentIdentity(subAgentAddr.address, EntityType.VirtualAgent, metadataHash);

      expect(await module.nextDelegationId()).to.equal(1);

      await module.connect(operator).delegateWithScope(agentAddr.address, credentialHash, scopeHash, futureTimestamp, 0, 0);
      expect(await module.nextDelegationId()).to.equal(2);

      await module.connect(operator).delegateWithScope(subAgentAddr.address, credentialHash, scopeHash, futureTimestamp, 0, 0);
      expect(await module.nextDelegationId()).to.equal(3);
    });

    it("should reject if issuer is not registered", async function () {
      const { module, stranger, agentAddr, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(deployFixture);

      await expect(
        module.connect(stranger).delegateWithScope(agentAddr.address, credentialHash, scopeHash, futureTimestamp, 0, 0)
      ).to.be.revertedWith("Issuer not registered");
    });

    it("should reject if subject is not registered", async function () {
      const { registry, module, deployer, operator, stranger, metadataHash, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(deployFixture);

      await registry.connect(deployer).registerIdentityFor(operator.address, EntityType.Human, metadataHash);

      await expect(
        module.connect(operator).delegateWithScope(stranger.address, credentialHash, scopeHash, futureTimestamp, 0, 0)
      ).to.be.revertedWith("Subject not registered");
    });

    it("should reject if issuer is suspended", async function () {
      const { registry, module, deployer, operator, agentAddr, metadataHash, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(deployFixture);

      await registry.connect(deployer).registerIdentityFor(operator.address, EntityType.Human, metadataHash);
      await registry.connect(operator).createAgentIdentity(agentAddr.address, EntityType.VirtualAgent, metadataHash);
      await registry.connect(operator).updateStatus(operator.address, EntityStatus.Suspended);

      await expect(
        module.connect(operator).delegateWithScope(agentAddr.address, credentialHash, scopeHash, futureTimestamp, 0, 0)
      ).to.be.revertedWith("Issuer not active");
    });

    it("should reject if subject is suspended", async function () {
      const { registry, module, deployer, operator, agentAddr, metadataHash, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(deployFixture);

      await registry.connect(deployer).registerIdentityFor(operator.address, EntityType.Human, metadataHash);
      await registry.connect(operator).createAgentIdentity(agentAddr.address, EntityType.VirtualAgent, metadataHash);
      await registry.connect(operator).updateStatus(agentAddr.address, EntityStatus.Suspended);

      await expect(
        module.connect(operator).delegateWithScope(agentAddr.address, credentialHash, scopeHash, futureTimestamp, 0, 0)
      ).to.be.revertedWith("Subject not active");
    });

    it("should reject if validUntil is in the past", async function () {
      const { registry, module, deployer, operator, agentAddr, metadataHash, credentialHash, scopeHash } =
        await loadFixture(deployFixture);

      await registry.connect(deployer).registerIdentityFor(operator.address, EntityType.Human, metadataHash);
      await registry.connect(operator).createAgentIdentity(agentAddr.address, EntityType.VirtualAgent, metadataHash);

      const pastTimestamp = BigInt((await time.latest()) - 100);

      await expect(
        module.connect(operator).delegateWithScope(agentAddr.address, credentialHash, scopeHash, pastTimestamp, 0, 0)
      ).to.be.revertedWith("validUntil must be in the future");
    });

    it("should reject if non-owner tries to create root delegation", async function () {
      const { registry, module, deployer, operator, operator2, agentAddr, metadataHash, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(deployFixture);

      // operator2 is registered but does NOT own agentAddr
      await registry.connect(deployer).registerIdentityFor(operator.address, EntityType.Human, metadataHash);
      await registry.connect(deployer).registerIdentityFor(operator2.address, EntityType.Human, metadataHash);
      await registry.connect(operator).createAgentIdentity(agentAddr.address, EntityType.VirtualAgent, metadataHash);

      await expect(
        module.connect(operator2).delegateWithScope(agentAddr.address, credentialHash, scopeHash, futureTimestamp, 0, 0)
      ).to.be.revertedWith("Only owner can create root delegation");
    });
  });

  // ─── Sub-Delegation ────────────────────────────────────

  describe("Sub-Delegation (agent → sub-agent)", function () {
    it("should create sub-delegation if parent allows it", async function () {
      const { registry, module, agentAddr, subAgentAddr, operator, metadataHash, credentialHash, scopeHash, futureTimestamp, delegationId } =
        await setupWithDelegation();

      // Register sub-agent under the operator
      await registry.connect(operator).createAgentIdentity(subAgentAddr.address, EntityType.VirtualAgent, metadataHash);

      // Agent sub-delegates to sub-agent (depth 1, parent had depth 2)
      await expect(
        module.connect(agentAddr).delegateWithScope(subAgentAddr.address, credentialHash, scopeHash, futureTimestamp, delegationId, 1)
      ).to.emit(module, "DelegationCreated");

      const subDelegation = await module.getDelegation(2);
      expect(subDelegation.issuer).to.equal(agentAddr.address);
      expect(subDelegation.subject).to.equal(subAgentAddr.address);
      expect(subDelegation.parentDelegationId).to.equal(delegationId);
      expect(subDelegation.delegationDepth).to.equal(1);
    });

    it("should reject sub-delegation if depth = 0 on parent", async function () {
      const { registry, module, deployer, operator, agentAddr, subAgentAddr, metadataHash, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(deployFixture);

      await registry.connect(deployer).registerIdentityFor(operator.address, EntityType.Human, metadataHash);
      await registry.connect(operator).createAgentIdentity(agentAddr.address, EntityType.VirtualAgent, metadataHash);
      await registry.connect(operator).createAgentIdentity(subAgentAddr.address, EntityType.VirtualAgent, metadataHash);

      // Root delegation with depth 0 = no sub-delegation
      await module.connect(operator).delegateWithScope(agentAddr.address, credentialHash, scopeHash, futureTimestamp, 0, 0);

      await expect(
        module.connect(agentAddr).delegateWithScope(subAgentAddr.address, credentialHash, scopeHash, futureTimestamp, 1, 0)
      ).to.be.revertedWith("Parent does not allow sub-delegation");
    });

    it("should reject sub-delegation with depth >= parent depth", async function () {
      const { module, registry, operator, agentAddr, subAgentAddr, metadataHash, credentialHash, scopeHash, futureTimestamp, delegationId } =
        await setupWithDelegation();

      await registry.connect(operator).createAgentIdentity(subAgentAddr.address, EntityType.VirtualAgent, metadataHash);

      // Parent depth is 2. Trying to sub-delegate with depth 2 should fail (must be strictly less).
      await expect(
        module.connect(agentAddr).delegateWithScope(subAgentAddr.address, credentialHash, scopeHash, futureTimestamp, delegationId, 2)
      ).to.be.revertedWith("Sub-delegation depth must be less than parent");
    });

    it("should reject sub-delegation exceeding parent validUntil", async function () {
      const { module, registry, operator, agentAddr, subAgentAddr, metadataHash, credentialHash, scopeHash, futureTimestamp, delegationId } =
        await setupWithDelegation();

      await registry.connect(operator).createAgentIdentity(subAgentAddr.address, EntityType.VirtualAgent, metadataHash);

      const beyondParent = futureTimestamp + 1n;

      await expect(
        module.connect(agentAddr).delegateWithScope(subAgentAddr.address, credentialHash, scopeHash, beyondParent, delegationId, 0)
      ).to.be.revertedWith("Cannot exceed parent validity");
    });

    it("should reject sub-delegation from wrong issuer (not the subject of parent)", async function () {
      const { module, registry, operator, agentAddr, subAgentAddr, metadataHash, credentialHash, scopeHash, futureTimestamp, delegationId } =
        await setupWithDelegation();

      await registry.connect(operator).createAgentIdentity(subAgentAddr.address, EntityType.VirtualAgent, metadataHash);

      // Operator tries to sub-delegate via parent delegation — but operator is the issuer, not the subject
      await expect(
        module.connect(operator).delegateWithScope(subAgentAddr.address, credentialHash, scopeHash, futureTimestamp, delegationId, 0)
      ).to.be.revertedWith("Not authorized by parent delegation");
    });
  });

  // ─── Revocation ────────────────────────────────────────

  describe("Revocation (chain-breaking, D-15)", function () {
    it("should revoke a delegation", async function () {
      const { module, operator, delegationId } = await setupWithDelegation();

      await expect(module.connect(operator).revokeDelegation(delegationId))
        .to.emit(module, "DelegationRevoked")
        .withArgs(delegationId, operator.address);

      const record = await module.getDelegation(delegationId);
      expect(record.status).to.equal(DelegationStatus.Revoked);
    });

    it("should reject revocation by non-issuer", async function () {
      const { module, agentAddr, delegationId } = await setupWithDelegation();

      await expect(
        module.connect(agentAddr).revokeDelegation(delegationId)
      ).to.be.revertedWith("Not the issuer");
    });

    it("should reject double revocation", async function () {
      const { module, operator, delegationId } = await setupWithDelegation();

      await module.connect(operator).revokeDelegation(delegationId);

      await expect(
        module.connect(operator).revokeDelegation(delegationId)
      ).to.be.revertedWith("Already revoked");
    });

    it("chain-breaking: revoking root invalidates sub-delegation", async function () {
      const { module, registry, operator, agentAddr, subAgentAddr, metadataHash, credentialHash, scopeHash, futureTimestamp, delegationId } =
        await setupWithDelegation();

      await registry.connect(operator).createAgentIdentity(subAgentAddr.address, EntityType.VirtualAgent, metadataHash);

      // Create sub-delegation
      await module.connect(agentAddr).delegateWithScope(subAgentAddr.address, credentialHash, scopeHash, futureTimestamp, delegationId, 0);
      const subDelegationId = 2n;

      // Both valid before revocation
      let [valid] = await module.isValidDelegation(delegationId);
      expect(valid).to.be.true;
      [valid] = await module.isValidDelegation(subDelegationId);
      expect(valid).to.be.true;

      // Revoke root (O(1) gas — only one on-chain write)
      await module.connect(operator).revokeDelegation(delegationId);

      // Root is invalid
      [valid] = await module.isValidDelegation(delegationId);
      expect(valid).to.be.false;

      // Sub-delegation is also invalid (chain-breaking)
      [valid] = await module.isValidDelegation(subDelegationId);
      expect(valid).to.be.false;
    });

    it("chain-breaking: suspending issuer identity invalidates delegation", async function () {
      const { module, registry, operator, agentAddr, metadataHash, delegationId } =
        await setupWithDelegation();

      // Valid before suspension
      let [valid] = await module.isValidDelegation(delegationId);
      expect(valid).to.be.true;

      // Suspend the operator identity
      await registry.connect(operator).updateStatus(operator.address, EntityStatus.Suspended);

      // Delegation is now invalid (issuer not active)
      [valid] = await module.isValidDelegation(delegationId);
      expect(valid).to.be.false;

      // Reactivate operator
      await registry.connect(operator).updateStatus(operator.address, EntityStatus.Active);

      // Delegation is valid again
      [valid] = await module.isValidDelegation(delegationId);
      expect(valid).to.be.true;
    });

    it("chain-breaking: suspending subject identity invalidates delegation", async function () {
      const { module, registry, operator, agentAddr, metadataHash, delegationId } =
        await setupWithDelegation();

      let [valid] = await module.isValidDelegation(delegationId);
      expect(valid).to.be.true;

      await registry.connect(operator).updateStatus(agentAddr.address, EntityStatus.Suspended);

      [valid] = await module.isValidDelegation(delegationId);
      expect(valid).to.be.false;
    });
  });

  // ─── Suspension ────────────────────────────────────────

  describe("Delegation Suspension", function () {
    it("should suspend an active delegation", async function () {
      const { module, operator, delegationId } = await setupWithDelegation();

      await expect(module.connect(operator).suspendDelegation(delegationId))
        .to.emit(module, "DelegationSuspended")
        .withArgs(delegationId, operator.address);

      const record = await module.getDelegation(delegationId);
      expect(record.status).to.equal(DelegationStatus.Suspended);
    });

    it("should reject suspending a non-active delegation", async function () {
      const { module, operator, delegationId } = await setupWithDelegation();

      await module.connect(operator).suspendDelegation(delegationId);

      await expect(
        module.connect(operator).suspendDelegation(delegationId)
      ).to.be.revertedWith("Can only suspend active delegation");
    });

    it("should reactivate a suspended delegation", async function () {
      const { module, operator, delegationId } = await setupWithDelegation();

      await module.connect(operator).suspendDelegation(delegationId);
      await module.connect(operator).reactivateDelegation(delegationId);

      const record = await module.getDelegation(delegationId);
      expect(record.status).to.equal(DelegationStatus.Active);
    });

    it("should reject reactivating a non-suspended delegation", async function () {
      const { module, operator, delegationId } = await setupWithDelegation();

      await expect(
        module.connect(operator).reactivateDelegation(delegationId)
      ).to.be.revertedWith("Can only reactivate suspended delegation");
    });

    it("suspended delegation is invalid", async function () {
      const { module, operator, delegationId } = await setupWithDelegation();

      await module.connect(operator).suspendDelegation(delegationId);

      const [valid] = await module.isValidDelegation(delegationId);
      expect(valid).to.be.false;
    });
  });

  // ─── Validation ────────────────────────────────────────

  describe("Delegation Validation", function () {
    it("should validate a root delegation", async function () {
      const { module, delegationId } = await setupWithDelegation();

      const [valid, depth] = await module.isValidDelegation(delegationId);
      expect(valid).to.be.true;
      expect(depth).to.equal(0); // root = depth 0
    });

    it("should validate a two-level chain and report depth", async function () {
      const { module, registry, operator, agentAddr, subAgentAddr, metadataHash, credentialHash, scopeHash, futureTimestamp, delegationId } =
        await setupWithDelegation();

      await registry.connect(operator).createAgentIdentity(subAgentAddr.address, EntityType.VirtualAgent, metadataHash);
      await module.connect(agentAddr).delegateWithScope(subAgentAddr.address, credentialHash, scopeHash, futureTimestamp, delegationId, 0);

      const [valid, depth] = await module.isValidDelegation(2);
      expect(valid).to.be.true;
      expect(depth).to.equal(1); // sub = depth 1
    });

    it("should return invalid for delegation ID 0", async function () {
      const { module } = await loadFixture(deployFixture);

      const [valid] = await module.isValidDelegation(0);
      expect(valid).to.be.false;
    });

    it("should return invalid for expired delegation", async function () {
      const { registry, module, deployer, operator, agentAddr, metadataHash, credentialHash, scopeHash } =
        await loadFixture(deployFixture);

      await registry.connect(deployer).registerIdentityFor(operator.address, EntityType.Human, metadataHash);
      await registry.connect(operator).createAgentIdentity(agentAddr.address, EntityType.VirtualAgent, metadataHash);

      // Create with short validity
      const shortFuture = BigInt((await time.latest()) + 60); // 60 seconds
      await module.connect(operator).delegateWithScope(agentAddr.address, credentialHash, scopeHash, shortFuture, 0, 0);

      // Valid now
      let [valid] = await module.isValidDelegation(1);
      expect(valid).to.be.true;

      // Advance time past validity
      await time.increase(120);

      // Now expired
      [valid] = await module.isValidDelegation(1);
      expect(valid).to.be.false;
    });
  });

  // ─── View Functions ────────────────────────────────────

  describe("View Functions", function () {
    it("getDelegation should revert for ID 0", async function () {
      const { module } = await loadFixture(deployFixture);

      await expect(module.getDelegation(0)).to.be.revertedWith("Invalid delegation ID");
    });

    it("getDelegation should revert for non-existent ID", async function () {
      const { module } = await loadFixture(deployFixture);

      await expect(module.getDelegation(999)).to.be.revertedWith("Invalid delegation ID");
    });

    it("nextDelegationId starts at 1", async function () {
      const { module } = await loadFixture(deployFixture);

      expect(await module.nextDelegationId()).to.equal(1);
    });

    it("identityRegistry returns the correct address", async function () {
      const { module, registry } = await loadFixture(deployFixture);

      expect(await module.identityRegistry()).to.equal(await registry.getAddress());
    });
  });
});
