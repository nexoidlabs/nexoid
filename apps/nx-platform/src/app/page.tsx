"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/lib/wallet";

interface Identity {
  address: string;
  entityType: string;
  status: string;
  createdAt: number;
  owner: string;
  did: string;
}

interface AgentRecord {
  agentSafe: string;
  agentEOA: string;
  status: number;
  statusName: string;
  validUntil: number;
}

function ScoreRing({
  value,
  max,
  label,
  desc,
  color,
}: {
  value: number;
  max: number;
  label: string;
  desc: string;
  color: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const r = 26;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <div className="score-ring">
      <div className="score-ring-visual">
        <svg viewBox="0 0 64 64">
          <circle className="ring-bg" cx="32" cy="32" r={r} />
          <circle
            className="ring-fill"
            cx="32"
            cy="32"
            r={r}
            stroke={color}
            strokeDasharray={circ}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="score-ring-value" style={{ color }}>{pct}</div>
      </div>
      <div className="score-ring-info">
        <div className="score-ring-label">{label}</div>
        <div className="score-ring-desc">{desc}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { network } = useWallet();
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [delegations, setDelegations] = useState<AgentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/identities?network=${network}`).then((r) => r.json()),
      fetch(`/api/delegations?network=${network}`).then((r) => r.json()),
    ])
      .then(([idData, delData]) => {
        setIdentities(idData.identities ?? []);
        setDelegations(delData.agents ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [network]);

  const humans = identities.filter((i) => i.entityType === "Human").length;
  const agents = identities.filter(
    (i) => i.entityType === "VirtualAgent" || i.entityType === "PhysicalAgent"
  ).length;
  const orgs = identities.filter((i) => i.entityType === "Organization").length;
  const activeIds = identities.filter((i) => i.status === "Active").length;
  const validAgents = delegations.filter(
    (d) => d.status === 0 && (d.validUntil === 0 || d.validUntil > Date.now() / 1000)
  ).length;

  if (loading) return <div className="loading">Loading registry data...</div>;
  if (error) return <div className="error-msg">{error}</div>;

  return (
    <div>
      {/* Score Rings */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px", marginBottom: "28px" }}>
        <ScoreRing
          value={activeIds}
          max={Math.max(identities.length, 1)}
          label="Identity Health"
          desc={`${activeIds} of ${identities.length} active`}
          color="var(--success)"
        />
        <ScoreRing
          value={validAgents}
          max={Math.max(delegations.length, 1)}
          label="Agent Validity"
          desc={`${validAgents} of ${delegations.length} valid`}
          color="var(--accent)"
        />
        <ScoreRing
          value={agents}
          max={Math.max(identities.length, 1)}
          label="Agent Ratio"
          desc={`${agents} agents registered`}
          color="var(--cyan)"
        />
      </div>

      {/* Stat Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div className="label">Total Identities</div>
          <div className="value">{identities.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "var(--success-soft)", color: "var(--success)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <div className="label">Active</div>
          <div className="value" style={{ color: "var(--success)" }}>{activeIds}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "var(--cyan-soft)", color: "var(--cyan)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          </div>
          <div className="label">Agent Scopes</div>
          <div className="value">{delegations.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "var(--purple-soft)", color: "var(--purple)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <div className="label">Valid Agents</div>
          <div className="value" style={{ color: "var(--success)" }}>{validAgents}</div>
        </div>
      </div>

      {/* Entity Breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "28px" }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="7" r="4"/><path d="M5.5 21a8.38 8.38 0 0 1 13 0"/></svg>
          </div>
          <div className="label">Humans</div>
          <div className="value">{humans}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "var(--cyan-soft)", color: "var(--cyan)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="12" cy="11" r="3"/><path d="M7 16h10"/></svg>
          </div>
          <div className="label">Agents</div>
          <div className="value">{agents}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "var(--purple-soft)", color: "var(--purple)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-4h6v4"/></svg>
          </div>
          <div className="label">Organizations</div>
          <div className="value">{orgs}</div>
        </div>
      </div>

      {/* Tables */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Recent Identities</div>
              <div className="card-subtitle">{identities.length} total registered</div>
            </div>
            <a href="/identities" className="btn btn-sm">View all</a>
          </div>
          {identities.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>No identities registered yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Address</th>
                  <th>Type</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {identities.slice(0, 5).map((id) => (
                  <tr key={id.address}>
                    <td className="mono">
                      {id.address.slice(0, 6)}...{id.address.slice(-4)}
                    </td>
                    <td>
                      <span className={`badge badge-${id.entityType === "Human" ? "human" : id.entityType === "Organization" ? "org" : "agent"}`}>
                        {id.entityType}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${id.status.toLowerCase()}`}>
                        {id.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Recent Agents</div>
              <div className="card-subtitle">{delegations.length} total registered</div>
            </div>
            <a href="/delegations" className="btn btn-sm">View all</a>
          </div>
          {delegations.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>No agents registered yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Agent Safe</th>
                  <th>Agent EOA</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {delegations.slice(0, 5).map((d) => (
                  <tr key={d.agentSafe}>
                    <td className="mono">
                      {d.agentSafe.slice(0, 6)}...{d.agentSafe.slice(-4)}
                    </td>
                    <td className="mono">
                      {d.agentEOA.slice(0, 6)}...{d.agentEOA.slice(-4)}
                    </td>
                    <td>
                      <span className={`badge badge-${d.statusName.toLowerCase()}`}>
                        {d.status === 0 && (d.validUntil === 0 || d.validUntil > Date.now() / 1000) ? d.statusName : "Invalid"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
