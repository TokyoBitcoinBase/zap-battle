import { finalizeEvent, getPublicKey, verifyEvent } from "nostr-tools/pure";
import { SimplePool } from "nostr-tools/pool";
import { mockSession } from "@/src/mock-session";
import { relaysFromEnv } from "@/src/relays";
import { nextSessionUpdatedAt, normalizeSession } from "@/src/session-validation";
import { hexToBytes, readServicePrivateKey } from "@/src/server/service-key";
import type { ZapBattleSession } from "@/src/types";

const GLOBAL_KEY = "__zapBattleSessions";
const SESSION_KIND = 30078;

type SessionGlobal = typeof globalThis & {
  [GLOBAL_KEY]?: Map<string, ZapBattleSession>;
};

function sessions(): Map<string, ZapBattleSession> {
  const storeGlobal = globalThis as SessionGlobal;
  if (!storeGlobal[GLOBAL_KEY]) {
    const initial = normalizeSession(mockSession, mockSession.id);
    storeGlobal[GLOBAL_KEY] = new Map([[initial.id, initial]]);
  }
  return storeGlobal[GLOBAL_KEY];
}

export async function getSession(sessionId: string): Promise<ZapBattleSession | null> {
  if (nostrSessionStorageEnabled()) {
    const session = await getNostrSession(sessionId);
    if (session) return session;
  }
  return sessions().get(sessionId) ?? null;
}

export async function deleteSession(sessionId: string): Promise<void> {
  if (nostrSessionStorageEnabled()) {
    const existing = await getNostrSession(sessionId);
    await publishNostrSessionDeletion(sessionId, nextSessionUpdatedAt(existing?.updatedAt));
  }
  sessions().delete(sessionId);
}

export async function saveSession(session: ZapBattleSession): Promise<ZapBattleSession> {
  if (nostrSessionStorageEnabled()) {
    await publishNostrSession(session);
  }
  sessions().set(session.id, session);
  return session;
}

export async function ensureSession(sessionId: string): Promise<ZapBattleSession> {
  const existing = await getSession(sessionId);
  if (existing) return existing;
  const session = normalizeSession({ ...mockSession, id: sessionId }, sessionId);
  await saveSession(session);
  return session;
}

function nostrSessionStorageEnabled(): boolean {
  return Boolean(readServicePrivateKey() && readSessionRelays().length > 0);
}

async function getNostrSession(sessionId: string): Promise<ZapBattleSession | null> {
  const privateKey = readServicePrivateKey();
  if (!privateKey) return null;
  const pubkey = getPublicKey(privateKey);
  const pool = new SimplePool();
  try {
    const events = await pool.querySync(readSessionRelays(), {
      kinds: [SESSION_KIND],
      authors: [pubkey],
      "#d": [sessionDTag(sessionId)]
    }, { maxWait: 1200 });
    return latestSessionFromEvents(events as NostrSessionEvent[], sessionId);
  } catch {
    return null;
  } finally {
    pool.close(readSessionRelays());
  }
}

type NostrSessionEvent = {
  id: string;
  created_at: number;
  content: string;
  kind: number;
  tags: string[][];
  pubkey: string;
  sig: string;
};

function latestSessionFromEvents(events: NostrSessionEvent[], sessionId: string): ZapBattleSession | null {
  const candidates = events
    .filter((event) => event.kind === SESSION_KIND && verifyEvent(event))
    .map((event) => {
      try {
        const parsed = JSON.parse(event.content) as unknown;
        return { event, parsed };
      } catch {
        return null;
      }
    })
    .filter((candidate): candidate is { event: NostrSessionEvent; parsed: unknown } => Boolean(candidate))
    .sort((left, right) => (
      sessionSortTime(right) - sessionSortTime(left) ||
      right.event.created_at - left.event.created_at ||
      left.event.id.localeCompare(right.event.id)
    ));

  const latest = candidates[0];
  if (!latest || isDeletedSession(latest.parsed, sessionId)) return null;
  return normalizeSession(latest.parsed, sessionId);
}

function sessionSortTime(candidate: { event: NostrSessionEvent; parsed: unknown }): number {
  const parsed = candidate.parsed;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const updatedAt = (parsed as { updatedAt?: unknown }).updatedAt;
    if (typeof updatedAt === "number" && Number.isFinite(updatedAt)) return updatedAt;
  }
  return candidate.event.created_at;
}

async function publishNostrSessionDeletion(sessionId: string, deletedAt: number): Promise<void> {
  const privateKey = readServicePrivateKey();
  if (!privateKey) return;
  const event = finalizeEvent({
    kind: SESSION_KIND,
    created_at: deletedAt,
    content: JSON.stringify({
      id: sessionId,
      deleted: true,
      deletedAt
    }),
    tags: [
      ["d", sessionDTag(sessionId)],
      ["type", "zap_battle_session"],
      ["client", "zap-battle"],
      ["t", "zapbattle"]
    ]
  }, privateKey);
  const pool = new SimplePool();
  try {
    await publishToAtLeastOneRelay(pool, event, 2000);
  } finally {
    pool.close(readSessionRelays());
  }
}

async function publishNostrSession(session: ZapBattleSession): Promise<void> {
  const privateKey = readServicePrivateKey();
  if (!privateKey) return;
  const event = finalizeEvent({
    kind: SESSION_KIND,
    created_at: Math.max(currentSeconds(), Math.floor(session.updatedAt ?? 0)),
    content: JSON.stringify(session),
    tags: [
      ["d", sessionDTag(session.id)],
      ["type", "zap_battle_session"],
      ["client", "zap-battle"],
      ["t", "zapbattle"]
    ]
  }, privateKey);
  const pool = new SimplePool();
  try {
    await publishToAtLeastOneRelay(pool, event, 2200);
  } finally {
    pool.close(readSessionRelays());
  }
}

async function publishToAtLeastOneRelay(
  pool: SimplePool,
  event: NostrSessionEvent,
  maxWait: number
): Promise<void> {
  let successCount = 0;
  const attempts = pool.publish(readSessionRelays(), event, { maxWait }).map((attempt) => (
    attempt.then(
      () => {
        successCount += 1;
      },
      () => undefined
    )
  ));
  await Promise.race([
    Promise.all(attempts),
    timeout(maxWait)
  ]);
  if (successCount === 0) {
    throw new Error("Could not save the session to any configured Nostr relay.");
  }
}

function timeout(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isDeletedSession(value: unknown, sessionId: string): boolean {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "deleted" in value &&
    (value as { deleted?: unknown; id?: unknown }).deleted === true &&
    (value as { id?: unknown }).id === sessionId
  );
}

function sessionDTag(sessionId: string): string {
  return `zap-battle:${sessionId}`;
}

function readSessionRelays(): string[] {
  return relaysFromEnv(process.env.NOSTR_SESSION_RELAYS, process.env.NOSTR_RELAYS);
}

function currentSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
