"use client";

import { useEffect, useState } from "react";

interface Identity {
  address: string;
  entityType: string;
  status: string;
  createdAt: number;
  owner: string;
  did: string;
}

interface Delegation {
  id: number;
  issuer: string;
  subject: string;
  status: string;
  chainValid: boolean;
  delegationDepth: number;
}

export default function Dashboard() {
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/identities").then((r) => r.json()),
      fetch("/api/delegations").then((r) => r.json()),
    ])
      .then(([idData, delData]) => {
        setIdentities(idData.identities ?? []);
        setDelegations(delData.delegations ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const humans = identities.filter((i) => i.entityType === "Human").length;
  const agents = identities.filter(
    (i) => i.entityType === "VirtualAgent" || i.entityType === "PhysicalAgent"
  ).length;
  const orgs = identities.filter((i) => i.entityType === "Organization").length;
  const activeIds = identities.filter((i) => i.status === "Active").length;
  const activeDelegations = delegations.filter(
    (d) => d.status === "Active" && d.chainValid
  ).length;

  if (loading) return <div className="loading">Loading registry data...</div>;
  if (error) return <div className="error-msg">{error}</div>;

  return (
    <div>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="label">Total Identities</div>
          <div className="value">{identities.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">Active</div>
          <div className="value" style={{ color: "var(--success)" }}>
            {activeIds}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Delegations</div>
          <div className="value">{delegations.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">Valid Delegations</div>
          <div className="value" style={{ color: "var(--success)" }}>
            {activeDelegations}
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="label">Humans</div>
          <div className="value">{humans}</div>
        </div>
        <div className="stat-card">
          <div className="label">Agents</div>
          <div className="value">{agents}</div>
        </div>
        <div className="stat-card">
          <div className="label">Organizations</div>
          <div className="value">{orgs}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        <div className="card">
          <h3 style={{ marginBottom: "16px" }}>
            Recent Identities{" "}
            <a href="/identities" style={{ fontSize: "13px", fontWeight: 400 }}>
              View all
            </a>
          </h3>
          {identities.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>No identities registered yet.</p>
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
          <h3 style={{ marginBottom: "16px" }}>
            Recent Delegations{" "}
            <a href="/delegations" style={{ fontSize: "13px", fontWeight: 400 }}>
              View all
            </a>
          </h3>
          {delegations.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>No delegations created yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Issuer</th>
                  <th>Subject</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {delegations.slice(0, 5).map((d) => (
                  <tr key={d.id}>
                    <td className="mono">#{d.id}</td>
                    <td className="mono">
                      {d.issuer.slice(0, 6)}...{d.issuer.slice(-4)}
                    </td>
                    <td className="mono">
                      {d.subject.slice(0, 6)}...{d.subject.slice(-4)}
                    </td>
                    <td>
                      <span className={`badge badge-${d.status.toLowerCase()}`}>
                        {d.chainValid ? d.status : "Invalid"}
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
