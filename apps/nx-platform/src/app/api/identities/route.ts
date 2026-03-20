import { NextResponse } from "next/server";
import {
  getPublicClient,
  getRegistryAddress,
  IDENTITY_REGISTRY_ABI,
  ENTITY_TYPES,
  ENTITY_STATUSES,
} from "@/lib/contracts";

function sanitizeError(msg: string): string {
  if (msg.includes("fetch failed")) return "Could not connect to RPC node. Is a local Hardhat node running?";
  return msg.split("\n")[0].slice(0, 200);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  const client = getPublicClient();
  const registryAddress = getRegistryAddress();

  // Single identity lookup
  if (address) {
    try {
      const isRegistered = await client.readContract({
        address: registryAddress,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "isRegistered",
        args: [address as `0x${string}`],
      });

      if (!isRegistered) {
        return NextResponse.json({ registered: false });
      }

      const record = await client.readContract({
        address: registryAddress,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "getIdentity",
        args: [address as `0x${string}`],
      });

      return NextResponse.json({
        registered: true,
        identity: {
          address,
          entityType: ENTITY_TYPES[record.entityType],
          entityTypeId: record.entityType,
          status: ENTITY_STATUSES[record.status],
          statusId: record.status,
          createdAt: Number(record.createdAt),
          metadataHash: record.metadataHash,
          owner: record.owner,
          did: `did:nexoid:eth:${address}`,
        },
      });
    } catch (e) {
      return NextResponse.json(
        { error: sanitizeError((e as Error).message) },
        { status: 500 }
      );
    }
  }

  // List all registered identities by scanning events
  try {
    const logs = await client.getLogs({
      address: registryAddress,
      event: {
        type: "event",
        name: "IdentityRegistered",
        inputs: [
          { name: "identity", type: "address", indexed: true },
          { name: "entityType", type: "uint8", indexed: false },
          { name: "owner", type: "address", indexed: true },
          { name: "metadataHash", type: "bytes32", indexed: false },
        ],
      },
      fromBlock: 0n,
      toBlock: "latest",
    });

    const identities = await Promise.all(
      logs.map(async (log) => {
        const addr = log.args.identity!;
        const record = await client.readContract({
          address: registryAddress,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: "getIdentity",
          args: [addr],
        });

        return {
          address: addr,
          entityType: ENTITY_TYPES[record.entityType],
          entityTypeId: record.entityType,
          status: ENTITY_STATUSES[record.status],
          statusId: record.status,
          createdAt: Number(record.createdAt),
          metadataHash: record.metadataHash,
          owner: record.owner,
          did: `did:nexoid:eth:${addr}`,
          blockNumber: Number(log.blockNumber),
        };
      })
    );

    return NextResponse.json({ identities });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
