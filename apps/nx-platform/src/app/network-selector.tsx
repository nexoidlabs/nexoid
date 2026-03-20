"use client";

import { useWallet, NETWORKS, type NetworkName } from "@/lib/wallet";
import { useState, useRef, useEffect } from "react";

const NETWORK_COLORS: Record<NetworkName, string> = {
  ethereum: "#627eea",
  sepolia: "#f6c343",
  hardhat: "#e8e288",
};

export function NetworkSelector() {
  const { network, switchNetwork } = useWallet();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const current = NETWORKS.find((n) => n.name === network)!;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className="btn"
        onClick={() => setOpen(!open)}
        style={{ display: "flex", alignItems: "center", gap: "8px" }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: NETWORK_COLORS[network],
          }}
        />
        {current.label}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="network-dropdown">
          {NETWORKS.map((n) => (
            <button
              key={n.name}
              className={`network-dropdown-item ${n.name === network ? "active" : ""}`}
              onClick={() => {
                switchNetwork(n.name);
                setOpen(false);
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: NETWORK_COLORS[n.name],
                  flexShrink: 0,
                }}
              />
              {n.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
