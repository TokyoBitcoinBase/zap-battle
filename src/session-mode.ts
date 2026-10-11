import type { BattleSide, SessionMode, ZapBattleSession } from "@/src/types";

export function sessionMode(session: Pick<ZapBattleSession, "mode">): SessionMode {
  return session.mode === "solo" ? "solo" : "battle";
}

export function activeContestantSides(session: Pick<ZapBattleSession, "mode">): BattleSide[] {
  return sessionMode(session) === "solo" ? ["left"] : ["left", "right"];
}

export function isActiveSide(session: Pick<ZapBattleSession, "mode">, side: BattleSide): boolean {
  return activeContestantSides(session).includes(side);
}
