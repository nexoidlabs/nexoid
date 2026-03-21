"use client";

import React, { useEffect, useState, useMemo } from "react";
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
}

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

export default function RegistryPage() {
  const { address: walletAddress, walletClient, publicClient, chain, network } = useWallet();
  const registryAddress = getRegistryAddress(network);

  // Access control
  const [isAdmin, setIsAdmin] = useState(false);
  const [isRegistrar, setIsRegistrar] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);

  // Data
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [txPending, setTxPending] = useState(false);
  const [showJson, setShowJson] = useState(false);

  // Registrar management
  const [regMgmtAddress, setRegMgmtAddress] = useState("");
  const [regMgmtAuth, setRegMgmtAuth] = useState(true);

  // Register identity form
  const [regTarget, setRegTarget] = useState("");
  const [regEntityType, setRegEntityType] = useState(0);
  const [regName, setRegName] = useState("");
  const [regYob, setRegYob] = useState("");
  const [regLocation, setRegLocation] = useState("");
  const [regDescription, setRegDescription] = useState("");
  const [regCustomKey, setRegCustomKey] = useState("");
  const [regCustomValue, setRegCustomValue] = useState("");
  const [regCustomFields, setRegCustomFields] = useState<Record<string, string>>({});

  // Status management
  const [statusTarget, setStatusTarget] = useState("");
  const [statusValue, setStatusValue] = useState(1);

  // Filter
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Expanded row
  const [expandedAddr, setExpandedAddr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const showSuccess = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(null), 5000); };
  const showError = (msg: string) => { setError(msg); setTimeout(() => setError(null), 8000); };

  // Check admin/registrar status
  useEffect(() => {
    if (!walletAddress || !publicClient) return;
    (async () => {
      try {
        const admin = await publicClient.readContract({
          address: registryAddress, abi: IDENTITY_REGISTRY_ABI,
          functionName: "admin", args: [],
        });
        const isAdm = (admin as string).toLowerCase() === walletAddress.toLowerCase();
        setIsAdmin(isAdm);

        const registrar = await publicClient.readContract({
          address: registryAddress, abi: IDENTITY_REGISTRY_ABI,
          functionName: "isRegistrar", args: [walletAddress],
        });
        setIsRegistrar(registrar as boolean);
      } catch {
        // Contract may not be deployed
      }
      setAccessChecked(true);
    })();
  }, [walletAddress, publicClient, registryAddress]);

  // Load identities
  const loadIdentities = () => {
    setLoading(true);
    fetch(`/api/identities?network=${network}`)
      .then((r) => r.json())
      .then((data) => setIdentities(data.identities ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadIdentities(); }, [network]);

  // Metadata object
  const regMetadataObj = useMemo(() => {
    const obj: Record<string, unknown> = {};
    if (regName) obj.name = regName;
    if (regYob) obj.yearOfBirth = parseInt(regYob);
    if (regLocation) obj.location = regLocation;
    if (regDescription) obj.description = regDescription;
    for (const [k, v] of Object.entries(regCustomFields)) obj[k] = v;
    return obj;
  }, [regName, regYob, regLocation, regDescription, regCustomFields]);

  // --- Write operations ---

  const handleSetRegistrar = async () => {
    if (!walletClient || !isAdmin) return;
    if (!regMgmtAddress.startsWith("0x") || regMgmtAddress.length !== 42)
      return showError("Invalid address.");
    setTxPending(true);
    try {
      const hash = await walletClient.writeContract({
        address: registryAddress, abi: IDENTITY_REGISTRY_ABI,
        functionName: "setRegistrar",
        args: [regMgmtAddress as `0x${string}`, regMgmtAuth],
        chain, account: walletAddress!, gas: 200_000n,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      showSuccess(`Registrar ${regMgmtAuth ? "added" : "removed"}. Tx: ${hash.slice(0, 10)}...`);
      setRegMgmtAddress("");
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setTxPending(false);
    }
  };

  const handleRegisterIdentity = async () => {
    if (!walletClient) return showError("Connect wallet first.");
    if (!regTarget.startsWith("0x") || regTarget.length !== 42)
      return showError("Invalid target address.");
    setTxPending(true);
    try {
      const hasFields = Object.keys(regMetadataObj).length > 0;
      const metadataHash = hasFields
        ? canonicalHash(regMetadataObj)
        : ("0x" + "0".repeat(64)) as `0x${string}`;

      const hash = await walletClient.writeContract({
        address: registryAddress, abi: IDENTITY_REGISTRY_ABI,
        functionName: "registerIdentityFor",
        args: [regTarget as `0x${string}`, regEntityType, metadataHash],
        chain, account: walletAddress!, gas: 500_000n,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      showSuccess(`Identity registered for ${regTarget.slice(0, 10)}... Tx: ${hash.slice(0, 10)}...`);
      setRegTarget(""); setRegName(""); setRegYob(""); setRegLocation("");
      setRegDescription(""); setRegCustomFields({});
      loadIdentities();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setTxPending(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!walletClient) return showError("Connect wallet first.");
    if (!statusTarget.startsWith("0x") || statusTarget.length !== 42)
      return showError("Invalid target address.");
    setTxPending(true);
    try {
      const hash = await walletClient.writeContract({
        address: registryAddress, abi: IDENTITY_REGISTRY_ABI,
        functionName: "updateStatus",
        args: [statusTarget as `0x${string}`, statusValue],
        chain, account: walletAddress!, gas: 200_000n,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      showSuccess(`Status updated to ${ENTITY_STATUSES[statusValue]}. Tx: ${hash.slice(0, 10)}...`);
      setStatusTarget("");
      loadIdentities();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setTxPending(false);
    }
  };

  const filtered = identities.filter((id) => {
    if (filterType !== "all" && id.entityType !== filterType) return false;
    if (filterStatus !== "all" && id.status !== filterStatus) return false;
    if (search && !id.address.toLowerCase().includes(search.toLowerCase()) && !id.did.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const JsonPreview = ({ obj, label }: { obj: Record<string, unknown>; label: string }) => {
    const keys = Object.keys(obj);
    if (keys.length === 0) return null;
    const hash = canonicalHash(obj);
    return (
      <div style={{ marginTop: "12px", borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</span>
          <button className="btn" style={{ padding: "2px 8px", fontSize: "11px" }} onClick={() => setShowJson(!showJson)}>
            {showJson ? "Hide JSON" : "Show JSON"}
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

  // --- Access gate ---
  if (!walletAddress) {
    return (
      <div className="empty-state">
        <h3>Connect Wallet</h3>
        <p>Connect your wallet to access the Registry admin panel.</p>
      </div>
    );
  }

  if (accessChecked && !isAdmin && !isRegistrar) {
    return (
      <div className="empty-state">
        <h3>Access Denied</h3>
        <p>Your wallet ({walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}) is not the registry admin or a registrar. Contact the registry administrator for access.</p>
      </div>
    );
  }

  return (
    <div>
      {error && <div className="error-msg">{error}</div>}
      {success && (
        <div style={{ background: "#22c55e22", border: "1px solid var(--success)", borderRadius: "var(--radius)", padding: "12px", color: "var(--success)", marginBottom: "16px" }}>
          {success}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Identity Registry</h2>
        <span className={`badge ${isAdmin ? "badge-active" : "badge-human"}`}>
          {isAdmin ? "Admin" : "Registrar"}
        </span>
      </div>

      {/* ===== Registrar Management (admin only) ===== */}
      {isAdmin && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 12 }}>Manage Registrars</h3>
          <p style={{ color: "var(--text-muted)", fontSize: "13px", marginBottom: "12px" }}>
            Add or remove registrar permissions. Only the admin can do this.
          </p>
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <label style={fieldLabel}>Address</label>
              <input type="text" placeholder="0x..." value={regMgmtAddress} onChange={(e) => setRegMgmtAddress(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div>
              <label style={fieldLabel}>Action</label>
              <select value={regMgmtAuth ? "true" : "false"} onChange={(e) => setRegMgmtAuth(e.target.value === "true")}>
                <option value="true">Add Registrar</option>
                <option value="false">Remove Registrar</option>
              </select>
            </div>
            <button className="btn btn-primary" onClick={handleSetRegistrar} disabled={txPending || !regMgmtAddress}>
              {txPending ? "Sending..." : "Submit"}
            </button>
          </div>
        </div>
      )}

      {/* ===== Register Identity Form ===== */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 12 }}>Register Identity</h3>
        <p style={{ color: "var(--text-muted)", fontSize: "13px", marginBottom: "16px" }}>
          Register a new identity on the IdentityRegistry. The metadata hash is stored on-chain.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={fieldLabel}>Target Address *</label>
            <input type="text" placeholder="0x... (address to register)" value={regTarget} onChange={(e) => setRegTarget(e.target.value)} style={{ width: "100%" }} className="mono" />
          </div>
          <div>
            <label style={fieldLabel}>Entity Type *</label>
            <select value={regEntityType} onChange={(e) => setRegEntityType(Number(e.target.value))} style={{ width: "100%" }}>
              <option value={0}>Human</option>
              <option value={3}>Organization</option>
            </select>
          </div>
          <div>
            <label style={fieldLabel}>Name</label>
            <input type="text" placeholder="Alice Johnson" value={regName} onChange={(e) => setRegName(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div>
            <label style={fieldLabel}>Year of Birth</label>
            <input type="number" placeholder="1990" value={regYob} onChange={(e) => setRegYob(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div>
            <label style={fieldLabel}>Location / Country</label>
            <input type="text" placeholder="Switzerland" value={regLocation} onChange={(e) => setRegLocation(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={fieldLabel}>Description</label>
            <input type="text" placeholder="Short description..." value={regDescription} onChange={(e) => setRegDescription(e.target.value)} style={{ width: "100%" }} />
          </div>
          {/* Custom fields */}
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={fieldLabel}>Custom Fields</label>
            {Object.entries(regCustomFields).length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                {Object.entries(regCustomFields).map(([k, v]) => (
                  <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "4px", padding: "2px 8px", fontSize: "12px" }}>
                    <span className="mono">{k}:</span> {v}
                    <button style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", padding: "0 2px", fontSize: "14px" }} onClick={() => { const next = { ...regCustomFields }; delete next[k]; setRegCustomFields(next); }}>x</button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: "8px" }}>
              <input type="text" placeholder="key" value={regCustomKey} onChange={(e) => setRegCustomKey(e.target.value)} style={{ width: "120px" }} />
              <input type="text" placeholder="value" value={regCustomValue} onChange={(e) => setRegCustomValue(e.target.value)} style={{ flex: 1 }} />
              <button className="btn" style={{ padding: "4px 10px", fontSize: "12px" }} onClick={() => { if (regCustomKey.trim()) { setRegCustomFields({ ...regCustomFields, [regCustomKey.trim()]: regCustomValue }); setRegCustomKey(""); setRegCustomValue(""); } }}>Add</button>
            </div>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <JsonPreview obj={regMetadataObj} label="Metadata Preview" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <button className="btn btn-primary" onClick={handleRegisterIdentity} disabled={txPending || !walletAddress || !regTarget} style={{ width: "100%" }}>
              {txPending ? "Sending Transaction..." : "Register Identity"}
            </button>
          </div>
        </div>
      </div>

      {/* ===== Status Management ===== */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 12 }}>Update Identity Status</h3>
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Target Address</label>
            <input type="text" placeholder="0x..." value={statusTarget} onChange={(e) => setStatusTarget(e.target.value)} style={{ width: "100%" }} className="mono" />
          </div>
          <div>
            <label style={fieldLabel}>New Status</label>
            <select value={statusValue} onChange={(e) => setStatusValue(Number(e.target.value))}>
              <option value={0}>Active</option>
              <option value={1}>Suspended</option>
              <option value={2}>Revoked</option>
            </select>
          </div>
          <button className={`btn ${statusValue === 2 ? "btn-danger" : "btn-primary"}`} onClick={handleUpdateStatus} disabled={txPending || !statusTarget}>
            {txPending ? "Sending..." : "Update Status"}
          </button>
        </div>
      </div>

      {/* ===== Identities Table ===== */}
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Registered Identities</h3>
        <div className="search-bar">
          <input type="text" placeholder="Search by address or DID..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
        </div>
      </div>

      {loading && identities.length === 0 ? (
        <div className="loading">Loading identities...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <h3>No Identities Found</h3>
          <p>{identities.length === 0 ? "No identities registered yet." : "No identities match your filters."}</p>
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
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((id) => {
                const isExpanded = expandedAddr === id.address;
                const credential = {
                  "@context": ["https://www.w3.org/2018/credentials/v1"],
                  type: ["VerifiableCredential", "NexoidIdentity"],
                  issuer: `did:nexoid:eth:${id.owner}`,
                  issuanceDate: new Date(id.createdAt * 1000).toISOString(),
                  credentialSubject: {
                    id: id.did,
                    address: id.address,
                    entityType: id.entityType,
                    entityTypeId: id.entityTypeId,
                    status: id.status,
                    statusId: id.statusId,
                    owner: id.owner,
                    metadataHash: id.metadataHash,
                    registeredAt: id.createdAt,
                  },
                };
                return (
                  <React.Fragment key={id.address}>
                    <tr
                      onClick={() => setExpandedAddr(isExpanded ? null : id.address)}
                      style={{ cursor: "pointer", transition: "background 0.15s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                    >
                      <td className="mono">{id.address.slice(0, 6)}...{id.address.slice(-4)}</td>
                      <td className="mono" style={{ fontSize: "12px" }}>did:nexoid:eth:{id.address.slice(0, 6)}...</td>
                      <td>
                        <span className={`badge badge-${id.entityType === "Human" ? "human" : id.entityType === "Organization" ? "org" : "agent"}`}>
                          {id.entityType}
                        </span>
                      </td>
                      <td><span className={`badge badge-${id.status.toLowerCase()}`}>{id.status}</span></td>
                      <td>{new Date(id.createdAt * 1000).toLocaleDateString()}</td>
                      <td>
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <span style={{ fontSize: 14, color: "var(--text-muted)", transform: isExpanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.2s" }}>▶</span>
                          {id.statusId === 0 && (
                            <button className="btn" style={{ fontSize: 11, padding: "2px 8px" }} onClick={(e) => { e.stopPropagation(); setStatusTarget(id.address); setStatusValue(1); }}>Suspend</button>
                          )}
                          {id.statusId === 1 && (
                            <button className="btn" style={{ fontSize: 11, padding: "2px 8px" }} onClick={(e) => { e.stopPropagation(); setStatusTarget(id.address); setStatusValue(0); }}>Activate</button>
                          )}
                          {id.statusId !== 2 && (
                            <button className="btn btn-danger" style={{ fontSize: 11, padding: "2px 8px" }} onClick={(e) => { e.stopPropagation(); setStatusTarget(id.address); setStatusValue(2); }}>Revoke</button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={6} style={{ padding: 0, border: "none" }}>
                          <div style={{ background: "var(--bg)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", padding: "16px 20px" }}>
                            {/* Detail fields */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px", marginBottom: 16 }}>
                              {[
                                { label: "Address", value: id.address, key: "addr" },
                                { label: "DID", value: id.did, key: "did" },
                                { label: "Owner", value: id.owner, key: "owner" },
                                { label: "Entity Type", value: `${id.entityType} (${id.entityTypeId})`, key: "type" },
                                { label: "Status", value: `${id.status} (${id.statusId})`, key: "status" },
                                { label: "Created At", value: `${new Date(id.createdAt * 1000).toISOString()} (${id.createdAt})`, key: "created" },
                                { label: "Metadata Hash", value: id.metadataHash, key: "hash" },
                              ].map((f) => (
                                <div key={f.key}>
                                  <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{f.label}</span>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                                    <span className="mono" style={{ fontSize: 13, wordBreak: "break-all" }}>{f.value}</span>
                                    <button
                                      className="btn"
                                      style={{ padding: "1px 6px", fontSize: 10, flexShrink: 0 }}
                                      onClick={() => copyToClipboard(f.value, f.key)}
                                    >
                                      {copied === f.key ? "Copied!" : "Copy"}
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Credential JSON block */}
                            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                <span style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Identity Credential</span>
                                <button
                                  className="btn"
                                  style={{ padding: "3px 10px", fontSize: 11 }}
                                  onClick={() => copyToClipboard(JSON.stringify(credential, null, 2), `cred-${id.address}`)}
                                >
                                  {copied === `cred-${id.address}` ? "Copied!" : "Copy JSON"}
                                </button>
                              </div>
                              <pre style={{
                                background: "var(--card-bg, #fff)",
                                border: "1px solid var(--border)",
                                borderRadius: "var(--radius)",
                                padding: "12px 16px",
                                fontSize: 12,
                                fontFamily: "'SF Mono', 'Fira Code', monospace",
                                overflowX: "auto",
                                whiteSpace: "pre",
                                margin: 0,
                                lineHeight: 1.5,
                              }}>
                                {JSON.stringify(credential, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
