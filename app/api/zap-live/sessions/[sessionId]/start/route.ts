import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/src/server/admin-auth";
import { ensureSession, saveSession } from "@/src/server/session-store";
import { validateSessionReady } from "@/src/session-validation";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  const unauthorized = requireAdmin(_request);
  if (unauthorized) return unauthorized;
  const { sessionId } = await context.params;
  const session = await ensureSession(sessionId);
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
    updatedAt: startsAt
  };
  await saveSession(next);
  return NextResponse.json({ session: next });
}

function currentSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
