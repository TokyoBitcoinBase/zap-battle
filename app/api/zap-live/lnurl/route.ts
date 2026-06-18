import { NextRequest, NextResponse } from "next/server";
import { fetchLnurlPayMetadata, siteUrlFromRequest } from "@/src/server/lnurl";
import { verifyZapLiveToken } from "@/src/server/lnurl-token";
import { ensureSession } from "@/src/server/session-store";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t") ?? request.nextUrl.searchParams.get("token") ?? "";
  try {
    const payload = verifyZapLiveToken(token);
    const session = await ensureSession(payload.sessionId);
    const contestant = session.contestants[payload.side];
    const lightningAddress = payload.lightningAddress || contestant.lightningAddress;
    const displayName = payload.displayName || contestant.displayName || (payload.side === "left" ? "PLAYER 1" : "PLAYER 2");
    const targetMetadata = await fetchLnurlPayMetadata(lightningAddress);
    const baseUrl = siteUrlFromRequest(request);
    return NextResponse.json({
      tag: "payRequest",
      callback: `${baseUrl}/c?t=${encodeURIComponent(token)}`,
      minSendable: targetMetadata.minSendable,
      maxSendable: targetMetadata.maxSendable,
      metadata: JSON.stringify([
        ["text/plain", `Zap Battle: ${displayName}`],
        ["text/identifier", `zap-battle:${payload.sessionId}:${payload.side}`]
      ]),
      commentAllowed: Math.min(targetMetadata.commentAllowed ?? 80, 120),
      allowsNostr: true,
      nostrPubkey: targetMetadata.nostrPubkey
    });
  } catch (error) {
    return NextResponse.json({
      status: "ERROR",
      reason: error instanceof Error ? error.message : "Invalid token."
    }, { status: 400 });
  }
}
