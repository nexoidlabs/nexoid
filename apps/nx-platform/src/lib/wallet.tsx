"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
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
import { getChain, getRpcUrl } from "./contracts";

interface WalletContextValue {
  address: Address | null;
  walletClient: WalletClient | null;
  publicClient: PublicClient;
  chain: Chain;
  chainId: number | null;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<Address | null>(null);
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);

  const chain = getChain();
  const publicClient = createPublicClient({
    chain,
    transport: http(getRpcUrl()),
  });

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
          // Chain not added to MetaMask yet — add it
          if (switchError.code === 4902) {
            await provider.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: targetChainHex,
                  chainName: chain.name,
                  nativeCurrency: chain.nativeCurrency,
                  rpcUrls: [getRpcUrl()],
                },
              ],
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
        // Rebuild wallet client with current chain context
        if (parsed !== chain.id) {
          console.warn(`Wallet switched to chain ${parsed}, expected ${chain.id}. Transactions may fail.`);
        }
      });
    } catch (e) {
      console.error("Failed to connect wallet:", e);
    } finally {
      setConnecting(false);
    }
  }, [chain]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setWalletClient(null);
    setChainId(null);
  }, []);

  return (
    <WalletContext.Provider
      value={{ address, walletClient, publicClient, chain, chainId, connecting, connect, disconnect }}
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
