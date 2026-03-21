// Centralized typed localStorage persistence for Nexoid platform
// All keys use `nexoid-` prefix with hyphens

const KEYS = {
  safeAddress: "nexoid-safe-address",
  linkedDids: "nexoid-linked-dids",
  agents: "nexoid-agents",
} as const;

// --- Types ---

export interface LinkedDid {
  did: string;
  address: string;
  entityType: string;
  linkedAt: number; // unix ms
}

export interface StoredAgent {
  address: string;
  safeAddress?: string;
  label: string;
  mnemonic?: string;
  mnemonicIndex?: number;
  createdAt: number; // unix ms
}

// --- Safe Address ---

export function getSafeAddress(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEYS.safeAddress) || null;
}

export function setSafeAddress(address: string): void {
  localStorage.setItem(KEYS.safeAddress, address);
}

export function clearSafeAddress(): void {
  localStorage.removeItem(KEYS.safeAddress);
}

// --- Linked DIDs ---

export function getLinkedDids(): LinkedDid[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEYS.linkedDids);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addLinkedDid(did: LinkedDid): void {
  const dids = getLinkedDids().filter((d) => d.did !== did.did);
  dids.push(did);
  localStorage.setItem(KEYS.linkedDids, JSON.stringify(dids));
}

export function removeLinkedDid(did: string): void {
  const dids = getLinkedDids().filter((d) => d.did !== did);
  localStorage.setItem(KEYS.linkedDids, JSON.stringify(dids));
}

// --- Agents ---

export function getStoredAgents(): StoredAgent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEYS.agents);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addStoredAgent(agent: StoredAgent): void {
  const agents = getStoredAgents().filter(
    (a) => a.address.toLowerCase() !== agent.address.toLowerCase()
  );
  agents.push(agent);
  localStorage.setItem(KEYS.agents, JSON.stringify(agents));
}

export function removeStoredAgent(address: string): void {
  const agents = getStoredAgents().filter(
    (a) => a.address.toLowerCase() !== address.toLowerCase()
  );
  localStorage.setItem(KEYS.agents, JSON.stringify(agents));
}
