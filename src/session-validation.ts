import type { BattleSide, Contestant, ZapBattleFinalResult, ZapBattleSession, ZapReceiptItem } from "@/src/types";

const SIDES: BattleSide[] = ["left", "right"];

export function normalizeSession(input: unknown, fallbackId: string): ZapBattleSession {
  const value = isRecord(input) ? input : {};
  const now = currentSeconds();
  const title = readString(value.title, "Zap Battle").slice(0, 80);
  const durationSeconds = clampInteger(value.durationSeconds, 1, 60 * 60 * 3, 10 * 60);
  const graceSeconds = clampInteger(value.graceSeconds, 10, 300, 60);
  const status = value.status === "live" || value.status === "ended" ? value.status : "draft";
  const startsAt = readNullableNumber(value.startsAt);
  const endsAt = readNullableNumber(value.endsAt);
  const contestantsValue = isRecord(value.contestants) ? value.contestants : {};

  return {
    id: readString(value.id, fallbackId).slice(0, 96) || fallbackId,
    title,
    status,
    startsAt,
    endsAt,
    durationSeconds,
    graceSeconds,
    finalResult: normalizeFinalResult(value.finalResult),
    contestants: {
      left: normalizeContestant(contestantsValue.left, "left"),
      right: normalizeContestant(contestantsValue.right, "right")
    },
    createdAt: readNullableNumber(value.createdAt) ?? now,
    updatedAt: now
  };
}

export function validateSessionReady(session: ZapBattleSession): string[] {
  const errors: string[] = [];
  SIDES.forEach((side) => {
    const contestant = session.contestants[side];
    if (!contestant.displayName.trim()) errors.push(`${side} display name is required.`);
    if (!contestant.lightningAddress.trim()) errors.push(`${side} Lightning Address is required.`);
  });
  return errors;
}

function normalizeContestant(input: unknown, side: BattleSide): Contestant {
  const value = isRecord(input) ? input : {};
  return {
    side,
    displayName: readString(value.displayName, "").slice(0, 80),
    lightningAddress: readString(value.lightningAddress, "").slice(0, 160),
    nostrPubkey: optionalString(value.nostrPubkey, 120),
    profileImageUrl: optionalString(value.profileImageUrl, 600),
    temporaryProfile: value.temporaryProfile === true
  };
}

function normalizeFinalResult(input: unknown): ZapBattleFinalResult | undefined {
  const value = isRecord(input) ? input : null;
  if (!value) return undefined;
  const winner = value.winner === "left" || value.winner === "right" || value.winner === "tied"
    ? value.winner
    : "tied";
  return {
    capturedAt: clampInteger(value.capturedAt, 0, Number.MAX_SAFE_INTEGER, currentSeconds()),
    winner,
    left: normalizeSideResult(value.left),
    right: normalizeSideResult(value.right),
    receipts: normalizeReceipts(value.receipts)
  };
}

function normalizeSideResult(input: unknown) {
  const value = isRecord(input) ? input : {};
  const totalSats = clampInteger(value.totalSats, 0, Number.MAX_SAFE_INTEGER, 0);
  const count = clampInteger(value.count, 0, Number.MAX_SAFE_INTEGER, 0);
  const averageSats = clampInteger(value.averageSats, 0, Number.MAX_SAFE_INTEGER, count > 0 ? Math.round(totalSats / count) : 0);
  return { totalSats, count, averageSats };
}

function normalizeReceipts(input: unknown): ZapReceiptItem[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 80).map((receipt) => {
    const value = isRecord(receipt) ? receipt : {};
    const side: BattleSide = value.side === "right" ? "right" : "left";
    return {
      id: readString(value.id, "").slice(0, 120) || `${side}-${readNullableNumber(value.createdAt) ?? 0}`,
      side,
      senderName: readString(value.senderName, "anonymous").slice(0, 80),
      amountSats: clampInteger(value.amountSats, 0, Number.MAX_SAFE_INTEGER, 0),
      comment: readString(value.comment, "").slice(0, 280),
      createdAt: clampInteger(value.createdAt, 0, Number.MAX_SAFE_INTEGER, 0)
    };
  }).filter((receipt) => receipt.amountSats > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function optionalString(value: unknown, maxLength: number): string | undefined {
  const next = readString(value, "").slice(0, maxLength);
  return next || undefined;
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function currentSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
