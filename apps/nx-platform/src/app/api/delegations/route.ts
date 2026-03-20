import { NextResponse } from "next/server";
import {
  getPublicClient,
  getModuleAddress,
  SAFE_IDENTITY_MODULE_ABI,
  DELEGATION_STATUSES,
} from "@/lib/contracts";

function sanitizeError(msg: string): string {
  if (msg.includes("fetch failed")) return "Could not connect to RPC node. Is a local Hardhat node running?";
  return msg.split("\n")[0].slice(0, 200);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  const client = getPublicClient();
  const moduleAddress = getModuleAddress();

  // Single delegation lookup
  if (id) {
    try {
      const record = await client.readContract({
        address: moduleAddress,
        abi: SAFE_IDENTITY_MODULE_ABI,
        functionName: "getDelegation",
        args: [BigInt(id)],
      });

      const [valid, depth] = await client.readContract({
        address: moduleAddress,
        abi: SAFE_IDENTITY_MODULE_ABI,
        functionName: "isValidDelegation",
        args: [BigInt(id)],
      });

      return NextResponse.json({
        delegation: {
          id: Number(id),
          issuer: record.issuer,
          subject: record.subject,
          credentialHash: record.credentialHash,
          scopeHash: record.scopeHash,
          validFrom: Number(record.validFrom),
          validUntil: Number(record.validUntil),
          parentDelegationId: Number(record.parentDelegationId),
          delegationDepth: record.delegationDepth,
          status: DELEGATION_STATUSES[record.status],
          statusId: record.status,
          chainValid: valid,
          chainDepth: depth,
        },
      });
    } catch (e) {
      return NextResponse.json(
        { error: (e as Error).message },
        { status: 500 }
      );
    }
  }

  // List all delegations by scanning events
  try {
    const logs = await client.getLogs({
      address: moduleAddress,
      event: {
        type: "event",
        name: "DelegationCreated",
        inputs: [
          { name: "delegationId", type: "uint256", indexed: true },
          { name: "issuer", type: "address", indexed: true },
          { name: "subject", type: "address", indexed: true },
          { name: "scopeHash", type: "bytes32", indexed: false },
          { name: "delegationDepth", type: "uint8", indexed: false },
          { name: "validUntil", type: "uint64", indexed: false },
        ],
      },
      fromBlock: 0n,
      toBlock: "latest",
    });

    const delegations = await Promise.all(
      logs.map(async (log) => {
        const delegationId = log.args.delegationId!;
        const record = await client.readContract({
          address: moduleAddress,
          abi: SAFE_IDENTITY_MODULE_ABI,
          functionName: "getDelegation",
          args: [delegationId],
        });

        let chainValid = false;
        try {
          const [valid] = await client.readContract({
            address: moduleAddress,
            abi: SAFE_IDENTITY_MODULE_ABI,
            functionName: "isValidDelegation",
            args: [delegationId],
          });
          chainValid = valid;
        } catch {
          // Chain validation may revert for invalid states
        }

        return {
          id: Number(delegationId),
          issuer: record.issuer,
          subject: record.subject,
          scopeHash: record.scopeHash,
          validFrom: Number(record.validFrom),
          validUntil: Number(record.validUntil),
          parentDelegationId: Number(record.parentDelegationId),
          delegationDepth: record.delegationDepth,
          status: DELEGATION_STATUSES[record.status],
          statusId: record.status,
          chainValid,
          blockNumber: Number(log.blockNumber),
        };
      })
    );

    return NextResponse.json({ delegations });
  } catch (e) {
    return NextResponse.json(
      { error: sanitizeError((e as Error).message) },
      { status: 500 }
    );
  }
}
