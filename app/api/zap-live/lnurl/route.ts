import { NextRequest, NextResponse } from "next/server";
import { fetchLnurlPayMetadata, siteUrlFromRequest } from "@/src/server/lnurl";
import { verifyZapLiveToken } from "@/src/server/lnurl-token";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  try {
    const payload = verifyZapLiveToken(token);
    const targetMetadata = await fetchLnurlPayMetadata(payload.lightningAddress);
    const baseUrl = siteUrlFromRequest(request);
    return NextResponse.json({
      tag: "payRequest",
      callback: `${baseUrl}/api/zap-live/lnurl/callback?token=${encodeURIComponent(token)}`,
      minSendable: targetMetadata.minSendable,
      maxSendable: targetMetadata.maxSendable,
      metadata: JSON.stringify([
        ["text/plain", `Zap Battle: ${payload.displayName}`],
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
