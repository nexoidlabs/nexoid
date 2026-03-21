"use client";

import { useEffect, useState, useCallback } from "react";
import { useWallet } from "@/lib/wallet";
import {
  getRegistryAddress,
  getNexoidModuleAddress,
  getTokenAddress,
  IDENTITY_REGISTRY_ABI,
  NEXOID_MODULE_ABI,
  SAFE_PROXY_FACTORY_ABI,
  SAFE_ABI,
  SAFE_PROXY_FACTORY,
  SAFE_SINGLETON,
  SAFE_FALLBACK_HANDLER,
  ALLOWANCE_MODULE_ADDRESS,
  ALLOWANCE_MODULE_WRITE_ABI,
} from "@/lib/contracts";
import {
  encodeFunctionData,
  keccak256,
  stringToHex,
  pad,
  concat,
  type Address,
  type Hex,
  decodeEventLog,
  zeroAddress,
} from "viem";
import { setSafeAddress as storeSafeAddress, addLinkedDid, addStoredAgent } from "@/lib/storage";

// ---- Types ----

type StepStatus = "pending" | "active" | "complete" | "error";

interface StepState {
  status: StepStatus;
  error?: string;
  txHash?: string;
}

// ---- Helpers ----

const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

function canonicalHash(obj: Record<string, unknown>): Hex {
  const sorted = Object.keys(obj).sort();
  const canonical = JSON.stringify(obj, sorted);
  return keccak256(stringToHex(canonical));
}

function buildPreApprovedSig(owner: Address): Hex {
  const r = pad(owner, { size: 32 });
  const s = pad("0x00" as Hex, { size: 32 });
  const v = "0x01" as Hex;
  return concat([r, s, v]);
}

// ---- Component ----

export default function OnboardingPage() {
  const {
    address: walletAddress,
    walletClient,
    publicClient,
    chain,
    connect,
  } = useWallet();

  const registryAddress = getRegistryAddress();
  const nexoidModuleAddress = getNexoidModuleAddress();
  const tokenAddress = getTokenAddress();

  // Step state
  const [steps, setSteps] = useState<Record<string, StepState>>({
    connect: { status: "active" },
    identity: { status: "pending" },
    safe: { status: "pending" },
    agent: { status: "pending" },
    allowance: { status: "pending" },
  });

  // Onboarding data
  const [didInput, setDidInput] = useState("");
  const [safeAddress, setSafeAddress] = useState<Address | null>(null);
  const [agentLabel, setAgentLabel] = useState("Agent Alpha");
  const [agentAddress, setAgentAddress] = useState("");
  const [agentSafeAddress, setAgentSafeAddress] = useState("");
  const [allowanceAmount, setAllowanceAmount] = useState("100");
  const [resetMinutes, setResetMinutes] = useState("1440");
  const [txPending, setTxPending] = useState(false);

  // Key generation
  const [agentKeyMode, setAgentKeyMode] = useState<"manual" | "generate">("manual");
  const [seedPhrase, setSeedPhrase] = useState("");
  const [derivedAgent, setDerivedAgent] = useState<{ address: string; privateKey: string } | null>(null);
  const [generating, setGenerating] = useState(false);

  // Checks
  const [isRegistered, setIsRegistered] = useState(false);
  const [moduleEnabled, setModuleEnabled] = useState(false);

  const updateStep = useCallback(
    (key: string, update: Partial<StepState>) => {
      setSteps((prev) => ({
        ...prev,
        [key]: { ...prev[key], ...update },
      }));
    },
    []
  );

  // ---- Check on-chain state when wallet connects ----
  useEffect(() => {
    if (!walletAddress || !publicClient) return;

    updateStep("connect", { status: "complete" });
    updateStep("identity", { status: "active" });

    (async () => {
      try {
        const registered = await publicClient.readContract({
          address: registryAddress,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: "isRegistered",
          args: [walletAddress],
        });
        setIsRegistered(registered as boolean);

        if (registered) {
          updateStep("identity", { status: "complete" });
          updateStep("safe", { status: "active" });
        }
      } catch {
        // Contract may not be deployed yet
      }

      // Check for existing Safe in localStorage
      const storedSafe = localStorage.getItem("nexoid-safe-address");
      if (storedSafe) {
        try {
          const { SAFE_ABI: safeAbi } = await import("@/lib/contracts");
          const owners = await publicClient.readContract({
            address: storedSafe as Address,
            abi: safeAbi,
            functionName: "getOwners",
            args: [],
          });
          if (
            (owners as Address[]).some(
              (o) => o.toLowerCase() === walletAddress.toLowerCase()
            )
          ) {
            setSafeAddress(storedSafe as Address);
            const modEnabled = await publicClient.readContract({
              address: storedSafe as Address,
              abi: safeAbi,
              functionName: "isModuleEnabled",
              args: [ALLOWANCE_MODULE_ADDRESS],
            });
            setModuleEnabled(modEnabled as boolean);
            updateStep("safe", { status: "complete" });
            updateStep("agent", { status: "active" });
          }
        } catch {
          // Safe not valid
        }
      }
    })();
  }, [walletAddress, publicClient, registryAddress, updateStep]);

  // ---- Step 2: Add DID ----
  async function handleAddDid() {
    if (!publicClient || !walletAddress) return;

    // Parse DID to extract address
    const match = didInput.match(/^did:nexoid:eth:(0x[a-fA-F0-9]{40})$/i);
    if (!match) {
      updateStep("identity", { status: "error", error: "Invalid DID format. Expected: did:nexoid:eth:0x..." });
      return;
    }
    const didAddress = match[1] as Address;

    setTxPending(true);
    updateStep("identity", { status: "active", error: undefined });

    try {
      const registered = await publicClient.readContract({
        address: registryAddress,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "isRegistered",
        args: [didAddress],
      });

      if (!registered) {
        updateStep("identity", {
          status: "error",
          error: "This DID is not registered on the IdentityRegistry. Contact the Nexoid administrator to register your identity.",
        });
        return;
      }

      const identity = await publicClient.readContract({
        address: registryAddress,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "getIdentity",
        args: [didAddress],
      }) as { entityType: number; status: number };

      const ENTITY_TYPES = ["Human", "VirtualAgent", "PhysicalAgent", "Organization"];

      // Store in localStorage
      addLinkedDid({
        did: didInput,
        address: didAddress,
        entityType: ENTITY_TYPES[identity.entityType] ?? "Unknown",
        linkedAt: Date.now(),
      });

      setIsRegistered(true);
      updateStep("identity", { status: "complete" });
      updateStep("safe", { status: "active" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      updateStep("identity", { status: "error", error: msg.slice(0, 200) });
    } finally {
      setTxPending(false);
    }
  }

  // ---- Step 3: Deploy Safe ----
  async function handleDeploySafe() {
    if (!walletClient || !publicClient || !walletAddress) return;
    setTxPending(true);
    updateStep("safe", { status: "active", error: undefined });

    try {
      const initializer = encodeFunctionData({
        abi: SAFE_ABI,
        functionName: "setup",
        args: [
          [walletAddress],
          1n,
          zeroAddress,
          "0x",
          SAFE_FALLBACK_HANDLER,
          zeroAddress,
          0n,
          zeroAddress,
        ],
      });

      const saltNonce = BigInt(Date.now());
      const deployTx = await walletClient.writeContract({ chain, account: walletAddress!, gas: 1_000_000n,
        address: SAFE_PROXY_FACTORY,
        abi: SAFE_PROXY_FACTORY_ABI,
        functionName: "createProxyWithNonce",
        args: [SAFE_SINGLETON, initializer, saltNonce],
      });

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: deployTx,
      });

      let newSafeAddress: Address | null = null;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: SAFE_PROXY_FACTORY_ABI,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === "ProxyCreation") {
            newSafeAddress = (decoded.args as { proxy: Address }).proxy;
            break;
          }
        } catch {
          // Not our event
        }
      }

      if (!newSafeAddress) throw new Error("Safe address not found in receipt");

      const enableModuleData = encodeFunctionData({
        abi: SAFE_ABI,
        functionName: "enableModule",
        args: [ALLOWANCE_MODULE_ADDRESS],
      });

      const sig = buildPreApprovedSig(walletAddress);

      const enableTx = await walletClient.writeContract({ chain, account: walletAddress!, gas: 500_000n,
        address: newSafeAddress,
        abi: SAFE_ABI,
        functionName: "execTransaction",
        args: [
          newSafeAddress,
          0n,
          enableModuleData,
          0,
          0n,
          0n,
          0n,
          zeroAddress,
          zeroAddress,
          sig,
        ],
      });
      await publicClient.waitForTransactionReceipt({ hash: enableTx });

      setSafeAddress(newSafeAddress);
      setModuleEnabled(true);
      storeSafeAddress(newSafeAddress);

      updateStep("safe", { status: "complete", txHash: deployTx });
      updateStep("agent", { status: "active" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      updateStep("safe", { status: "error", error: msg.slice(0, 200) });
    } finally {
      setTxPending(false);
    }
  }

  // ---- Step 4: Key generation helpers ----
  async function handleGenerateMnemonic() {
    setGenerating(true);
    try {
      const res = await fetch("/api/wdk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSeedPhrase(data.seedPhrase);
      setDerivedAgent(null);
    } catch (e) {
      updateStep("agent", { status: "error", error: e instanceof Error ? e.message : "Failed to generate" });
    } finally {
      setGenerating(false);
    }
  }

  async function handleDeriveAgent() {
    if (!seedPhrase) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/wdk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "derive-agent", seedPhrase, index: 1 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDerivedAgent(data.agent);
      setAgentAddress(data.agent.address);
    } catch (e) {
      updateStep("agent", { status: "error", error: e instanceof Error ? e.message : "Failed to derive" });
    } finally {
      setGenerating(false);
    }
  }

  // ---- Step 4: Create Agent ----
  async function handleCreateAgent() {
    if (!walletClient || !publicClient || !walletAddress || !agentAddress)
      return;
    setTxPending(true);
    updateStep("agent", { status: "active", error: undefined });

    try {
      const agentAddr = agentAddress as Address;
      const agentSafe = (agentSafeAddress || agentAddress) as Address;

      const metadata: Record<string, unknown> = {
        label: agentLabel,
        operator: `did:nexoid:eth:${walletAddress.toLowerCase()}`,
      };
      const metadataHash = canonicalHash(metadata);

      const tx1 = await walletClient.writeContract({ chain, account: walletAddress!, gas: 500_000n,
        address: registryAddress,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "createAgentIdentity",
        args: [agentAddr, 1, metadataHash],
      });
      await publicClient.waitForTransactionReceipt({ hash: tx1 });

      if (nexoidModuleAddress) {
        const tx2 = await walletClient.writeContract({ chain, account: walletAddress!, gas: 500_000n,
          address: nexoidModuleAddress,
          abi: NEXOID_MODULE_ABI,
          functionName: "registerAgentSafe",
          args: [agentSafe, agentAddr, ZERO_BYTES32, ZERO_BYTES32, 0n],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx2 });
      }

      // Store agent locally
      addStoredAgent({
        address: agentAddress,
        safeAddress: agentSafeAddress || undefined,
        label: agentLabel,
        mnemonic: seedPhrase || undefined,
        mnemonicIndex: seedPhrase ? 1 : undefined,
        createdAt: Date.now(),
      });

      updateStep("agent", { status: "complete", txHash: tx1 });
      updateStep("allowance", { status: "active" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      updateStep("agent", { status: "error", error: msg.slice(0, 200) });
    } finally {
      setTxPending(false);
    }
  }

  // ---- Step 5: Set Allowance ----
  async function handleSetAllowance() {
    if (!walletClient || !publicClient || !walletAddress || !safeAddress)
      return;
    setTxPending(true);
    updateStep("allowance", { status: "active", error: undefined });

    try {
      const delegateAddr = agentAddress as Address;
      const decimals = 6;
      const amountRaw = BigInt(
        Math.round(parseFloat(allowanceAmount) * 10 ** decimals)
      );
      const resetMin = parseInt(resetMinutes) || 0;

      const addDelegateData = encodeFunctionData({
        abi: ALLOWANCE_MODULE_WRITE_ABI,
        functionName: "addDelegate",
        args: [delegateAddr],
      });

      const sig = buildPreApprovedSig(walletAddress);

      const tx1 = await walletClient.writeContract({ chain, account: walletAddress!, gas: 500_000n,
        address: safeAddress,
        abi: SAFE_ABI,
        functionName: "execTransaction",
        args: [
          ALLOWANCE_MODULE_ADDRESS,
          0n,
          addDelegateData,
          0,
          0n,
          0n,
          0n,
          zeroAddress,
          zeroAddress,
          sig,
        ],
      });
      await publicClient.waitForTransactionReceipt({ hash: tx1 });

      const setAllowanceData = encodeFunctionData({
        abi: ALLOWANCE_MODULE_WRITE_ABI,
        functionName: "setAllowance",
        args: [delegateAddr, tokenAddress, amountRaw, resetMin, 0],
      });

      const tx2 = await walletClient.writeContract({ chain, account: walletAddress!, gas: 500_000n,
        address: safeAddress,
        abi: SAFE_ABI,
        functionName: "execTransaction",
        args: [
          ALLOWANCE_MODULE_ADDRESS,
          0n,
          setAllowanceData,
          0,
          0n,
          0n,
          0n,
          zeroAddress,
          zeroAddress,
          sig,
        ],
      });
      await publicClient.waitForTransactionReceipt({ hash: tx2 });

      updateStep("allowance", { status: "complete", txHash: tx2 });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      updateStep("allowance", {
        status: "error",
        error: msg.slice(0, 200),
      });
    } finally {
      setTxPending(false);
    }
  }

  // ---- Render helpers ----

  function stepNumber(step: StepState, n: number) {
    if (step.status === "complete") return "\u2713";
    return n;
  }

  const allComplete = Object.values(steps).every(
    (s) => s.status === "complete"
  );

  return (
    <div className="page-content">
      <div className="wizard">
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>
            Operator Setup
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
            Link your identity, deploy a Safe wallet, and create your first
            agent.
          </p>
        </div>

        <div className="wizard-steps">
          {/* ---- Step 1: Connect Wallet ---- */}
          <div className={`wizard-step ${steps.connect.status}`}>
            <div className="wizard-step-header">
              <div className="wizard-step-number">
                {stepNumber(steps.connect, 1)}
              </div>
              <div>
                <div className="wizard-step-title">Connect Wallet</div>
                <div className="wizard-step-desc">
                  Connect your MetaMask or Web3 wallet
                </div>
              </div>
            </div>
            {steps.connect.status !== "complete" && (
              <div className="wizard-step-body">
                <div className="wizard-step-actions">
                  <button
                    className="btn btn-primary"
                    onClick={connect}
                    disabled={txPending}
                  >
                    Connect Wallet
                  </button>
                </div>
              </div>
            )}
            {steps.connect.status === "complete" && walletAddress && (
              <div className="wizard-step-body">
                <div className="wizard-result">
                  Connected as
                  <span className="mono">{walletAddress}</span>
                </div>
              </div>
            )}
          </div>

          {/* ---- Step 2: Add DID ---- */}
          <div className={`wizard-step ${steps.identity.status}`}>
            <div className="wizard-step-header">
              <div className="wizard-step-number">
                {stepNumber(steps.identity, 2)}
              </div>
              <div>
                <div className="wizard-step-title">Add DID</div>
                <div className="wizard-step-desc">
                  Link your registered DID to this wallet
                </div>
              </div>
            </div>
            {steps.identity.status === "active" && !isRegistered && (
              <div className="wizard-step-body">
                <div className="wizard-info">
                  Enter your DID to verify it is registered on the IdentityRegistry. Not registered? Contact the Nexoid administrator.
                </div>
                <div className="form-row">
                  <div>
                    <label>Your DID</label>
                    <input
                      value={didInput}
                      onChange={(e) => setDidInput(e.target.value)}
                      placeholder="did:nexoid:eth:0x..."
                      className="mono"
                    />
                  </div>
                </div>
                <div className="wizard-step-actions">
                  <button
                    className="btn btn-primary"
                    onClick={handleAddDid}
                    disabled={txPending || !didInput}
                  >
                    {txPending ? "Verifying..." : "Verify & Link DID"}
                  </button>
                </div>
                {steps.identity.error && (
                  <div className="error-msg" style={{ marginTop: 12 }}>
                    {steps.identity.error}
                  </div>
                )}
              </div>
            )}
            {(steps.identity.status === "complete" || isRegistered) && (
              <div className="wizard-step-body">
                <div className="wizard-result">
                  Identity linked
                  {didInput && (
                    <span className="mono">{didInput}</span>
                  )}
                  {!didInput && walletAddress && (
                    <span className="mono">
                      did:nexoid:eth:{walletAddress.toLowerCase()}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ---- Step 3: Deploy Safe ---- */}
          <div className={`wizard-step ${steps.safe.status}`}>
            <div className="wizard-step-header">
              <div className="wizard-step-number">
                {stepNumber(steps.safe, 3)}
              </div>
              <div>
                <div className="wizard-step-title">Deploy Safe Wallet</div>
                <div className="wizard-step-desc">
                  Deploy a 1-of-1 Safe with AllowanceModule enabled
                </div>
              </div>
            </div>
            {steps.safe.status === "active" && (
              <div className="wizard-step-body">
                <div className="wizard-info">
                  This deploys a new Safe{"{Wallet}"} smart account owned by your
                  connected wallet. The AllowanceModule is enabled automatically
                  to enforce per-agent spending limits.
                </div>
                <div className="wizard-step-actions">
                  <button
                    className="btn btn-primary"
                    onClick={handleDeploySafe}
                    disabled={txPending}
                  >
                    {txPending ? "Deploying..." : "Deploy Safe"}
                  </button>
                </div>
                {steps.safe.error && (
                  <div className="error-msg" style={{ marginTop: 12 }}>
                    {steps.safe.error}
                  </div>
                )}
              </div>
            )}
            {steps.safe.status === "complete" && safeAddress && (
              <div className="wizard-step-body">
                <div className="wizard-result">
                  Safe deployed with AllowanceModule
                  <span className="mono">{safeAddress}</span>
                </div>
              </div>
            )}
          </div>

          {/* ---- Step 4: Create Agent ---- */}
          <div className={`wizard-step ${steps.agent.status}`}>
            <div className="wizard-step-header">
              <div className="wizard-step-number">
                {stepNumber(steps.agent, 4)}
              </div>
              <div>
                <div className="wizard-step-title">Create Agent</div>
                <div className="wizard-step-desc">
                  Register an AI agent identity and link it to NexoidModule
                </div>
              </div>
            </div>
            {steps.agent.status === "active" && (
              <div className="wizard-step-body">
                {/* Mode toggle */}
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <button className={`btn ${agentKeyMode === "manual" ? "btn-primary" : ""}`} onClick={() => setAgentKeyMode("manual")}>
                    Enter Address
                  </button>
                  <button className={`btn ${agentKeyMode === "generate" ? "btn-primary" : ""}`} onClick={() => setAgentKeyMode("generate")}>
                    Generate New Key
                  </button>
                </div>

                {agentKeyMode === "generate" && (
                  <div style={{ marginBottom: 12 }}>
                    <button className="btn" onClick={handleGenerateMnemonic} disabled={generating} style={{ marginBottom: 8 }}>
                      {generating ? "Generating..." : seedPhrase ? "Regenerate" : "Generate Mnemonic"}
                    </button>
                    {seedPhrase && (
                      <>
                        <div style={{ background: "var(--bg)", border: "1px solid var(--warning)", borderRadius: "var(--radius)", padding: 12, marginBottom: 8 }}>
                          <div style={{ fontSize: 11, color: "var(--warning)", fontWeight: 600, marginBottom: 4, textTransform: "uppercase" }}>
                            Save securely — cannot be recovered
                          </div>
                          <div className="mono" style={{ fontSize: 12, lineHeight: 1.8, wordBreak: "break-word" }}>{seedPhrase}</div>
                        </div>
                        <button className="btn btn-primary" onClick={handleDeriveAgent} disabled={generating}>
                          {generating ? "Deriving..." : "Derive Agent Key (index 1)"}
                        </button>
                        {derivedAgent && (
                          <div style={{ marginTop: 8, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 12 }}>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Address:</div>
                            <div className="mono" style={{ fontSize: 12, marginBottom: 4 }}>{derivedAgent.address}</div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Private Key:</div>
                            <div className="mono" style={{ fontSize: 12, wordBreak: "break-all" }}>{derivedAgent.privateKey}</div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div className="form-row">
                  <div>
                    <label>Agent Label</label>
                    <input
                      value={agentLabel}
                      onChange={(e) => setAgentLabel(e.target.value)}
                      placeholder="e.g. Agent Alpha"
                    />
                  </div>
                </div>
                {agentKeyMode === "manual" && (
                  <div className="form-row">
                    <div>
                      <label>Agent EOA Address</label>
                      <input
                        value={agentAddress}
                        onChange={(e) => setAgentAddress(e.target.value)}
                        placeholder="0x..."
                        className="mono"
                      />
                    </div>
                  </div>
                )}
                <div className="form-row">
                  <div>
                    <label>
                      Agent Safe Address{" "}
                      <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                        (optional, defaults to EOA)
                      </span>
                    </label>
                    <input
                      value={agentSafeAddress}
                      onChange={(e) => setAgentSafeAddress(e.target.value)}
                      placeholder="0x... (leave blank to use EOA)"
                      className="mono"
                    />
                  </div>
                </div>
                <div className="wizard-step-actions">
                  <button
                    className="btn btn-primary"
                    onClick={handleCreateAgent}
                    disabled={txPending || !agentAddress}
                  >
                    {txPending ? "Creating..." : "Create Agent"}
                  </button>
                </div>
                {steps.agent.error && (
                  <div className="error-msg" style={{ marginTop: 12 }}>
                    {steps.agent.error}
                  </div>
                )}
              </div>
            )}
            {steps.agent.status === "complete" && (
              <div className="wizard-step-body">
                <div className="wizard-result">
                  Agent created
                  <span className="mono">
                    did:nexoid:eth:{agentAddress.toLowerCase()}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ---- Step 5: Set Allowance ---- */}
          <div className={`wizard-step ${steps.allowance.status}`}>
            <div className="wizard-step-header">
              <div className="wizard-step-number">
                {stepNumber(steps.allowance, 5)}
              </div>
              <div>
                <div className="wizard-step-title">Set Spending Allowance</div>
                <div className="wizard-step-desc">
                  Configure the agent&apos;s USDT spending limit on your Safe
                </div>
              </div>
            </div>
            {steps.allowance.status === "active" && (
              <div className="wizard-step-body">
                <div className="wizard-info">
                  The agent will be able to spend up to this amount per period
                  from your Safe. The AllowanceModule enforces this limit at the
                  EVM level — the transaction reverts if the agent exceeds it.
                </div>
                <div className="form-row">
                  <div>
                    <label>Allowance (USDT)</label>
                    <input
                      type="number"
                      value={allowanceAmount}
                      onChange={(e) => setAllowanceAmount(e.target.value)}
                      placeholder="100"
                    />
                  </div>
                  <div>
                    <label>Reset Period (minutes, 0 = no reset)</label>
                    <input
                      type="number"
                      value={resetMinutes}
                      onChange={(e) => setResetMinutes(e.target.value)}
                      placeholder="1440"
                    />
                  </div>
                </div>
                <div className="wizard-step-actions">
                  <button
                    className="btn btn-primary"
                    onClick={handleSetAllowance}
                    disabled={txPending}
                  >
                    {txPending ? "Setting..." : "Set Allowance"}
                  </button>
                </div>
                {steps.allowance.error && (
                  <div className="error-msg" style={{ marginTop: 12 }}>
                    {steps.allowance.error}
                  </div>
                )}
              </div>
            )}
            {steps.allowance.status === "complete" && (
              <div className="wizard-step-body">
                <div className="wizard-result">
                  Allowance set: {allowanceAmount} USDT
                  {parseInt(resetMinutes) > 0
                    ? ` (resets every ${resetMinutes} min)`
                    : " (one-time)"}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ---- All Done ---- */}
        {allComplete && (
          <div
            className="card"
            style={{
              marginTop: 24,
              textAlign: "center",
              padding: "32px 24px",
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              Setup Complete
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Your identity is linked, Safe is deployed, and your
              agent is configured with a spending allowance.
            </p>
            <div
              style={{
                marginTop: 16,
                display: "flex",
                gap: 10,
                justifyContent: "center",
              }}
            >
              <a href="/wallet" className="btn btn-primary">
                Go to Wallet
              </a>
              <a href="/identities" className="btn">
                Manage Identities
              </a>
              <a href="/delegations" className="btn">
                Manage Delegations
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
