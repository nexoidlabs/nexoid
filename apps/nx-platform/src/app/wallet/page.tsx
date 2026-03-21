"use client";

import { useState, useCallback, useEffect } from "react";
import { useWallet } from "@/lib/wallet";
import { getSafeAddress } from "@/lib/storage";

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

export default function WalletPage() {
  const { address: walletAddress } = useWallet();
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchWallet = useCallback(async (safeAddr: string, eoa?: string) => {
    if (!safeAddr) return;
    setLoading(true);
    setError("");
    try {
      let url = `/api/wallet?safe=${safeAddr}&type=operator`;
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
  }, []);

  useEffect(() => {
    const stored = getSafeAddress();
    if (stored) fetchWallet(stored, walletAddress ?? undefined);
  }, [fetchWallet, walletAddress]);

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
            <div className="stat-card">
              <div className="label">Operator USDT</div>
              <div className="value" style={{ color: "var(--success)" }}>
                {parseFloat(data.balances.usdt).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Tether USD</div>
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

          {/* Agent Safe cards */}
          {data.agentSafes && data.agentSafes.length > 0 && (
            <>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Agent Safes</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16, marginBottom: 24 }}>
                {data.agentSafes.map((agentSafe) => (
                  <div key={agentSafe.agentSafe} className="card" style={{ padding: 20 }}>
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

          {/* Allowances set directly on the operator Safe (legacy or direct grants) */}
          {data.agents.length > 0 && (
            <>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Direct Allowances</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16 }}>
                {data.agents.map(renderAllowanceBar)}
              </div>
            </>
          )}

          {data.agents.length === 0 && (!data.agentSafes || data.agentSafes.length === 0) && (
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
    </div>
  );
}
