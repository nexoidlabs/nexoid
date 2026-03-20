import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

interface PendingApproval {
  id: string;
  agentDid: string;
  requestedAmount: string;
  reason: string;
  timestamp: number;
  status: "pending" | "approved" | "denied";
}

function getRequestsPath(): string {
  const dir = join(homedir(), ".nexoid");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "pending-requests.json");
}

function loadRequests(): PendingApproval[] {
  const path = getRequestsPath();
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as PendingApproval[];
  } catch {
    return [];
  }
}

function saveRequests(requests: PendingApproval[]): void {
  writeFileSync(
    getRequestsPath(),
    JSON.stringify(requests, null, 2) + "\n",
    "utf-8"
  );
}

export async function GET() {
  const requests = loadRequests();
  return NextResponse.json({ requests });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { id, action } = body as { id: string; action: "approve" | "deny" };

  if (!id || !action) {
    return NextResponse.json(
      { error: "id and action (approve/deny) required" },
      { status: 400 }
    );
  }

  const requests = loadRequests();
  const req = requests.find((r) => r.id === id);

  if (!req) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  if (req.status !== "pending") {
    return NextResponse.json(
      { error: `Request already ${req.status}` },
      { status: 400 }
    );
  }

  req.status = action === "approve" ? "approved" : "denied";
  saveRequests(requests);

  return NextResponse.json({
    id: req.id,
    status: req.status,
    agentDid: req.agentDid,
    requestedAmount: req.requestedAmount,
  });
}
