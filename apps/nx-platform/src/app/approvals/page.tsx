"use client";

import { useEffect, useState, useCallback } from "react";

interface PendingApproval {
  id: string;
  agentDid: string;
  requestedAmount: string;
  reason: string;
  timestamp: number;
  status: "pending" | "approved" | "denied";
}

export default function ApprovalsPage() {
  const [requests, setRequests] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/approvals");
      const data = await res.json();
      setRequests(data.requests ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
    // Poll every 5 seconds for new requests
    const interval = setInterval(fetchRequests, 5000);
    return () => clearInterval(interval);
  }, [fetchRequests]);

  const handleAction = async (id: string, action: "approve" | "deny") => {
    setActioning(id);
    try {
      await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      await fetchRequests();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActioning(null);
    }
  };

  const pending = requests.filter((r) => r.status === "pending");
  const resolved = requests.filter((r) => r.status !== "pending");

  if (loading) return <div className="loading">Loading requests...</div>;
  if (error) return <div className="error-msg">{error}</div>;

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Pending Approvals</h2>

      {pending.length === 0 ? (
        <div className="card">
          <p style={{ color: "var(--text-muted)" }}>No pending fund requests.</p>
        </div>
      ) : (
        pending.map((r) => (
          <div key={r.id} className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>
                  Agent: <span className="mono">{r.agentDid}</span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>
                  {r.requestedAmount} USDT
                </div>
                <div style={{ fontSize: 14, color: "var(--text-muted)" }}>
                  {r.reason}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                  {new Date(r.timestamp).toLocaleString()}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => handleAction(r.id, "approve")}
                  disabled={actioning === r.id}
                  style={{
                    background: "var(--success)",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    padding: "8px 16px",
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  Approve
                </button>
                <button
                  onClick={() => handleAction(r.id, "deny")}
                  disabled={actioning === r.id}
                  style={{
                    background: "var(--danger)",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    padding: "8px 16px",
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  Deny
                </button>
              </div>
            </div>
          </div>
        ))
      )}

      {resolved.length > 0 && (
        <>
          <h3 style={{ marginTop: 24, marginBottom: 12, color: "var(--text-muted)" }}>
            History
          </h3>
          {resolved.map((r) => (
            <div key={r.id} className="card" style={{ marginBottom: 8, opacity: 0.6 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <span className="mono" style={{ fontSize: 13 }}>{r.agentDid.slice(0, 30)}...</span>
                  {" "}{r.requestedAmount} USDT — {r.reason}
                </div>
                <span className={`badge badge-${r.status === "approved" ? "active" : "revoked"}`}>
                  {r.status}
                </span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
