import { NextRequest, NextResponse } from "next/server";
import { formatUnits, type Address } from "viem";
import {
  getPublicClient,
  getTokenAddress,
  ALLOWANCE_MODULE_ADDRESS,
  ALLOWANCE_MODULE_ABI,
  ERC20_ABI,
} from "../../../lib/contracts";

export async function GET(request: NextRequest) {
  const safeAddress = request.nextUrl.searchParams.get("safe") as Address | null;

  if (!safeAddress) {
    return NextResponse.json({ error: "Missing ?safe= parameter" }, { status: 400 });
  }

  const publicClient = getPublicClient();
  const tokenAddress = getTokenAddress();

  try {
    // Fetch Safe balances
    const [ethBalance, usdtBalance] = await Promise.all([
      publicClient.getBalance({ address: safeAddress }),
      publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [safeAddress],
      }).catch(() => 0n),
    ]);

    // Fetch delegates
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

    // Fetch allowances for each delegate
    const agents = await Promise.all(
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

          // Calculate remaining (account for reset)
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

    return NextResponse.json({
      safe: safeAddress,
      token: tokenAddress,
      balances: {
        eth: formatUnits(ethBalance, 18),
        usdt: formatUnits(usdtBalance as bigint, 6),
        ethRaw: ethBalance.toString(),
        usdtRaw: (usdtBalance as bigint).toString(),
      },
      agents,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to query wallet";
    const clean = msg.includes("fetch failed")
      ? "Could not connect to RPC node. Is a local Hardhat node running?"
      : msg.split("\n")[0].slice(0, 200);
    return NextResponse.json({ error: clean }, { status: 500 });
  }
}
