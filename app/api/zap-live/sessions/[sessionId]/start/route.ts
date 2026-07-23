import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/src/server/admin-auth";
import { ensureSession, saveSession } from "@/src/server/session-store";
import { nextSessionUpdatedAt, normalizeSession, validateSessionReady } from "@/src/session-validation";
import type { ZapBattleSession } from "@/src/types";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;
  const { sessionId } = await context.params;
  const body = await request.json().catch(() => ({}));
  let session: ZapBattleSession;
  try {
    session = body && typeof body === "object" && "session" in body
      ? normalizeSession({ ...(body as { session: object }).session, id: sessionId }, sessionId)
      : await ensureSession(sessionId);
  } catch {
    return persistenceUnavailable();
  }
  const errors = validateSessionReady(session);
  if (errors.length > 0) {
    return NextResponse.json({ error: "validation_error", errors }, { status: 400 });
  }
  const startsAt = currentSeconds();
  const next = {
    ...session,
    status: "live" as const,
    startsAt,
    endsAt: startsAt + session.durationSeconds,
    finalResult: undefined,
    updatedAt: nextSessionUpdatedAt(session.updatedAt)
  };
  try {
    await saveSession(next);
  } catch {
    return persistenceUnavailable();
  }
  return NextResponse.json({ session: next });
}

function currentSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function persistenceUnavailable(): NextResponse {
  return NextResponse.json({
    error: "persistence_unavailable",
    errors: ["Could not save session data to the configured Nostr relays. Please try again."]
  }, { status: 503 });
}
