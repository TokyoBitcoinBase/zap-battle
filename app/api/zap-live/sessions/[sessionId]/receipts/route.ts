import { NextRequest, NextResponse } from "next/server";
import { fetchZapReceiptsOnce } from "@/src/nostr-zap-receipts";
import { lookupSession } from "@/src/server/session-store";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { sessionId } = await context.params;
  const lookup = await lookupSession(sessionId);
  if (lookup.state === "unavailable") {
    return noStoreJson({ error: "session_relays_unavailable" }, { status: 503 });
  }
  if (lookup.state === "deleted") {
    return noStoreJson({ error: "session_deactivated" }, { status: 410 });
  }
  if (lookup.state === "missing") {
    return noStoreJson({ error: "not_configured" }, { status: 404 });
  }
  const session = lookup.session;
  const requestedSince = Number(request.nextUrl.searchParams.get("since"));
  const since = Number.isFinite(requestedSince)
    ? Math.max(session.startsAt ?? 0, Math.floor(requestedSince))
    : session.startsAt ?? undefined;
  try {
    const receipts = await fetchZapReceiptsOnce({
      session,
      since,
      maxWait: 3000
    });
    return noStoreJson({ receipts });
  } catch {
    return noStoreJson({ error: "receipt_relays_unavailable" }, { status: 503 });
  }
}

function noStoreJson(body: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(body, init);
  response.headers.set("cache-control", "no-store, no-cache, must-revalidate");
  return response;
}
