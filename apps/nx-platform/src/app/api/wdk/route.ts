import { NextRequest, NextResponse } from "next/server";
import {
  generateSeedPhrase,
  deriveOperator,
  deriveAgent,
} from "@nexoid/core-client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "generate") {
      const seedPhrase = generateSeedPhrase();
      const operator = deriveOperator(seedPhrase);
      return NextResponse.json({ seedPhrase, operator });
    }

    if (action === "derive-agent") {
      const { seedPhrase, index } = body;
      if (!seedPhrase || typeof index !== "number" || index < 1) {
        return NextResponse.json(
          { error: "seedPhrase and index (>= 1) required" },
          { status: 400 }
        );
      }
      const agent = deriveAgent(seedPhrase, index);
      return NextResponse.json({ agent });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
