"use client";

import { useWallet } from "@/lib/wallet";

export function WalletButton() {
  const { address, connecting, connect, disconnect } = useWallet();

  if (address) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          className="mono"
          style={{ fontSize: "13px", color: "var(--success)" }}
        >
          {address.slice(0, 6)}...{address.slice(-4)}
        </span>
        <button className="btn" onClick={disconnect} style={{ padding: "4px 10px", fontSize: "12px" }}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button className="btn btn-primary" onClick={connect} disabled={connecting}>
      {connecting ? "Connecting..." : "Connect Wallet"}
    </button>
  );
}
