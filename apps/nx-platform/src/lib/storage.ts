// Centralized typed localStorage persistence for Nexoid platform
// All keys use `nexoid-` prefix with hyphens, scoped by network

function getKeys(network: string) {
  return {
    safeAddress: `nexoid-safe-address-${network}`,
    linkedDids: `nexoid-linked-dids-${network}`,
    agents: `nexoid-agents-${network}`,
  };
}

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

export function getSafeAddress(network: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(getKeys(network).safeAddress) || null;
}

export function setSafeAddress(address: string, network: string): void {
  localStorage.setItem(getKeys(network).safeAddress, address);
}

export function clearSafeAddress(network: string): void {
  localStorage.removeItem(getKeys(network).safeAddress);
}

// --- Linked DIDs ---

export function getLinkedDids(network: string): LinkedDid[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getKeys(network).linkedDids);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addLinkedDid(did: LinkedDid, network: string): void {
  const dids = getLinkedDids(network).filter((d) => d.did !== did.did);
  dids.push(did);
  localStorage.setItem(getKeys(network).linkedDids, JSON.stringify(dids));
}

export function removeLinkedDid(did: string, network: string): void {
  const dids = getLinkedDids(network).filter((d) => d.did !== did);
  localStorage.setItem(getKeys(network).linkedDids, JSON.stringify(dids));
}

// --- Agents ---

export function getStoredAgents(network: string): StoredAgent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getKeys(network).agents);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addStoredAgent(agent: StoredAgent, network: string): void {
  const agents = getStoredAgents(network).filter(
    (a) => a.address.toLowerCase() !== agent.address.toLowerCase()
  );
  agents.push(agent);
  localStorage.setItem(getKeys(network).agents, JSON.stringify(agents));
}

export function removeStoredAgent(address: string, network: string): void {
  const agents = getStoredAgents(network).filter(
    (a) => a.address.toLowerCase() !== address.toLowerCase()
  );
  localStorage.setItem(getKeys(network).agents, JSON.stringify(agents));
}
