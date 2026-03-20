"use client";

import { useState } from "react";
import { verifyTypedData } from "viem";

const IDENTITY_PROOF_TYPES = {
  IdentityProof: [
    { name: "agent", type: "address" },
    { name: "delegationId", type: "uint256" },
    { name: "nonce", type: "bytes32" },
    { name: "timestamp", type: "uint256" },
    { name: "verifier", type: "address" },
  ],
} as const;

interface VerificationResult {
  valid: boolean;
  agent: string;
  delegationId: string;
  timestamp: string;
  verifier: string;
  expired: boolean;
}

export default function VerifyPage() {
  const [proofJson, setProofJson] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    if (!proofJson.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = JSON.parse(proofJson);
      if (!data.proof || !data.signature || !data.domain) {
        throw new Error("Missing required fields: proof, signature, domain");
      }
      if (!data.proof.agent || !data.proof.delegationId || !data.proof.nonce || !data.proof.timestamp || !data.proof.verifier) {
        throw new Error("Missing proof fields: agent, delegationId, nonce, timestamp, verifier");
      }

      const valid = await verifyTypedData({
        address: data.proof.agent as `0x${string}`,
        domain: data.domain,
        types: IDENTITY_PROOF_TYPES,
        primaryType: "IdentityProof",
        message: {
          agent: data.proof.agent,
          delegationId: BigInt(data.proof.delegationId),
          nonce: data.proof.nonce,
          timestamp: BigInt(data.proof.timestamp),
          verifier: data.proof.verifier,
        },
        signature: data.signature as `0x${string}`,
      });

      const proofTimestamp = Number(data.proof.timestamp);
      const now = Math.floor(Date.now() / 1000);
      const expired = now - proofTimestamp > 300; // 5 minute expiry

      setResult({
        valid,
        agent: data.proof.agent,
        delegationId: data.proof.delegationId,
        timestamp: new Date(proofTimestamp * 1000).toISOString(),
        verifier: data.proof.verifier,
        expired,
      });
    } catch (e) {
      setError(`Invalid proof: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Verify Identity Proof</h3>
        <p style={{ color: "var(--text-muted)", marginBottom: 16, fontSize: 14 }}>
          Paste the signed EIP-712 identity proof JSON below to verify it.
        </p>
        <textarea
          placeholder='{"proof":{"agent":"0x...","delegationId":"1",...},"signature":"0x...","domain":{...}}'
          value={proofJson}
          onChange={(e) => setProofJson(e.target.value)}
        />
        <div style={{ marginTop: 12 }}>
          <button className="btn" onClick={handleVerify} disabled={loading}>
            {loading ? "Verifying..." : "Verify Proof"}
          </button>
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {result && (
        <div className={`card ${result.valid && !result.expired ? "result-valid" : "result-invalid"}`}>
          <h3 style={{ marginBottom: 16 }}>
            {result.valid && !result.expired ? "Valid Proof" : result.valid && result.expired ? "Expired Proof" : "Invalid Proof"}
          </h3>

          <div className="field">
            <div className="label">Signature Valid</div>
            <div className="value">
              <span className={`badge ${result.valid ? "badge-active" : "badge-revoked"}`}>
                {result.valid ? "Yes" : "No"}
              </span>
            </div>
          </div>

          <div className="field">
            <div className="label">Expired</div>
            <div className="value">
              <span className={`badge ${result.expired ? "badge-revoked" : "badge-active"}`}>
                {result.expired ? "Yes (>5min)" : "No"}
              </span>
            </div>
          </div>

          <div className="field">
            <div className="label">Agent</div>
            <div className="value mono">{result.agent}</div>
          </div>

          <div className="field">
            <div className="label">Delegation ID</div>
            <div className="value mono">{result.delegationId}</div>
          </div>

          <div className="field">
            <div className="label">Timestamp</div>
            <div className="value">{result.timestamp}</div>
          </div>

          <div className="field">
            <div className="label">Verifier</div>
            <div className="value mono">{result.verifier}</div>
          </div>

          {result.valid && !result.expired && (
            <p style={{ marginTop: 16, color: "var(--text-muted)", fontSize: 13 }}>
              This proof confirms that the agent at {result.agent.slice(0, 8)}... signed
              this message with delegation #{result.delegationId}.{" "}
              <a href={`/?q=${result.agent}`} style={{ color: "var(--accent)" }}>
                Look up agent identity
              </a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
