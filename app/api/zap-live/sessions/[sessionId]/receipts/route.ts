import { NextRequest, NextResponse } from "next/server";
import { fetchZapReceiptsOnce } from "@/src/nostr-zap-receipts";
import { getSession } from "@/src/server/session-store";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { sessionId } = await context.params;
  const session = await getSession(sessionId);
  if (!session) {
    return noStoreJson({ error: "not_configured" }, { status: 404 });
  }
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
