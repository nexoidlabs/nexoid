"use client";

import { useEffect, useState, useMemo } from "react";
import { useWallet } from "@/lib/wallet";
import {
  getModuleAddress,
  SAFE_IDENTITY_MODULE_ABI,
  DELEGATION_STATUSES,
} from "@/lib/contracts";
import { keccak256, stringToHex } from "viem";

interface Delegation {
  id: number;
  issuer: string;
  subject: string;
  credentialHash?: string;
  scopeHash: string;
  validFrom: number;
  validUntil: number;
  parentDelegationId: number;
  delegationDepth: number;
  status: string;
  statusId: number;
  chainValid: boolean;
  chainDepth?: number;
  blockNumber?: number;
}

type ModalType = "create" | "revoke" | "suspend" | "reactivate" | null;

// Canonical hash matching core-client
function canonicalHash(obj: Record<string, unknown>): `0x${string}` {
  const sorted = Object.keys(obj).sort();
  const canonical = JSON.stringify(obj, sorted);
  return keccak256(stringToHex(canonical));
}

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: "13px",
  color: "var(--text-muted)",
  marginBottom: "4px",
};

// Available MCP tools from the control plane
const AVAILABLE_TOOLS = [
  "get_identity",
  "resolve_identity",
  "list_delegations",
  "request_delegation",
  "send_usdt",
  "request_funds",
  "get_balance",
  "get_audit_log",
] as const;

export default function DelegationsPage() {
  const { address: walletAddress, walletClient, publicClient, chain } = useWallet();
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Delegation | null>(null);
  const [modal, setModal] = useState<ModalType>(null);
  const [txPending, setTxPending] = useState(false);
  const [showJson, setShowJson] = useState(false);

  // --- Create delegation form ---
  const [delSubject, setDelSubject] = useState("");
  const [delValidDays, setDelValidDays] = useState("30");
  const [delParentId, setDelParentId] = useState("0");
  const [delDepth, setDelDepth] = useState("0");

  // Scope fields (V1 AgentScope)
  const [scopeBudgetAmount, setScopeBudgetAmount] = useState("");
  const [scopeBudgetCurrency, setScopeBudgetCurrency] = useState("USDT");
  const [scopeBudgetPeriod, setScopeBudgetPeriod] = useState("daily");
  const [scopeMaxTxAmount, setScopeMaxTxAmount] = useState("");
  const [scopeMaxTxCurrency, setScopeMaxTxCurrency] = useState("USDT");
  const [scopeAllowedTools, setScopeAllowedTools] = useState<string[]>([]);
  const [scopeDelegationDepth, setScopeDelegationDepth] = useState("0");

  // Credential fields
  const [credType, setCredType] = useState("");
  const [credIssuer, setCredIssuer] = useState("");
  const [credDescription, setCredDescription] = useState("");

  // Action target
  const [actionId, setActionId] = useState("");

  const moduleAddress = getModuleAddress();

  const loadDelegations = () => {
    setLoading(true);
    fetch("/api/delegations")
      .then((r) => r.json())
      .then((data) => setDelegations(data.delegations ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDelegations();
  }, []);

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 5000);
  };
  const showError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 8000);
  };

  const lookupDelegation = async () => {
    const id = parseInt(search);
    if (isNaN(id)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/delegations?id=${id}`);
      const data = await res.json();
      if (data.delegation) setSelected(data.delegation);
      else showError(data.error ?? "Delegation not found");
    } catch (e) {
      showError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // --- Build scope object ---
  const scopeObj = useMemo(() => {
    const obj: Record<string, unknown> = {};
    if (scopeBudgetAmount) {
      obj.budgetLimit = {
        amount: scopeBudgetAmount,
        currency: scopeBudgetCurrency,
        period: scopeBudgetPeriod,
      };
    }
    if (scopeMaxTxAmount) {
      obj.maxTransactionAmount = {
        amount: scopeMaxTxAmount,
        currency: scopeMaxTxCurrency,
      };
    }
    if (scopeAllowedTools.length > 0) {
      obj.allowedTools = scopeAllowedTools;
    }
    if (scopeDelegationDepth && parseInt(scopeDelegationDepth) > 0) {
      obj.delegationDepth = parseInt(scopeDelegationDepth);
    }
    return obj;
  }, [scopeBudgetAmount, scopeBudgetCurrency, scopeBudgetPeriod, scopeMaxTxAmount, scopeMaxTxCurrency, scopeAllowedTools, scopeDelegationDepth]);

  const credObj = useMemo(() => {
    const obj: Record<string, unknown> = {};
    if (credType) obj.type = credType;
    if (credIssuer) obj.issuer = credIssuer;
    if (credDescription) obj.description = credDescription;
    return obj;
  }, [credType, credIssuer, credDescription]);

  // --- Write operations ---

  const createDelegation = async () => {
    if (!walletClient) return showError("Connect wallet first.");
    if (!delSubject.startsWith("0x") || delSubject.length !== 42)
      return showError("Invalid subject address.");
    setTxPending(true);
    try {
      const hasScopeFields = Object.keys(scopeObj).length > 0;
      const scopeHash = hasScopeFields
        ? canonicalHash(scopeObj)
        : ("0x" + "0".repeat(64)) as `0x${string}`;
      const hasCredFields = Object.keys(credObj).length > 0;
      const credentialHash = hasCredFields
        ? canonicalHash(credObj)
        : ("0x" + "0".repeat(64)) as `0x${string}`;
      const validUntil = BigInt(
        Math.floor(Date.now() / 1000) + parseInt(delValidDays) * 86400
      );

      const hash = await walletClient.writeContract({
        address: moduleAddress,
        abi: SAFE_IDENTITY_MODULE_ABI,
        functionName: "delegateWithScope",
        args: [
          delSubject as `0x${string}`,
          credentialHash,
          scopeHash,
          validUntil,
          BigInt(delParentId),
          parseInt(delDepth),
        ],
        chain,
        account: walletAddress!,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      showSuccess(`Delegation created. Tx: ${hash.slice(0, 10)}...`);
      setModal(null);
      resetCreateForm();
      loadDelegations();
    } catch (e: any) {
      showError(e.shortMessage ?? e.message);
    } finally {
      setTxPending(false);
    }
  };

  const revokeDelegation = async () => {
    if (!walletClient) return showError("Connect wallet first.");
    setTxPending(true);
    try {
      const hash = await walletClient.writeContract({
        address: moduleAddress,
        abi: SAFE_IDENTITY_MODULE_ABI,
        functionName: "revokeDelegation",
        args: [BigInt(actionId)],
        chain,
        account: walletAddress!,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      showSuccess(`Delegation #${actionId} revoked. Tx: ${hash.slice(0, 10)}...`);
      setModal(null);
      setActionId("");
      loadDelegations();
    } catch (e: any) {
      showError(e.shortMessage ?? e.message);
    } finally {
      setTxPending(false);
    }
  };

  const suspendDelegation = async () => {
    if (!walletClient) return showError("Connect wallet first.");
    setTxPending(true);
    try {
      const hash = await walletClient.writeContract({
        address: moduleAddress,
        abi: SAFE_IDENTITY_MODULE_ABI,
        functionName: "suspendDelegation",
        args: [BigInt(actionId)],
        chain,
        account: walletAddress!,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      showSuccess(`Delegation #${actionId} suspended. Tx: ${hash.slice(0, 10)}...`);
      setModal(null);
      setActionId("");
      loadDelegations();
    } catch (e: any) {
      showError(e.shortMessage ?? e.message);
    } finally {
      setTxPending(false);
    }
  };

  const reactivateDelegation = async () => {
    if (!walletClient) return showError("Connect wallet first.");
    setTxPending(true);
    try {
      const hash = await walletClient.writeContract({
        address: moduleAddress,
        abi: SAFE_IDENTITY_MODULE_ABI,
        functionName: "reactivateDelegation",
        args: [BigInt(actionId)],
        chain,
        account: walletAddress!,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      showSuccess(`Delegation #${actionId} reactivated. Tx: ${hash.slice(0, 10)}...`);
      setModal(null);
      setActionId("");
      loadDelegations();
    } catch (e: any) {
      showError(e.shortMessage ?? e.message);
    } finally {
      setTxPending(false);
    }
  };

  const resetCreateForm = () => {
    setDelSubject(""); setDelValidDays("30"); setDelParentId("0"); setDelDepth("0");
    setScopeBudgetAmount(""); setScopeBudgetCurrency("USDT"); setScopeBudgetPeriod("daily");
    setScopeMaxTxAmount(""); setScopeMaxTxCurrency("USDT"); setScopeAllowedTools([]);
    setScopeDelegationDepth("0"); setCredType(""); setCredIssuer(""); setCredDescription("");
  };

  const openActionModal = (type: "revoke" | "suspend" | "reactivate", d: Delegation) => {
    setActionId(String(d.id));
    setModal(type);
  };

  const toggleTool = (tool: string) => {
    setScopeAllowedTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]
    );
  };

  const filtered = delegations.filter((d) => {
    if (filterStatus !== "all" && d.status !== filterStatus) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!d.issuer.toLowerCase().includes(s) && !d.subject.toLowerCase().includes(s) && !String(d.id).includes(s)) return false;
    }
    return true;
  });

  const isExpired = (d: Delegation) =>
    d.validUntil > 0 && d.validUntil < Date.now() / 1000;

  // --- JSON preview ---
  const JsonPreview = ({ obj, label }: { obj: Record<string, unknown>; label: string }) => {
    const keys = Object.keys(obj);
    if (keys.length === 0) return null;
    const hash = canonicalHash(obj);
    return (
      <div style={{ marginTop: "8px", borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</span>
          <button className="btn" style={{ padding: "2px 8px", fontSize: "11px" }} onClick={() => setShowJson(!showJson)}>
            {showJson ? "Hide" : "Show JSON"}
          </button>
        </div>
        {showJson && (
          <pre style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "12px", fontSize: "12px", fontFamily: "'SF Mono', 'Fira Code', monospace", overflowX: "auto", marginBottom: "8px" }}>
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

  if (loading && delegations.length === 0)
    return <div className="loading">Loading delegations...</div>;

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
        <button className="btn btn-primary" onClick={() => { resetCreateForm(); setModal("create"); }}>
          Create Delegation
        </button>
        <button className="btn" onClick={() => setModal("suspend")}>Suspend</button>
        <button className="btn" onClick={() => setModal("reactivate")}>Reactivate</button>
        <button className="btn btn-danger" onClick={() => setModal("revoke")}>Revoke</button>
      </div>

      {/* ===== CREATE DELEGATION MODAL ===== */}
      {modal === "create" && (
        <div className="card" style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
            <h3>Create Delegation</h3>
            <button className="btn" onClick={() => setModal(null)}>Cancel</button>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "13px", marginBottom: "16px" }}>
            Root delegation: you must be the owner of the subject.
            Sub-delegation: you must hold the parent delegation.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {/* --- Subject & Timing --- */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={fieldLabel}>Subject Address * (who receives the delegation)</label>
              <input type="text" placeholder="0x..." value={delSubject} onChange={(e) => setDelSubject(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div>
              <label style={fieldLabel}>Valid for (days)</label>
              <input type="number" value={delValidDays} onChange={(e) => setDelValidDays(e.target.value)} min="1" style={{ width: "100%" }} />
            </div>
            <div>
              <label style={fieldLabel}>Parent Delegation ID (0 = root)</label>
              <input type="number" value={delParentId} onChange={(e) => setDelParentId(e.target.value)} min="0" style={{ width: "100%" }} />
            </div>
            <div>
              <label style={fieldLabel}>On-chain Delegation Depth (0 = no sub-delegation)</label>
              <input type="number" value={delDepth} onChange={(e) => setDelDepth(e.target.value)} min="0" max="255" style={{ width: "100%" }} />
            </div>
            <div style={{ gridColumn: "1 / -1", borderTop: "1px solid var(--border)", paddingTop: "16px" }} />

            {/* --- Scope: Budget Limit --- */}
            <div style={{ gridColumn: "1 / -1" }}>
              <h4 style={{ fontSize: "14px", marginBottom: "8px" }}>Scope (V1 AgentScope)</h4>
              <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px" }}>
                Defines what the agent is allowed to do. All 4 V1 scope fields below.
              </p>
            </div>

            <div>
              <label style={fieldLabel}>Budget Limit &mdash; Amount</label>
              <input type="number" placeholder="e.g. 1000" value={scopeBudgetAmount} onChange={(e) => setScopeBudgetAmount(e.target.value)} min="0" step="0.01" style={{ width: "100%" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div>
                <label style={fieldLabel}>Currency</label>
                <select value={scopeBudgetCurrency} onChange={(e) => setScopeBudgetCurrency(e.target.value)} style={{ width: "100%" }}>
                  <option value="USDT">USDT</option>
                  <option value="ETH">ETH</option>
                </select>
              </div>
              <div>
                <label style={fieldLabel}>Period</label>
                <select value={scopeBudgetPeriod} onChange={(e) => setScopeBudgetPeriod(e.target.value)} style={{ width: "100%" }}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            </div>

            {/* --- Scope: Max Transaction --- */}
            <div>
              <label style={fieldLabel}>Max Transaction Amount</label>
              <input type="number" placeholder="e.g. 100" value={scopeMaxTxAmount} onChange={(e) => setScopeMaxTxAmount(e.target.value)} min="0" step="0.01" style={{ width: "100%" }} />
            </div>
            <div>
              <label style={fieldLabel}>Max Tx Currency</label>
              <select value={scopeMaxTxCurrency} onChange={(e) => setScopeMaxTxCurrency(e.target.value)} style={{ width: "100%" }}>
                <option value="USDT">USDT</option>
                <option value="ETH">ETH</option>
              </select>
            </div>

            {/* --- Scope: Allowed Tools --- */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={fieldLabel}>Allowed Tools (click to toggle)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {AVAILABLE_TOOLS.map((tool) => (
                  <button
                    key={tool}
                    className="btn"
                    style={{
                      padding: "4px 10px",
                      fontSize: "12px",
                      background: scopeAllowedTools.includes(tool) ? "var(--accent)" : "var(--bg)",
                      color: scopeAllowedTools.includes(tool) ? "white" : "var(--text-muted)",
                      borderColor: scopeAllowedTools.includes(tool) ? "var(--accent)" : "var(--border)",
                    }}
                    onClick={() => toggleTool(tool)}
                  >
                    {tool}
                  </button>
                ))}
              </div>
              {scopeAllowedTools.length > 0 && (
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                  {scopeAllowedTools.length} tool{scopeAllowedTools.length !== 1 ? "s" : ""} selected
                </div>
              )}
            </div>

            {/* --- Scope: Delegation Depth (in scope obj) --- */}
            <div>
              <label style={fieldLabel}>Scope Delegation Depth</label>
              <input type="number" placeholder="0" value={scopeDelegationDepth} onChange={(e) => setScopeDelegationDepth(e.target.value)} min="0" max="10" style={{ width: "100%" }} />
            </div>
            <div />

            {/* Scope preview */}
            <div style={{ gridColumn: "1 / -1" }}>
              <JsonPreview obj={scopeObj} label="Scope Preview" />
            </div>

            <div style={{ gridColumn: "1 / -1", borderTop: "1px solid var(--border)", paddingTop: "16px" }} />

            {/* --- Credential --- */}
            <div style={{ gridColumn: "1 / -1" }}>
              <h4 style={{ fontSize: "14px", marginBottom: "8px" }}>Credential (optional)</h4>
              <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px" }}>
                Off-chain Verifiable Credential reference. Only the hash is stored on-chain.
              </p>
            </div>
            <div>
              <label style={fieldLabel}>Credential Type</label>
              <input type="text" placeholder="DelegationCredential, AccessGrant..." value={credType} onChange={(e) => setCredType(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div>
              <label style={fieldLabel}>Credential Issuer</label>
              <input type="text" placeholder="did:nexoid:eth:0x... or name" value={credIssuer} onChange={(e) => setCredIssuer(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={fieldLabel}>Credential Description</label>
              <input type="text" placeholder="What this credential authorizes..." value={credDescription} onChange={(e) => setCredDescription(e.target.value)} style={{ width: "100%" }} />
            </div>

            {/* Credential preview */}
            <div style={{ gridColumn: "1 / -1" }}>
              <JsonPreview obj={credObj} label="Credential Preview" />
            </div>

            <div style={{ gridColumn: "1 / -1", marginTop: "8px" }}>
              <button className="btn btn-primary" onClick={createDelegation} disabled={txPending || !walletAddress} style={{ width: "100%" }}>
                {txPending ? "Sending Transaction..." : "Create Delegation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== REVOKE / SUSPEND / REACTIVATE MODAL ===== */}
      {(modal === "revoke" || modal === "suspend" || modal === "reactivate") && (
        <div className="card" style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
            <h3>
              {modal === "revoke" && "Revoke Delegation"}
              {modal === "suspend" && "Suspend Delegation"}
              {modal === "reactivate" && "Reactivate Delegation"}
            </h3>
            <button className="btn" onClick={() => setModal(null)}>Cancel</button>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "13px", marginBottom: "16px" }}>
            {modal === "revoke" && "Permanently revoke a delegation. Only the issuer can do this. This invalidates all downstream sub-delegations (chain-breaking D-15)."}
            {modal === "suspend" && "Temporarily suspend an active delegation. Only the issuer can do this."}
            {modal === "reactivate" && "Reactivate a suspended delegation. Only the issuer can do this."}
          </p>
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <label style={fieldLabel}>Delegation ID</label>
              <input type="number" placeholder="e.g. 1" value={actionId} onChange={(e) => setActionId(e.target.value)} min="1" style={{ width: "100%" }} />
            </div>
            <button
              className={`btn ${modal === "revoke" ? "btn-danger" : "btn-primary"}`}
              onClick={modal === "revoke" ? revokeDelegation : modal === "suspend" ? suspendDelegation : reactivateDelegation}
              disabled={txPending || !walletAddress || !actionId}
            >
              {txPending ? "Sending..." : modal === "revoke" ? "Revoke" : modal === "suspend" ? "Suspend" : "Reactivate"}
            </button>
          </div>
        </div>
      )}

      {/* Detail panel */}
      {selected && (
        <div className="card" style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3>Delegation #{selected.id}</h3>
            <div style={{ display: "flex", gap: "8px" }}>
              {selected.statusId === 0 && (
                <button className="btn" onClick={() => openActionModal("suspend", selected)}>Suspend</button>
              )}
              {selected.statusId === 1 && (
                <button className="btn btn-primary" onClick={() => openActionModal("reactivate", selected)}>Reactivate</button>
              )}
              {selected.statusId !== 2 && (
                <button className="btn btn-danger" onClick={() => openActionModal("revoke", selected)}>Revoke</button>
              )}
              <button className="btn" onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>
          <div className="detail-grid">
            <div className="label">ID</div>
            <div className="value mono">#{selected.id}</div>
            <div className="label">Issuer</div>
            <div className="value mono">{selected.issuer}</div>
            <div className="label">Subject</div>
            <div className="value mono">{selected.subject}</div>
            <div className="label">Status</div>
            <div className="value">
              <span className={`badge badge-${selected.status.toLowerCase()}`}>{selected.status}</span>
              {selected.chainValid ? (
                <span className="badge badge-active" style={{ marginLeft: "8px" }}>Chain Valid</span>
              ) : (
                <span className="badge badge-revoked" style={{ marginLeft: "8px" }}>Chain Invalid</span>
              )}
            </div>
            <div className="label">Scope Hash</div>
            <div className="value mono" style={{ wordBreak: "break-all" }}>{selected.scopeHash}</div>
            <div className="label">Valid From</div>
            <div className="value">{new Date(selected.validFrom * 1000).toLocaleString()}</div>
            <div className="label">Valid Until</div>
            <div className="value">
              {selected.validUntil === 0 ? "No expiry" : new Date(selected.validUntil * 1000).toLocaleString()}
              {isExpired(selected) && <span className="badge badge-revoked" style={{ marginLeft: "8px" }}>Expired</span>}
            </div>
            <div className="label">Parent</div>
            <div className="value mono">
              {selected.parentDelegationId === 0 ? (
                <span style={{ color: "var(--text-muted)" }}>Root (no parent)</span>
              ) : `#${selected.parentDelegationId}`}
            </div>
            <div className="label">Depth</div>
            <div className="value">{selected.delegationDepth}</div>
          </div>
        </div>
      )}

      {/* Search & filter */}
      <div className="search-bar">
        <input type="text" placeholder="Search by delegation ID, issuer, or subject..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && lookupDelegation()} />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Suspended">Suspended</option>
          <option value="Revoked">Revoked</option>
        </select>
        <button className="btn btn-primary" onClick={lookupDelegation}>Lookup by ID</button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <h3>No Delegations Found</h3>
          <p>{delegations.length === 0 ? "No delegations created yet. Register identities first, then create delegations." : "No delegations match your filters."}</p>
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Issuer</th>
                <th>Subject</th>
                <th>Depth</th>
                <th>Status</th>
                <th>Chain</th>
                <th>Expires</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} style={{ cursor: "pointer" }} onClick={() => setSelected(d)}>
                  <td className="mono">#{d.id}</td>
                  <td className="mono">{d.issuer.slice(0, 6)}...{d.issuer.slice(-4)}</td>
                  <td className="mono">{d.subject.slice(0, 6)}...{d.subject.slice(-4)}</td>
                  <td>{d.delegationDepth}</td>
                  <td><span className={`badge badge-${d.status.toLowerCase()}`}>{d.status}</span></td>
                  <td>{d.chainValid ? <span className="badge badge-active">Valid</span> : <span className="badge badge-revoked">Invalid</span>}</td>
                  <td>
                    {d.validUntil === 0 ? (
                      <span style={{ color: "var(--text-muted)" }}>Never</span>
                    ) : isExpired(d) ? (
                      <span style={{ color: "var(--danger)" }}>Expired</span>
                    ) : new Date(d.validUntil * 1000).toLocaleDateString()}
                  </td>
                  <td><button className="btn" onClick={(e) => { e.stopPropagation(); setSelected(d); }}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
