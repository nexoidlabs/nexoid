"use client";

import { useState, useEffect } from "react";
import { getSafeAddress, setSafeAddress as storeSafeAddress, clearSafeAddress } from "@/lib/storage";

export default function SettingsPage() {
  const [safeAddress, setSafeAddress] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = getSafeAddress();
    if (stored) setSafeAddress(stored);
  }, []);

  const handleSave = () => {
    if (!safeAddress) return;
    storeSafeAddress(safeAddress);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleClear = () => {
    clearSafeAddress();
    setSafeAddress("");
    setSaved(false);
  };

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24 }}>Settings</h2>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Operator Safe Address</h3>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 16 }}>
          Configure your Safe&#123;Wallet&#125; address. This is used across the platform to load your wallet balances, agents, and delegations.
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          <input
            type="text"
            placeholder="0x..."
            value={safeAddress}
            onChange={(e) => { setSafeAddress(e.target.value); setSaved(false); }}
            style={{ flex: 1 }}
            className="mono"
          />
          <button className="btn btn-primary" onClick={handleSave} disabled={!safeAddress}>
            {saved ? "Saved" : "Save"}
          </button>
          {safeAddress && (
            <button className="btn btn-danger" onClick={handleClear}>Clear</button>
          )}
        </div>
        {saved && (
          <div style={{ marginTop: 12, fontSize: 13, color: "var(--success)" }}>
            Safe address saved successfully.
          </div>
        )}
      </div>
    </div>
  );
}
