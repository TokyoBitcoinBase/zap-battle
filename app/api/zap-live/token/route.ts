import { NextRequest, NextResponse } from "next/server";
import { ensureSession } from "@/src/server/session-store";
import { signZapLiveToken } from "@/src/server/lnurl-token";
import { fetchLnurlPayMetadata, siteUrlFromRequest } from "@/src/server/lnurl";
import type { BattleSide } from "@/src/types";

const TOKEN_TTL_SECONDS = 60 * 60 * 12;

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

  const expiresAt = currentSeconds() + TOKEN_TTL_SECONDS;
  const token = signZapLiveToken({
    sessionId,
    side,
    startsAt: session.startsAt ?? undefined,
    expiresAt
  });
  const baseUrl = siteUrlFromRequest(request);
  return NextResponse.json({
    lnurlPayUrl: `${baseUrl}/l?t=${encodeURIComponent(token)}`,
    expiresAt
  });
}

function currentSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
