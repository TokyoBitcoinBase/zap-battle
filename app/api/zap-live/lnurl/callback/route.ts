import { NextRequest, NextResponse } from "next/server";
import { finalizeEvent } from "nostr-tools/pure";
import { encodeLnurl } from "@/src/lnurl";
import { fetchLnurlPayMetadata, resolveLnurlPayUrl } from "@/src/server/lnurl";
import { verifyZapLiveToken } from "@/src/server/lnurl-token";
import { readServicePrivateKey, readServicePubkey } from "@/src/server/service-key";
import { ensureSession } from "@/src/server/session-store";
import { zapRequestRelaysFromEnv } from "@/src/relays";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t") ?? request.nextUrl.searchParams.get("token") ?? "";
  const amount = Number(request.nextUrl.searchParams.get("amount") ?? 0);
  const comment = (request.nextUrl.searchParams.get("comment") ?? "").slice(0, 120);
  try {
    const payload = verifyZapLiveToken(token);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ status: "ERROR", reason: "Invalid amount." }, { status: 400 });
    }
    const session = await ensureSession(payload.sessionId);
    if (payload.startsAt && payload.startsAt !== session.startsAt) {
      return NextResponse.json({ status: "ERROR", reason: "This QR code is for a previous battle." }, { status: 409 });
    }
    const contestant = session.contestants[payload.side];
    const lightningAddress = payload.lightningAddress || contestant.lightningAddress;
    const recipientPubkey = payload.recipientPubkey || contestant.nostrPubkey;
    if (!recipientPubkey) {
      return NextResponse.json({ status: "ERROR", reason: "Recipient Nostr pubkey is required." }, { status: 400 });
    }
    const servicePrivateKey = readServicePrivateKey();
    const servicePubkey = readServicePubkey();
    if (!servicePrivateKey || !servicePubkey) {
      return NextResponse.json({ status: "ERROR", reason: "Service signing key is not configured." }, { status: 500 });
    }

    const targetLnurlPayUrl = resolveLnurlPayUrl(lightningAddress);
    const targetMetadata = await fetchLnurlPayMetadata(targetLnurlPayUrl);
    if (targetMetadata.allowsNostr !== true || !targetMetadata.nostrPubkey) {
      return NextResponse.json({ status: "ERROR", reason: "Recipient wallet does not support Nostr zaps." }, { status: 400 });
    }
    if (amount < targetMetadata.minSendable || amount > targetMetadata.maxSendable) {
      return NextResponse.json({ status: "ERROR", reason: "Amount is outside recipient wallet range." }, { status: 400 });
    }

    const zapRequest = finalizeEvent({
      kind: 9734,
      created_at: currentSeconds(),
      content: comment,
      tags: [
        ["relays", ...(payload.relays || readPublicRelays())],
        ["amount", String(Math.round(amount))],
        ["lnurl", encodeLnurl(targetLnurlPayUrl)],
        ["p", recipientPubkey],
        ["zap_live", payload.sessionId],
        ["zap_live_side", payload.side],
        ...(payload.startsAt ? [["zap_live_starts_at", String(payload.startsAt)]] : []),
        ["client", "zap-battle"]
      ]
    }, servicePrivateKey);

    const callbackUrl = new URL(targetMetadata.callback);
    callbackUrl.searchParams.set("amount", String(Math.round(amount)));
    callbackUrl.searchParams.set("nostr", JSON.stringify(zapRequest));
    callbackUrl.searchParams.set("lnurl", encodeLnurl(targetLnurlPayUrl));
    if (comment) callbackUrl.searchParams.set("comment", comment.slice(0, targetMetadata.commentAllowed ?? 0));

    const invoiceResponse = await fetch(callbackUrl, {
      headers: { accept: "application/json" },
      cache: "no-store"
    });
    const invoiceJson = await invoiceResponse.json().catch(() => ({}));
    return NextResponse.json(invoiceJson, { status: invoiceResponse.ok ? 200 : invoiceResponse.status });
  } catch (error) {
    return NextResponse.json({
      status: "ERROR",
      reason: error instanceof Error ? error.message : "Invalid token."
    }, { status: 400 });
  }
}

function currentSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function readPublicRelays(): string[] {
  return zapRequestRelaysFromEnv(process.env.NEXT_PUBLIC_ZAP_REQUEST_RELAYS, process.env.ZAP_REQUEST_RELAYS);
}
