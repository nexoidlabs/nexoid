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
 *   4. Operator delegates scoped authority to agents
 *   5. Operator sets spending allowances for agents
 *   6. Agents send USDC within allowance limits
 *   7. Delegation validation & chain-breaking revocation
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
   * - DelegationRegistry (linked to IdentityRegistry)
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
      subAgent,     // Sub-agent (delegated by agent1)
      recipient,    // Payment recipient
      stranger,     // Unauthorized signer
    ] = await hre.ethers.getSigners();

    // Deploy IdentityRegistry
    const IdentityRegistry = await hre.ethers.getContractFactory("IdentityRegistry");
    const registry = await IdentityRegistry.connect(admin).deploy();

    // Deploy DelegationRegistry linked to IdentityRegistry
    const DelegationRegistry = await hre.ethers.getContractFactory("DelegationRegistry");
    const delegationRegistry = await DelegationRegistry.connect(admin).deploy(await registry.getAddress());

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
      delegationRegistry,
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
      const { registry, delegationRegistry, allowanceModule, usdc } =
        await loadFixture(deployFullSystemFixture);

      expect(await registry.getAddress()).to.be.properAddress;
      expect(await delegationRegistry.getAddress()).to.be.properAddress;
      expect(await allowanceModule.getAddress()).to.be.properAddress;
      expect(await usdc.getAddress()).to.be.properAddress;
    });

    it("should set admin as deployer", async function () {
      const { registry, admin } = await loadFixture(deployFullSystemFixture);

      expect(await registry.admin()).to.equal(admin.address);
    });

    it("should link DelegationRegistry to IdentityRegistry", async function () {
      const { registry, delegationRegistry } = await loadFixture(deployFullSystemFixture);

      expect(await delegationRegistry.identityRegistry()).to.equal(
        await registry.getAddress()
      );
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
  // PHASE 4: Delegation (Operator → Agent, Agent → Sub-Agent)
  // ═══════════════════════════════════════════════════════════════

  describe("Phase 4: Delegation", function () {
    async function operatorWithAgentsFixture() {
      const fixture = await loadFixture(deployFullSystemFixture);
      const { registry, registrar, operator, agent1, agent2, subAgent, operatorMeta, agentMeta } = fixture;

      // Register operator
      await registry.connect(registrar).registerIdentityFor(
        operator.address, EntityType.Human, operatorMeta
      );

      // Create agents
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

    it("should create root delegation (operator → agent)", async function () {
      const { delegationRegistry, operator, agent1, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(operatorWithAgentsFixture);

      await expect(
        delegationRegistry.connect(operator).delegateWithScope(
          agent1.address, credentialHash, scopeHash, futureTimestamp, 0, 2
        )
      )
        .to.emit(delegationRegistry, "DelegationCreated")
        .withArgs(1, operator.address, agent1.address, scopeHash, 2, futureTimestamp);

      const record = await delegationRegistry.getDelegation(1);
      expect(record.issuer).to.equal(operator.address);
      expect(record.subject).to.equal(agent1.address);
      expect(record.credentialHash).to.equal(credentialHash);
      expect(record.scopeHash).to.equal(scopeHash);
      expect(record.parentDelegationId).to.equal(0); // root
      expect(record.delegationDepth).to.equal(2);
      expect(record.status).to.equal(DelegationStatus.Active);
    });

    it("should create multiple delegations for different agents", async function () {
      const { delegationRegistry, operator, agent1, agent2, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(operatorWithAgentsFixture);

      await delegationRegistry.connect(operator).delegateWithScope(
        agent1.address, credentialHash, scopeHash, futureTimestamp, 0, 1
      );
      await delegationRegistry.connect(operator).delegateWithScope(
        agent2.address, credentialHash, scopeHash, futureTimestamp, 0, 0
      );

      expect(await delegationRegistry.nextDelegationId()).to.equal(3);

      const rec1 = await delegationRegistry.getDelegation(1);
      const rec2 = await delegationRegistry.getDelegation(2);
      expect(rec1.subject).to.equal(agent1.address);
      expect(rec2.subject).to.equal(agent2.address);
    });

    it("should create sub-delegation (agent → sub-agent) within depth", async function () {
      const { delegationRegistry, operator, agent1, subAgent, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(operatorWithAgentsFixture);

      // Root: operator → agent1, depth=2
      await delegationRegistry.connect(operator).delegateWithScope(
        agent1.address, credentialHash, scopeHash, futureTimestamp, 0, 2
      );

      // Sub: agent1 → subAgent, depth=1 (< parent depth 2)
      await expect(
        delegationRegistry.connect(agent1).delegateWithScope(
          subAgent.address, credentialHash, scopeHash, futureTimestamp, 1, 1
        )
      ).to.emit(delegationRegistry, "DelegationCreated");

      const subRec = await delegationRegistry.getDelegation(2);
      expect(subRec.issuer).to.equal(agent1.address);
      expect(subRec.subject).to.equal(subAgent.address);
      expect(subRec.parentDelegationId).to.equal(1);
      expect(subRec.delegationDepth).to.equal(1);
    });

    it("should reject sub-delegation when parent depth=0", async function () {
      const { delegationRegistry, operator, agent1, subAgent, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(operatorWithAgentsFixture);

      // Root delegation with depth=0 (no sub-delegation allowed)
      await delegationRegistry.connect(operator).delegateWithScope(
        agent1.address, credentialHash, scopeHash, futureTimestamp, 0, 0
      );

      await expect(
        delegationRegistry.connect(agent1).delegateWithScope(
          subAgent.address, credentialHash, scopeHash, futureTimestamp, 1, 0
        )
      ).to.be.revertedWith("Parent does not allow sub-delegation");
    });

    it("should reject sub-delegation with depth >= parent depth", async function () {
      const { delegationRegistry, operator, agent1, subAgent, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(operatorWithAgentsFixture);

      await delegationRegistry.connect(operator).delegateWithScope(
        agent1.address, credentialHash, scopeHash, futureTimestamp, 0, 2
      );

      await expect(
        delegationRegistry.connect(agent1).delegateWithScope(
          subAgent.address, credentialHash, scopeHash, futureTimestamp, 1, 2
        )
      ).to.be.revertedWith("Sub-delegation depth must be less than parent");
    });

    it("should reject sub-delegation exceeding parent validity", async function () {
      const { delegationRegistry, operator, agent1, subAgent, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(operatorWithAgentsFixture);

      await delegationRegistry.connect(operator).delegateWithScope(
        agent1.address, credentialHash, scopeHash, futureTimestamp, 0, 2
      );

      const beyondParent = futureTimestamp + 1n;
      await expect(
        delegationRegistry.connect(agent1).delegateWithScope(
          subAgent.address, credentialHash, scopeHash, beyondParent, 1, 0
        )
      ).to.be.revertedWith("Cannot exceed parent validity");
    });

    it("should reject delegation from non-owner of subject", async function () {
      const { registry, delegationRegistry, registrar, operator, operator2, agent1, operatorMeta, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(operatorWithAgentsFixture);

      // Register operator2 separately
      await registry.connect(registrar).registerIdentityFor(
        operator2.address, EntityType.Human, operatorMeta
      );

      // operator2 tries to delegate to agent1 (owned by operator) — should fail
      await expect(
        delegationRegistry.connect(operator2).delegateWithScope(
          agent1.address, credentialHash, scopeHash, futureTimestamp, 0, 0
        )
      ).to.be.revertedWith("Only owner can create root delegation");
    });

    it("should reject delegation with past validUntil", async function () {
      const { delegationRegistry, operator, agent1, credentialHash, scopeHash } =
        await loadFixture(operatorWithAgentsFixture);

      const pastTimestamp = BigInt((await time.latest()) - 100);
      await expect(
        delegationRegistry.connect(operator).delegateWithScope(
          agent1.address, credentialHash, scopeHash, pastTimestamp, 0, 0
        )
      ).to.be.revertedWith("validUntil must be in the future");
    });

    it("should reject delegation from suspended issuer", async function () {
      const { registry, delegationRegistry, operator, agent1, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(operatorWithAgentsFixture);

      await registry.connect(operator).updateStatus(operator.address, EntityStatus.Suspended);

      await expect(
        delegationRegistry.connect(operator).delegateWithScope(
          agent1.address, credentialHash, scopeHash, futureTimestamp, 0, 0
        )
      ).to.be.revertedWith("Issuer not active");
    });

    it("should reject delegation to suspended subject", async function () {
      const { registry, delegationRegistry, operator, agent1, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(operatorWithAgentsFixture);

      await registry.connect(operator).updateStatus(agent1.address, EntityStatus.Suspended);

      await expect(
        delegationRegistry.connect(operator).delegateWithScope(
          agent1.address, credentialHash, scopeHash, futureTimestamp, 0, 0
        )
      ).to.be.revertedWith("Subject not active");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PHASE 5: Allowance Setup (Operator → Agent Spending Limits)
  // ═══════════════════════════════════════════════════════════════

  describe("Phase 5: Allowance Setup", function () {
    async function delegatedAgentsFixture() {
      const fixture = await loadFixture(deployFullSystemFixture);
      const { registry, delegationRegistry, allowanceModule, registrar, operator, agent1, agent2, operatorMeta, agentMeta, credentialHash, scopeHash, futureTimestamp } = fixture;

      await registry.connect(registrar).registerIdentityFor(
        operator.address, EntityType.Human, operatorMeta
      );
      await registry.connect(operator).createAgentIdentity(
        agent1.address, EntityType.VirtualAgent, agentMeta
      );
      await registry.connect(operator).createAgentIdentity(
        agent2.address, EntityType.VirtualAgent, agentMeta
      );

      // Delegate to both agents
      await delegationRegistry.connect(operator).delegateWithScope(
        agent1.address, credentialHash, scopeHash, futureTimestamp, 0, 1
      );
      await delegationRegistry.connect(operator).delegateWithScope(
        agent2.address, credentialHash, scopeHash, futureTimestamp, 0, 0
      );

      return fixture;
    }

    it("should add agent as delegate on AllowanceModule", async function () {
      const { allowanceModule, operator, agent1 } =
        await loadFixture(delegatedAgentsFixture);

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
        await loadFixture(delegatedAgentsFixture);

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
        await loadFixture(delegatedAgentsFixture);

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
        await loadFixture(delegatedAgentsFixture);

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
        await loadFixture(delegatedAgentsFixture);

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
      const { registry, delegationRegistry, allowanceModule, usdc, registrar, operator, agent1, agent2, operatorMeta, agentMeta, credentialHash, scopeHash, futureTimestamp } = fixture;

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

      // Delegate
      await delegationRegistry.connect(operator).delegateWithScope(
        agent1.address, credentialHash, scopeHash, futureTimestamp, 0, 1
      );
      await delegationRegistry.connect(operator).delegateWithScope(
        agent2.address, credentialHash, scopeHash, futureTimestamp, 0, 0
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
  // PHASE 7: Delegation Validation & Chain-Breaking Revocation
  // ═══════════════════════════════════════════════════════════════

  describe("Phase 7: Delegation Validation & Revocation", function () {
    async function fullChainFixture() {
      const fixture = await loadFixture(deployFullSystemFixture);
      const { registry, delegationRegistry, registrar, operator, agent1, subAgent, operatorMeta, agentMeta, credentialHash, scopeHash, futureTimestamp } = fixture;

      await registry.connect(registrar).registerIdentityFor(
        operator.address, EntityType.Human, operatorMeta
      );
      await registry.connect(operator).createAgentIdentity(
        agent1.address, EntityType.VirtualAgent, agentMeta
      );
      await registry.connect(operator).createAgentIdentity(
        subAgent.address, EntityType.VirtualAgent, agentMeta
      );

      // Root: operator → agent1, depth=2
      await delegationRegistry.connect(operator).delegateWithScope(
        agent1.address, credentialHash, scopeHash, futureTimestamp, 0, 2
      );

      // Sub: agent1 → subAgent, depth=0
      await delegationRegistry.connect(agent1).delegateWithScope(
        subAgent.address, credentialHash, scopeHash, futureTimestamp, 1, 0
      );

      return { ...fixture, rootDelegationId: 1n, subDelegationId: 2n };
    }

    it("should validate root delegation", async function () {
      const { delegationRegistry, rootDelegationId } =
        await loadFixture(fullChainFixture);

      const [valid, depth] = await delegationRegistry.isValidDelegation(rootDelegationId);
      expect(valid).to.be.true;
      expect(depth).to.equal(0); // root = depth 0
    });

    it("should validate sub-delegation and report correct depth", async function () {
      const { delegationRegistry, subDelegationId } =
        await loadFixture(fullChainFixture);

      const [valid, depth] = await delegationRegistry.isValidDelegation(subDelegationId);
      expect(valid).to.be.true;
      expect(depth).to.equal(1); // one level deep
    });

    it("should invalidate entire chain when root is revoked (chain-breaking)", async function () {
      const { delegationRegistry, operator, rootDelegationId, subDelegationId } =
        await loadFixture(fullChainFixture);

      // Both valid before revocation
      let [validRoot] = await delegationRegistry.isValidDelegation(rootDelegationId);
      let [validSub] = await delegationRegistry.isValidDelegation(subDelegationId);
      expect(validRoot).to.be.true;
      expect(validSub).to.be.true;

      // Revoke root (O(1) — single on-chain write)
      await delegationRegistry.connect(operator).revokeDelegation(rootDelegationId);

      // Root is now invalid
      [validRoot] = await delegationRegistry.isValidDelegation(rootDelegationId);
      expect(validRoot).to.be.false;

      // Sub-delegation is also invalid (chain is broken)
      [validSub] = await delegationRegistry.isValidDelegation(subDelegationId);
      expect(validSub).to.be.false;
    });

    it("should invalidate delegation when issuer identity is suspended", async function () {
      const { registry, delegationRegistry, operator, rootDelegationId, subDelegationId } =
        await loadFixture(fullChainFixture);

      // Suspend operator identity
      await registry.connect(operator).updateStatus(operator.address, EntityStatus.Suspended);

      // Root delegation invalid (issuer not active)
      let [validRoot] = await delegationRegistry.isValidDelegation(rootDelegationId);
      expect(validRoot).to.be.false;

      // Sub also invalid (chain broken at root)
      let [validSub] = await delegationRegistry.isValidDelegation(subDelegationId);
      expect(validSub).to.be.false;

      // Reactivate operator
      await registry.connect(operator).updateStatus(operator.address, EntityStatus.Active);

      // Delegation is valid again
      [validRoot] = await delegationRegistry.isValidDelegation(rootDelegationId);
      expect(validRoot).to.be.true;
      [validSub] = await delegationRegistry.isValidDelegation(subDelegationId);
      expect(validSub).to.be.true;
    });

    it("should invalidate delegation when subject identity is suspended", async function () {
      const { registry, delegationRegistry, operator, agent1, rootDelegationId, subDelegationId } =
        await loadFixture(fullChainFixture);

      // Suspend agent1 (subject of root, issuer of sub)
      await registry.connect(operator).updateStatus(agent1.address, EntityStatus.Suspended);

      // Root invalid (subject not active)
      let [validRoot] = await delegationRegistry.isValidDelegation(rootDelegationId);
      expect(validRoot).to.be.false;

      // Sub also invalid (issuer agent1 not active)
      let [validSub] = await delegationRegistry.isValidDelegation(subDelegationId);
      expect(validSub).to.be.false;
    });

    it("should suspend and reactivate a delegation", async function () {
      const { delegationRegistry, operator, rootDelegationId } =
        await loadFixture(fullChainFixture);

      // Suspend
      await delegationRegistry.connect(operator).suspendDelegation(rootDelegationId);
      let [valid] = await delegationRegistry.isValidDelegation(rootDelegationId);
      expect(valid).to.be.false;

      // Reactivate
      await delegationRegistry.connect(operator).reactivateDelegation(rootDelegationId);
      [valid] = await delegationRegistry.isValidDelegation(rootDelegationId);
      expect(valid).to.be.true;
    });

    it("should reject revocation by non-issuer", async function () {
      const { delegationRegistry, agent1, rootDelegationId } =
        await loadFixture(fullChainFixture);

      await expect(
        delegationRegistry.connect(agent1).revokeDelegation(rootDelegationId)
      ).to.be.revertedWith("Not the issuer");
    });

    it("should handle expired delegations", async function () {
      const { registry, delegationRegistry, registrar, operator, agent1, operatorMeta, agentMeta, credentialHash, scopeHash } =
        await loadFixture(deployFullSystemFixture);

      await registry.connect(registrar).registerIdentityFor(
        operator.address, EntityType.Human, operatorMeta
      );
      await registry.connect(operator).createAgentIdentity(
        agent1.address, EntityType.VirtualAgent, agentMeta
      );

      // Short-lived delegation (60 seconds)
      const shortFuture = BigInt((await time.latest()) + 60);
      await delegationRegistry.connect(operator).delegateWithScope(
        agent1.address, credentialHash, scopeHash, shortFuture, 0, 0
      );

      // Valid now
      let [valid] = await delegationRegistry.isValidDelegation(1);
      expect(valid).to.be.true;

      // Fast-forward past expiry
      await time.increase(120);

      // Now expired
      [valid] = await delegationRegistry.isValidDelegation(1);
      expect(valid).to.be.false;
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PHASE 8: Full End-to-End Workflow (Complete Lifecycle)
  // ═══════════════════════════════════════════════════════════════

  describe("Phase 8: Complete End-to-End Workflow", function () {
    it("should execute the full operator → agent → payment workflow", async function () {
      const {
        registry, delegationRegistry, allowanceModule, usdc,
        admin, registrar, operator, agent1, recipient,
        operatorMeta, agentMeta, credentialHash, scopeHash, futureTimestamp,
      } = await loadFixture(deployFullSystemFixture);

      // ─── Step 1: Admin authorizes registrar ─────────────────
      // (Already done in fixture, but verify)
      expect(await registry.isRegistrar(registrar.address)).to.be.true;

      // ─── Step 2: Registrar registers operator ───────────────
      await registry.connect(registrar).registerIdentityFor(
        operator.address, EntityType.Human, operatorMeta
      );
      expect(await registry.isRegistered(operator.address)).to.be.true;

      // ─── Step 3: Operator creates agent ─────────────────────
      await registry.connect(operator).createAgentIdentity(
        agent1.address, EntityType.VirtualAgent, agentMeta
      );
      expect(await registry.ownerOf(agent1.address)).to.equal(operator.address);

      // ─── Step 4: Operator delegates scope to agent ──────────
      await delegationRegistry.connect(operator).delegateWithScope(
        agent1.address, credentialHash, scopeHash, futureTimestamp, 0, 1
      );
      const [valid] = await delegationRegistry.isValidDelegation(1);
      expect(valid).to.be.true;

      // ─── Step 5: Operator sets USDC allowance for agent ─────
      await allowanceModule.connect(operator).addDelegate(agent1.address);
      await allowanceModule.connect(operator).setAllowance(
        agent1.address, await usdc.getAddress(), toUSDC(100n), 0, 0
      );

      // ─── Step 6: Agent sends USDC to recipient ─────────────
      await allowanceModule.connect(agent1).executeAllowanceTransfer(
        operator.address, await usdc.getAddress(), recipient.address,
        toUSDC(50n), hre.ethers.ZeroAddress, 0, agent1.address, "0x"
      );

      expect(await usdc.balanceOf(recipient.address)).to.equal(toUSDC(50n));

      // ─── Step 7: Verify remaining allowance ─────────────────
      const allowanceResult = await allowanceModule.getTokenAllowance(
        operator.address, agent1.address, await usdc.getAddress()
      );
      expect(allowanceResult[0]).to.equal(toUSDC(100n)); // total
      expect(allowanceResult[1]).to.equal(toUSDC(50n));  // spent
      // remaining = 100 - 50 = 50 USDC

      // ─── Step 8: Agent tries to exceed remaining allowance ──
      await expect(
        allowanceModule.connect(agent1).executeAllowanceTransfer(
          operator.address, await usdc.getAddress(), recipient.address,
          toUSDC(51n), hre.ethers.ZeroAddress, 0, agent1.address, "0x"
        )
      ).to.be.revertedWith("Allowance exceeded");

      // ─── Step 9: Agent sends exactly remaining (50 USDC) ───
      await allowanceModule.connect(agent1).executeAllowanceTransfer(
        operator.address, await usdc.getAddress(), recipient.address,
        toUSDC(50n), hre.ethers.ZeroAddress, 0, agent1.address, "0x"
      );

      expect(await usdc.balanceOf(recipient.address)).to.equal(toUSDC(100n));
    });

    it("should support multi-agent fleet with independent controls", async function () {
      const {
        registry, delegationRegistry, allowanceModule, usdc,
        registrar, operator, agent1, agent2, agent3, recipient,
        operatorMeta, agentMeta, credentialHash, scopeHash, futureTimestamp,
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

      // Delegate with varying depths
      const scope1 = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("scope-trading"));
      const scope2 = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("scope-payments"));
      const scope3 = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("scope-delivery"));

      await delegationRegistry.connect(operator).delegateWithScope(
        agent1.address, credentialHash, scope1, futureTimestamp, 0, 2
      );
      await delegationRegistry.connect(operator).delegateWithScope(
        agent2.address, credentialHash, scope2, futureTimestamp, 0, 0
      );
      await delegationRegistry.connect(operator).delegateWithScope(
        agent3.address, credentialHash, scope3, futureTimestamp, 0, 0
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
  // PHASE 9: Agent Lifecycle (Suspend, Reactivate, Revoke)
  // ═══════════════════════════════════════════════════════════════

  describe("Phase 9: Agent Identity Lifecycle", function () {
    async function activeAgentFixture() {
      const fixture = await loadFixture(deployFullSystemFixture);
      const { registry, delegationRegistry, registrar, operator, agent1, operatorMeta, agentMeta, credentialHash, scopeHash, futureTimestamp } = fixture;

      await registry.connect(registrar).registerIdentityFor(
        operator.address, EntityType.Human, operatorMeta
      );
      await registry.connect(operator).createAgentIdentity(
        agent1.address, EntityType.VirtualAgent, agentMeta
      );
      await delegationRegistry.connect(operator).delegateWithScope(
        agent1.address, credentialHash, scopeHash, futureTimestamp, 0, 1
      );

      return { ...fixture, delegationId: 1n };
    }

    it("operator should suspend agent identity", async function () {
      const { registry, operator, agent1 } = await loadFixture(activeAgentFixture);

      await registry.connect(operator).updateStatus(agent1.address, EntityStatus.Suspended);

      const record = await registry.getIdentity(agent1.address);
      expect(record.status).to.equal(EntityStatus.Suspended);
    });

    it("suspending agent should invalidate its delegation", async function () {
      const { registry, delegationRegistry, operator, agent1, delegationId } =
        await loadFixture(activeAgentFixture);

      await registry.connect(operator).updateStatus(agent1.address, EntityStatus.Suspended);

      const [valid] = await delegationRegistry.isValidDelegation(delegationId);
      expect(valid).to.be.false;
    });

    it("reactivating agent should restore delegation validity", async function () {
      const { registry, delegationRegistry, operator, agent1, delegationId } =
        await loadFixture(activeAgentFixture);

      await registry.connect(operator).updateStatus(agent1.address, EntityStatus.Suspended);
      await registry.connect(operator).updateStatus(agent1.address, EntityStatus.Active);

      const [valid] = await delegationRegistry.isValidDelegation(delegationId);
      expect(valid).to.be.true;
    });

    it("revoking agent identity is permanent", async function () {
      const { registry, delegationRegistry, operator, agent1, delegationId } =
        await loadFixture(activeAgentFixture);

      await registry.connect(operator).updateStatus(agent1.address, EntityStatus.Revoked);

      // Cannot reactivate
      await expect(
        registry.connect(operator).updateStatus(agent1.address, EntityStatus.Active)
      ).to.be.revertedWith("Cannot update revoked identity");

      // Delegation is permanently invalid
      const [valid] = await delegationRegistry.isValidDelegation(delegationId);
      expect(valid).to.be.false;
    });

    it("stranger cannot modify agent status", async function () {
      const { registry, stranger, agent1 } = await loadFixture(activeAgentFixture);

      await expect(
        registry.connect(stranger).updateStatus(agent1.address, EntityStatus.Suspended)
      ).to.be.revertedWith("Not authorized");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PHASE 10: Security Boundaries & Edge Cases
  // ═══════════════════════════════════════════════════════════════

  describe("Phase 10: Security Boundaries", function () {
    async function securityFixture() {
      const fixture = await loadFixture(deployFullSystemFixture);
      const { registry, delegationRegistry, allowanceModule, usdc, registrar, operator, agent1, agent2, subAgent, operatorMeta, agentMeta, credentialHash, scopeHash, futureTimestamp } = fixture;

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

      // Delegate agent1 with depth=2
      await delegationRegistry.connect(operator).delegateWithScope(
        agent1.address, credentialHash, scopeHash, futureTimestamp, 0, 2
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

    it("delegation does not grant spending — allowance is the hard ceiling", async function () {
      const { delegationRegistry, allowanceModule, usdc, operator, agent2, recipient, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(securityFixture);

      // Agent2 has delegation but no allowance
      await delegationRegistry.connect(operator).delegateWithScope(
        agent2.address, credentialHash, scopeHash, futureTimestamp, 0, 0
      );

      // Verify delegation is valid
      const [valid] = await delegationRegistry.isValidDelegation(2);
      expect(valid).to.be.true;

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

    it("sub-delegation from revoked parent should fail validation", async function () {
      const { delegationRegistry, operator, agent1, subAgent, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(securityFixture);

      // Agent1 sub-delegates to subAgent
      await delegationRegistry.connect(agent1).delegateWithScope(
        subAgent.address, credentialHash, scopeHash, futureTimestamp, 1, 0
      );

      // Both valid
      let [validRoot] = await delegationRegistry.isValidDelegation(1);
      let [validSub] = await delegationRegistry.isValidDelegation(2);
      expect(validRoot).to.be.true;
      expect(validSub).to.be.true;

      // Revoke root
      await delegationRegistry.connect(operator).revokeDelegation(1);

      // Sub is also invalid
      [validSub] = await delegationRegistry.isValidDelegation(2);
      expect(validSub).to.be.false;
    });

    it("should reject delegation to unregistered address", async function () {
      const { delegationRegistry, operator, stranger, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(securityFixture);

      await expect(
        delegationRegistry.connect(operator).delegateWithScope(
          stranger.address, credentialHash, scopeHash, futureTimestamp, 0, 0
        )
      ).to.be.revertedWith("Subject not registered");
    });

    it("should reject delegation from unregistered address", async function () {
      const { delegationRegistry, stranger, agent1, credentialHash, scopeHash, futureTimestamp } =
        await loadFixture(securityFixture);

      await expect(
        delegationRegistry.connect(stranger).delegateWithScope(
          agent1.address, credentialHash, scopeHash, futureTimestamp, 0, 0
        )
      ).to.be.revertedWith("Issuer not registered");
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
    it("should support full Organization → Agent workflow", async function () {
      const {
        registry, delegationRegistry, allowanceModule, usdc,
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

      // Org delegates
      await delegationRegistry.connect(operator2).delegateWithScope(
        agent1.address, credentialHash, scopeHash, futureTimestamp, 0, 1
      );

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
  // PHASE 11: NexoidModule — Agent Safe Registry
  // ═══════════════════════════════════════════════════════════════

  describe("Phase 11: NexoidModule", function () {
    async function deployWithNexoidModuleFixture() {
      const fixture = await loadFixture(deployFullSystemFixture);

      const NexoidModule = await hre.ethers.getContractFactory("NexoidModule");
      const nexoidModule = await NexoidModule.connect(fixture.admin).deploy();

      return { ...fixture, nexoidModule };
    }

    it("should deploy NexoidModule successfully", async function () {
      const { nexoidModule } = await loadFixture(deployWithNexoidModuleFixture);
      expect(await nexoidModule.getAddress()).to.be.properAddress;
    });

    it("should register an agent Safe under an operator", async function () {
      const { nexoidModule, operator, agent1 } =
        await loadFixture(deployWithNexoidModuleFixture);

      // operator.address acts as the operator Safe in tests
      const agentSafeAddr = agent1.address; // simulated agent Safe

      await expect(
        nexoidModule.connect(operator).registerAgentSafe(agentSafeAddr, agent1.address)
      )
        .to.emit(nexoidModule, "AgentSafeRegistered")
        .withArgs(operator.address, agentSafeAddr, agent1.address);

      expect(await nexoidModule.agentCount(operator.address)).to.equal(1);
      expect(await nexoidModule.getOperator(agentSafeAddr)).to.equal(operator.address);
    });

    it("should register multiple agent Safes", async function () {
      const { nexoidModule, operator, agent1, agent2 } =
        await loadFixture(deployWithNexoidModuleFixture);

      await nexoidModule.connect(operator).registerAgentSafe(agent1.address, agent1.address);
      await nexoidModule.connect(operator).registerAgentSafe(agent2.address, agent2.address);

      expect(await nexoidModule.agentCount(operator.address)).to.equal(2);

      const agents = await nexoidModule.getAgentSafes(operator.address);
      expect(agents.length).to.equal(2);
      expect(agents[0].agentSafe).to.equal(agent1.address);
      expect(agents[1].agentSafe).to.equal(agent2.address);
    });

    it("should return correct reverse lookup (getOperator)", async function () {
      const { nexoidModule, operator, agent1 } =
        await loadFixture(deployWithNexoidModuleFixture);

      await nexoidModule.connect(operator).registerAgentSafe(agent1.address, agent1.address);

      expect(await nexoidModule.getOperator(agent1.address)).to.equal(operator.address);
      expect(await nexoidModule.operatorOf(agent1.address)).to.equal(operator.address);
    });

    it("should reject duplicate agent Safe registration", async function () {
      const { nexoidModule, operator, agent1 } =
        await loadFixture(deployWithNexoidModuleFixture);

      await nexoidModule.connect(operator).registerAgentSafe(agent1.address, agent1.address);

      await expect(
        nexoidModule.connect(operator).registerAgentSafe(agent1.address, agent1.address)
      ).to.be.revertedWith("Agent Safe already registered");
    });

    it("should reject registration with zero addresses", async function () {
      const { nexoidModule, operator, agent1 } =
        await loadFixture(deployWithNexoidModuleFixture);

      await expect(
        nexoidModule.connect(operator).registerAgentSafe(hre.ethers.ZeroAddress, agent1.address)
      ).to.be.revertedWith("Invalid agent Safe");

      await expect(
        nexoidModule.connect(operator).registerAgentSafe(agent1.address, hre.ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid agent EOA");
    });

    it("should remove an agent Safe", async function () {
      const { nexoidModule, operator, agent1, agent2 } =
        await loadFixture(deployWithNexoidModuleFixture);

      await nexoidModule.connect(operator).registerAgentSafe(agent1.address, agent1.address);
      await nexoidModule.connect(operator).registerAgentSafe(agent2.address, agent2.address);

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
      const { nexoidModule, operator, agent1, stranger } =
        await loadFixture(deployWithNexoidModuleFixture);

      await nexoidModule.connect(operator).registerAgentSafe(agent1.address, agent1.address);

      await expect(
        nexoidModule.connect(stranger).removeAgentSafe(agent1.address)
      ).to.be.revertedWith("Not operator of this agent Safe");
    });

    it("should return empty array for operator with no agents", async function () {
      const { nexoidModule, stranger } =
        await loadFixture(deployWithNexoidModuleFixture);

      const agents = await nexoidModule.getAgentSafes(stranger.address);
      expect(agents.length).to.equal(0);
      expect(await nexoidModule.agentCount(stranger.address)).to.equal(0);
    });

    it("should return zero address for unregistered agent Safe", async function () {
      const { nexoidModule, stranger } =
        await loadFixture(deployWithNexoidModuleFixture);

      expect(await nexoidModule.getOperator(stranger.address)).to.equal(hre.ethers.ZeroAddress);
    });

    it("should store createdAt timestamp", async function () {
      const { nexoidModule, operator, agent1 } =
        await loadFixture(deployWithNexoidModuleFixture);

      await nexoidModule.connect(operator).registerAgentSafe(agent1.address, agent1.address);

      const agents = await nexoidModule.getAgentSafes(operator.address);
      expect(agents[0].createdAt).to.be.greaterThan(0);
    });

    it("should allow re-registration after removal", async function () {
      const { nexoidModule, operator, agent1 } =
        await loadFixture(deployWithNexoidModuleFixture);

      await nexoidModule.connect(operator).registerAgentSafe(agent1.address, agent1.address);
      await nexoidModule.connect(operator).removeAgentSafe(agent1.address);

      // Should succeed after removal
      await nexoidModule.connect(operator).registerAgentSafe(agent1.address, agent1.address);
      expect(await nexoidModule.agentCount(operator.address)).to.equal(1);
    });
  });
});
