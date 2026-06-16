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
  const body = await request.json().catch(() => ({}));
  const endedAt = currentSeconds();
  const next = normalizeSession({
    ...session,
    status: "ended" as const,
    endsAt: endedAt,
    finalResult: body.finalResult,
    updatedAt: endedAt
  }, sessionId);
  await saveSession(next);
  return NextResponse.json({ session: next });
}

function currentSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
