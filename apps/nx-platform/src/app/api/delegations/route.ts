import { NextResponse } from "next/server";
import {
  getPublicClient,
  getModuleAddress,
  NEXOID_MODULE_ABI,
  AGENT_STATUSES,
} from "@/lib/contracts";

function sanitizeError(msg: string): string {
  if (msg.includes("fetch failed")) return "Could not connect to RPC node. Is a local Hardhat node running?";
  return msg.split("\n")[0].slice(0, 200);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentAddress = searchParams.get("agent");
  const operator = searchParams.get("operator");
  const network = searchParams.get("network") ?? undefined;

  const client = getPublicClient(network);
  const moduleAddress = getModuleAddress(network);

  // Single agent lookup
  if (agentAddress) {
    try {
      const record = await client.readContract({
        address: moduleAddress,
        abi: NEXOID_MODULE_ABI,
        functionName: "getAgentRecord",
        args: [agentAddress as `0x${string}`],
      });

      const valid = await client.readContract({
        address: moduleAddress,
        abi: NEXOID_MODULE_ABI,
        functionName: "isValidAgent",
        args: [agentAddress as `0x${string}`],
      });

      return NextResponse.json({
        agent: {
          agentSafe: record.agentSafe,
          agentEOA: record.agentEOA,
          scopeHash: record.scopeHash,
          credentialHash: record.credentialHash,
          validUntil: Number(record.validUntil),
          status: record.status,
          statusName: AGENT_STATUSES[record.status],
          valid,
        },
      });
    } catch (e) {
      return NextResponse.json(
        { error: (e as Error).message },
        { status: 500 }
      );
    }
  }

  // List all agents for an operator by querying getAgentSafes
  try {
    // Use the operator param, or fall back to a zero-address query
    // In practice the frontend should pass the connected wallet as operator
    const operatorAddress = operator ?? "0x0000000000000000000000000000000000000000";

    const records = await client.readContract({
      address: moduleAddress,
      abi: NEXOID_MODULE_ABI,
      functionName: "getAgentSafes",
      args: [operatorAddress as `0x${string}`],
    });

    const agents = (records as any[]).map((record: any) => ({
      agentSafe: record.agentSafe,
      agentEOA: record.agentEOA,
      scopeHash: record.scopeHash,
      credentialHash: record.credentialHash,
      validUntil: Number(record.validUntil),
      status: record.status,
      statusName: AGENT_STATUSES[record.status],
    }));

    return NextResponse.json({ agents });
  } catch (e) {
    return NextResponse.json(
      { error: sanitizeError((e as Error).message) },
      { status: 500 }
    );
  }
}
