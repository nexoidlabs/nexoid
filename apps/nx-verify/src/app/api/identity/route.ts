import { NextResponse } from "next/server";
import {
  getPublicClient,
  getRegistryAddress,
  IDENTITY_REGISTRY_ABI,
  ENTITY_TYPES,
  ENTITY_STATUSES,
} from "@/lib/contracts";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  if (!address) {
    return NextResponse.json({ error: "Address parameter required" }, { status: 400 });
  }

  const client = getPublicClient();
  const registryAddress = getRegistryAddress();

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

    const ownerAddress = record.owner;
    let ownerDid: string | undefined;
    if (ownerAddress.toLowerCase() !== address.toLowerCase()) {
      ownerDid = `did:nexoid:eth:${ownerAddress.toLowerCase()}`;
    }

    return NextResponse.json({
      registered: true,
      identity: {
        address,
        entityType: ENTITY_TYPES[record.entityType],
        status: ENTITY_STATUSES[record.status],
        createdAt: Number(record.createdAt),
        owner: record.owner,
        ownerDid,
        did: `did:nexoid:eth:${address.toLowerCase()}`,
      },
    });
  } catch (e) {
    const msg = (e as Error).message;
    const clean = msg.includes("fetch failed")
      ? "Could not connect to RPC node. Is a local Hardhat node running?"
      : msg.split("\n")[0].slice(0, 200);
    return NextResponse.json({ error: clean }, { status: 500 });
  }
}
