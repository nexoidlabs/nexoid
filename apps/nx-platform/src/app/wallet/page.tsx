"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useWallet } from "@/lib/wallet";
import { getSafeAddress } from "@/lib/storage";
import { SlidePanel } from "../slide-panel";
import { SAFE_ABI, ERC20_ABI } from "@/lib/contracts";
import {
  encodeFunctionData,
  parseUnits,
  pad,
  concat,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";

interface AgentAllowance {
  address: string;
  did: string;
  allowance: string;
  spent: string;
  remaining: string;
  resetTimeMin: number;
  nonce: number;
}

interface AgentSafeInfo {
  agentSafe: string;
  agentEOA: string;
  createdAt: number;
  did: string;
  balances: {
    eth: string;
    usdt: string;
  };
  delegates: AgentAllowance[];
}

interface WalletData {
  safe: string;
  token: string;
  balances: {
    eth: string;
    usdt: string;
  };
  agents: AgentAllowance[];
  agentSafes?: AgentSafeInfo[];
}

function buildPreApprovedSig(owner: Address): Hex {
  const r = pad(owner, { size: 32 });
  const s = pad("0x00" as Hex, { size: 32 });
  const v = "0x01" as Hex;
  return concat([r, s, v]);
}

export default function WalletPage() {
  const { address: walletAddress, walletClient, publicClient, chain, network } = useWallet();
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelAgent, setPanelAgent] = useState<AgentSafeInfo | null>(null);
  const [panelMode, setPanelMode] = useState<"details" | "transfer">("details");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferPending, setTransferPending] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState("");

  // Drag state (HTML5 native)
  const [isDragging, setIsDragging] = useState(false);
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);
  const dragImageRef = useRef<HTMLDivElement>(null);

  const fetchWallet = useCallback(async (safeAddr: string, eoa?: string) => {
    if (!safeAddr) return;
    setLoading(true);
    setError("");
    try {
      let url = `/api/wallet?safe=${safeAddr}&type=operator&network=${network}`;
      if (eoa) url += `&eoa=${eoa}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to fetch");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [network]);

  useEffect(() => {
    const stored = getSafeAddress(network);
    if (stored) fetchWallet(stored, walletAddress ?? undefined);
  }, [fetchWallet, walletAddress, network]);

  // --- HTML5 Drag handlers ---

  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "usdt");
    if (dragImageRef.current) {
      e.dataTransfer.setDragImage(dragImageRef.current, 28, 28);
    }
    setIsDragging(true);
  };

  const onDragEnd = () => {
    setIsDragging(false);
    setHoverTarget(null);
  };

  const onAgentDragOver = (e: React.DragEvent, agentAddr: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setHoverTarget(agentAddr);
  };

  const onAgentDragLeave = () => {
    setHoverTarget(null);
  };

  const onAgentDrop = (e: React.DragEvent, agent: AgentSafeInfo) => {
    e.preventDefault();
    setIsDragging(false);
    setHoverTarget(null);
    setPanelAgent(agent);
    setPanelMode("transfer");
    setTransferAmount("");
    setTransferSuccess("");
    setPanelOpen(true);
  };

  // --- Panel handlers ---

  const openAgentPanel = (agent: AgentSafeInfo) => {
    setPanelAgent(agent);
    setPanelMode("details");
    setTransferSuccess("");
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setPanelAgent(null);
    setTransferAmount("");
    setTransferSuccess("");
  };

  // --- Transfer USDT ---

  const handleTransfer = async () => {
    if (!walletClient || !walletAddress || !panelAgent || !data) return;
    if (!transferAmount || parseFloat(transferAmount) <= 0) return;

    setTransferPending(true);
    setTransferSuccess("");
    setError("");
    try {
      const amount = parseUnits(transferAmount, 6);
      const tokenAddress = data.token as Address;
      const safeAddress = data.safe as Address;
      const agentSafe = panelAgent.agentSafe as Address;

      const transferData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [agentSafe, amount],
      });

      const sig = buildPreApprovedSig(walletAddress);
      const tx = await walletClient.writeContract({
        chain,
        account: walletAddress,
        gas: 500_000n,
        address: safeAddress,
        abi: SAFE_ABI,
        functionName: "execTransaction",
        args: [tokenAddress, 0n, transferData, 0, 0n, 0n, 0n, zeroAddress, zeroAddress, sig],
      });
      await publicClient.waitForTransactionReceipt({ hash: tx });

      setTransferSuccess(`Transferred ${transferAmount} USDT`);
      setTransferAmount("");
      const stored = getSafeAddress(network);
      if (stored) fetchWallet(stored, walletAddress ?? undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 200) : "Transfer failed");
    } finally {
      setTransferPending(false);
    }
  };

  // --- Helpers ---

  const formatResetPeriod = (minutes: number) => {
    if (minutes === 0) return "No reset";
    if (minutes < 60) return `${minutes}m`;
    if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
    return `${Math.round(minutes / 1440)}d`;
  };

  const pct = (spent: string, total: string) => {
    const s = parseFloat(spent);
    const t = parseFloat(total);
    if (t === 0) return 0;
    return Math.min(100, Math.round((s / t) * 100));
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const renderAllowanceBar = (agent: AgentAllowance) => {
    const usedPct = pct(agent.spent, agent.allowance);
    const isExhausted = parseFloat(agent.remaining) === 0 && parseFloat(agent.allowance) > 0;
    return (
      <div key={agent.address} className="card" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="mono" style={{ fontSize: 13 }}>
              {agent.address.slice(0, 6)}...{agent.address.slice(-4)}
            </div>
            <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              did:nexoid:eth:{agent.address.slice(0, 8)}...{agent.address.slice(-4)}
            </div>
          </div>
          <span className={`badge ${isExhausted ? "badge-revoked" : "badge-active"}`} style={{ flexShrink: 0, marginLeft: 8 }}>
            {isExhausted ? "Exhausted" : "Active"}
          </span>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
            <span>
              <span style={{ color: "var(--text-muted)" }}>Spent: </span>
              <span style={{ fontWeight: 600 }}>{parseFloat(agent.spent).toLocaleString()} USDT</span>
            </span>
            <span>
              <span style={{ color: "var(--text-muted)" }}>Limit: </span>
              <span style={{ fontWeight: 600 }}>{parseFloat(agent.allowance).toLocaleString()} USDT</span>
            </span>
          </div>
          <div style={{ width: "100%", height: 8, borderRadius: 4, background: "var(--bg)", overflow: "hidden" }}>
            <div
              style={{
                width: `${usedPct}%`,
                height: "100%",
                borderRadius: 4,
                background: usedPct >= 90 ? "var(--danger)" : usedPct >= 70 ? "var(--warning)" : "var(--success)",
                transition: "width 0.3s",
              }}
            />
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
            {usedPct}% used — {parseFloat(agent.remaining).toLocaleString()} USDT remaining
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--text-muted)" }}>
          <span>Reset: {formatResetPeriod(agent.resetTimeMin)}</span>
          <span>Nonce: {agent.nonce}</span>
        </div>
      </div>
    );
  };

  const hasAgentSafes = data?.agentSafes && data.agentSafes.length > 0;

  if (loading) return <div className="loading">Loading wallet data...</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Wallet & Allowances</h2>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {data && (
        <>
          {/* Balance cards */}
          <div className="stats-grid" style={{ marginBottom: 24 }}>
            {/* USDT card — draggable to agent Safes */}
            <div
              className={`stat-card ${hasAgentSafes ? "draggable-card" : ""}`}
              draggable={!!hasAgentSafes}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            >
              <div className="label">Operator USDT</div>
              <div className="value" style={{ color: "var(--success)" }}>
                {parseFloat(data.balances.usdt).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                Tether USD{hasAgentSafes ? " — drag to fund agent" : ""}
              </div>
            </div>

            <div className="stat-card">
              <div className="label">Operator ETH</div>
              <div className="value">
                {parseFloat(data.balances.eth).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Gas funding</div>
            </div>
            <div className="stat-card">
              <div className="label">Agent Safes</div>
              <div className="value">{data.agentSafes?.length ?? 0}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>NexoidModule</div>
            </div>
            <div className="stat-card">
              <div className="label">Operator Safe</div>
              <div className="mono" style={{ fontSize: 13, marginTop: 8 }}>
                {data.safe.slice(0, 6)}...{data.safe.slice(-4)}
              </div>
            </div>
          </div>

          {/* Agent Safe cards — clickable + drop targets */}
          {hasAgentSafes && (
            <>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Agent Safes</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16, marginBottom: 24 }}>
                {data.agentSafes!.map((agentSafe) => (
                  <div
                    key={agentSafe.agentSafe}
                    className={`card drop-target ${isDragging ? (hoverTarget === agentSafe.agentSafe ? "drop-target-hover" : "drop-target-active") : ""}`}
                    style={{ padding: 20, cursor: "pointer" }}
                    onClick={() => openAgentPanel(agentSafe)}
                    onDragOver={(e) => onAgentDragOver(e, agentSafe.agentSafe)}
                    onDragLeave={onAgentDragLeave}
                    onDrop={(e) => onAgentDrop(e, agentSafe)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="mono" style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {agentSafe.did.replace(/^(did:nexoid:eth:0x[a-fA-F0-9]{8}).*([a-fA-F0-9]{4})$/, "$1...$2")}
                        </div>
                        <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                          Safe: {agentSafe.agentSafe.slice(0, 6)}...{agentSafe.agentSafe.slice(-4)}
                        </div>
                        <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>
                          EOA: {agentSafe.agentEOA.slice(0, 6)}...{agentSafe.agentEOA.slice(-4)}
                        </div>
                      </div>
                      <span className="badge badge-active" style={{ flexShrink: 0, marginLeft: 8 }}>Active</span>
                    </div>
                    <div style={{ display: "flex", gap: 16, fontSize: 13, marginBottom: 12 }}>
                      <span>
                        <span style={{ color: "var(--text-muted)" }}>USDT: </span>
                        <span style={{ fontWeight: 600, color: "var(--success)" }}>
                          {parseFloat(agentSafe.balances.usdt).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </span>
                      <span>
                        <span style={{ color: "var(--text-muted)" }}>ETH: </span>
                        <span style={{ fontWeight: 600 }}>
                          {parseFloat(agentSafe.balances.eth).toLocaleString(undefined, { minimumFractionDigits: 4 })}
                        </span>
                      </span>
                    </div>
                    {agentSafe.delegates.length > 0 && (
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {agentSafe.delegates.length} delegate(s) with allowances
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Direct Allowances */}
          {data.agents.length > 0 && (
            <>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Direct Allowances</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16 }}>
                {data.agents.map(renderAllowanceBar)}
              </div>
            </>
          )}

          {data.agents.length === 0 && !hasAgentSafes && (
            <div className="empty-state">
              <h3>No agents</h3>
              <p>No agent Safes or delegates have been configured.</p>
            </div>
          )}
        </>
      )}

      {!data && !loading && !error && (
        <div className="empty-state">
          <h3>No Safe configured</h3>
          <p>Go to <a href="/settings" style={{ color: "var(--accent)" }}>Settings</a> to configure your Safe address, or complete <a href="/onboarding" style={{ color: "var(--accent)" }}>Setup</a> to deploy one.</p>
        </div>
      )}

      {/* Hidden drag image for custom cursor */}
      <div
        ref={dragImageRef}
        style={{
          position: "fixed", top: -200, left: -200,
          width: 56, height: 56, borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(52, 211, 153, 0.3)", border: "2px solid #34d399",
          color: "#34d399", fontSize: 10, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.06em",
        }}
      >
        USDT
      </div>

      {/* Agent details / transfer panel */}
      <SlidePanel
        isOpen={panelOpen}
        onClose={closePanel}
        title={panelMode === "transfer" ? "Transfer USDT" : "Agent Safe Details"}
      >
        {panelAgent && panelMode === "details" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>DID</div>
              <div className="mono" style={{ fontSize: 13, wordBreak: "break-all", marginBottom: 8 }}>{panelAgent.did}</div>
              <button className="btn btn-sm" onClick={() => copyText(panelAgent.did)} style={{ fontSize: 11 }}>Copy DID</button>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Agent Safe Address</div>
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
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>USDT Balance</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--success)" }}>
                  {parseFloat(panelAgent.balances.usdt).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>ETH Balance</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>
                  {parseFloat(panelAgent.balances.eth).toLocaleString(undefined, { minimumFractionDigits: 4 })}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Created</div>
              <div style={{ fontSize: 13 }}>
                {panelAgent.createdAt ? new Date(panelAgent.createdAt * 1000).toLocaleString() : "Unknown"}
              </div>
            </div>

            {panelAgent.delegates.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Delegates ({panelAgent.delegates.length})</div>
                {panelAgent.delegates.map((d) => {
                  const usedP = pct(d.spent, d.allowance);
                  return (
                    <div key={d.address} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                      <div className="mono" style={{ fontSize: 12, marginBottom: 4 }}>{d.address}</div>
                      <div style={{ width: "100%", height: 6, borderRadius: 3, background: "var(--bg)", overflow: "hidden", marginBottom: 4 }}>
                        <div style={{
                          width: `${usedP}%`, height: "100%", borderRadius: 3,
                          background: usedP >= 90 ? "var(--danger)" : usedP >= 70 ? "var(--warning)" : "var(--success)",
                        }} />
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {parseFloat(d.spent).toLocaleString()} / {parseFloat(d.allowance).toLocaleString()} USDT
                        — {parseFloat(d.remaining).toLocaleString()} remaining
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              className="btn btn-primary"
              style={{ width: "100%" }}
              onClick={() => {
                setPanelMode("transfer");
                setTransferAmount("");
                setTransferSuccess("");
              }}
            >
              Transfer USDT to this Safe
            </button>
          </div>
        )}

        {panelAgent && panelMode === "transfer" && (
          <div>
            <div style={{ marginBottom: 16, padding: 16, background: "var(--bg-input)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>From</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Operator Safe</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Balance</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--success)" }}>
                    {data ? parseFloat(data.balances.usdt).toLocaleString(undefined, { minimumFractionDigits: 2 }) : "—"} USDT
                  </div>
                </div>
              </div>
              <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>{data?.safe}</div>
            </div>

            <div style={{ textAlign: "center", padding: "4px 0", color: "var(--text-muted)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <polyline points="19 12 12 19 5 12" />
              </svg>
            </div>

            <div style={{ marginBottom: 20, padding: 16, background: "var(--bg-input)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>To</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Agent Safe</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Balance</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--success)" }}>
                    {parseFloat(panelAgent.balances.usdt).toLocaleString(undefined, { minimumFractionDigits: 2 })} USDT
                  </div>
                </div>
              </div>
              <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>{panelAgent.agentSafe}</div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>Amount (USDT)</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="number"
                  placeholder="0.00"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  style={{ flex: 1 }}
                  step="0.01"
                  min="0"
                />
                <button className="btn btn-sm" onClick={() => data && setTransferAmount(data.balances.usdt)}>Max</button>
              </div>
            </div>

            {transferSuccess && (
              <div style={{ marginBottom: 16, padding: 12, background: "var(--success-soft)", border: "1px solid rgba(52, 211, 153, 0.2)", borderRadius: "var(--radius-sm)", color: "var(--success)", fontSize: 13 }}>
                {transferSuccess}
              </div>
            )}

            <button
              className="btn btn-primary"
              style={{ width: "100%" }}
              onClick={handleTransfer}
              disabled={transferPending || !transferAmount || parseFloat(transferAmount) <= 0}
            >
              {transferPending ? "Transferring..." : `Transfer ${transferAmount || "0"} USDT`}
            </button>

            <button className="btn" style={{ width: "100%", marginTop: 8 }} onClick={() => setPanelMode("details")}>
              Back to Details
            </button>
          </div>
        )}
      </SlidePanel>
    </div>
  );
}
