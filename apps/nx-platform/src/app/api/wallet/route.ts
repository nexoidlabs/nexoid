import { NextRequest, NextResponse } from "next/server";
import { formatUnits, type Address } from "viem";
import {
  getPublicClient,
  getTokenAddress,
  getNexoidModuleAddress,
  ALLOWANCE_MODULE_ADDRESS,
  ALLOWANCE_MODULE_ABI,
  NEXOID_MODULE_ABI,
  ERC20_ABI,
} from "../../../lib/contracts";

async function fetchSafeBalances(
  publicClient: ReturnType<typeof getPublicClient>,
  safeAddress: Address,
  tokenAddress: Address
) {
  const [ethBalance, usdtBalance] = await Promise.all([
    publicClient.getBalance({ address: safeAddress }),
    publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [safeAddress],
    }).catch(() => 0n),
  ]);
  return { ethBalance, usdtBalance: usdtBalance as bigint };
}

async function fetchDelegateAllowances(
  publicClient: ReturnType<typeof getPublicClient>,
  safeAddress: Address,
  tokenAddress: Address
) {
  let delegates: Address[] = [];
  try {
    const [results] = await publicClient.readContract({
      address: ALLOWANCE_MODULE_ADDRESS,
      abi: ALLOWANCE_MODULE_ABI,
      functionName: "getDelegates",
      args: [safeAddress, 0, 50],
    }) as [Address[], number];
    delegates = results.filter((d: string) => d !== "0x0000000000000000000000000000000000000000");
  } catch {
    // AllowanceModule may not be enabled
  }

  return Promise.all(
    delegates.map(async (delegate) => {
      try {
        const result = await publicClient.readContract({
          address: ALLOWANCE_MODULE_ADDRESS,
          abi: ALLOWANCE_MODULE_ABI,
          functionName: "getTokenAllowance",
          args: [safeAddress, delegate, tokenAddress],
        }) as readonly bigint[];

        const amount = result[0];
        const spent = result[1];
        const resetTimeMin = Number(result[2]);
        const lastResetMin = Number(result[3]);
        const nonce = Number(result[4]);

        let effectiveSpent = spent;
        if (resetTimeMin > 0 && lastResetMin > 0) {
          const nowMin = Math.floor(Date.now() / 60000);
          if (nowMin >= lastResetMin + resetTimeMin) {
            effectiveSpent = 0n;
          }
        }
        const remaining = amount > effectiveSpent ? amount - effectiveSpent : 0n;

        return {
          address: delegate,
          did: `did:nexoid:eth:${delegate.toLowerCase()}`,
          allowance: formatUnits(amount, 6),
          spent: formatUnits(effectiveSpent, 6),
          remaining: formatUnits(remaining, 6),
          resetTimeMin,
          nonce,
          allowanceRaw: amount.toString(),
          spentRaw: effectiveSpent.toString(),
          remainingRaw: remaining.toString(),
        };
      } catch {
        return {
          address: delegate,
          did: `did:nexoid:eth:${delegate.toLowerCase()}`,
          allowance: "0",
          spent: "0",
          remaining: "0",
          resetTimeMin: 0,
          nonce: 0,
          allowanceRaw: "0",
          spentRaw: "0",
          remainingRaw: "0",
        };
      }
    })
  );
}

export async function GET(request: NextRequest) {
  const safeAddress = request.nextUrl.searchParams.get("safe") as Address | null;
  const queryType = request.nextUrl.searchParams.get("type") ?? "operator";

  if (!safeAddress) {
    return NextResponse.json({ error: "Missing ?safe= parameter" }, { status: 400 });
  }

  const publicClient = getPublicClient();
  const tokenAddress = getTokenAddress();

  try {
    // Fetch operator Safe balances and delegate allowances
    const { ethBalance, usdtBalance } = await fetchSafeBalances(publicClient, safeAddress, tokenAddress);
    const agents = await fetchDelegateAllowances(publicClient, safeAddress, tokenAddress);

    const response: Record<string, unknown> = {
      safe: safeAddress,
      token: tokenAddress,
      balances: {
        eth: formatUnits(ethBalance, 18),
        usdt: formatUnits(usdtBalance, 6),
        ethRaw: ethBalance.toString(),
        usdtRaw: usdtBalance.toString(),
      },
      agents,
    };

    // If operator mode and NexoidModule is configured, also fetch agent Safes
    if (queryType === "operator") {
      const nexoidModuleAddress = getNexoidModuleAddress();
      if (nexoidModuleAddress) {
        try {
          const agentSafes = await publicClient.readContract({
            address: nexoidModuleAddress,
            abi: NEXOID_MODULE_ABI,
            functionName: "getAgentSafes",
            args: [safeAddress],
          }) as Array<{ agentSafe: Address; agentEOA: Address; createdAt: bigint }>;

          const agentSafeDetails = await Promise.all(
            agentSafes.map(async (record) => {
              const { ethBalance: agentEth, usdtBalance: agentUsdt } =
                await fetchSafeBalances(publicClient, record.agentSafe, tokenAddress);
              const agentDelegates = await fetchDelegateAllowances(
                publicClient, record.agentSafe, tokenAddress
              );
              return {
                agentSafe: record.agentSafe,
                agentEOA: record.agentEOA,
                createdAt: Number(record.createdAt),
                did: `did:nexoid:eth:${record.agentEOA.toLowerCase()}`,
                balances: {
                  eth: formatUnits(agentEth, 18),
                  usdt: formatUnits(agentUsdt, 6),
                },
                delegates: agentDelegates,
              };
            })
          );

          response.agentSafes = agentSafeDetails;
        } catch {
          response.agentSafes = [];
        }
      }
    }

    return NextResponse.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to query wallet";
    const clean = msg.includes("fetch failed")
      ? "Could not connect to RPC node. Is a local Hardhat node running?"
      : msg.split("\n")[0].slice(0, 200);
    return NextResponse.json({ error: clean }, { status: 500 });
  }
}
