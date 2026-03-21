"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useWallet } from "@/lib/wallet";
import {
  getRegistryAddress,
  getNexoidModuleAddress,
  IDENTITY_REGISTRY_ABI,
  NEXOID_MODULE_ABI,
  SAFE_PROXY_FACTORY_ABI,
  SAFE_ABI,
  SAFE_PROXY_FACTORY,
  SAFE_SINGLETON,
  SAFE_FALLBACK_HANDLER,
  ALLOWANCE_MODULE_ADDRESS,
} from "@/lib/contracts";
import {
  keccak256,
  stringToHex,
  encodeFunctionData,
  pad,
  concat,
  decodeEventLog,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import {
  getLinkedDids,
  addLinkedDid,
  removeLinkedDid,
  getStoredAgents,
  addStoredAgent,
  getSafeAddress,
  type LinkedDid,
  type StoredAgent,
} from "@/lib/storage";
import { SlidePanel } from "../slide-panel";

// --- Helpers ---

function canonicalHash(obj: Record<string, unknown>): `0x${string}` {
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

const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

const ENTITY_TYPES = ["Human", "VirtualAgent", "PhysicalAgent", "Organization"];
const ENTITY_STATUSES = ["Active", "Suspended", "Revoked"];

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: "13px",
  color: "var(--text-muted)",
  marginBottom: "4px",
};

interface IdentityInfo {
  address: string;
  did: string;
  entityType: string;
  status: string;
  owner: string;
}

interface OnChainAgent {
  agentSafe: string;
  agentEOA: string;
  scopeHash: string;
  credentialHash: string;
  validUntil: number;
  status: number;
  statusName: string;
}

// --- Component ---

export default function IdentitiesPage() {
  const { address: walletAddress, walletClient, publicClient, chain } = useWallet();
  const registryAddress = getRegistryAddress();
  const nexoidModuleAddress = getNexoidModuleAddress();

  // My identities from on-chain
  const [identities, setIdentities] = useState<IdentityInfo[]>([]);
  const [identitiesLoading, setIdentitiesLoading] = useState(true);

  // Linked DIDs
  const [linkedDids, setLinkedDids] = useState<LinkedDid[]>([]);
  const [showLinkDid, setShowLinkDid] = useState(false);
  const [didInput, setDidInput] = useState("");
  const [didVerifying, setDidVerifying] = useState(false);
  const [didVerifyResult, setDidVerifyResult] = useState<{
    valid: boolean;
    address: string;
    entityType: string;
    status: string;
  } | null>(null);
  const [didError, setDidError] = useState("");

  // Agent creation
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [agentMode, setAgentMode] = useState<"existing" | "generate">("generate");
  const [agentAddress, setAgentAddress] = useState("");
  const [agentLabel, setAgentLabel] = useState("");

  // Key generation
  const [seedPhrase, setSeedPhrase] = useState("");
  const [agentIndex, setAgentIndex] = useState("1");
  const [derivedAgent, setDerivedAgent] = useState<{ address: string; privateKey: string } | null>(null);
  const [generating, setGenerating] = useState(false);

  // Safe deployment for agent
  const [deployAgentSafe, setDeployAgentSafe] = useState(true);
  const [agentSafeAddress, setAgentSafeAddress] = useState("");

  // Transaction state
  const [txPending, setTxPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [creationStep, setCreationStep] = useState<number | null>(null);

  // Agents: on-chain + local
  const [onChainAgents, setOnChainAgents] = useState<OnChainAgent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [storedAgents, setStoredAgents] = useState<StoredAgent[]>([]);

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelAgentSafe, setPanelAgentSafe] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<"details" | "delegate">("details");
  const [panelIdentity, setPanelIdentity] = useState<IdentityInfo | null>(null);
  const [delegatePending, setDelegatePending] = useState(false);
  const [delegateSuccess, setDelegateSuccess] = useState("");

  // Drag state (HTML5 native)
  const [isDragging, setIsDragging] = useState(false);
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);
  const [dragIdentity, setDragIdentity] = useState<IdentityInfo | null>(null);
  const dragImageRef = useRef<HTMLDivElement>(null);

  // Load data on mount and when wallet connects
  useEffect(() => {
    setLinkedDids(getLinkedDids());
    setStoredAgents(getStoredAgents());
    loadIdentities();
    loadOnChainAgents();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);

  const showSuccess = useCallback((msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(null), 5000); }, []);
  const showError = useCallback((msg: string) => { setError(msg); setTimeout(() => setError(null), 8000); }, []);

  // --- Load identities from on-chain ---
  const loadIdentities = async () => {
    setIdentitiesLoading(true);
    try {
      // Get identities linked to this wallet via linked DIDs
      const dids = getLinkedDids();
      const results: IdentityInfo[] = [];

      for (const d of dids) {
        try {
          const identity = await publicClient.readContract({
            address: registryAddress,
            abi: IDENTITY_REGISTRY_ABI,
            functionName: "getIdentity",
            args: [d.address as Address],
          }) as { entityType: number; status: number; owner: Address };

          results.push({
            address: d.address,
            did: d.did,
            entityType: ENTITY_TYPES[identity.entityType] ?? "Unknown",
            status: ENTITY_STATUSES[identity.status] ?? "Unknown",
            owner: identity.owner,
          });
        } catch {
          // Identity not found on-chain, still show from local
          results.push({
            address: d.address,
            did: d.did,
            entityType: d.entityType,
            status: "Unknown",
            owner: "",
          });
        }
      }

      setIdentities(results);
    } catch {
      // Silently fail - identities will just be empty
    } finally {
      setIdentitiesLoading(false);
    }
  };

  // --- Load on-chain agents ---
  // The NexoidModule keys agents by msg.sender. When registerAgentSafe is called
  // directly from the EOA (not via Safe transaction), msg.sender is the EOA.
  // So we query both the operator Safe AND the connected wallet EOA.
  const loadOnChainAgents = async () => {
    setAgentsLoading(true);
    try {
      const all: OnChainAgent[] = [];
      const queried = new Set<string>();

      const safeAddr = getSafeAddress();
      if (safeAddr) {
        queried.add(safeAddr.toLowerCase());
        const res = await fetch(`/api/delegations?operator=${safeAddr}`);
        const data = await res.json();
        if (data.agents) all.push(...data.agents);
      }

      // Also query with the connected wallet EOA (msg.sender for direct calls)
      if (walletAddress && !queried.has(walletAddress.toLowerCase())) {
        const res = await fetch(`/api/delegations?operator=${walletAddress}`);
        const data = await res.json();
        if (data.agents) all.push(...data.agents);
      }

      setOnChainAgents(all);
    } catch {
      // Silently fail
    } finally {
      setAgentsLoading(false);
    }
  };

  // Merge on-chain agents with local metadata
  const mergedAgents = useMemo(() => {
    return onChainAgents.map((agent) => {
      const local = storedAgents.find(
        (s) =>
          s.address.toLowerCase() === agent.agentEOA.toLowerCase() ||
          (s.safeAddress && s.safeAddress.toLowerCase() === agent.agentSafe.toLowerCase())
      );
      return { ...agent, local };
    });
  }, [onChainAgents, storedAgents]);

  // Local-only agents (not yet on-chain)
  const localOnlyAgents = useMemo(() => {
    return storedAgents.filter(
      (s) =>
        !onChainAgents.some(
          (a) =>
            a.agentEOA.toLowerCase() === s.address.toLowerCase() ||
            (s.safeAddress && a.agentSafe.toLowerCase() === s.safeAddress.toLowerCase())
        )
    );
  }, [onChainAgents, storedAgents]);

  // --- Link DID ---

  const parseDid = (did: string): string | null => {
    const match = did.match(/^did:nexoid:eth:(0x[a-fA-F0-9]{40})$/);
    return match ? match[1] : null;
  };

  const verifyDid = async () => {
    const address = parseDid(didInput);
    if (!address) {
      setDidError("Invalid DID format. Expected: did:nexoid:eth:0x...");
      setDidVerifyResult(null);
      return;
    }
    setDidVerifying(true);
    setDidError("");
    setDidVerifyResult(null);
    try {
      const registered = await publicClient.readContract({
        address: registryAddress, abi: IDENTITY_REGISTRY_ABI,
        functionName: "isRegistered", args: [address as Address],
      });
      if (!registered) {
        setDidError("This DID is not registered on the IdentityRegistry.");
        return;
      }
      const identity = await publicClient.readContract({
        address: registryAddress, abi: IDENTITY_REGISTRY_ABI,
        functionName: "getIdentity", args: [address as Address],
      }) as { entityType: number; status: number };

      setDidVerifyResult({
        valid: true,
        address,
        entityType: ENTITY_TYPES[identity.entityType] ?? "Unknown",
        status: ENTITY_STATUSES[identity.status] ?? "Unknown",
      });
    } catch (e) {
      setDidError(e instanceof Error ? e.message : "Failed to verify");
    } finally {
      setDidVerifying(false);
    }
  };

  const linkDid = () => {
    if (!didVerifyResult) return;
    addLinkedDid({
      did: didInput,
      address: didVerifyResult.address,
      entityType: didVerifyResult.entityType,
      linkedAt: Date.now(),
    });
    setLinkedDids(getLinkedDids());
    setDidInput("");
    setDidVerifyResult(null);
    setShowLinkDid(false);
    showSuccess("DID linked successfully.");
    loadIdentities();
  };

  const unlinkDid = (did: string) => {
    removeLinkedDid(did);
    setLinkedDids(getLinkedDids());
    loadIdentities();
  };

  // --- Agent Key Generation ---

  const generateMnemonic = async () => {
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
      showError(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setGenerating(false);
    }
  };

  const deriveAgentKey = async () => {
    if (!seedPhrase) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/wdk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "derive-agent", seedPhrase, index: parseInt(agentIndex) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDerivedAgent(data.agent);
      setAgentAddress(data.agent.address);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to derive");
    } finally {
      setGenerating(false);
    }
  };

  // --- Agent metadata ---

  const agentMetadataObj = useMemo(() => {
    const obj: Record<string, unknown> = {};
    if (agentLabel) obj.label = agentLabel;
    if (walletAddress) obj.operator = `did:nexoid:eth:${walletAddress.toLowerCase()}`;
    return obj;
  }, [agentLabel, walletAddress]);

  // --- Create Agent ---

  const handleCreateAgent = async () => {
    if (!walletClient || !walletAddress) return showError("Connect wallet first.");
    if (!agentAddress || !agentAddress.startsWith("0x") || agentAddress.length !== 42)
      return showError("Invalid agent address.");

    setTxPending(true);
    setCreationStep(0);
    setError(null);
    try {
      const agentAddr = agentAddress as Address;
      let finalSafeAddress = "";

      if (deployAgentSafe) {
        // Step 0: Deploy Agent Safe
        setCreationStep(0);
        const initializer = encodeFunctionData({
          abi: SAFE_ABI,
          functionName: "setup",
          args: [
            [walletAddress],
            1n,
            zeroAddress, "0x",
            SAFE_FALLBACK_HANDLER,
            zeroAddress, 0n, zeroAddress,
          ],
        });
        const saltNonce = BigInt(Date.now());
        const deployTx = await walletClient.writeContract({
          chain, account: walletAddress, gas: 1_000_000n,
          address: SAFE_PROXY_FACTORY,
          abi: SAFE_PROXY_FACTORY_ABI,
          functionName: "createProxyWithNonce",
          args: [SAFE_SINGLETON, initializer, saltNonce],
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash: deployTx });

        let newSafeAddr: Address | null = null;
        for (const log of receipt.logs) {
          try {
            const decoded = decodeEventLog({ abi: SAFE_PROXY_FACTORY_ABI, data: log.data, topics: log.topics });
            if (decoded.eventName === "ProxyCreation") {
              newSafeAddr = (decoded.args as { proxy: Address }).proxy;
              break;
            }
          } catch { /* not our event */ }
        }
        if (!newSafeAddr) throw new Error("Safe address not found in receipt");

        // Step 1: Enable AllowanceModule
        setCreationStep(1);
        const enableData = encodeFunctionData({ abi: SAFE_ABI, functionName: "enableModule", args: [ALLOWANCE_MODULE_ADDRESS] });
        const sig = buildPreApprovedSig(walletAddress);
        const enableTx = await walletClient.writeContract({
          chain, account: walletAddress, gas: 500_000n,
          address: newSafeAddr, abi: SAFE_ABI, functionName: "execTransaction",
          args: [newSafeAddr, 0n, enableData, 0, 0n, 0n, 0n, zeroAddress, zeroAddress, sig],
        });
        await publicClient.waitForTransactionReceipt({ hash: enableTx });

        finalSafeAddress = newSafeAddr;
        setAgentSafeAddress(newSafeAddr);
      }

      // Step 2: Register Agent Identity
      setCreationStep(2);
      const hasFields = Object.keys(agentMetadataObj).length > 0;
      const metadataHash = hasFields ? canonicalHash(agentMetadataObj) : ZERO_BYTES32 as `0x${string}`;

      const tx1 = await walletClient.writeContract({
        chain, account: walletAddress, gas: 500_000n,
        address: registryAddress, abi: IDENTITY_REGISTRY_ABI,
        functionName: "createAgentIdentity",
        args: [agentAddr, 1, metadataHash],
      });
      await publicClient.waitForTransactionReceipt({ hash: tx1 });

      if (nexoidModuleAddress) {
        // Step 3: Register on NexoidModule
        setCreationStep(3);
        const agentSafe = (finalSafeAddress || agentAddress) as Address;
        const tx2 = await walletClient.writeContract({
          chain, account: walletAddress, gas: 500_000n,
          address: nexoidModuleAddress, abi: NEXOID_MODULE_ABI,
          functionName: "registerAgentSafe",
          args: [agentSafe, agentAddr, ZERO_BYTES32, ZERO_BYTES32, 0n],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx2 });
      }

      // Step 4: Complete
      setCreationStep(4);

      addStoredAgent({
        address: agentAddress,
        safeAddress: finalSafeAddress || undefined,
        label: agentLabel || "Agent",
        mnemonic: seedPhrase || undefined,
        mnemonicIndex: seedPhrase ? parseInt(agentIndex) : undefined,
        createdAt: Date.now(),
      });
      setStoredAgents(getStoredAgents());
      setShowCreateAgent(false);
      loadOnChainAgents();

      showSuccess(`Agent created: ${agentAddress.slice(0, 10)}...${finalSafeAddress ? ` Safe: ${finalSafeAddress.slice(0, 10)}...` : ""}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showError(msg.slice(0, 300));
    } finally {
      setTxPending(false);
      setCreationStep(null);
    }
  };


  const statusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "active": return "var(--success)";
      case "suspended": return "var(--warning)";
      case "revoked": return "var(--danger)";
      default: return "var(--text-muted)";
    }
  };

  // --- Panel resolved agent ---
  const panelAgent = panelAgentSafe
    ? mergedAgents.find((a) => a.agentSafe === panelAgentSafe) ?? null
    : null;

  // --- HTML5 Drag handlers ---
  const onIdentityDragStart = (e: React.DragEvent, identity: IdentityInfo) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "identity");
    if (dragImageRef.current) {
      e.dataTransfer.setDragImage(dragImageRef.current, 28, 28);
    }
    setDragIdentity(identity);
    setIsDragging(true);
  };

  const onIdentityDragEnd = () => {
    setIsDragging(false);
    setHoverTarget(null);
    setDragIdentity(null);
  };

  const onAgentDragOver = (e: React.DragEvent, agentSafe: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setHoverTarget(agentSafe);
  };

  const onAgentDragLeave = () => {
    setHoverTarget(null);
  };

  const onAgentDrop = (e: React.DragEvent, agentSafe: string) => {
    e.preventDefault();
    setIsDragging(false);
    setHoverTarget(null);
    if (dragIdentity) {
      setPanelAgentSafe(agentSafe);
      setPanelIdentity(dragIdentity);
      setPanelMode("delegate");
      setDelegateSuccess("");
      setPanelOpen(true);
    }
    setDragIdentity(null);
  };

  // --- Panel handlers ---
  const openAgentDetails = (agentSafe: string) => {
    setPanelAgentSafe(agentSafe);
    setPanelMode("details");
    setDelegateSuccess("");
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setPanelAgentSafe(null);
    setPanelIdentity(null);
    setDelegateSuccess("");
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // --- Delegate identity to agent ---
  const handleDelegate = async () => {
    if (!walletClient || !walletAddress || !panelAgent || !panelIdentity || !nexoidModuleAddress) return;

    setDelegatePending(true);
    setDelegateSuccess("");
    setError(null);
    try {
      const credential = {
        identity: panelIdentity.did,
        identityType: panelIdentity.entityType,
        operator: `did:nexoid:eth:${walletAddress.toLowerCase()}`,
        delegatedAt: Math.floor(Date.now() / 1000),
      };
      const credentialHash = canonicalHash(credential as Record<string, unknown>);

      const tx = await walletClient.writeContract({
        chain,
        account: walletAddress,
        gas: 500_000n,
        address: nexoidModuleAddress,
        abi: NEXOID_MODULE_ABI,
        functionName: "updateAgentScope",
        args: [panelAgent.agentSafe as `0x${string}`, ZERO_BYTES32, credentialHash, 0n],
      });
      await publicClient.waitForTransactionReceipt({ hash: tx });

      setDelegateSuccess(`Identity delegated to agent ${panelAgent.agentSafe.slice(0, 10)}...`);
      loadOnChainAgents();
    } catch (e) {
      showError(e instanceof Error ? e.message.slice(0, 300) : "Delegation failed");
    } finally {
      setDelegatePending(false);
    }
  };

  return (
    <div>
      {error && <div className="error-msg">{error}</div>}
      {success && (
        <div style={{ background: "#22c55e22", border: "1px solid var(--success)", borderRadius: "var(--radius)", padding: "12px", color: "var(--success)", marginBottom: "16px" }}>
          {success}
        </div>
      )}

      {/* ===== MY IDENTITIES ===== */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>My Identities</h2>
          <button
            className="btn"
            onClick={() => setShowLinkDid(!showLinkDid)}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Link DID
          </button>
        </div>

        {/* Link DID expandable */}
        {showLinkDid && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>Link DID</h3>
              <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setShowLinkDid(false)}>Cancel</button>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "13px", marginBottom: "12px" }}>
              Link your registered DID to this wallet. The DID must already be registered on the IdentityRegistry.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <input
                type="text"
                placeholder="did:nexoid:eth:0x..."
                value={didInput}
                onChange={(e) => { setDidInput(e.target.value); setDidVerifyResult(null); setDidError(""); }}
                style={{ flex: 1 }}
                className="mono"
              />
              <button className="btn btn-primary" onClick={verifyDid} disabled={didVerifying || !didInput}>
                {didVerifying ? "Verifying..." : "Verify"}
              </button>
            </div>
            {didError && <div className="error-msg" style={{ marginTop: 8 }}>{didError}</div>}

            {didVerifyResult && (
              <div style={{ marginTop: 12, padding: 12, background: "var(--bg-input)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {didVerifyResult.entityType} — <span className={`badge badge-${didVerifyResult.status.toLowerCase()}`}>{didVerifyResult.status}</span>
                    </div>
                    <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                      {didVerifyResult.address}
                    </div>
                  </div>
                  <button className="btn btn-primary" onClick={linkDid}>Link to Wallet</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Identity cards */}
        {identitiesLoading ? (
          <div className="loading">Loading identities...</div>
        ) : identities.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
            {identities.map((id) => (
              <div
                key={id.did}
                className={`card ${mergedAgents.length > 0 ? "draggable-card" : ""}`}
                style={{ padding: 20 }}
                draggable={mergedAgents.length > 0}
                onDragStart={(e) => onIdentityDragStart(e, id)}
                onDragEnd={onIdentityDragEnd}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: "var(--radius-sm)",
                    background: id.entityType === "Human" ? "var(--accent-soft)" : id.entityType === "Organization" ? "var(--purple-soft)" : "var(--cyan-soft)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 18, color: id.entityType === "Human" ? "var(--accent)" : "var(--text-secondary)",
                  }}>
                    {id.entityType === "Human" ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    ) : id.entityType === "Organization" ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="3"/></svg>
                    )}
                  </div>
                  <span className={`badge badge-${id.status.toLowerCase()}`}>{id.status}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{id.entityType}</div>
                <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8, wordBreak: "break-all" }}>
                  {id.did}
                </div>
                {id.owner && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    Owner: <span className="mono">{id.owner.slice(0, 6)}...{id.owner.slice(-4)}</span>
                  </div>
                )}
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <button className="btn btn-danger" style={{ fontSize: 11, padding: "2px 8px" }} onClick={(e) => { e.stopPropagation(); unlinkDid(id.did); }}>
                    Unlink
                  </button>
                  {mergedAgents.length > 0 && (
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Drag to agent to delegate</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card" style={{ padding: 32, textAlign: "center" }}>
            <div style={{ color: "var(--text-muted)", marginBottom: 8 }}>No identities linked yet.</div>
            <button className="btn btn-primary" onClick={() => setShowLinkDid(true)}>Link your first DID</button>
          </div>
        )}
      </div>

      {/* ===== MY AGENTS ===== */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>My Agents ({mergedAgents.length + localOnlyAgents.length})</h2>
          <button
            className="btn"
            onClick={() => setShowCreateAgent(!showCreateAgent)}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Agent
          </button>
        </div>

        {/* Create Agent expandable */}
        {showCreateAgent && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>Create Agent</h3>
              <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setShowCreateAgent(false)}>Cancel</button>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "13px", marginBottom: "16px" }}>
              Create a new AI agent identity. You can use an existing EOA or generate a new key pair.
            </p>

            {/* Mode toggle */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button className={`btn ${agentMode === "generate" ? "btn-primary" : ""}`} onClick={() => setAgentMode("generate")}>
                Generate New Key
              </button>
              <button className={`btn ${agentMode === "existing" ? "btn-primary" : ""}`} onClick={() => setAgentMode("existing")}>
                Use Existing EOA
              </button>
            </div>

            {/* Generate Key */}
            {agentMode === "generate" && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                  <button className="btn btn-primary" onClick={generateMnemonic} disabled={generating}>
                    {generating ? "Generating..." : seedPhrase ? "Regenerate Mnemonic" : "Generate Mnemonic"}
                  </button>
                </div>

                {seedPhrase && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ background: "var(--bg-input)", border: "1px solid var(--warning)", borderRadius: "var(--radius-sm)", padding: 16, marginBottom: 12 }}>
                      <div style={{ fontSize: 12, color: "var(--warning)", fontWeight: 600, marginBottom: 8, textTransform: "uppercase" }}>
                        Save this seed phrase securely — it cannot be recovered
                      </div>
                      <div className="mono" style={{ fontSize: 13, lineHeight: 1.8, wordBreak: "break-word" }}>
                        {seedPhrase}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
                      <div>
                        <label style={fieldLabel}>Agent Index (1+)</label>
                        <input type="number" value={agentIndex} onChange={(e) => setAgentIndex(e.target.value)} min="1" style={{ width: 100 }} />
                      </div>
                      <button className="btn btn-primary" onClick={deriveAgentKey} disabled={generating}>
                        {generating ? "Deriving..." : "Derive Agent Key"}
                      </button>
                    </div>

                    {derivedAgent && (
                      <div style={{ marginTop: 12, background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: 16 }}>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Derived Address:</div>
                        <div className="mono" style={{ fontSize: 13, marginBottom: 8 }}>{derivedAgent.address}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Private Key:</div>
                        <div className="mono" style={{ fontSize: 13, wordBreak: "break-all" }}>{derivedAgent.privateKey}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Existing EOA */}
            {agentMode === "existing" && (
              <div style={{ marginBottom: 16 }}>
                <label style={fieldLabel}>Agent EOA Address *</label>
                <input type="text" placeholder="0x..." value={agentAddress} onChange={(e) => setAgentAddress(e.target.value)} style={{ width: "100%" }} className="mono" />
              </div>
            )}

            {/* Agent Label */}
            <div style={{ marginBottom: 16 }}>
              <label style={fieldLabel}>Label</label>
              <input type="text" placeholder="e.g. trading-bot-1" value={agentLabel} onChange={(e) => setAgentLabel(e.target.value)} style={{ width: "100%" }} />
            </div>

            {/* Deploy Safe toggle */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={deployAgentSafe} onChange={(e) => setDeployAgentSafe(e.target.checked)} />
                <span style={{ fontSize: 13 }}>Deploy Agent Safe (1-of-1 with AllowanceModule)</span>
              </label>
            </div>

            <button
              className="btn btn-primary"
              onClick={handleCreateAgent}
              disabled={txPending || !walletAddress || !agentAddress}
              style={{ width: "100%", marginTop: 16 }}
            >
              {txPending ? "Creating Agent..." : `Create Agent${deployAgentSafe ? " + Deploy Safe" : ""}`}
            </button>

            {/* Step-by-step progress indicator */}
            {txPending && creationStep !== null && (() => {
              const steps: { label: string; description: string; show: boolean }[] = [
                { label: "Deploy Agent Safe", description: "createProxyWithNonce", show: deployAgentSafe },
                { label: "Enable AllowanceModule", description: "execTransaction on Safe", show: deployAgentSafe },
                { label: "Register Agent Identity", description: "createAgentIdentity on IdentityRegistry", show: true },
                { label: "Register on NexoidModule", description: "registerAgentSafe", show: !!nexoidModuleAddress },
                { label: "Complete", description: "Saved to localStorage", show: true },
              ];
              const visibleSteps = steps.filter((s) => s.show);
              // Map creationStep (0-4 absolute) to visible index
              const visibleIndex = steps.slice(0, creationStep + 1).filter((s) => s.show).length - 1;

              return (
                <div style={{
                  marginTop: 16,
                  padding: 16,
                  background: "var(--bg-input)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "var(--text-secondary)" }}>
                    Progress
                  </div>
                  {visibleSteps.map((step, i) => {
                    const isCompleted = i < visibleIndex || (i === visibleIndex && creationStep === 4);
                    const isCurrent = i === visibleIndex && creationStep !== 4;

                    return (
                      <div key={i} style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        marginBottom: i < visibleSteps.length - 1 ? 8 : 0,
                        padding: "6px 0",
                      }}>
                        {/* Status icon */}
                        <div style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          fontSize: 12,
                          fontWeight: 700,
                          ...(isCompleted
                            ? { background: "var(--success)", color: "#fff" }
                            : isCurrent
                              ? { background: "transparent", border: "2px solid var(--accent)", color: "var(--accent)" }
                              : { background: "transparent", border: "2px solid var(--border)", color: "var(--text-muted)" }
                          ),
                        }}>
                          {isCompleted ? "\u2713" : isCurrent ? (
                            <span style={{
                              display: "inline-block",
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: "var(--accent)",
                              animation: "pulse 1.5s ease-in-out infinite",
                            }} />
                          ) : (
                            <span style={{ fontSize: 11 }}>{i + 1}</span>
                          )}
                        </div>
                        {/* Step text */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 13,
                            fontWeight: isCurrent ? 600 : 400,
                            color: isCompleted
                              ? "var(--success)"
                              : isCurrent
                                ? "var(--text-primary)"
                                : "var(--text-muted)",
                          }}>
                            {step.label}
                            {isCurrent && (
                              <span style={{ fontWeight: 400, fontSize: 12, marginLeft: 6, color: "var(--text-muted)" }}>
                                — waiting for signature...
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                            {step.description}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
                </div>
              );
            })()}
          </div>
        )}

        {/* Agent cards */}
        {agentsLoading ? (
          <div className="loading">Loading agents from NexoidModule...</div>
        ) : mergedAgents.length > 0 || localOnlyAgents.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
            {/* On-chain agents */}
            {mergedAgents.map((agent) => {
              const isExpired = agent.validUntil > 0 && agent.validUntil < Date.now() / 1000;
              const isValid = agent.status === 0 && !isExpired;
              return (
                <div
                  key={agent.agentSafe}
                  className={`card drop-target ${isDragging ? (hoverTarget === agent.agentSafe ? "drop-target-hover" : "drop-target-active") : ""}`}
                  style={{ padding: 20, cursor: "pointer" }}
                  onClick={() => openAgentDetails(agent.agentSafe)}
                  onDragOver={(e) => onAgentDragOver(e, agent.agentSafe)}
                  onDragLeave={onAgentDragLeave}
                  onDrop={(e) => onAgentDrop(e, agent.agentSafe)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: "var(--radius-sm)",
                      background: isValid ? "var(--success-soft)" : "var(--danger-soft)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isValid ? "var(--success)" : "var(--danger)"} strokeWidth="2">
                        <rect x="3" y="11" width="18" height="10" rx="2" />
                        <circle cx="12" cy="5" r="3" />
                      </svg>
                    </div>
                    <span className={`badge badge-${agent.statusName.toLowerCase()}`}>{agent.statusName}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                    {agent.local?.label || `did:nexoid:eth:${agent.agentEOA.slice(0, 8)}...`}
                  </div>
                  <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
                    Safe: {agent.agentSafe.slice(0, 10)}...{agent.agentSafe.slice(-4)}
                  </div>
                  <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
                    EOA: {agent.agentEOA.slice(0, 10)}...{agent.agentEOA.slice(-4)}
                  </div>
                  {agent.validUntil > 0 && (
                    <div style={{ fontSize: 12, color: isExpired ? "var(--danger)" : "var(--text-muted)", marginBottom: 4 }}>
                      {isExpired ? "Expired" : `Valid until ${new Date(agent.validUntil * 1000).toLocaleDateString()}`}
                    </div>
                  )}
                  <div style={{ paddingTop: 12, marginTop: 8, borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
                    <button
                      className="btn"
                      style={{ fontSize: 11, padding: "4px 10px" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const config = [
                          `AGENT_ADDRESS=${agent.agentEOA}`,
                          `AGENT_SAFE_ADDRESS=${agent.agentSafe}`,
                          agent.local?.mnemonic ? `AGENT_MNEMONIC="${agent.local.mnemonic}"` : "",
                          agent.local?.mnemonicIndex !== undefined ? `AGENT_MNEMONIC_INDEX=${agent.local.mnemonicIndex}` : "",
                        ].filter(Boolean).join("\n");
                        navigator.clipboard.writeText(config);
                        showSuccess("Agent config copied to clipboard.");
                      }}
                    >
                      Copy nxcli Config
                    </button>
                  </div>
                  {isDragging && hoverTarget === agent.agentSafe && (
                    <div style={{
                      position: "absolute", inset: 0, borderRadius: "inherit",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: "rgba(255,255,255,0.06)",
                      pointerEvents: "none", transition: "background 0.2s",
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>Drop to delegate</span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Local-only agents (not yet on-chain) */}
            {localOnlyAgents.map((agent) => (
              <div key={agent.address} className="card" style={{ padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: "var(--radius-sm)",
                    background: "var(--cyan-soft)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="10" rx="2" />
                      <circle cx="12" cy="5" r="3" />
                    </svg>
                  </div>
                  <span className="badge" style={{ background: "var(--accent-soft)", color: "var(--text-muted)" }}>Local Only</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{agent.label}</div>
                <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
                  EOA: {agent.address.slice(0, 10)}...{agent.address.slice(-4)}
                </div>
                {agent.safeAddress && (
                  <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
                    Safe: {agent.safeAddress.slice(0, 10)}...{agent.safeAddress.slice(-4)}
                  </div>
                )}
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                  Created: {new Date(agent.createdAt).toLocaleDateString()}
                </div>
                <div style={{ paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
                  <button
                    className="btn"
                    style={{ fontSize: 11, padding: "4px 10px" }}
                    onClick={() => {
                      const config = [
                        `AGENT_ADDRESS=${agent.address}`,
                        agent.safeAddress ? `AGENT_SAFE_ADDRESS=${agent.safeAddress}` : "",
                        agent.mnemonic ? `AGENT_MNEMONIC="${agent.mnemonic}"` : "",
                        agent.mnemonicIndex !== undefined ? `AGENT_MNEMONIC_INDEX=${agent.mnemonicIndex}` : "",
                      ].filter(Boolean).join("\n");
                      navigator.clipboard.writeText(config);
                      showSuccess("Agent config copied to clipboard.");
                    }}
                  >
                    Copy nxcli Config
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : !showCreateAgent ? (
          <div className="card" style={{ padding: 32, textAlign: "center" }}>
            <div style={{ color: "var(--text-muted)", marginBottom: 8 }}>
              {getSafeAddress() ? "No agents registered on-chain for this Safe." : "Configure your Safe address in Settings to load agents."}
            </div>
            <button className="btn btn-primary" onClick={() => setShowCreateAgent(true)}>Create your first agent</button>
          </div>
        ) : null}
      </div>

      {/* Hidden drag image for custom cursor */}
      <div
        ref={dragImageRef}
        style={{
          position: "fixed", top: -200, left: -200,
          width: 56, height: 56, borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(139, 92, 246, 0.3)", border: "2px solid #8b5cf6",
          color: "#8b5cf6", fontSize: 10, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.06em",
        }}
      >
        ID
      </div>

      {/* Agent details / delegation panel */}
      <SlidePanel
        isOpen={panelOpen}
        onClose={closePanel}
        title={panelMode === "delegate" ? "Delegate Identity" : "Agent Details"}
      >
        {panelAgent && panelMode === "details" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Agent DID</div>
              <div className="mono" style={{ fontSize: 13, wordBreak: "break-all", marginBottom: 8 }}>
                did:nexoid:eth:{panelAgent.agentEOA.toLowerCase()}
              </div>
              <button className="btn btn-sm" onClick={() => copyText(`did:nexoid:eth:${panelAgent.agentEOA.toLowerCase()}`)} style={{ fontSize: 11 }}>Copy DID</button>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Agent Safe</div>
              <div className="mono" style={{ fontSize: 13, wordBreak: "break-all", marginBottom: 8 }}>{panelAgent.agentSafe}</div>
              <button className="btn btn-sm" onClick={() => copyText(panelAgent.agentSafe)} style={{ fontSize: 11 }}>Copy</button>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Agent EOA</div>
              <div className="mono" style={{ fontSize: 13, wordBreak: "break-all", marginBottom: 8 }}>{panelAgent.agentEOA}</div>
              <button className="btn btn-sm" onClick={() => copyText(panelAgent.agentEOA)} style={{ fontSize: 11 }}>Copy</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Status</div>
                <span className={`badge badge-${panelAgent.statusName.toLowerCase()}`}>{panelAgent.statusName}</span>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Valid Until</div>
                <div style={{ fontSize: 13 }}>
                  {panelAgent.validUntil > 0 ? new Date(panelAgent.validUntil * 1000).toLocaleDateString() : "No expiry"}
                </div>
              </div>
            </div>

            {panelAgent.scopeHash && panelAgent.scopeHash !== ZERO_BYTES32 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Scope Hash</div>
                <div className="mono" style={{ fontSize: 11, wordBreak: "break-all", color: "var(--text-secondary)" }}>{panelAgent.scopeHash}</div>
              </div>
            )}

            {panelAgent.credentialHash && panelAgent.credentialHash !== ZERO_BYTES32 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Credential Hash</div>
                <div className="mono" style={{ fontSize: 11, wordBreak: "break-all", color: "var(--text-secondary)" }}>{panelAgent.credentialHash}</div>
              </div>
            )}

            {panelAgent.local && (
              <div style={{ marginBottom: 20, padding: 12, background: "var(--bg-input)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" }}>Local Metadata</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
                  Label: <span style={{ color: "var(--text)" }}>{panelAgent.local.label}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Created: {new Date(panelAgent.local.createdAt).toLocaleString()}
                </div>
              </div>
            )}

            <button
              className="btn"
              style={{ width: "100%", marginBottom: 8 }}
              onClick={() => {
                const config = [
                  `AGENT_ADDRESS=${panelAgent.agentEOA}`,
                  `AGENT_SAFE_ADDRESS=${panelAgent.agentSafe}`,
                  panelAgent.local?.mnemonic ? `AGENT_MNEMONIC="${panelAgent.local.mnemonic}"` : "",
                  panelAgent.local?.mnemonicIndex !== undefined ? `AGENT_MNEMONIC_INDEX=${panelAgent.local.mnemonicIndex}` : "",
                ].filter(Boolean).join("\n");
                navigator.clipboard.writeText(config);
                showSuccess("Agent config copied to clipboard.");
              }}
            >
              Copy nxcli Config
            </button>

            {identities.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Delegate Identity</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                  Drag an identity card onto this agent, or select below:
                </div>
                {identities.map((id) => (
                  <button
                    key={id.did}
                    className="btn"
                    style={{ width: "100%", marginBottom: 4, justifyContent: "flex-start", textAlign: "left" }}
                    onClick={() => {
                      setPanelIdentity(id);
                      setPanelMode("delegate");
                      setDelegateSuccess("");
                    }}
                  >
                    <span style={{ fontSize: 12 }}>{id.entityType} — {id.did.slice(0, 24)}...{id.did.slice(-4)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {panelAgent && panelMode === "delegate" && panelIdentity && (
          <div>
            {/* Identity being delegated */}
            <div style={{ marginBottom: 16, padding: 16, background: "var(--bg-input)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Identity</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{panelIdentity.entityType}</div>
              <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)", wordBreak: "break-all" }}>{panelIdentity.did}</div>
              <div style={{ marginTop: 4 }}>
                <span className={`badge badge-${panelIdentity.status.toLowerCase()}`}>{panelIdentity.status}</span>
              </div>
            </div>

            {/* Arrow */}
            <div style={{ textAlign: "center", padding: "4px 0", color: "var(--text-muted)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <polyline points="19 12 12 19 5 12" />
              </svg>
            </div>

            {/* Target agent */}
            <div style={{ marginBottom: 20, padding: 16, background: "var(--bg-input)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Agent</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                {panelAgent.local?.label || `Agent ${panelAgent.agentEOA.slice(0, 8)}...`}
              </div>
              <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Safe: {panelAgent.agentSafe}
              </div>
            </div>

            <div style={{ marginBottom: 16, padding: 12, background: "var(--accent-soft)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              This will update the agent&apos;s credential hash on the NexoidModule, binding this identity to the agent on-chain.
            </div>

            {delegateSuccess && (
              <div style={{ marginBottom: 16, padding: 12, background: "var(--success-soft)", border: "1px solid rgba(52, 211, 153, 0.2)", borderRadius: "var(--radius-sm)", color: "var(--success)", fontSize: 13 }}>
                {delegateSuccess}
              </div>
            )}

            <button
              className="btn btn-primary"
              style={{ width: "100%" }}
              onClick={handleDelegate}
              disabled={delegatePending || !nexoidModuleAddress}
            >
              {delegatePending ? "Delegating..." : "Delegate Identity to Agent"}
            </button>

            <button
              className="btn"
              style={{ width: "100%", marginTop: 8 }}
              onClick={() => setPanelMode("details")}
            >
              Back to Details
            </button>
          </div>
        )}
      </SlidePanel>
    </div>
  );
}
