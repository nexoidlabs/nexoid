"use client";

import { useState } from "react";

interface IdentityResult {
  address: string;
  did: string;
  entityType: string;
  status: string;
  createdAt: number;
  owner: string;
  ownerDid?: string;
}

const ENTITY_TYPES = ["Human", "VirtualAgent", "PhysicalAgent", "Organization"];
const ENTITY_STATUSES = ["Active", "Suspended", "Revoked"];

export default function LookupPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IdentityResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Extract address from DID or use directly
      let address = query.trim();
      if (address.startsWith("did:nexoid:eth:")) {
        address = address.split(":")[3];
      }

      const res = await fetch(`/api/identity?address=${address}`);
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else if (!data.registered) {
        setError("Address not registered in Nexoid Identity Registry.");
      } else {
        setResult(data.identity);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="search-box">
        <input
          type="text"
          placeholder="Enter DID (did:nexoid:eth:0x...) or Ethereum address (0x...)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <button onClick={handleSearch} disabled={loading}>
          {loading ? "..." : "Lookup"}
        </button>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {result && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Identity Card</h3>

          <div className="field">
            <div className="label">DID</div>
            <div className="value mono">{result.did}</div>
          </div>

          <div className="field">
            <div className="label">Address</div>
            <div className="value mono">{result.address}</div>
          </div>

          <div className="field">
            <div className="label">Type</div>
            <div className="value">
              <span className={`badge badge-${result.entityType === "Human" ? "human" : result.entityType === "Organization" ? "org" : "agent"}`}>
                {result.entityType}
              </span>
            </div>
          </div>

          <div className="field">
            <div className="label">Status</div>
            <div className="value">
              <span className={`badge badge-${result.status.toLowerCase()}`}>
                {result.status}
              </span>
            </div>
          </div>

          <div className="field">
            <div className="label">Created</div>
            <div className="value">
              {result.createdAt > 0
                ? new Date(result.createdAt * 1000).toISOString()
                : "N/A"}
            </div>
          </div>

          {result.owner !== result.address && (
            <div className="field">
              <div className="label">Owner (Operator)</div>
              <div className="value mono">{result.owner}</div>
              {result.ownerDid && (
                <div className="value mono" style={{ color: "var(--text-muted)", fontSize: 12 }}>
                  {result.ownerDid}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
