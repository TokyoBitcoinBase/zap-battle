import type { ZapBattleSession } from "./types";

export const RECEIPT_RECOVERY_SECONDS = 24 * 60 * 60;

export function zapRequestAcceptedUntil(session: ZapBattleSession): number | undefined {
  if (!session.endsAt) return undefined;
  return session.endsAt + session.graceSeconds;
}

export function receiptEventAcceptedUntil(session: ZapBattleSession): number | undefined {
  const requestCutoff = zapRequestAcceptedUntil(session);
  return requestCutoff === undefined
    ? undefined
    : requestCutoff + RECEIPT_RECOVERY_SECONDS;
}

export function isZapRequestWithinBattle(session: ZapBattleSession, createdAt: number): boolean {
  if (!Number.isFinite(createdAt)) return false;
  if (session.startsAt && createdAt < session.startsAt) return false;
  const requestCutoff = zapRequestAcceptedUntil(session);
  return requestCutoff === undefined || createdAt <= requestCutoff;
}
