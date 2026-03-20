"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  type ReactNode,
} from "react";
import {
  createWalletClient,
  createPublicClient,
  custom,
  http,
  type WalletClient,
  type PublicClient,
  type Address,
  type Chain,
} from "viem";
import { mainnet, sepolia, hardhat } from "viem/chains";

export type NetworkName = "ethereum" | "sepolia" | "hardhat";

const CHAIN_MAP: Record<NetworkName, Chain> = {
  ethereum: mainnet,
  sepolia: sepolia,
  hardhat: hardhat,
};

const DEFAULT_RPC: Record<NetworkName, string> = {
  ethereum: "https://eth.llamarpc.com",
  sepolia: "https://rpc.sepolia.org",
  hardhat: "http://127.0.0.1:8545",
};

export const NETWORKS: { name: NetworkName; label: string }[] = [
  { name: "ethereum", label: "Ethereum" },
  { name: "sepolia", label: "Sepolia" },
  { name: "hardhat", label: "Hardhat" },
];

function getRpcForNetwork(name: NetworkName): string {
  const envNetwork = (process.env.NEXT_PUBLIC_NETWORK ?? "hardhat") as NetworkName;
  if (name === envNetwork && process.env.NEXT_PUBLIC_RPC_URL) {
    return process.env.NEXT_PUBLIC_RPC_URL;
  }
  return DEFAULT_RPC[name];
}

interface WalletContextValue {
  address: Address | null;
  walletClient: WalletClient | null;
  publicClient: PublicClient;
  chain: Chain;
  chainId: number | null;
  connecting: boolean;
  network: NetworkName;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: (network: NetworkName) => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const defaultNetwork = (process.env.NEXT_PUBLIC_NETWORK ?? "hardhat") as NetworkName;
  const [network, setNetwork] = useState<NetworkName>(defaultNetwork);
  const [address, setAddress] = useState<Address | null>(null);
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Restore network from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("nexoid-network") as NetworkName | null;
    if (stored && CHAIN_MAP[stored]) {
      setNetwork(stored);
    }
  }, []);

  const chain = CHAIN_MAP[network];
  const rpcUrl = getRpcForNetwork(network);

  const publicClient = useMemo(
    () => createPublicClient({ chain, transport: http(rpcUrl) }),
    [chain, rpcUrl]
  );

  const switchNetwork = useCallback(async (name: NetworkName) => {
    setNetwork(name);
    localStorage.setItem("nexoid-network", name);

    // If wallet is connected, request MetaMask to switch chains
    if (typeof window !== "undefined" && (window as any).ethereum && address) {
      const targetChain = CHAIN_MAP[name];
      const targetChainHex = `0x${targetChain.id.toString(16)}`;
      try {
        await (window as any).ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: targetChainHex }],
        });
      } catch (switchError: any) {
        if (switchError.code === 4902) {
          await (window as any).ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: targetChainHex,
              chainName: targetChain.name,
              nativeCurrency: targetChain.nativeCurrency,
              rpcUrls: [getRpcForNetwork(name)],
            }],
          });
        }
      }
    }

    // Rebuild wallet client if connected
    if (address && typeof window !== "undefined" && (window as any).ethereum) {
      const newChain = CHAIN_MAP[name];
      setWalletClient(
        createWalletClient({
          account: address,
          chain: newChain,
          transport: custom((window as any).ethereum),
        })
      );
      setChainId(newChain.id);
    }
  }, [address]);

  const connect = useCallback(async () => {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      alert("No wallet detected. Please install MetaMask or another Web3 wallet.");
      return;
    }

    setConnecting(true);
    try {
      const provider = (window as any).ethereum;
      const accounts = await provider.request({
        method: "eth_requestAccounts",
      });
      const addr = accounts[0] as Address;

      // Switch MetaMask to the target chain
      const targetChainHex = `0x${chain.id.toString(16)}`;
      const currentChainId = await provider.request({ method: "eth_chainId" });
      if (currentChainId !== targetChainHex) {
        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: targetChainHex }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await provider.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: targetChainHex,
                chainName: chain.name,
                nativeCurrency: chain.nativeCurrency,
                rpcUrls: [rpcUrl],
              }],
            });
          } else {
            throw switchError;
          }
        }
      }

      const client = createWalletClient({
        account: addr,
        chain,
        transport: custom(provider),
      });

      setAddress(addr);
      setWalletClient(client);
      setChainId(chain.id);

      // Listen for account/chain changes
      provider.on("accountsChanged", (accs: string[]) => {
        if (accs.length === 0) {
          setAddress(null);
          setWalletClient(null);
        } else {
          const newAddr = accs[0] as Address;
          setAddress(newAddr);
          setWalletClient(
            createWalletClient({
              account: newAddr,
              chain,
              transport: custom(provider),
            })
          );
        }
      });
      provider.on("chainChanged", (newChainId: string) => {
        const parsed = parseInt(newChainId, 16);
        setChainId(parsed);
        if (parsed !== chain.id) {
          console.warn(`Wallet switched to chain ${parsed}, expected ${chain.id}. Transactions may fail.`);
        }
      });
    } catch (e) {
      console.error("Failed to connect wallet:", e);
    } finally {
      setConnecting(false);
    }
  }, [chain, rpcUrl]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setWalletClient(null);
    setChainId(null);
  }, []);

  return (
    <WalletContext.Provider
      value={{ address, walletClient, publicClient, chain, chainId, connecting, network, connect, disconnect, switchNetwork }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
