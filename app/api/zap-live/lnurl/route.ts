import { NextRequest, NextResponse } from "next/server";
import { fetchLnurlPayMetadata, siteUrlFromRequest } from "@/src/server/lnurl";
import { verifyZapLiveToken } from "@/src/server/lnurl-token";
import { ensureSession } from "@/src/server/session-store";
import type { BattleSide } from "@/src/types";

type ZapLiveTarget = {
  sessionId: string;
  side: BattleSide;
};

export async function GET(request: NextRequest) {
  try {
    const target = readZapLiveTarget(request);
    const session = await ensureSession(target.sessionId);
    const contestant = session.contestants[target.side];
    const lightningAddress = contestant.lightningAddress;
    const displayName = contestant.displayName || (target.side === "left" ? "PLAYER 1" : "PLAYER 2");
    if (!contestant.nostrPubkey) {
      return NextResponse.json({ status: "ERROR", reason: "Nostr profile is required for this player." }, { status: 400 });
    }
    const targetMetadata = await fetchLnurlPayMetadata(lightningAddress);
    const baseUrl = siteUrlFromRequest(request);
    const callbackUrl = new URL("/c", baseUrl);
    callbackUrl.searchParams.set("s", target.sessionId);
    callbackUrl.searchParams.set("side", target.side);
    return NextResponse.json({
      tag: "payRequest",
      callback: callbackUrl.toString(),
      minSendable: targetMetadata.minSendable,
      maxSendable: targetMetadata.maxSendable,
      metadata: JSON.stringify([
        ["text/plain", `Zap Battle: ${displayName}`],
        ["text/identifier", `zap-battle:${target.sessionId}:${target.side}`]
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

function readZapLiveTarget(request: NextRequest): ZapLiveTarget {
  const token = request.nextUrl.searchParams.get("t") ?? request.nextUrl.searchParams.get("token") ?? "";
  if (token) {
    const payload = verifyZapLiveToken(token);
    return {
      sessionId: payload.sessionId,
      side: payload.side
    };
  }

  const sessionId = request.nextUrl.searchParams.get("s") ?? request.nextUrl.searchParams.get("sessionId") ?? "";
  const side = request.nextUrl.searchParams.get("side");
  if (!sessionId || (side !== "left" && side !== "right")) {
    throw new Error("Invalid QR code.");
  }
  return { sessionId, side };
}
