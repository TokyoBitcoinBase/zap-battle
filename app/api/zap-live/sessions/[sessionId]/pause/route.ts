import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/src/server/admin-auth";
import { ensureSession, saveSession } from "@/src/server/session-store";
import { normalizeSession } from "@/src/session-validation";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;
  const { sessionId } = await context.params;
  const session = await ensureSession(sessionId);
  const now = currentSeconds();

  if (session.status === "live") {
    const endAt = session.endsAt ?? (session.startsAt ? session.startsAt + session.durationSeconds : now);
    const remainingSeconds = Math.max(1, endAt - now);
    const next = normalizeSession({
      ...session,
      status: "paused" as const,
      durationSeconds: remainingSeconds,
      endsAt: null,
      updatedAt: now
    }, sessionId);
    await saveSession(next);
    return NextResponse.json({ session: next });
  }

  if (session.status === "paused") {
    const next = normalizeSession({
      ...session,
      status: "live" as const,
      startsAt: session.startsAt ?? now,
      endsAt: now + session.durationSeconds,
      updatedAt: now
    }, sessionId);
    await saveSession(next);
    return NextResponse.json({ session: next });
  }

  return NextResponse.json({ error: "invalid_status" }, { status: 400 });
}

function currentSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
