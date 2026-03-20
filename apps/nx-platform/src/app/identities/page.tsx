"use client";

import { useEffect, useState, useMemo } from "react";
import { useWallet } from "@/lib/wallet";
import {
  getRegistryAddress,
  IDENTITY_REGISTRY_ABI,
  ENTITY_TYPES,
  ENTITY_STATUSES,
} from "@/lib/contracts";
import { keccak256, stringToHex } from "viem";

interface Identity {
  address: string;
  entityType: string;
  entityTypeId: number;
  status: string;
  statusId: number;
  createdAt: number;
  metadataHash: string;
  owner: string;
  did: string;
  blockNumber?: number;
}

type ModalType =
  | "register"
  | "createAgent"
  | "updateStatus"
  | "updateMetadata"
  | null;

// --- Canonical hash matching core-client/identity.ts ---
function canonicalHash(obj: Record<string, unknown>): `0x${string}` {
  const sorted = Object.keys(obj).sort();
  const canonical = JSON.stringify(obj, sorted);
  return keccak256(stringToHex(canonical));
}

// --- Label style helper ---
const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: "13px",
  color: "var(--text-muted)",
  marginBottom: "4px",
};

export default function IdentitiesPage() {
  const { address: walletAddress, walletClient, publicClient, chain } = useWallet();
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selected, setSelected] = useState<Identity | null>(null);
  const [modal, setModal] = useState<ModalType>(null);
  const [txPending, setTxPending] = useState(false);
  const [showJson, setShowJson] = useState(false);

  // --- Register Identity form ---
  const [regEntityType, setRegEntityType] = useState(0); // Human=0, Organization=3
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regRole, setRegRole] = useState("");
  const [regDescription, setRegDescription] = useState("");
  // Org-specific
  const [regWebsite, setRegWebsite] = useState("");
  const [regIndustry, setRegIndustry] = useState("");
  // Custom fields
  const [regCustomKey, setRegCustomKey] = useState("");
  const [regCustomValue, setRegCustomValue] = useState("");
  const [regCustomFields, setRegCustomFields] = useState<Record<string, string>>({});

  // --- Create Agent form ---
  const [agentAddress, setAgentAddress] = useState("");
  const [agentType, setAgentType] = useState(1); // VirtualAgent=1, PhysicalAgent=2
  const [agentLabel, setAgentLabel] = useState("");
  const [agentModel, setAgentModel] = useState("");
  const [agentDescription, setAgentDescription] = useState("");
  const [agentCapabilities, setAgentCapabilities] = useState("");
  const [agentEnvironment, setAgentEnvironment] = useState("");
  const [agentCustomKey, setAgentCustomKey] = useState("");
  const [agentCustomValue, setAgentCustomValue] = useState("");
  const [agentCustomFields, setAgentCustomFields] = useState<Record<string, string>>({});

  // --- Update Status form ---
  const [statusTarget, setStatusTarget] = useState("");
  const [statusValue, setStatusValue] = useState(1);

  // --- Update Metadata form ---
  const [metaTarget, setMetaTarget] = useState("");
  const [metaName, setMetaName] = useState("");
  const [metaEmail, setMetaEmail] = useState("");
  const [metaRole, setMetaRole] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [metaWebsite, setMetaWebsite] = useState("");
  const [metaCustomKey, setMetaCustomKey] = useState("");
  const [metaCustomValue, setMetaCustomValue] = useState("");
  const [metaCustomFields, setMetaCustomFields] = useState<Record<string, string>>({});

  const registryAddress = getRegistryAddress();

  const loadIdentities = () => {
    setLoading(true);
    fetch("/api/identities")
      .then((r) => r.json())
      .then((data) => setIdentities(data.identities ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadIdentities();
  }, []);

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 5000);
  };
  const showError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 8000);
  };

  const lookupAddress = async () => {
    if (!search.startsWith("0x") || search.length !== 42) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/identities?address=${search}`);
      const data = await res.json();
      if (data.registered) setSelected(data.identity);
      else showError(`Address ${search} is not registered.`);
    } catch (e) {
      showError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // --- Build metadata objects ---

  const regMetadataObj = useMemo(() => {
    const obj: Record<string, unknown> = {};
    if (regName) obj.name = regName;
    if (regEmail) obj.email = regEmail;
    if (regEntityType === 0 && regRole) obj.role = regRole;
    if (regEntityType === 3 && regWebsite) obj.website = regWebsite;
    if (regEntityType === 3 && regIndustry) obj.industry = regIndustry;
    if (regDescription) obj.description = regDescription;
    for (const [k, v] of Object.entries(regCustomFields)) {
      obj[k] = v;
    }
    return obj;
  }, [regName, regEmail, regRole, regDescription, regWebsite, regIndustry, regEntityType, regCustomFields]);

  const agentMetadataObj = useMemo(() => {
    const obj: Record<string, unknown> = {};
    if (agentLabel) obj.label = agentLabel;
    if (agentModel) obj.model = agentModel;
    if (agentDescription) obj.description = agentDescription;
    if (agentCapabilities) obj.capabilities = agentCapabilities.split(",").map((s) => s.trim()).filter(Boolean);
    if (agentEnvironment) obj.environment = agentEnvironment;
    if (walletAddress) obj.operator = `did:nexoid:eth:${walletAddress.toLowerCase()}`;
    if (agentType === 2) obj.agentType = "physical";
    for (const [k, v] of Object.entries(agentCustomFields)) {
      obj[k] = v;
    }
    return obj;
  }, [agentLabel, agentModel, agentDescription, agentCapabilities, agentEnvironment, agentCustomFields, walletAddress, agentType]);

  const metaObj = useMemo(() => {
    const obj: Record<string, unknown> = {};
    if (metaName) obj.name = metaName;
    if (metaEmail) obj.email = metaEmail;
    if (metaRole) obj.role = metaRole;
    if (metaDescription) obj.description = metaDescription;
    if (metaWebsite) obj.website = metaWebsite;
    for (const [k, v] of Object.entries(metaCustomFields)) {
      obj[k] = v;
    }
    return obj;
  }, [metaName, metaEmail, metaRole, metaDescription, metaWebsite, metaCustomFields]);

  // --- Write operations ---

  const registerIdentity = async () => {
    if (!walletClient) return showError("Connect wallet first.");
    setTxPending(true);
    try {
      const hasFields = Object.keys(regMetadataObj).length > 0;
      const metadataHash = hasFields
        ? canonicalHash(regMetadataObj)
        : ("0x" + "0".repeat(64)) as `0x${string}`;
      const hash = await walletClient.writeContract({
        address: registryAddress,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "registerIdentity",
        args: [regEntityType, metadataHash],
        chain,
        account: walletAddress!,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      showSuccess(`Identity registered. Tx: ${hash.slice(0, 10)}...`);
      setModal(null);
      resetRegForm();
      loadIdentities();
    } catch (e: any) {
      showError(e.shortMessage ?? e.message);
    } finally {
      setTxPending(false);
    }
  };

  const createAgent = async () => {
    if (!walletClient) return showError("Connect wallet first.");
    if (!agentAddress.startsWith("0x") || agentAddress.length !== 42)
      return showError("Invalid agent address.");
    setTxPending(true);
    try {
      const hasFields = Object.keys(agentMetadataObj).length > 0;
      const metadataHash = hasFields
        ? canonicalHash(agentMetadataObj)
        : ("0x" + "0".repeat(64)) as `0x${string}`;
      const hash = await walletClient.writeContract({
        address: registryAddress,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "createAgentIdentity",
        args: [agentAddress as `0x${string}`, agentType, metadataHash],
        chain,
        account: walletAddress!,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      showSuccess(`Agent created at ${agentAddress.slice(0, 10)}... Tx: ${hash.slice(0, 10)}...`);
      setModal(null);
      resetAgentForm();
      loadIdentities();
    } catch (e: any) {
      showError(e.shortMessage ?? e.message);
    } finally {
      setTxPending(false);
    }
  };

  const updateStatus = async () => {
    if (!walletClient) return showError("Connect wallet first.");
    if (!statusTarget.startsWith("0x") || statusTarget.length !== 42)
      return showError("Invalid target address.");
    setTxPending(true);
    try {
      const hash = await walletClient.writeContract({
        address: registryAddress,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "updateStatus",
        args: [statusTarget as `0x${string}`, statusValue],
        chain,
        account: walletAddress!,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      showSuccess(`Status updated to ${ENTITY_STATUSES[statusValue]}. Tx: ${hash.slice(0, 10)}...`);
      setModal(null);
      setStatusTarget("");
      loadIdentities();
    } catch (e: any) {
      showError(e.shortMessage ?? e.message);
    } finally {
      setTxPending(false);
    }
  };

  const updateMetadata = async () => {
    if (!walletClient) return showError("Connect wallet first.");
    if (!metaTarget.startsWith("0x") || metaTarget.length !== 42)
      return showError("Invalid target address.");
    setTxPending(true);
    try {
      const hasFields = Object.keys(metaObj).length > 0;
      const newHash = hasFields
        ? canonicalHash(metaObj)
        : ("0x" + "0".repeat(64)) as `0x${string}`;
      const hash = await walletClient.writeContract({
        address: registryAddress,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "updateMetadata",
        args: [metaTarget as `0x${string}`, newHash],
        chain,
        account: walletAddress!,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      showSuccess(`Metadata updated. Tx: ${hash.slice(0, 10)}...`);
      setModal(null);
      resetMetaForm();
      loadIdentities();
    } catch (e: any) {
      showError(e.shortMessage ?? e.message);
    } finally {
      setTxPending(false);
    }
  };

  // --- Reset helpers ---
  const resetRegForm = () => {
    setRegName(""); setRegEmail(""); setRegRole("");
    setRegDescription(""); setRegWebsite(""); setRegIndustry("");
    setRegCustomFields({}); setRegCustomKey(""); setRegCustomValue("");
  };
  const resetAgentForm = () => {
    setAgentAddress(""); setAgentLabel(""); setAgentModel("");
    setAgentDescription(""); setAgentCapabilities(""); setAgentEnvironment("");
    setAgentCustomFields({}); setAgentCustomKey(""); setAgentCustomValue("");
  };
  const resetMetaForm = () => {
    setMetaTarget(""); setMetaName(""); setMetaEmail("");
    setMetaRole(""); setMetaDescription(""); setMetaWebsite("");
    setMetaCustomFields({}); setMetaCustomKey(""); setMetaCustomValue("");
  };

  // --- Prefill helpers ---
  const openStatusModal = (id: Identity) => {
    setStatusTarget(id.address);
    setStatusValue(id.statusId === 0 ? 1 : id.statusId === 1 ? 0 : 1);
    setModal("updateStatus");
  };
  const openMetaModal = (id: Identity) => {
    setMetaTarget(id.address);
    resetMetaForm();
    setMetaTarget(id.address);
    setModal("updateMetadata");
  };

  const filtered = identities.filter((id) => {
    if (filterType !== "all" && id.entityType !== filterType) return false;
    if (filterStatus !== "all" && id.status !== filterStatus) return false;
    if (search && !id.address.toLowerCase().includes(search.toLowerCase()) && !id.did.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // --- JSON preview component ---
  const JsonPreview = ({ obj, label }: { obj: Record<string, unknown>; label: string }) => {
    const keys = Object.keys(obj);
    if (keys.length === 0) return null;
    const hash = canonicalHash(obj);
    return (
      <div style={{ marginTop: "12px", borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            {label}
          </span>
          <button
            className="btn"
            style={{ padding: "2px 8px", fontSize: "11px" }}
            onClick={() => setShowJson(!showJson)}
          >
            {showJson ? "Hide JSON" : "Show JSON"}
          </button>
        </div>
        {showJson && (
          <pre style={{
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "12px",
            fontSize: "12px",
            fontFamily: "'SF Mono', 'Fira Code', monospace",
            overflowX: "auto",
            marginBottom: "8px",
          }}>
            {JSON.stringify(obj, Object.keys(obj).sort(), 2)}
          </pre>
        )}
        <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
          <span style={{ fontWeight: 600 }}>Hash:</span>{" "}
          <span className="mono" style={{ wordBreak: "break-all" }}>{hash}</span>
        </div>
      </div>
    );
  };

  // --- Custom field adder component ---
  const CustomFieldAdder = ({
    customKey, setCustomKey, customValue, setCustomValue, customFields, setCustomFields,
  }: {
    customKey: string; setCustomKey: (v: string) => void;
    customValue: string; setCustomValue: (v: string) => void;
    customFields: Record<string, string>; setCustomFields: (v: Record<string, string>) => void;
  }) => (
    <div>
      <label style={fieldLabel}>Custom Fields</label>
      {Object.entries(customFields).length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
          {Object.entries(customFields).map(([k, v]) => (
            <span
              key={k}
              style={{
                display: "inline-flex", alignItems: "center", gap: "4px",
                background: "var(--bg)", border: "1px solid var(--border)",
                borderRadius: "4px", padding: "2px 8px", fontSize: "12px",
              }}
            >
              <span className="mono">{k}:</span> {v}
              <button
                style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", padding: "0 2px", fontSize: "14px" }}
                onClick={() => {
                  const next = { ...customFields };
                  delete next[k];
                  setCustomFields(next);
                }}
              >
                x
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: "8px" }}>
        <input
          type="text"
          placeholder="key"
          value={customKey}
          onChange={(e) => setCustomKey(e.target.value)}
          style={{ width: "120px" }}
        />
        <input
          type="text"
          placeholder="value"
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          style={{ flex: 1 }}
        />
        <button
          className="btn"
          style={{ padding: "4px 10px", fontSize: "12px" }}
          onClick={() => {
            if (customKey.trim()) {
              setCustomFields({ ...customFields, [customKey.trim()]: customValue });
              setCustomKey("");
              setCustomValue("");
            }
          }}
        >
          Add
        </button>
      </div>
    </div>
  );

  if (loading && identities.length === 0)
    return <div className="loading">Loading identities...</div>;

  return (
    <div>
      {error && <div className="error-msg">{error}</div>}
      {success && (
        <div style={{ background: "#22c55e22", border: "1px solid var(--success)", borderRadius: "var(--radius)", padding: "12px", color: "var(--success)", marginBottom: "16px" }}>
          {success}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        <button className="btn btn-primary" onClick={() => { resetRegForm(); setModal("register"); }}>
          Register Identity
        </button>
        <button className="btn btn-primary" onClick={() => { resetAgentForm(); setModal("createAgent"); }}>
          Create Agent
        </button>
        <button className="btn" onClick={() => setModal("updateStatus")}>
          Update Status
        </button>
        <button className="btn" onClick={() => { resetMetaForm(); setModal("updateMetadata"); }}>
          Update Metadata
        </button>
      </div>

      {/* ===== REGISTER IDENTITY MODAL ===== */}
      {modal === "register" && (
        <div className="card" style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
            <h3>Register Your Identity</h3>
            <button className="btn" onClick={() => setModal(null)}>Cancel</button>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "13px", marginBottom: "16px" }}>
            Self-registration for your connected wallet ({walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4) ?? "not connected"}).
            Only the hash of your metadata is stored on-chain.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={fieldLabel}>Entity Type *</label>
              <select value={regEntityType} onChange={(e) => setRegEntityType(Number(e.target.value))} style={{ width: "100%" }}>
                <option value={0}>Human</option>
                <option value={3}>Organization</option>
              </select>
            </div>
            <div>
              <label style={fieldLabel}>Name</label>
              <input type="text" placeholder={regEntityType === 0 ? "Alice Johnson" : "Nexoid Inc."} value={regName} onChange={(e) => setRegName(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div>
              <label style={fieldLabel}>Email</label>
              <input type="email" placeholder="alice@example.com" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} style={{ width: "100%" }} />
            </div>
            {regEntityType === 0 ? (
              <div>
                <label style={fieldLabel}>Role</label>
                <input type="text" placeholder="operator, admin, developer..." value={regRole} onChange={(e) => setRegRole(e.target.value)} style={{ width: "100%" }} />
              </div>
            ) : (
              <>
                <div>
                  <label style={fieldLabel}>Website</label>
                  <input type="url" placeholder="https://nexoid.io" value={regWebsite} onChange={(e) => setRegWebsite(e.target.value)} style={{ width: "100%" }} />
                </div>
                <div>
                  <label style={fieldLabel}>Industry</label>
                  <input type="text" placeholder="AI Infrastructure, DeFi..." value={regIndustry} onChange={(e) => setRegIndustry(e.target.value)} style={{ width: "100%" }} />
                </div>
              </>
            )}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={fieldLabel}>Description</label>
              <input type="text" placeholder="Short description..." value={regDescription} onChange={(e) => setRegDescription(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <CustomFieldAdder
                customKey={regCustomKey} setCustomKey={setRegCustomKey}
                customValue={regCustomValue} setCustomValue={setRegCustomValue}
                customFields={regCustomFields} setCustomFields={setRegCustomFields}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <JsonPreview obj={regMetadataObj} label="Metadata Preview (canonical JSON)" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <button className="btn btn-primary" onClick={registerIdentity} disabled={txPending || !walletAddress} style={{ width: "100%" }}>
                {txPending ? "Sending Transaction..." : "Register Identity"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== CREATE AGENT MODAL ===== */}
      {modal === "createAgent" && (
        <div className="card" style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
            <h3>Create Agent Identity</h3>
            <button className="btn" onClick={() => setModal(null)}>Cancel</button>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "13px", marginBottom: "16px" }}>
            You must be a registered Human or Organization. Your wallet becomes the agent&apos;s owner (operator).
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={fieldLabel}>Agent Address *</label>
              <input type="text" placeholder="0x... (the address that will represent this agent)" value={agentAddress} onChange={(e) => setAgentAddress(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div>
              <label style={fieldLabel}>Agent Type *</label>
              <select value={agentType} onChange={(e) => setAgentType(Number(e.target.value))} style={{ width: "100%" }}>
                <option value={1}>Virtual Agent (software)</option>
                <option value={2}>Physical Agent (robot/device)</option>
              </select>
            </div>
            <div>
              <label style={fieldLabel}>Label</label>
              <input type="text" placeholder="trading-bot-1, data-crawler..." value={agentLabel} onChange={(e) => setAgentLabel(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div>
              <label style={fieldLabel}>Model</label>
              <input type="text" placeholder="claude-opus-4-6, gpt-4o, custom..." value={agentModel} onChange={(e) => setAgentModel(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div>
              <label style={fieldLabel}>Environment</label>
              <input type="text" placeholder="production, staging, dev..." value={agentEnvironment} onChange={(e) => setAgentEnvironment(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={fieldLabel}>Description</label>
              <input type="text" placeholder="What does this agent do?" value={agentDescription} onChange={(e) => setAgentDescription(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={fieldLabel}>Capabilities (comma-separated)</label>
              <input type="text" placeholder="send_usdt, get_balance, request_funds..." value={agentCapabilities} onChange={(e) => setAgentCapabilities(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <CustomFieldAdder
                customKey={agentCustomKey} setCustomKey={setAgentCustomKey}
                customValue={agentCustomValue} setCustomValue={setAgentCustomValue}
                customFields={agentCustomFields} setCustomFields={setAgentCustomFields}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <JsonPreview obj={agentMetadataObj} label="Agent Metadata Preview" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <button className="btn btn-primary" onClick={createAgent} disabled={txPending || !walletAddress} style={{ width: "100%" }}>
                {txPending ? "Sending Transaction..." : "Create Agent"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== UPDATE STATUS MODAL ===== */}
      {modal === "updateStatus" && (
        <div className="card" style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
            <h3>Update Identity Status</h3>
            <button className="btn" onClick={() => setModal(null)}>Cancel</button>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "13px", marginBottom: "16px" }}>
            Only the identity owner or the identity itself can update status.
            Active &rarr; Suspended, Suspended &rarr; Active, Any &rarr; Revoked (terminal).
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <label style={fieldLabel}>Target Address</label>
              <input type="text" placeholder="0x..." value={statusTarget} onChange={(e) => setStatusTarget(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div>
              <label style={fieldLabel}>New Status</label>
              <select value={statusValue} onChange={(e) => setStatusValue(Number(e.target.value))}>
                <option value={0}>Active</option>
                <option value={1}>Suspended</option>
                <option value={2}>Revoked (irreversible)</option>
              </select>
            </div>
            <button
              className={`btn ${statusValue === 2 ? "btn-danger" : "btn-primary"}`}
              onClick={updateStatus}
              disabled={txPending || !walletAddress}
            >
              {txPending ? "Sending..." : statusValue === 2 ? "Revoke Identity" : "Update Status"}
            </button>
          </div>
        </div>
      )}

      {/* ===== UPDATE METADATA MODAL ===== */}
      {modal === "updateMetadata" && (
        <div className="card" style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
            <h3>Update Metadata</h3>
            <button className="btn" onClick={() => setModal(null)}>Cancel</button>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "13px", marginBottom: "16px" }}>
            Replaces the metadata hash for an identity. Only the owner or the identity itself can do this.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={fieldLabel}>Target Address</label>
              <input type="text" placeholder="0x..." value={metaTarget} onChange={(e) => setMetaTarget(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div>
              <label style={fieldLabel}>Name</label>
              <input type="text" placeholder="Updated name" value={metaName} onChange={(e) => setMetaName(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div>
              <label style={fieldLabel}>Email</label>
              <input type="email" placeholder="updated@example.com" value={metaEmail} onChange={(e) => setMetaEmail(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div>
              <label style={fieldLabel}>Role</label>
              <input type="text" placeholder="operator, admin..." value={metaRole} onChange={(e) => setMetaRole(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div>
              <label style={fieldLabel}>Website</label>
              <input type="url" placeholder="https://..." value={metaWebsite} onChange={(e) => setMetaWebsite(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={fieldLabel}>Description</label>
              <input type="text" placeholder="Updated description..." value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <CustomFieldAdder
                customKey={metaCustomKey} setCustomKey={setMetaCustomKey}
                customValue={metaCustomValue} setCustomValue={setMetaCustomValue}
                customFields={metaCustomFields} setCustomFields={setMetaCustomFields}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <JsonPreview obj={metaObj} label="Updated Metadata Preview" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <button className="btn btn-primary" onClick={updateMetadata} disabled={txPending || !walletAddress} style={{ width: "100%" }}>
                {txPending ? "Sending Transaction..." : "Update Metadata"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail panel */}
      {selected && (
        <div className="card" style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3>Identity Detail</h3>
            <div style={{ display: "flex", gap: "8px" }}>
              {selected.statusId !== 2 && (
                <button className="btn" onClick={() => openStatusModal(selected)}>
                  {selected.statusId === 0 ? "Suspend" : "Reactivate"}
                </button>
              )}
              {selected.statusId !== 2 && (
                <button className="btn btn-danger" onClick={() => { setStatusTarget(selected.address); setStatusValue(2); setModal("updateStatus"); }}>
                  Revoke
                </button>
              )}
              <button className="btn" onClick={() => openMetaModal(selected)}>
                Update Metadata
              </button>
              <button className="btn" onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>
          <div className="detail-grid">
            <div className="label">DID</div>
            <div className="value mono">{selected.did}</div>
            <div className="label">Address</div>
            <div className="value mono">{selected.address}</div>
            <div className="label">Type</div>
            <div className="value">
              <span className={`badge badge-${selected.entityType === "Human" ? "human" : selected.entityType === "Organization" ? "org" : "agent"}`}>
                {selected.entityType}
              </span>
            </div>
            <div className="label">Status</div>
            <div className="value">
              <span className={`badge badge-${selected.status.toLowerCase()}`}>{selected.status}</span>
            </div>
            <div className="label">Owner</div>
            <div className="value mono">{selected.owner}</div>
            <div className="label">Created</div>
            <div className="value">{new Date(selected.createdAt * 1000).toLocaleString()}</div>
            <div className="label">Metadata Hash</div>
            <div className="value mono" style={{ wordBreak: "break-all" }}>{selected.metadataHash}</div>
          </div>
        </div>
      )}

      {/* Search & filter */}
      <div className="search-bar">
        <input type="text" placeholder="Search by address (0x...) or DID..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && lookupAddress()} />
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="all">All Types</option>
          <option value="Human">Human</option>
          <option value="VirtualAgent">Virtual Agent</option>
          <option value="PhysicalAgent">Physical Agent</option>
          <option value="Organization">Organization</option>
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Suspended">Suspended</option>
          <option value="Revoked">Revoked</option>
        </select>
        <button className="btn btn-primary" onClick={lookupAddress}>Lookup</button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <h3>No Identities Found</h3>
          <p>{identities.length === 0 ? "No identities registered on-chain yet. Connect your wallet and register." : "No identities match your filters."}</p>
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Address</th>
                <th>DID</th>
                <th>Type</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((id) => (
                <tr key={id.address} style={{ cursor: "pointer" }} onClick={() => setSelected(id)}>
                  <td className="mono">{id.address.slice(0, 6)}...{id.address.slice(-4)}</td>
                  <td className="mono" style={{ fontSize: "12px" }}>did:nexoid:eth:{id.address.slice(0, 6)}...</td>
                  <td>
                    <span className={`badge badge-${id.entityType === "Human" ? "human" : id.entityType === "Organization" ? "org" : "agent"}`}>
                      {id.entityType}
                    </span>
                  </td>
                  <td><span className={`badge badge-${id.status.toLowerCase()}`}>{id.status}</span></td>
                  <td className="mono">{id.owner.slice(0, 6)}...{id.owner.slice(-4)}</td>
                  <td>{new Date(id.createdAt * 1000).toLocaleDateString()}</td>
                  <td>
                    <button className="btn" onClick={(e) => { e.stopPropagation(); setSelected(id); }}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
