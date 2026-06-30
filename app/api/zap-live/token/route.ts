import { NextRequest, NextResponse } from "next/server";
import { ensureSession } from "@/src/server/session-store";
import { fetchLnurlPayMetadata, siteUrlFromRequest } from "@/src/server/lnurl";
import type { BattleSide } from "@/src/types";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as Partial<{ sessionId: string; side: BattleSide }>;
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const side = body.side === "left" || body.side === "right" ? body.side : null;
  if (!sessionId || !side) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const session = await ensureSession(sessionId);
  const contestant = session.contestants[side];
  if (!contestant.lightningAddress.trim()) {
    return NextResponse.json({ error: "missing_lightning_address" }, { status: 400 });
  }
  try {
    await fetchLnurlPayMetadata(contestant.lightningAddress);
  } catch (error) {
    return NextResponse.json({
      error: "invalid_lightning_address",
      reason: error instanceof Error ? error.message : "Failed to validate Lightning Address."
    }, { status: 400 });
  }

  const baseUrl = siteUrlFromRequest(request);
  const lnurlPayUrl = new URL("/l", baseUrl);
  lnurlPayUrl.searchParams.set("s", sessionId);
  lnurlPayUrl.searchParams.set("side", side);
  return NextResponse.json({
    lnurlPayUrl: lnurlPayUrl.toString()
  });
}
