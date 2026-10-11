import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/src/server/admin-auth";
import { deleteSession, ensureSession, lookupSession, saveSession } from "@/src/server/session-store";
import { nextSessionUpdatedAt, normalizeSession } from "@/src/session-validation";
import { sessionMode } from "@/src/session-mode";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { sessionId } = await context.params;
  const shouldCreate = _request.nextUrl.searchParams.get("create") === "1";
  if (shouldCreate) {
    const unauthorized = requireAdmin(_request);
    if (unauthorized) return unauthorized;
    try {
      const mode = _request.nextUrl.searchParams.get("mode") === "solo" ? "solo" : "battle";
      const session = await ensureSession(sessionId, mode);
      return noStoreJson({ session });
    } catch {
      return persistenceUnavailable();
    }
  }
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
  return noStoreJson({ session: lookup.session });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;
  const { sessionId } = await context.params;
  const body = await request.json().catch(() => ({}));
  try {
    const existing = await ensureSession(sessionId);
    const session = normalizeSession({
      ...existing,
      ...body,
      id: sessionId,
      updatedAt: nextSessionUpdatedAt(existing.updatedAt)
    }, sessionId);
    // Resetting to draft clears the previous run and permits changing its mode.
    if (sessionMode(existing) !== sessionMode(session) && (session.status !== "draft" || session.startsAt !== null)) {
      return noStoreJson({ error: "mode_locked", errors: ["Clear results before changing the mode."] }, { status: 409 });
    }
    await saveSession(session);
    return noStoreJson({ session });
  } catch {
    return persistenceUnavailable();
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;
  const { sessionId } = await context.params;
  try {
    await deleteSession(sessionId);
    return noStoreJson({ deleted: true });
  } catch {
    return persistenceUnavailable();
  }
}

function noStoreJson(body: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(body, init);
  response.headers.set("cache-control", "no-store, no-cache, must-revalidate");
  return response;
}

function persistenceUnavailable(): NextResponse {
  return noStoreJson({
    error: "persistence_unavailable",
    errors: ["Could not save session data to the configured Nostr relays. Please try again."]
  }, { status: 503 });
}
