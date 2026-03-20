"use client";

import { useState, useCallback } from "react";

interface AgentAllowance {
  address: string;
  did: string;
  allowance: string;
  spent: string;
  remaining: string;
  resetTimeMin: number;
  nonce: number;
}

interface WalletData {
  safe: string;
  token: string;
  balances: {
    eth: string;
    usdt: string;
  };
  agents: AgentAllowance[];
}

export default function WalletPage() {
  const [safeAddress, setSafeAddress] = useState(
    () => (typeof window !== "undefined" && localStorage.getItem("nexoid_safe_address")) || ""
  );
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchWallet = useCallback(async (address?: string) => {
    const addr = address ?? safeAddress;
    if (!addr) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/wallet?safe=${addr}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to fetch");
      setData(json);
      localStorage.setItem("nexoid_safe_address", addr);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [safeAddress]);

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

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Wallet & Allowances</h2>
      </div>

      {/* Safe address input */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <input
            type="text"
            placeholder="Safe address (0x...)"
            value={safeAddress}
            onChange={(e) => setSafeAddress(e.target.value)}
            style={{ flex: 1 }}
            className="mono"
          />
          <button className="btn btn-primary" onClick={() => fetchWallet()} disabled={loading || !safeAddress}>
            {loading ? "Loading..." : "Load Wallet"}
          </button>
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {data && (
        <>
          {/* Balance cards */}
          <div className="stats-grid" style={{ marginBottom: 24 }}>
            <div className="stat-card">
              <div className="label">USDT Balance</div>
              <div className="value" style={{ color: "var(--success)" }}>
                {parseFloat(data.balances.usdt).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Tether USD</div>
            </div>
            <div className="stat-card">
              <div className="label">ETH Balance</div>
              <div className="value">
                {parseFloat(data.balances.eth).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Gas funding</div>
            </div>
            <div className="stat-card">
              <div className="label">Agent Delegates</div>
              <div className="value">{data.agents.length}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>AllowanceModule</div>
            </div>
            <div className="stat-card">
              <div className="label">Safe Address</div>
              <div className="mono" style={{ fontSize: 13, wordBreak: "break-all", marginTop: 8 }}>
                {data.safe}
              </div>
            </div>
          </div>

          {/* Agent allowance cards */}
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Agent Allowances</h3>

          {data.agents.length === 0 ? (
            <div className="empty-state">
              <h3>No delegates</h3>
              <p>No agents have been added as delegates on this Safe.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16 }}>
              {data.agents.map((agent) => {
                const usedPct = pct(agent.spent, agent.allowance);
                const isExhausted = parseFloat(agent.remaining) === 0 && parseFloat(agent.allowance) > 0;
                return (
                  <div key={agent.address} className="card" style={{ padding: 20 }}>
                    {/* Agent header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div>
                        <div className="mono" style={{ fontSize: 13 }}>
                          {agent.address.slice(0, 6)}...{agent.address.slice(-4)}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                          {agent.did}
                        </div>
                      </div>
                      <span className={`badge ${isExhausted ? "badge-revoked" : "badge-active"}`}>
                        {isExhausted ? "Exhausted" : "Active"}
                      </span>
                    </div>

                    {/* Allowance bar */}
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
                      <div
                        style={{
                          width: "100%",
                          height: 8,
                          borderRadius: 4,
                          background: "var(--bg)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${usedPct}%`,
                            height: "100%",
                            borderRadius: 4,
                            background:
                              usedPct >= 90
                                ? "var(--danger)"
                                : usedPct >= 70
                                  ? "var(--warning)"
                                  : "var(--success)",
                            transition: "width 0.3s",
                          }}
                        />
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                        {usedPct}% used — {parseFloat(agent.remaining).toLocaleString()} USDT remaining
                      </div>
                    </div>

                    {/* Details */}
                    <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--text-muted)" }}>
                      <span>Reset: {formatResetPeriod(agent.resetTimeMin)}</span>
                      <span>Nonce: {agent.nonce}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {!data && !loading && !error && (
        <div className="empty-state">
          <h3>Enter a Safe address</h3>
          <p>Enter your Safe{"{Wallet}"} address above to view balances and agent allowances.</p>
        </div>
      )}
    </div>
  );
}
