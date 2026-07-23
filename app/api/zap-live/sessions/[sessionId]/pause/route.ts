import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/src/server/admin-auth";
import { ensureSession, saveSession } from "@/src/server/session-store";
import { nextSessionUpdatedAt, normalizeSession } from "@/src/session-validation";
import type { ZapBattleSession } from "@/src/types";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;
  const { sessionId } = await context.params;
  let session: ZapBattleSession;
  try {
    session = await ensureSession(sessionId);
  } catch {
    return persistenceUnavailable();
  }
  const now = currentSeconds();

  if (session.status === "live") {
    const endAt = session.endsAt ?? (session.startsAt ? session.startsAt + session.durationSeconds : now);
    const remainingSeconds = Math.max(1, endAt - now);
    const next = normalizeSession({
      ...session,
      status: "paused" as const,
      durationSeconds: remainingSeconds,
      endsAt: null,
      updatedAt: nextSessionUpdatedAt(session.updatedAt)
    }, sessionId);
    try {
      await saveSession(next);
    } catch {
      return persistenceUnavailable();
    }
    return NextResponse.json({ session: next });
  }

  if (session.status === "paused") {
    const next = normalizeSession({
      ...session,
      status: "live" as const,
      startsAt: session.startsAt ?? now,
      endsAt: now + session.durationSeconds,
      updatedAt: nextSessionUpdatedAt(session.updatedAt)
    }, sessionId);
    try {
      await saveSession(next);
    } catch {
      return persistenceUnavailable();
    }
    return NextResponse.json({ session: next });
  }

  return NextResponse.json({ error: "invalid_status" }, { status: 400 });
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
