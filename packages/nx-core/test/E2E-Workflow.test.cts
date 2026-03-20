import { expect } from "chai";
import hre from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

/**
 * End-to-End Workflow Tests for Nexoid
 *
 * These tests walk through the complete operator + agent lifecycle:
 *   1. Admin bootstraps the system (deploy contracts, authorize registrar)
 *   2. Registrar registers a human identity (operator)
 *   3. Operator creates agent identities
 *   4. Operator registers agent Safes with scope via NexoidModule
 *   5. Operator sets spending allowances for agents
 *   6. Agents send USDC within allowance limits
 *   7. Agent validation & revocation via NexoidModule
 *   8. Multi-agent fleet management
 *   9. Agent lifecycle (suspend, reactivate, revoke)
 *  10. Edge cases and security boundaries
 *
 * All tests run on Hardhat local network.
 */

const EntityType = { Human: 0, VirtualAgent: 1, PhysicalAgent: 2, Organization: 3 };
const EntityStatus = { Active: 0, Suspended: 1, Revoked: 2 };
const DelegationStatus = { Active: 0, Suspended: 1, Revoked: 2 };

const USDC_DECIMALS = 6n;
const toUSDC = (amount: bigint) => amount * 10n ** USDC_DECIMALS;

describe("E2E Workflow: Full Operator & Agent Lifecycle", function () {

  /**
   * Deploy all contracts and set up initial state:
   * - IdentityRegistry
   * - NexoidModule (agent scope/status management)
   * - TestAllowanceModule
   * - MockERC20 (USDC)
   * - Registrar authorized
   * - Safe (simulated by safeOwner signer) funded with USDC
   */
  async function deployFullSystemFixture() {
    const [
      admin,        // Contract deployer, initial admin
      registrar,    // Authorized registrar (Nexoid backend)
      operator,     // Human operator (manages agents)
      operator2,    // Second operator
      agent1,       // Virtual agent #1
      agent2,       // Virtual agent #2
      agent3,       // Physical agent
      subAgent,     // Extra signer (used as additional agent EOA)
      recipient,    // Payment recipient
      stranger,     // Unauthorized signer
    ] = await hre.ethers.getSigners();

    // Deploy IdentityRegistry
    const IdentityRegistry = await hre.ethers.getContractFactory("IdentityRegistry");
    const registry = await IdentityRegistry.connect(admin).deploy();

    // Deploy NexoidModule (flat agent scope/status management)
    const NexoidModule = await hre.ethers.getContractFactory("NexoidModule");
    const nexoidModule = await NexoidModule.connect(admin).deploy();

    // Deploy TestAllowanceModule
    const AllowanceModule = await hre.ethers.getContractFactory("TestAllowanceModule");
    const allowanceModule = await AllowanceModule.connect(admin).deploy();

    // Deploy MockERC20 (USDC, 6 decimals)
    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

    // Authorize registrar
    await registry.connect(admin).setRegistrar(registrar.address, true);

    // In production, operator's Safe holds the USDC. Here we simulate the Safe
    // as the operator signer. Mint USDC to operator (acting as Safe).
    const SAFE_BALANCE = toUSDC(50000n); // 50,000 USDC
    await usdc.mint(operator.address, SAFE_BALANCE);

    // Operator (Safe) approves AllowanceModule to transfer USDC
    await usdc.connect(operator).approve(await allowanceModule.getAddress(), SAFE_BALANCE);

    // Metadata hashes
    const operatorMeta = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("operator-meta-v1"));
    const agentMeta = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("agent-meta-v1"));
    const credentialHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("credential-vc-v1"));
    const scopeHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("scope-trading-bot"));

    // 1 year from now
    const futureTimestamp = BigInt((await time.latest()) + 365 * 24 * 3600);

    return {
      registry,
      nexoidModule,
      allowanceModule,
      usdc,
      admin,
      registrar,
      operator,
      operator2,
      agent1,
      agent2,
      agent3,
      subAgent,
      recipient,
      stranger,
      operatorMeta,
      agentMeta,
      credentialHash,
      scopeHash,
      futureTimestamp,
      SAFE_BALANCE,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // PHASE 1: System Bootstrap & Admin Operations
  // ═══════════════════════════════════════════════════════════════

  describe("Phase 1: System Bootstrap", function () {
    it("should deploy all contracts successfully", async function () {
      const { registry, nexoidModule, allowanceModule, usdc } =
        await loadFixture(deployFullSystemFixture);

      expect(await registry.getAddress()).to.be.properAddress;
      expect(await nexoidModule.getAddress()).to.be.properAddress;
      expect(await allowanceModule.getAddress()).to.be.properAddress;
      expect(await usdc.getAddress()).to.be.properAddress;
    });

    it("should set admin as deployer", async function () {
      const { registry, admin } = await loadFixture(deployFullSystemFixture);

      expect(await registry.admin()).to.equal(admin.address);
    });

    it("should authorize registrar", async function () {
      const { registry, registrar } = await loadFixture(deployFullSystemFixture);

      expect(await registry.isRegistrar(registrar.address)).to.be.true;
    });

    it("should fund operator (Safe) with USDC", async function () {
      const { usdc, operator, SAFE_BALANCE } = await loadFixture(deployFullSystemFixture);

      expect(await usdc.balanceOf(operator.address)).to.equal(SAFE_BALANCE);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PHASE 2: Identity Registration (Registrar-Only)
  // ═══════════════════════════════════════════════════════════════

  describe("Phase 2: Identity Registration", function () {
    it("should register a Human identity via registrar", async function () {
      const { registry, registrar, operator, operatorMeta } =
        await loadFixture(deployFullSystemFixture);

      await expect(
        registry.connect(registrar).registerIdentityFor(
          operator.address, EntityType.Human, operatorMeta
        )
      )
        .to.emit(registry, "IdentityRegistered")
        .withArgs(operator.address, EntityType.Human, operator.address, operatorMeta);

      expect(await registry.isRegistered(operator.address)).to.be.true;

      const record = await registry.getIdentity(operator.address);
      expect(record.entityType).to.equal(EntityType.Human);
      expect(record.status).to.equal(EntityStatus.Active);
      expect(record.owner).to.equal(operator.address);
    });

    it("should register an Organization identity via registrar", async function () {
      const { registry, registrar, operator2, operatorMeta } =
        await loadFixture(deployFullSystemFixture);

      await registry.connect(registrar).registerIdentityFor(
        operator2.address, EntityType.Organization, operatorMeta
      );

      const record = await registry.getIdentity(operator2.address);
      expect(record.entityType).to.equal(EntityType.Organization);
      expect(record.owner).to.equal(operator2.address);
    });

    it("should reject self-registration (no registerIdentity function)", async function () {
      const { registry } = await loadFixture(deployFullSystemFixture);

      // Verify self-registration function does not exist
      expect((registry as any).registerIdentity).to.be.undefined;
    });

    it("should reject registration by non-registrar", async function () {
      const { registry, stranger, operatorMeta } =
        await loadFixture(deployFullSystemFixture);

      await expect(
        registry.connect(stranger).registerIdentityFor(
          stranger.address, EntityType.Human, operatorMeta
        )
      ).to.be.revertedWith("Not registrar");
    });

    it("should reject duplicate registration", async function () {
      const { registry, registrar, operator, operatorMeta } =
        await loadFixture(deployFullSystemFixture);

      await registry.connect(registrar).registerIdentityFor(
        operator.address, EntityType.Human, operatorMeta
      );

      await expect(
        registry.connect(registrar).registerIdentityFor(
          operator.address, EntityType.Human, operatorMeta
        )
      ).to.be.revertedWith("Already registered");
    });

    it("should reject registering agent types via registrar", async function () {
      const { registry, registrar, stranger, operatorMeta } =
        await loadFixture(deployFullSystemFixture);

      await expect(
        registry.connect(registrar).registerIdentityFor(
          stranger.address, EntityType.VirtualAgent, operatorMeta
        )
      ).to.be.revertedWith("Only Human or Organization can be registered");

      await expect(
        registry.connect(registrar).registerIdentityFor(
          stranger.address, EntityType.PhysicalAgent, operatorMeta
        )
      ).to.be.revertedWith("Only Human or Organization can be registered");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PHASE 3: Agent Creation by Operator
  // ═══════════════════════════════════════════════════════════════

  describe("Phase 3: Agent Creation", function () {
    async function registeredOperatorFixture() {
      const fixture = await loadFixture(deployFullSystemFixture);
      await fixture.registry.connect(fixture.registrar).registerIdentityFor(
        fixture.operator.address, EntityType.Human, fixture.operatorMeta
      );
      return fixture;
    }

    it("should create a VirtualAgent linked to operator", async function () {
      const { registry, operator, agent1, agentMeta } =
        await loadFixture(registeredOperatorFixture);

      await expect(
        registry.connect(operator).createAgentIdentity(
          agent1.address, EntityType.VirtualAgent, agentMeta
        )
      )
        .to.emit(registry, "IdentityRegistered")
        .withArgs(agent1.address, EntityType.VirtualAgent, operator.address, agentMeta);

      const record = await registry.getIdentity(agent1.address);
      expect(record.entityType).to.equal(EntityType.VirtualAgent);
      expect(record.status).to.equal(EntityStatus.Active);
      expect(record.owner).to.equal(operator.address);
      expect(await registry.ownerOf(agent1.address)).to.equal(operator.address);
    });

    it("should create a PhysicalAgent linked to operator", async function () {
      const { registry, operator, agent3, agentMeta } =
        await loadFixture(registeredOperatorFixture);

      await registry.connect(operator).createAgentIdentity(
        agent3.address, EntityType.PhysicalAgent, agentMeta
      );

      const record = await registry.getIdentity(agent3.address);
      expect(record.entityType).to.equal(EntityType.PhysicalAgent);
      expect(record.owner).to.equal(operator.address);
    });

    it("should create multiple agents for one operator", async function () {
      const { registry, operator, agent1, agent2, agent3, agentMeta } =
        await loadFixture(registeredOperatorFixture);

      await registry.connect(operator).createAgentIdentity(
        agent1.address, EntityType.VirtualAgent, agentMeta
      );
      await registry.connect(operator).createAgentIdentity(
        agent2.address, EntityType.VirtualAgent, agentMeta
      );
      await registry.connect(operator).createAgentIdentity(
        agent3.address, EntityType.PhysicalAgent, agentMeta
      );

      expect(await registry.ownerOf(agent1.address)).to.equal(operator.address);
      expect(await registry.ownerOf(agent2.address)).to.equal(operator.address);
      expect(await registry.ownerOf(agent3.address)).to.equal(operator.address);
    });

    it("should reject agent creation by unregistered caller", async function () {
      const { registry, stranger, agent1, agentMeta } =
        await loadFixture(deployFullSystemFixture);

      await expect(
        registry.connect(stranger).createAgentIdentity(
          agent1.address, EntityType.VirtualAgent, agentMeta
        )
      ).to.be.revertedWith("Identity not registered");
    });

    it("should reject agent creating sub-agent directly", async function () {
      const { registry, operator, agent1, agent2, agentMeta } =
        await loadFixture(registeredOperatorFixture);

      await registry.connect(operator).createAgentIdentity(
        agent1.address, EntityType.VirtualAgent, agentMeta
      );

      // Agent (VirtualAgent) tries to create another agent — should fail
      await expect(
        registry.connect(agent1).createAgentIdentity(
          agent2.address, EntityType.VirtualAgent, agentMeta
        )
      ).to.be.revertedWith("Only Human or Organization can create agents");
    });

    it("should reject creating agent with Human type", async function () {
      const { registry, operator, agent1, agentMeta } =
        await loadFixture(registeredOperatorFixture);

      await expect(
        registry.connect(operator).createAgentIdentity(
          agent1.address, EntityType.Human, agentMeta
        )
      ).to.be.revertedWith("Agent must be VirtualAgent or PhysicalAgent");
    });

    it("should reject creating agent when operator is suspended", async function () {
      const { registry, operator, agent1, agentMeta } =
        await loadFixture(registeredOperatorFixture);

      await registry.connect(operator).updateStatus(operator.address, EntityStatus.Suspended);

      await expect(
        registry.connect(operator).createAgentIdentity(
          agent1.address, EntityType.VirtualAgent, agentMeta
        )
      ).to.be.revertedWith("Identity not active");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PHASE 4: Agent Registration via NexoidModule (Scope & Status)
  // ═══════════════════════════════════════════════════════════════

  describe("Phase 4: Agent Registration via NexoidModule", function () {
    async function operatorWithAgentsFixture() {
      const fixture = await loadFixture(deployFullSystemFixture);
      const { registry, registrar, operator, agent1, agent2, subAgent, operatorMeta, agentMeta } = fixture;

      // Register operator
      await registry.connect(registrar).registerIdentityFor(
        operator.address, EntityType.Human, operatorMeta
      );

      // Create agents in IdentityRegistry
      await registry.connect(operator).createAgentIdentity(
        agent1.address, EntityType.VirtualAgent, agentMeta
      );
      await registry.connect(operator).createAgentIdentity(
        agent2.address, EntityType.VirtualAgent, agentMeta
      );
      await registry.connect(operator).createAgentIdentity(
        subAgent.address, EntityType.VirtualAgent, agentMeta
      );

      return fixture;
    }

    it("should register agent Safe with scope via NexoidModule", async function () {
      const { nexoidModule, operator, agent1, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(operatorWithAgentsFixture);

      await expect(
        nexoidModule.connect(operator).registerAgentSafe(
          agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
        )
      )
        .to.emit(nexoidModule, "AgentSafeRegistered")
        .withArgs(operator.address, agent1.address, agent1.address);

      expect(await nexoidModule.getOperator(agent1.address)).to.equal(operator.address);
      expect(await nexoidModule.agentCount(operator.address)).to.equal(1);

      const record = await nexoidModule.getAgentRecord(agent1.address);
      expect(record.agentSafe).to.equal(agent1.address);
      expect(record.agentEOA).to.equal(agent1.address);
      expect(record.scopeHash).to.equal(scopeHash);
      expect(record.credentialHash).to.equal(credentialHash);
      expect(record.validUntil).to.equal(futureTimestamp);
      expect(record.status).to.equal(DelegationStatus.Active);
    });

    it("should emit AgentScopeUpdated when scope is provided at registration", async function () {
      const { nexoidModule, operator, agent1, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(operatorWithAgentsFixture);

      await expect(
        nexoidModule.connect(operator).registerAgentSafe(
          agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
        )
      )
        .to.emit(nexoidModule, "AgentScopeUpdated")
        .withArgs(operator.address, agent1.address, scopeHash, credentialHash, futureTimestamp);
    });

    it("should register multiple agent Safes for same operator", async function () {
      const { nexoidModule, operator, agent1, agent2, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(operatorWithAgentsFixture);

      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );
      await nexoidModule.connect(operator).registerAgentSafe(
        agent2.address, agent2.address, scopeHash, credentialHash, futureTimestamp
      );

      expect(await nexoidModule.agentCount(operator.address)).to.equal(2);

      const agents = await nexoidModule.getAgentSafes(operator.address);
      expect(agents.length).to.equal(2);
      expect(agents[0].agentSafe).to.equal(agent1.address);
      expect(agents[1].agentSafe).to.equal(agent2.address);
    });

    it("should validate agent via isValidAgent", async function () {
      const { nexoidModule, operator, agent1, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(operatorWithAgentsFixture);

      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );

      expect(await nexoidModule.isValidAgent(agent1.address)).to.be.true;
    });

    it("should return false for isValidAgent on unregistered address", async function () {
      const { nexoidModule, stranger } =
        await loadFixture(operatorWithAgentsFixture);

      expect(await nexoidModule.isValidAgent(stranger.address)).to.be.false;
    });

    it("should retrieve full agent record via getAgentRecord", async function () {
      const { nexoidModule, operator, agent1, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(operatorWithAgentsFixture);

      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );

      const record = await nexoidModule.getAgentRecord(agent1.address);
      expect(record.agentSafe).to.equal(agent1.address);
      expect(record.agentEOA).to.equal(agent1.address);
      expect(record.scopeHash).to.equal(scopeHash);
      expect(record.credentialHash).to.equal(credentialHash);
      expect(record.validUntil).to.equal(futureTimestamp);
      expect(record.status).to.equal(DelegationStatus.Active);
      expect(record.createdAt).to.be.greaterThan(0);
    });

    it("should revert getAgentRecord for unregistered agent", async function () {
      const { nexoidModule, stranger } =
        await loadFixture(operatorWithAgentsFixture);

      await expect(
        nexoidModule.getAgentRecord(stranger.address)
      ).to.be.revertedWith("Agent not registered");
    });

    it("should update agent scope via updateAgentScope", async function () {
      const { nexoidModule, operator, agent1, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(operatorWithAgentsFixture);

      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );

      const newScopeHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("scope-payments-v2"));
      const newCredentialHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("credential-vc-v2"));
      const newValidUntil = futureTimestamp + 86400n;

      await expect(
        nexoidModule.connect(operator).updateAgentScope(
          agent1.address, newScopeHash, newCredentialHash, newValidUntil
        )
      )
        .to.emit(nexoidModule, "AgentScopeUpdated")
        .withArgs(operator.address, agent1.address, newScopeHash, newCredentialHash, newValidUntil);

      const record = await nexoidModule.getAgentRecord(agent1.address);
      expect(record.scopeHash).to.equal(newScopeHash);
      expect(record.credentialHash).to.equal(newCredentialHash);
      expect(record.validUntil).to.equal(newValidUntil);
    });

    it("should reject duplicate agent Safe registration", async function () {
      const { nexoidModule, operator, agent1, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(operatorWithAgentsFixture);

      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );

      await expect(
        nexoidModule.connect(operator).registerAgentSafe(
          agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
        )
      ).to.be.revertedWith("Agent Safe already registered");
    });

    it("should reject registration with zero agent Safe address", async function () {
      const { nexoidModule, operator, agent1, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(operatorWithAgentsFixture);

      await expect(
        nexoidModule.connect(operator).registerAgentSafe(
          hre.ethers.ZeroAddress, agent1.address, scopeHash, credentialHash, futureTimestamp
        )
      ).to.be.revertedWith("Invalid agent Safe");
    });

    it("should reject registration with zero agent EOA address", async function () {
      const { nexoidModule, operator, agent1, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(operatorWithAgentsFixture);

      await expect(
        nexoidModule.connect(operator).registerAgentSafe(
          agent1.address, hre.ethers.ZeroAddress, scopeHash, credentialHash, futureTimestamp
        )
      ).to.be.revertedWith("Invalid agent EOA");
    });

    it("should register agent Safe with no expiry (validUntil = 0)", async function () {
      const { nexoidModule, operator, agent1, credentialHash, scopeHash } =
        await loadFixture(operatorWithAgentsFixture);

      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, 0
      );

      expect(await nexoidModule.isValidAgent(agent1.address)).to.be.true;

      const record = await nexoidModule.getAgentRecord(agent1.address);
      expect(record.validUntil).to.equal(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PHASE 5: Allowance Setup (Operator -> Agent Spending Limits)
  // ═══════════════════════════════════════════════════════════════

  describe("Phase 5: Allowance Setup", function () {
    async function registeredAgentsFixture() {
      const fixture = await loadFixture(deployFullSystemFixture);
      const { registry, nexoidModule, registrar, operator, agent1, agent2, operatorMeta, agentMeta, credentialHash, scopeHash, futureTimestamp } = fixture;

      await registry.connect(registrar).registerIdentityFor(
        operator.address, EntityType.Human, operatorMeta
      );
      await registry.connect(operator).createAgentIdentity(
        agent1.address, EntityType.VirtualAgent, agentMeta
      );
      await registry.connect(operator).createAgentIdentity(
        agent2.address, EntityType.VirtualAgent, agentMeta
      );

      // Register agent Safes with scope via NexoidModule
      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );
      await nexoidModule.connect(operator).registerAgentSafe(
        agent2.address, agent2.address, scopeHash, credentialHash, futureTimestamp
      );

      return fixture;
    }

    it("should add agent as delegate on AllowanceModule", async function () {
      const { allowanceModule, operator, agent1 } =
        await loadFixture(registeredAgentsFixture);

      await expect(
        allowanceModule.connect(operator).addDelegate(agent1.address)
      )
        .to.emit(allowanceModule, "AddDelegate")
        .withArgs(operator.address, agent1.address);

      const [delegates] = await allowanceModule.getDelegates(operator.address, 0, 50);
      expect(delegates).to.include(agent1.address);
    });

    it("should set USDC allowance for agent", async function () {
      const { allowanceModule, usdc, operator, agent1 } =
        await loadFixture(registeredAgentsFixture);

      await allowanceModule.connect(operator).addDelegate(agent1.address);

      const allowanceAmount = toUSDC(100n); // 100 USDC
      await expect(
        allowanceModule.connect(operator).setAllowance(
          agent1.address, await usdc.getAddress(), allowanceAmount, 0, 0
        )
      )
        .to.emit(allowanceModule, "SetAllowance")
        .withArgs(operator.address, agent1.address, await usdc.getAddress(), allowanceAmount, 0);

      const result = await allowanceModule.getTokenAllowance(
        operator.address, agent1.address, await usdc.getAddress()
      );
      expect(result[0]).to.equal(allowanceAmount); // amount
      expect(result[1]).to.equal(0);                // spent
      expect(result[4]).to.equal(0);                // nonce
    });

    it("should set different allowances for different agents", async function () {
      const { allowanceModule, usdc, operator, agent1, agent2 } =
        await loadFixture(registeredAgentsFixture);

      await allowanceModule.connect(operator).addDelegate(agent1.address);
      await allowanceModule.connect(operator).addDelegate(agent2.address);

      await allowanceModule.connect(operator).setAllowance(
        agent1.address, await usdc.getAddress(), toUSDC(100n), 0, 0
      );
      await allowanceModule.connect(operator).setAllowance(
        agent2.address, await usdc.getAddress(), toUSDC(500n), 1440, 0 // daily reset
      );

      const result1 = await allowanceModule.getTokenAllowance(
        operator.address, agent1.address, await usdc.getAddress()
      );
      const result2 = await allowanceModule.getTokenAllowance(
        operator.address, agent2.address, await usdc.getAddress()
      );

      expect(result1[0]).to.equal(toUSDC(100n));
      expect(result2[0]).to.equal(toUSDC(500n));
      expect(result2[2]).to.equal(1440); // reset time in minutes (daily)
    });

    it("should update an existing allowance", async function () {
      const { allowanceModule, usdc, operator, agent1 } =
        await loadFixture(registeredAgentsFixture);

      await allowanceModule.connect(operator).addDelegate(agent1.address);
      await allowanceModule.connect(operator).setAllowance(
        agent1.address, await usdc.getAddress(), toUSDC(100n), 0, 0
      );

      // Increase to 500 USDC
      await allowanceModule.connect(operator).setAllowance(
        agent1.address, await usdc.getAddress(), toUSDC(500n), 0, 0
      );

      const result = await allowanceModule.getTokenAllowance(
        operator.address, agent1.address, await usdc.getAddress()
      );
      expect(result[0]).to.equal(toUSDC(500n));
    });

    it("should reject allowance for non-delegate", async function () {
      const { allowanceModule, usdc, operator, stranger } =
        await loadFixture(registeredAgentsFixture);

      await expect(
        allowanceModule.connect(operator).setAllowance(
          stranger.address, await usdc.getAddress(), toUSDC(100n), 0, 0
        )
      ).to.be.revertedWith("Not a delegate");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PHASE 6: Agent Sends USDC (Within Allowance)
  // ═══════════════════════════════════════════════════════════════

  describe("Phase 6: Agent USDC Transfers", function () {
    async function fundedAgentFixture() {
      const fixture = await loadFixture(deployFullSystemFixture);
      const { registry, nexoidModule, allowanceModule, usdc, registrar, operator, agent1, agent2, operatorMeta, agentMeta, credentialHash, scopeHash, futureTimestamp } = fixture;

      // Register operator, create agents
      await registry.connect(registrar).registerIdentityFor(
        operator.address, EntityType.Human, operatorMeta
      );
      await registry.connect(operator).createAgentIdentity(
        agent1.address, EntityType.VirtualAgent, agentMeta
      );
      await registry.connect(operator).createAgentIdentity(
        agent2.address, EntityType.VirtualAgent, agentMeta
      );

      // Register agent Safes via NexoidModule
      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );
      await nexoidModule.connect(operator).registerAgentSafe(
        agent2.address, agent2.address, scopeHash, credentialHash, futureTimestamp
      );

      // Set allowances: agent1=100 USDC, agent2=200 USDC
      await allowanceModule.connect(operator).addDelegate(agent1.address);
      await allowanceModule.connect(operator).addDelegate(agent2.address);
      await allowanceModule.connect(operator).setAllowance(
        agent1.address, await usdc.getAddress(), toUSDC(100n), 0, 0
      );
      await allowanceModule.connect(operator).setAllowance(
        agent2.address, await usdc.getAddress(), toUSDC(200n), 0, 0
      );

      return fixture;
    }

    it("should allow agent to send USDC within allowance", async function () {
      const { allowanceModule, usdc, operator, agent1, recipient } =
        await loadFixture(fundedAgentFixture);

      const transferAmount = toUSDC(25n);

      await expect(
        allowanceModule.connect(agent1).executeAllowanceTransfer(
          operator.address,
          await usdc.getAddress(),
          recipient.address,
          transferAmount,
          hre.ethers.ZeroAddress,
          0,
          agent1.address,
          "0x"
        )
      ).to.emit(allowanceModule, "ExecuteAllowanceTransfer");

      // Verify recipient received USDC
      expect(await usdc.balanceOf(recipient.address)).to.equal(transferAmount);

      // Verify spent tracking
      const result = await allowanceModule.getTokenAllowance(
        operator.address, agent1.address, await usdc.getAddress()
      );
      expect(result[1]).to.equal(transferAmount); // spent
      expect(result[4]).to.equal(1);              // nonce
    });

    it("should allow multiple transfers within allowance", async function () {
      const { allowanceModule, usdc, operator, agent1, recipient } =
        await loadFixture(fundedAgentFixture);

      // Transfer 1: 30 USDC
      await allowanceModule.connect(agent1).executeAllowanceTransfer(
        operator.address, await usdc.getAddress(), recipient.address,
        toUSDC(30n), hre.ethers.ZeroAddress, 0, agent1.address, "0x"
      );

      // Transfer 2: 40 USDC
      await allowanceModule.connect(agent1).executeAllowanceTransfer(
        operator.address, await usdc.getAddress(), recipient.address,
        toUSDC(40n), hre.ethers.ZeroAddress, 0, agent1.address, "0x"
      );

      // Transfer 3: 30 USDC (total = 100, exactly at limit)
      await allowanceModule.connect(agent1).executeAllowanceTransfer(
        operator.address, await usdc.getAddress(), recipient.address,
        toUSDC(30n), hre.ethers.ZeroAddress, 0, agent1.address, "0x"
      );

      expect(await usdc.balanceOf(recipient.address)).to.equal(toUSDC(100n));

      const result = await allowanceModule.getTokenAllowance(
        operator.address, agent1.address, await usdc.getAddress()
      );
      expect(result[1]).to.equal(toUSDC(100n)); // fully spent
      expect(result[4]).to.equal(3);             // 3 transfers
    });

    it("should reject transfer exceeding allowance", async function () {
      const { allowanceModule, usdc, operator, agent1, recipient } =
        await loadFixture(fundedAgentFixture);

      await expect(
        allowanceModule.connect(agent1).executeAllowanceTransfer(
          operator.address, await usdc.getAddress(), recipient.address,
          toUSDC(101n), // 101 > 100 allowance
          hre.ethers.ZeroAddress, 0, agent1.address, "0x"
        )
      ).to.be.revertedWith("Allowance exceeded");
    });

    it("should reject transfer after allowance is fully spent", async function () {
      const { allowanceModule, usdc, operator, agent1, recipient } =
        await loadFixture(fundedAgentFixture);

      // Spend full 100 USDC allowance
      await allowanceModule.connect(agent1).executeAllowanceTransfer(
        operator.address, await usdc.getAddress(), recipient.address,
        toUSDC(100n), hre.ethers.ZeroAddress, 0, agent1.address, "0x"
      );

      // Any additional transfer should fail
      await expect(
        allowanceModule.connect(agent1).executeAllowanceTransfer(
          operator.address, await usdc.getAddress(), recipient.address,
          1n, // even 1 wei
          hre.ethers.ZeroAddress, 0, agent1.address, "0x"
        )
      ).to.be.revertedWith("Allowance exceeded");
    });

    it("should enforce independent allowances per agent", async function () {
      const { allowanceModule, usdc, operator, agent1, agent2, recipient } =
        await loadFixture(fundedAgentFixture);

      // Agent1 spends 80 out of 100
      await allowanceModule.connect(agent1).executeAllowanceTransfer(
        operator.address, await usdc.getAddress(), recipient.address,
        toUSDC(80n), hre.ethers.ZeroAddress, 0, agent1.address, "0x"
      );

      // Agent2 can still spend up to 200 (independent)
      await allowanceModule.connect(agent2).executeAllowanceTransfer(
        operator.address, await usdc.getAddress(), recipient.address,
        toUSDC(150n), hre.ethers.ZeroAddress, 0, agent2.address, "0x"
      );

      expect(await usdc.balanceOf(recipient.address)).to.equal(toUSDC(230n));
    });

    it("should reject transfer from non-delegate caller", async function () {
      const { allowanceModule, usdc, operator, agent1, stranger, recipient } =
        await loadFixture(fundedAgentFixture);

      await expect(
        allowanceModule.connect(stranger).executeAllowanceTransfer(
          operator.address, await usdc.getAddress(), recipient.address,
          toUSDC(10n), hre.ethers.ZeroAddress, 0, agent1.address, "0x"
        )
      ).to.be.revertedWith("Caller must be delegate");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PHASE 7: Agent Validation & Revocation via NexoidModule
  // ═══════════════════════════════════════════════════════════════

  describe("Phase 7: Agent Validation & Revocation", function () {
    async function registeredAgentFixture() {
      const fixture = await loadFixture(deployFullSystemFixture);
      const { registry, nexoidModule, registrar, operator, agent1, operatorMeta, agentMeta, credentialHash, scopeHash, futureTimestamp } = fixture;

      await registry.connect(registrar).registerIdentityFor(
        operator.address, EntityType.Human, operatorMeta
      );
      await registry.connect(operator).createAgentIdentity(
        agent1.address, EntityType.VirtualAgent, agentMeta
      );

      // Register agent Safe with scope via NexoidModule
      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );

      return fixture;
    }

    it("should validate active agent", async function () {
      const { nexoidModule, agent1 } =
        await loadFixture(registeredAgentFixture);

      expect(await nexoidModule.isValidAgent(agent1.address)).to.be.true;
    });

    it("should invalidate agent after suspension", async function () {
      const { nexoidModule, operator, agent1 } =
        await loadFixture(registeredAgentFixture);

      await nexoidModule.connect(operator).suspendAgent(agent1.address);

      expect(await nexoidModule.isValidAgent(agent1.address)).to.be.false;
    });

    it("should restore validity after reactivation", async function () {
      const { nexoidModule, operator, agent1 } =
        await loadFixture(registeredAgentFixture);

      await nexoidModule.connect(operator).suspendAgent(agent1.address);
      expect(await nexoidModule.isValidAgent(agent1.address)).to.be.false;

      await nexoidModule.connect(operator).reactivateAgent(agent1.address);
      expect(await nexoidModule.isValidAgent(agent1.address)).to.be.true;
    });

    it("should permanently invalidate agent after revocation", async function () {
      const { nexoidModule, operator, agent1 } =
        await loadFixture(registeredAgentFixture);

      await expect(
        nexoidModule.connect(operator).revokeAgent(agent1.address)
      )
        .to.emit(nexoidModule, "AgentStatusChanged")
        .withArgs(operator.address, agent1.address, DelegationStatus.Revoked);

      expect(await nexoidModule.isValidAgent(agent1.address)).to.be.false;

      // Cannot reactivate a revoked agent
      await expect(
        nexoidModule.connect(operator).reactivateAgent(agent1.address)
      ).to.be.revertedWith("Can only reactivate suspended agent");
    });

    it("should emit AgentStatusChanged on suspend", async function () {
      const { nexoidModule, operator, agent1 } =
        await loadFixture(registeredAgentFixture);

      await expect(
        nexoidModule.connect(operator).suspendAgent(agent1.address)
      )
        .to.emit(nexoidModule, "AgentStatusChanged")
        .withArgs(operator.address, agent1.address, DelegationStatus.Suspended);
    });

    it("should emit AgentStatusChanged on reactivate", async function () {
      const { nexoidModule, operator, agent1 } =
        await loadFixture(registeredAgentFixture);

      await nexoidModule.connect(operator).suspendAgent(agent1.address);

      await expect(
        nexoidModule.connect(operator).reactivateAgent(agent1.address)
      )
        .to.emit(nexoidModule, "AgentStatusChanged")
        .withArgs(operator.address, agent1.address, DelegationStatus.Active);
    });

    it("should reject suspension of non-active agent", async function () {
      const { nexoidModule, operator, agent1 } =
        await loadFixture(registeredAgentFixture);

      await nexoidModule.connect(operator).suspendAgent(agent1.address);

      await expect(
        nexoidModule.connect(operator).suspendAgent(agent1.address)
      ).to.be.revertedWith("Can only suspend active agent");
    });

    it("should reject revocation of already revoked agent", async function () {
      const { nexoidModule, operator, agent1 } =
        await loadFixture(registeredAgentFixture);

      await nexoidModule.connect(operator).revokeAgent(agent1.address);

      await expect(
        nexoidModule.connect(operator).revokeAgent(agent1.address)
      ).to.be.revertedWith("Already revoked");
    });

    it("should reject revocation by non-operator", async function () {
      const { nexoidModule, agent1, stranger } =
        await loadFixture(registeredAgentFixture);

      await expect(
        nexoidModule.connect(stranger).revokeAgent(agent1.address)
      ).to.be.revertedWith("Not operator of this agent Safe");
    });

    it("should handle expired agents (validUntil)", async function () {
      const { registry, nexoidModule, registrar, operator, agent1, operatorMeta, agentMeta, credentialHash, scopeHash } =
        await loadFixture(deployFullSystemFixture);

      await registry.connect(registrar).registerIdentityFor(
        operator.address, EntityType.Human, operatorMeta
      );
      await registry.connect(operator).createAgentIdentity(
        agent1.address, EntityType.VirtualAgent, agentMeta
      );

      // Short-lived agent registration (60 seconds)
      const shortFuture = BigInt((await time.latest()) + 60);
      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, shortFuture
      );

      // Valid now
      expect(await nexoidModule.isValidAgent(agent1.address)).to.be.true;

      // Fast-forward past expiry
      await time.increase(120);

      // Now expired
      expect(await nexoidModule.isValidAgent(agent1.address)).to.be.false;
    });

    it("should allow revoking from suspended status", async function () {
      const { nexoidModule, operator, agent1 } =
        await loadFixture(registeredAgentFixture);

      await nexoidModule.connect(operator).suspendAgent(agent1.address);
      await nexoidModule.connect(operator).revokeAgent(agent1.address);

      expect(await nexoidModule.isValidAgent(agent1.address)).to.be.false;

      const record = await nexoidModule.getAgentRecord(agent1.address);
      expect(record.status).to.equal(DelegationStatus.Revoked);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PHASE 8: Full End-to-End Workflow (Complete Lifecycle)
  // ═══════════════════════════════════════════════════════════════

  describe("Phase 8: Complete End-to-End Workflow", function () {
    it("should execute the full operator -> agent -> payment workflow", async function () {
      const {
        registry, nexoidModule, allowanceModule, usdc,
        admin, registrar, operator, agent1, recipient,
        operatorMeta, agentMeta, credentialHash, scopeHash, futureTimestamp,
      } = await loadFixture(deployFullSystemFixture);

      // --- Step 1: Admin authorizes registrar ---
      // (Already done in fixture, but verify)
      expect(await registry.isRegistrar(registrar.address)).to.be.true;

      // --- Step 2: Registrar registers operator ---
      await registry.connect(registrar).registerIdentityFor(
        operator.address, EntityType.Human, operatorMeta
      );
      expect(await registry.isRegistered(operator.address)).to.be.true;

      // --- Step 3: Operator creates agent ---
      await registry.connect(operator).createAgentIdentity(
        agent1.address, EntityType.VirtualAgent, agentMeta
      );
      expect(await registry.ownerOf(agent1.address)).to.equal(operator.address);

      // --- Step 4: Operator registers agent Safe with scope via NexoidModule ---
      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );
      expect(await nexoidModule.isValidAgent(agent1.address)).to.be.true;

      // --- Step 5: Operator sets USDC allowance for agent ---
      await allowanceModule.connect(operator).addDelegate(agent1.address);
      await allowanceModule.connect(operator).setAllowance(
        agent1.address, await usdc.getAddress(), toUSDC(100n), 0, 0
      );

      // --- Step 6: Agent sends USDC to recipient ---
      await allowanceModule.connect(agent1).executeAllowanceTransfer(
        operator.address, await usdc.getAddress(), recipient.address,
        toUSDC(50n), hre.ethers.ZeroAddress, 0, agent1.address, "0x"
      );

      expect(await usdc.balanceOf(recipient.address)).to.equal(toUSDC(50n));

      // --- Step 7: Verify remaining allowance ---
      const allowanceResult = await allowanceModule.getTokenAllowance(
        operator.address, agent1.address, await usdc.getAddress()
      );
      expect(allowanceResult[0]).to.equal(toUSDC(100n)); // total
      expect(allowanceResult[1]).to.equal(toUSDC(50n));  // spent
      // remaining = 100 - 50 = 50 USDC

      // --- Step 8: Agent tries to exceed remaining allowance ---
      await expect(
        allowanceModule.connect(agent1).executeAllowanceTransfer(
          operator.address, await usdc.getAddress(), recipient.address,
          toUSDC(51n), hre.ethers.ZeroAddress, 0, agent1.address, "0x"
        )
      ).to.be.revertedWith("Allowance exceeded");

      // --- Step 9: Agent sends exactly remaining (50 USDC) ---
      await allowanceModule.connect(agent1).executeAllowanceTransfer(
        operator.address, await usdc.getAddress(), recipient.address,
        toUSDC(50n), hre.ethers.ZeroAddress, 0, agent1.address, "0x"
      );

      expect(await usdc.balanceOf(recipient.address)).to.equal(toUSDC(100n));
    });

    it("should support multi-agent fleet with independent controls", async function () {
      const {
        registry, nexoidModule, allowanceModule, usdc,
        registrar, operator, agent1, agent2, agent3, recipient,
        operatorMeta, agentMeta, credentialHash, futureTimestamp,
      } = await loadFixture(deployFullSystemFixture);

      // Register operator
      await registry.connect(registrar).registerIdentityFor(
        operator.address, EntityType.Human, operatorMeta
      );

      // Create fleet of 3 agents (2 virtual, 1 physical)
      await registry.connect(operator).createAgentIdentity(
        agent1.address, EntityType.VirtualAgent, agentMeta
      );
      await registry.connect(operator).createAgentIdentity(
        agent2.address, EntityType.VirtualAgent, agentMeta
      );
      await registry.connect(operator).createAgentIdentity(
        agent3.address, EntityType.PhysicalAgent, agentMeta
      );

      // Register agent Safes with different scopes via NexoidModule
      const scope1 = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("scope-trading"));
      const scope2 = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("scope-payments"));
      const scope3 = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("scope-delivery"));

      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scope1, credentialHash, futureTimestamp
      );
      await nexoidModule.connect(operator).registerAgentSafe(
        agent2.address, agent2.address, scope2, credentialHash, futureTimestamp
      );
      await nexoidModule.connect(operator).registerAgentSafe(
        agent3.address, agent3.address, scope3, credentialHash, futureTimestamp
      );

      // Set different allowances
      await allowanceModule.connect(operator).addDelegate(agent1.address);
      await allowanceModule.connect(operator).addDelegate(agent2.address);
      await allowanceModule.connect(operator).addDelegate(agent3.address);

      await allowanceModule.connect(operator).setAllowance(
        agent1.address, await usdc.getAddress(), toUSDC(1000n), 0, 0
      );
      await allowanceModule.connect(operator).setAllowance(
        agent2.address, await usdc.getAddress(), toUSDC(500n), 0, 0
      );
      await allowanceModule.connect(operator).setAllowance(
        agent3.address, await usdc.getAddress(), toUSDC(200n), 0, 0
      );

      // All agents transfer independently
      await allowanceModule.connect(agent1).executeAllowanceTransfer(
        operator.address, await usdc.getAddress(), recipient.address,
        toUSDC(100n), hre.ethers.ZeroAddress, 0, agent1.address, "0x"
      );
      await allowanceModule.connect(agent2).executeAllowanceTransfer(
        operator.address, await usdc.getAddress(), recipient.address,
        toUSDC(200n), hre.ethers.ZeroAddress, 0, agent2.address, "0x"
      );
      await allowanceModule.connect(agent3).executeAllowanceTransfer(
        operator.address, await usdc.getAddress(), recipient.address,
        toUSDC(150n), hre.ethers.ZeroAddress, 0, agent3.address, "0x"
      );

      expect(await usdc.balanceOf(recipient.address)).to.equal(toUSDC(450n));

      // Verify all delegates are listed
      const [delegates] = await allowanceModule.getDelegates(operator.address, 0, 50);
      expect(delegates.length).to.equal(3);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PHASE 9: Agent Identity Lifecycle
  // ═══════════════════════════════════════════════════════════════

  describe("Phase 9: Agent Identity Lifecycle", function () {
    async function activeAgentFixture() {
      const fixture = await loadFixture(deployFullSystemFixture);
      const { registry, nexoidModule, registrar, operator, agent1, operatorMeta, agentMeta, credentialHash, scopeHash, futureTimestamp } = fixture;

      await registry.connect(registrar).registerIdentityFor(
        operator.address, EntityType.Human, operatorMeta
      );
      await registry.connect(operator).createAgentIdentity(
        agent1.address, EntityType.VirtualAgent, agentMeta
      );
      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );

      return fixture;
    }

    it("operator should suspend agent identity", async function () {
      const { registry, operator, agent1 } = await loadFixture(activeAgentFixture);

      await registry.connect(operator).updateStatus(agent1.address, EntityStatus.Suspended);

      const record = await registry.getIdentity(agent1.address);
      expect(record.status).to.equal(EntityStatus.Suspended);
    });

    it("suspending agent via NexoidModule should invalidate it", async function () {
      const { nexoidModule, operator, agent1 } =
        await loadFixture(activeAgentFixture);

      expect(await nexoidModule.isValidAgent(agent1.address)).to.be.true;

      await nexoidModule.connect(operator).suspendAgent(agent1.address);

      expect(await nexoidModule.isValidAgent(agent1.address)).to.be.false;
    });

    it("reactivating agent via NexoidModule should restore validity", async function () {
      const { nexoidModule, operator, agent1 } =
        await loadFixture(activeAgentFixture);

      await nexoidModule.connect(operator).suspendAgent(agent1.address);
      expect(await nexoidModule.isValidAgent(agent1.address)).to.be.false;

      await nexoidModule.connect(operator).reactivateAgent(agent1.address);
      expect(await nexoidModule.isValidAgent(agent1.address)).to.be.true;
    });

    it("revoking agent via NexoidModule is permanent", async function () {
      const { nexoidModule, operator, agent1 } =
        await loadFixture(activeAgentFixture);

      await nexoidModule.connect(operator).revokeAgent(agent1.address);

      // Cannot reactivate
      await expect(
        nexoidModule.connect(operator).reactivateAgent(agent1.address)
      ).to.be.revertedWith("Can only reactivate suspended agent");

      // Agent is permanently invalid
      expect(await nexoidModule.isValidAgent(agent1.address)).to.be.false;
    });

    it("revoking agent identity in IdentityRegistry is permanent", async function () {
      const { registry, operator, agent1 } =
        await loadFixture(activeAgentFixture);

      await registry.connect(operator).updateStatus(agent1.address, EntityStatus.Revoked);

      // Cannot reactivate
      await expect(
        registry.connect(operator).updateStatus(agent1.address, EntityStatus.Active)
      ).to.be.revertedWith("Cannot update revoked identity");
    });

    it("stranger cannot modify agent status in IdentityRegistry", async function () {
      const { registry, stranger, agent1 } = await loadFixture(activeAgentFixture);

      await expect(
        registry.connect(stranger).updateStatus(agent1.address, EntityStatus.Suspended)
      ).to.be.revertedWith("Not authorized");
    });

    it("stranger cannot suspend agent via NexoidModule", async function () {
      const { nexoidModule, stranger, agent1 } = await loadFixture(activeAgentFixture);

      await expect(
        nexoidModule.connect(stranger).suspendAgent(agent1.address)
      ).to.be.revertedWith("Not operator of this agent Safe");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PHASE 10: Security Boundaries & Edge Cases
  // ═══════════════════════════════════════════════════════════════

  describe("Phase 10: Security Boundaries", function () {
    async function securityFixture() {
      const fixture = await loadFixture(deployFullSystemFixture);
      const { registry, nexoidModule, allowanceModule, usdc, registrar, operator, agent1, agent2, subAgent, operatorMeta, agentMeta, credentialHash, scopeHash, futureTimestamp } = fixture;

      await registry.connect(registrar).registerIdentityFor(
        operator.address, EntityType.Human, operatorMeta
      );
      await registry.connect(operator).createAgentIdentity(
        agent1.address, EntityType.VirtualAgent, agentMeta
      );
      await registry.connect(operator).createAgentIdentity(
        agent2.address, EntityType.VirtualAgent, agentMeta
      );
      await registry.connect(operator).createAgentIdentity(
        subAgent.address, EntityType.VirtualAgent, agentMeta
      );

      // Register agent1 via NexoidModule with scope
      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );

      // Allowance for agent1: 100 USDC
      await allowanceModule.connect(operator).addDelegate(agent1.address);
      await allowanceModule.connect(operator).setAllowance(
        agent1.address, await usdc.getAddress(), toUSDC(100n), 0, 0
      );

      return fixture;
    }

    it("agent cannot escalate its own allowance", async function () {
      const { allowanceModule, usdc, operator, agent1 } =
        await loadFixture(securityFixture);

      // Agent tries to set its own allowance (msg.sender = agent1 acting as Safe)
      // This would create a different mapping entry (agent1 as safe, not operator as safe)
      await allowanceModule.connect(agent1).addDelegate(agent1.address);
      await allowanceModule.connect(agent1).setAllowance(
        agent1.address, await usdc.getAddress(), toUSDC(999999n), 0, 0
      );

      // But the allowance is under agent1's safe mapping, not operator's
      // Agent1 still only has 100 USDC under operator's safe
      const operatorResult = await allowanceModule.getTokenAllowance(
        operator.address, agent1.address, await usdc.getAddress()
      );
      expect(operatorResult[0]).to.equal(toUSDC(100n));
    });

    it("agent cannot spend from another agent's allowance", async function () {
      const { allowanceModule, usdc, operator, agent1, agent2, recipient } =
        await loadFixture(securityFixture);

      // Agent2 is not a delegate on operator's AllowanceModule
      await expect(
        allowanceModule.connect(agent2).executeAllowanceTransfer(
          operator.address, await usdc.getAddress(), recipient.address,
          toUSDC(10n), hre.ethers.ZeroAddress, 0, agent2.address, "0x"
        )
      ).to.be.revertedWith("No allowance set");
    });

    it("NexoidModule registration does not grant spending — allowance is the hard ceiling", async function () {
      const { nexoidModule, allowanceModule, usdc, operator, agent2, recipient, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(securityFixture);

      // Register agent2 via NexoidModule (has scope but no allowance)
      await nexoidModule.connect(operator).registerAgentSafe(
        agent2.address, agent2.address, scopeHash, credentialHash, futureTimestamp
      );

      // Verify agent is valid via NexoidModule
      expect(await nexoidModule.isValidAgent(agent2.address)).to.be.true;

      // But agent2 cannot spend (no allowance set on AllowanceModule)
      await expect(
        allowanceModule.connect(agent2).executeAllowanceTransfer(
          operator.address, await usdc.getAddress(), recipient.address,
          toUSDC(1n), hre.ethers.ZeroAddress, 0, agent2.address, "0x"
        )
      ).to.be.revertedWith("No allowance set");
    });

    it("revoked registrar cannot register new identities", async function () {
      const { registry, admin, registrar, stranger, operatorMeta } =
        await loadFixture(securityFixture);

      // Revoke registrar
      await registry.connect(admin).setRegistrar(registrar.address, false);
      expect(await registry.isRegistrar(registrar.address)).to.be.false;

      await expect(
        registry.connect(registrar).registerIdentityFor(
          stranger.address, EntityType.Human, operatorMeta
        )
      ).to.be.revertedWith("Not registrar");
    });

    it("admin transfer removes old admin privileges", async function () {
      const { registry, admin, operator, stranger } =
        await loadFixture(securityFixture);

      await registry.connect(admin).transferAdmin(operator.address);

      // Old admin cannot manage registrars
      await expect(
        registry.connect(admin).setRegistrar(stranger.address, true)
      ).to.be.revertedWith("Not admin");

      // New admin can
      await registry.connect(operator).setRegistrar(stranger.address, true);
      expect(await registry.isRegistrar(stranger.address)).to.be.true;
    });

    it("non-operator cannot update agent scope via NexoidModule", async function () {
      const { nexoidModule, agent1, stranger, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(securityFixture);

      const newScopeHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("scope-hacked"));

      await expect(
        nexoidModule.connect(stranger).updateAgentScope(
          agent1.address, newScopeHash, credentialHash, futureTimestamp
        )
      ).to.be.revertedWith("Not operator of this agent Safe");
    });

    it("non-operator cannot suspend others' agents via NexoidModule", async function () {
      const { nexoidModule, agent1, stranger } =
        await loadFixture(securityFixture);

      await expect(
        nexoidModule.connect(stranger).suspendAgent(agent1.address)
      ).to.be.revertedWith("Not operator of this agent Safe");
    });

    it("non-operator cannot revoke others' agents via NexoidModule", async function () {
      const { nexoidModule, agent1, stranger } =
        await loadFixture(securityFixture);

      await expect(
        nexoidModule.connect(stranger).revokeAgent(agent1.address)
      ).to.be.revertedWith("Not operator of this agent Safe");
    });

    it("delegate removal prevents future transfers", async function () {
      const { allowanceModule, usdc, operator, agent1, recipient } =
        await loadFixture(securityFixture);

      // Agent1 can transfer initially
      await allowanceModule.connect(agent1).executeAllowanceTransfer(
        operator.address, await usdc.getAddress(), recipient.address,
        toUSDC(10n), hre.ethers.ZeroAddress, 0, agent1.address, "0x"
      );

      // Remove delegate
      await allowanceModule.connect(operator).removeDelegate(agent1.address, true);

      // Agent can no longer transfer
      await expect(
        allowanceModule.connect(agent1).executeAllowanceTransfer(
          operator.address, await usdc.getAddress(), recipient.address,
          toUSDC(10n), hre.ethers.ZeroAddress, 0, agent1.address, "0x"
        )
      ).to.be.revertedWith("No allowance set");
    });

    it("operator can remove and re-add delegate (fresh allowance)", async function () {
      const { allowanceModule, usdc, operator, agent1 } =
        await loadFixture(securityFixture);

      // Remove delegate (clears allowances)
      await allowanceModule.connect(operator).removeDelegate(agent1.address, true);

      // Re-add delegate
      await allowanceModule.connect(operator).addDelegate(agent1.address);

      // Old allowance should be gone
      const result = await allowanceModule.getTokenAllowance(
        operator.address, agent1.address, await usdc.getAddress()
      );
      expect(result[0]).to.equal(0);

      // Set new allowance
      await allowanceModule.connect(operator).setAllowance(
        agent1.address, await usdc.getAddress(), toUSDC(50n), 0, 0
      );

      const newResult = await allowanceModule.getTokenAllowance(
        operator.address, agent1.address, await usdc.getAddress()
      );
      expect(newResult[0]).to.equal(toUSDC(50n));
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PHASE 11: Organization Workflow (Alternative Entity Type)
  // ═══════════════════════════════════════════════════════════════

  describe("Phase 11: Organization Workflow", function () {
    it("should support full Organization -> Agent workflow", async function () {
      const {
        registry, nexoidModule, allowanceModule, usdc,
        registrar, operator2, agent1, recipient,
        operatorMeta, agentMeta, credentialHash, scopeHash, futureTimestamp,
      } = await loadFixture(deployFullSystemFixture);

      // Mint USDC to org (simulated Safe)
      await usdc.mint(operator2.address, toUSDC(10000n));
      await usdc.connect(operator2).approve(
        await allowanceModule.getAddress(), toUSDC(10000n)
      );

      // Register as Organization
      await registry.connect(registrar).registerIdentityFor(
        operator2.address, EntityType.Organization, operatorMeta
      );

      const record = await registry.getIdentity(operator2.address);
      expect(record.entityType).to.equal(EntityType.Organization);

      // Org creates agent
      await registry.connect(operator2).createAgentIdentity(
        agent1.address, EntityType.VirtualAgent, agentMeta
      );
      expect(await registry.ownerOf(agent1.address)).to.equal(operator2.address);

      // Org registers agent Safe with scope via NexoidModule
      await nexoidModule.connect(operator2).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );
      expect(await nexoidModule.isValidAgent(agent1.address)).to.be.true;

      // Org sets allowance
      await allowanceModule.connect(operator2).addDelegate(agent1.address);
      await allowanceModule.connect(operator2).setAllowance(
        agent1.address, await usdc.getAddress(), toUSDC(500n), 0, 0
      );

      // Agent sends
      await allowanceModule.connect(agent1).executeAllowanceTransfer(
        operator2.address, await usdc.getAddress(), recipient.address,
        toUSDC(100n), hre.ethers.ZeroAddress, 0, agent1.address, "0x"
      );

      expect(await usdc.balanceOf(recipient.address)).to.equal(toUSDC(100n));
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PHASE 12: Hash Generation & Determinism
  // ═══════════════════════════════════════════════════════════════

  describe("Phase 12: Transfer Hash Generation", function () {
    it("should generate deterministic transfer hashes", async function () {
      const { allowanceModule, usdc, operator, recipient } =
        await loadFixture(deployFullSystemFixture);

      const hash1 = await allowanceModule.generateTransferHash(
        operator.address, await usdc.getAddress(), recipient.address,
        toUSDC(100n), hre.ethers.ZeroAddress, 0, 0
      );
      const hash2 = await allowanceModule.generateTransferHash(
        operator.address, await usdc.getAddress(), recipient.address,
        toUSDC(100n), hre.ethers.ZeroAddress, 0, 0
      );

      expect(hash1).to.equal(hash2);
    });

    it("should produce different hashes for different amounts", async function () {
      const { allowanceModule, usdc, operator, recipient } =
        await loadFixture(deployFullSystemFixture);

      const hash100 = await allowanceModule.generateTransferHash(
        operator.address, await usdc.getAddress(), recipient.address,
        toUSDC(100n), hre.ethers.ZeroAddress, 0, 0
      );
      const hash200 = await allowanceModule.generateTransferHash(
        operator.address, await usdc.getAddress(), recipient.address,
        toUSDC(200n), hre.ethers.ZeroAddress, 0, 0
      );

      expect(hash100).to.not.equal(hash200);
    });

    it("should produce different hashes for different nonces", async function () {
      const { allowanceModule, usdc, operator, recipient } =
        await loadFixture(deployFullSystemFixture);

      const hashNonce0 = await allowanceModule.generateTransferHash(
        operator.address, await usdc.getAddress(), recipient.address,
        toUSDC(100n), hre.ethers.ZeroAddress, 0, 0
      );
      const hashNonce1 = await allowanceModule.generateTransferHash(
        operator.address, await usdc.getAddress(), recipient.address,
        toUSDC(100n), hre.ethers.ZeroAddress, 0, 1
      );

      expect(hashNonce0).to.not.equal(hashNonce1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PHASE 13: NexoidModule — Comprehensive Agent Safe Registry
  // ═══════════════════════════════════════════════════════════════

  describe("Phase 13: NexoidModule Comprehensive Tests", function () {
    async function nexoidModuleFixture() {
      const fixture = await loadFixture(deployFullSystemFixture);
      const { registry, registrar, operator, operatorMeta, agentMeta, agent1, agent2, agent3 } = fixture;

      // Register operator
      await registry.connect(registrar).registerIdentityFor(
        operator.address, EntityType.Human, operatorMeta
      );

      // Create agents in IdentityRegistry
      await registry.connect(operator).createAgentIdentity(
        agent1.address, EntityType.VirtualAgent, agentMeta
      );
      await registry.connect(operator).createAgentIdentity(
        agent2.address, EntityType.VirtualAgent, agentMeta
      );
      await registry.connect(operator).createAgentIdentity(
        agent3.address, EntityType.PhysicalAgent, agentMeta
      );

      return fixture;
    }

    it("should deploy NexoidModule successfully", async function () {
      const { nexoidModule } = await loadFixture(nexoidModuleFixture);
      expect(await nexoidModule.getAddress()).to.be.properAddress;
    });

    it("should register agent Safe with 5-param registerAgentSafe", async function () {
      const { nexoidModule, operator, agent1, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(nexoidModuleFixture);

      await expect(
        nexoidModule.connect(operator).registerAgentSafe(
          agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
        )
      )
        .to.emit(nexoidModule, "AgentSafeRegistered")
        .withArgs(operator.address, agent1.address, agent1.address);

      expect(await nexoidModule.agentCount(operator.address)).to.equal(1);
      expect(await nexoidModule.getOperator(agent1.address)).to.equal(operator.address);
    });

    it("should register multiple agent Safes", async function () {
      const { nexoidModule, operator, agent1, agent2, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(nexoidModuleFixture);

      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );
      await nexoidModule.connect(operator).registerAgentSafe(
        agent2.address, agent2.address, scopeHash, credentialHash, futureTimestamp
      );

      expect(await nexoidModule.agentCount(operator.address)).to.equal(2);

      const agents = await nexoidModule.getAgentSafes(operator.address);
      expect(agents.length).to.equal(2);
      expect(agents[0].agentSafe).to.equal(agent1.address);
      expect(agents[1].agentSafe).to.equal(agent2.address);
    });

    it("should return correct reverse lookup (getOperator)", async function () {
      const { nexoidModule, operator, agent1, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(nexoidModuleFixture);

      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );

      expect(await nexoidModule.getOperator(agent1.address)).to.equal(operator.address);
      expect(await nexoidModule.operatorOf(agent1.address)).to.equal(operator.address);
    });

    it("should reject duplicate agent Safe registration", async function () {
      const { nexoidModule, operator, agent1, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(nexoidModuleFixture);

      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );

      await expect(
        nexoidModule.connect(operator).registerAgentSafe(
          agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
        )
      ).to.be.revertedWith("Agent Safe already registered");
    });

    it("should reject registration with zero addresses", async function () {
      const { nexoidModule, operator, agent1, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(nexoidModuleFixture);

      await expect(
        nexoidModule.connect(operator).registerAgentSafe(
          hre.ethers.ZeroAddress, agent1.address, scopeHash, credentialHash, futureTimestamp
        )
      ).to.be.revertedWith("Invalid agent Safe");

      await expect(
        nexoidModule.connect(operator).registerAgentSafe(
          agent1.address, hre.ethers.ZeroAddress, scopeHash, credentialHash, futureTimestamp
        )
      ).to.be.revertedWith("Invalid agent EOA");
    });

    it("should remove an agent Safe", async function () {
      const { nexoidModule, operator, agent1, agent2, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(nexoidModuleFixture);

      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );
      await nexoidModule.connect(operator).registerAgentSafe(
        agent2.address, agent2.address, scopeHash, credentialHash, futureTimestamp
      );

      await expect(
        nexoidModule.connect(operator).removeAgentSafe(agent1.address)
      )
        .to.emit(nexoidModule, "AgentSafeRemoved")
        .withArgs(operator.address, agent1.address);

      expect(await nexoidModule.agentCount(operator.address)).to.equal(1);
      expect(await nexoidModule.getOperator(agent1.address)).to.equal(hre.ethers.ZeroAddress);

      // Remaining agent is agent2
      const agents = await nexoidModule.getAgentSafes(operator.address);
      expect(agents.length).to.equal(1);
      expect(agents[0].agentSafe).to.equal(agent2.address);
    });

    it("should reject removal by non-operator", async function () {
      const { nexoidModule, operator, agent1, stranger, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(nexoidModuleFixture);

      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );

      await expect(
        nexoidModule.connect(stranger).removeAgentSafe(agent1.address)
      ).to.be.revertedWith("Not operator of this agent Safe");
    });

    it("should return empty array for operator with no agents", async function () {
      const { nexoidModule, stranger } =
        await loadFixture(nexoidModuleFixture);

      const agents = await nexoidModule.getAgentSafes(stranger.address);
      expect(agents.length).to.equal(0);
      expect(await nexoidModule.agentCount(stranger.address)).to.equal(0);
    });

    it("should return zero address for unregistered agent Safe", async function () {
      const { nexoidModule, stranger } =
        await loadFixture(nexoidModuleFixture);

      expect(await nexoidModule.getOperator(stranger.address)).to.equal(hre.ethers.ZeroAddress);
    });

    it("should store createdAt timestamp", async function () {
      const { nexoidModule, operator, agent1, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(nexoidModuleFixture);

      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );

      const agents = await nexoidModule.getAgentSafes(operator.address);
      expect(agents[0].createdAt).to.be.greaterThan(0);
    });

    it("should allow re-registration after removal", async function () {
      const { nexoidModule, operator, agent1, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(nexoidModuleFixture);

      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );
      await nexoidModule.connect(operator).removeAgentSafe(agent1.address);

      // Should succeed after removal
      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );
      expect(await nexoidModule.agentCount(operator.address)).to.equal(1);
    });

    it("should update agent scope", async function () {
      const { nexoidModule, operator, agent1, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(nexoidModuleFixture);

      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );

      const newScopeHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("scope-updated"));
      const newCredentialHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("credential-updated"));
      const newValidUntil = futureTimestamp + 86400n;

      await expect(
        nexoidModule.connect(operator).updateAgentScope(
          agent1.address, newScopeHash, newCredentialHash, newValidUntil
        )
      )
        .to.emit(nexoidModule, "AgentScopeUpdated")
        .withArgs(operator.address, agent1.address, newScopeHash, newCredentialHash, newValidUntil);

      const record = await nexoidModule.getAgentRecord(agent1.address);
      expect(record.scopeHash).to.equal(newScopeHash);
      expect(record.credentialHash).to.equal(newCredentialHash);
      expect(record.validUntil).to.equal(newValidUntil);
    });

    it("should suspend an active agent", async function () {
      const { nexoidModule, operator, agent1, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(nexoidModuleFixture);

      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );

      await expect(
        nexoidModule.connect(operator).suspendAgent(agent1.address)
      )
        .to.emit(nexoidModule, "AgentStatusChanged")
        .withArgs(operator.address, agent1.address, DelegationStatus.Suspended);

      expect(await nexoidModule.isValidAgent(agent1.address)).to.be.false;

      const record = await nexoidModule.getAgentRecord(agent1.address);
      expect(record.status).to.equal(DelegationStatus.Suspended);
    });

    it("should revoke an agent", async function () {
      const { nexoidModule, operator, agent1, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(nexoidModuleFixture);

      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );

      await expect(
        nexoidModule.connect(operator).revokeAgent(agent1.address)
      )
        .to.emit(nexoidModule, "AgentStatusChanged")
        .withArgs(operator.address, agent1.address, DelegationStatus.Revoked);

      expect(await nexoidModule.isValidAgent(agent1.address)).to.be.false;

      const record = await nexoidModule.getAgentRecord(agent1.address);
      expect(record.status).to.equal(DelegationStatus.Revoked);
    });

    it("should reactivate a suspended agent", async function () {
      const { nexoidModule, operator, agent1, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(nexoidModuleFixture);

      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );

      await nexoidModule.connect(operator).suspendAgent(agent1.address);
      expect(await nexoidModule.isValidAgent(agent1.address)).to.be.false;

      await expect(
        nexoidModule.connect(operator).reactivateAgent(agent1.address)
      )
        .to.emit(nexoidModule, "AgentStatusChanged")
        .withArgs(operator.address, agent1.address, DelegationStatus.Active);

      expect(await nexoidModule.isValidAgent(agent1.address)).to.be.true;

      const record = await nexoidModule.getAgentRecord(agent1.address);
      expect(record.status).to.equal(DelegationStatus.Active);
    });

    it("should validate agent via isValidAgent (active + not expired)", async function () {
      const { nexoidModule, operator, agent1, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(nexoidModuleFixture);

      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );

      // Active and not expired
      expect(await nexoidModule.isValidAgent(agent1.address)).to.be.true;

      // Not registered
      expect(await nexoidModule.isValidAgent(hre.ethers.ZeroAddress)).to.be.false;
    });

    it("should return full agent record via getAgentRecord", async function () {
      const { nexoidModule, operator, agent1, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(nexoidModuleFixture);

      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );

      const record = await nexoidModule.getAgentRecord(agent1.address);
      expect(record.agentSafe).to.equal(agent1.address);
      expect(record.agentEOA).to.equal(agent1.address);
      expect(record.scopeHash).to.equal(scopeHash);
      expect(record.credentialHash).to.equal(credentialHash);
      expect(record.validUntil).to.equal(futureTimestamp);
      expect(record.status).to.equal(DelegationStatus.Active);
      expect(record.createdAt).to.be.greaterThan(0);
    });

    it("should revert getAgentRecord for unregistered agent", async function () {
      const { nexoidModule, stranger } =
        await loadFixture(nexoidModuleFixture);

      await expect(
        nexoidModule.getAgentRecord(stranger.address)
      ).to.be.revertedWith("Agent not registered");
    });

    it("should reject suspending non-active agent", async function () {
      const { nexoidModule, operator, agent1, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(nexoidModuleFixture);

      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );

      await nexoidModule.connect(operator).suspendAgent(agent1.address);

      await expect(
        nexoidModule.connect(operator).suspendAgent(agent1.address)
      ).to.be.revertedWith("Can only suspend active agent");
    });

    it("should reject revoking already revoked agent", async function () {
      const { nexoidModule, operator, agent1, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(nexoidModuleFixture);

      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );

      await nexoidModule.connect(operator).revokeAgent(agent1.address);

      await expect(
        nexoidModule.connect(operator).revokeAgent(agent1.address)
      ).to.be.revertedWith("Already revoked");
    });

    it("should reject reactivating non-suspended agent", async function () {
      const { nexoidModule, operator, agent1, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(nexoidModuleFixture);

      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );

      // Active agent — cannot reactivate
      await expect(
        nexoidModule.connect(operator).reactivateAgent(agent1.address)
      ).to.be.revertedWith("Can only reactivate suspended agent");
    });

    it("should handle agent expiry correctly", async function () {
      const { nexoidModule, operator, agent1, credentialHash, scopeHash } =
        await loadFixture(nexoidModuleFixture);

      // Short-lived agent (60 seconds)
      const shortFuture = BigInt((await time.latest()) + 60);
      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, shortFuture
      );

      // Valid now
      expect(await nexoidModule.isValidAgent(agent1.address)).to.be.true;

      // Fast-forward past expiry
      await time.increase(120);

      // Now expired
      expect(await nexoidModule.isValidAgent(agent1.address)).to.be.false;
    });

    it("should allow revoking from suspended status", async function () {
      const { nexoidModule, operator, agent1, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(nexoidModuleFixture);

      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );

      await nexoidModule.connect(operator).suspendAgent(agent1.address);
      await nexoidModule.connect(operator).revokeAgent(agent1.address);

      expect(await nexoidModule.isValidAgent(agent1.address)).to.be.false;

      const record = await nexoidModule.getAgentRecord(agent1.address);
      expect(record.status).to.equal(DelegationStatus.Revoked);
    });

    it("should not allow reactivating a revoked agent", async function () {
      const { nexoidModule, operator, agent1, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(nexoidModuleFixture);

      await nexoidModule.connect(operator).registerAgentSafe(
        agent1.address, agent1.address, scopeHash, credentialHash, futureTimestamp
      );

      await nexoidModule.connect(operator).revokeAgent(agent1.address);

      await expect(
        nexoidModule.connect(operator).reactivateAgent(agent1.address)
      ).to.be.revertedWith("Can only reactivate suspended agent");
    });
  });
});
