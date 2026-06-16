import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/src/server/admin-auth";
import { ensureSession, getSession, saveSession } from "@/src/server/session-store";
import { normalizeSession } from "@/src/session-validation";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { sessionId } = await context.params;
  const shouldCreate = _request.nextUrl.searchParams.get("create") === "1";
  if (shouldCreate) {
    const unauthorized = requireAdmin(_request);
    if (unauthorized) return unauthorized;
    const session = await ensureSession(sessionId);
    return NextResponse.json({ session });
  }
  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "not_configured" }, { status: 404 });
  }
  return NextResponse.json({ session });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;
  const { sessionId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const existing = await ensureSession(sessionId);
  const session = normalizeSession({ ...existing, ...body, id: sessionId }, sessionId);
  await saveSession(session);
  return NextResponse.json({ session });
}
