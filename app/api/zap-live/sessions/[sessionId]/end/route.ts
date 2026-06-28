import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/src/server/admin-auth";
import { ensureSession, saveSession } from "@/src/server/session-store";
import { normalizeSession } from "@/src/session-validation";
import type { ZapBattleFinalResult } from "@/src/types";

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
  const incomingFinalResult = isRecord(body) ? body.finalResult : undefined;
  const finalResult = shouldKeepExistingFinalResult(session.finalResult, incomingFinalResult)
    ? session.finalResult
    : incomingFinalResult;
  const next = normalizeSession({
    ...session,
    status: "ended" as const,
    endsAt: endedAt,
    finalResult,
    updatedAt: endedAt
  }, sessionId);
  await saveSession(next);
  return NextResponse.json({ session: next });
}

function currentSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function shouldKeepExistingFinalResult(existing: ZapBattleFinalResult | undefined, incoming: unknown): boolean {
  if (!existing || !isEmptyFinalResult(incoming)) return false;
  return existing.left.totalSats > 0 || existing.right.totalSats > 0 || existing.receipts.length > 0;
}

function isEmptyFinalResult(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const left = isRecord(value.left) ? value.left : {};
  const right = isRecord(value.right) ? value.right : {};
  const leftTotal = typeof left.totalSats === "number" ? left.totalSats : 0;
  const rightTotal = typeof right.totalSats === "number" ? right.totalSats : 0;
  const receipts = Array.isArray(value.receipts) ? value.receipts : [];
  return leftTotal === 0 && rightTotal === 0 && receipts.length === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
