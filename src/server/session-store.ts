import { finalizeEvent, getPublicKey, verifyEvent } from "nostr-tools/pure";
import { SimplePool } from "nostr-tools/pool";
import { mockSession } from "@/src/mock-session";
import { relaysFromEnv } from "@/src/relays";
import { nextSessionUpdatedAt, normalizeSession } from "@/src/session-validation";
import { hexToBytes, readServicePrivateKey } from "@/src/server/service-key";
import type { ZapBattleSession, ZapBattleSessionSummary } from "@/src/types";

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
    const lookup = await lookupNostrSession(sessionId);
    if (lookup.state === "found") return lookup.session;
    if (lookup.state === "deleted") {
      sessions().delete(sessionId);
      return null;
    }
  }
  return sessions().get(sessionId) ?? null;
}

export async function listSessions(): Promise<ZapBattleSessionSummary[]> {
  const storedSessions = nostrSessionStorageEnabled()
    ? await listNostrSessions()
    : Array.from(sessions().values());
  return storedSessions
    .map(sessionSummary)
    .sort((left, right) => (
      (right.updatedAt ?? 0) - (left.updatedAt ?? 0) ||
      left.id.localeCompare(right.id)
    ));
}

export async function deleteSession(sessionId: string): Promise<void> {
  if (nostrSessionStorageEnabled()) {
    const lookup = await lookupNostrSession(sessionId);
    const previousUpdatedAt = lookup.state === "found"
      ? lookup.session.updatedAt
      : lookup.state === "deleted"
        ? lookup.updatedAt
        : undefined;
    await publishNostrSessionDeletion(sessionId, nextSessionUpdatedAt(previousUpdatedAt));
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
  let previousUpdatedAt: number | undefined;
  if (nostrSessionStorageEnabled()) {
    const lookup = await lookupNostrSession(sessionId);
    if (lookup.state === "found") return lookup.session;
    if (lookup.state === "deleted") {
      sessions().delete(sessionId);
      previousUpdatedAt = lookup.updatedAt;
    }
  }
  const existing = sessions().get(sessionId);
  if (existing) return existing;
  const session = normalizeSession({
    ...mockSession,
    id: sessionId,
    ...(previousUpdatedAt ? { updatedAt: nextSessionUpdatedAt(previousUpdatedAt) } : {})
  }, sessionId);
  await saveSession(session);
  return session;
}

function nostrSessionStorageEnabled(): boolean {
  return Boolean(readServicePrivateKey() && readSessionRelays().length > 0);
}

type NostrSessionLookup =
  | { state: "found"; session: ZapBattleSession }
  | { state: "deleted"; updatedAt: number }
  | { state: "missing" }
  | { state: "unavailable" };

async function lookupNostrSession(sessionId: string): Promise<NostrSessionLookup> {
  const privateKey = readServicePrivateKey();
  if (!privateKey) return { state: "missing" };
  const pubkey = getPublicKey(privateKey);
  const pool = new SimplePool();
  try {
    const events = await pool.querySync(readSessionRelays(), {
      kinds: [SESSION_KIND],
      authors: [pubkey],
      "#d": [sessionDTag(sessionId)]
    }, { maxWait: 1200 });
    return latestSessionLookupFromEvents(events as NostrSessionEvent[], sessionId);
  } catch {
    return { state: "unavailable" };
  } finally {
    pool.close(readSessionRelays());
  }
}

async function listNostrSessions(): Promise<ZapBattleSession[]> {
  const privateKey = readServicePrivateKey();
  if (!privateKey) return [];
  const pubkey = getPublicKey(privateKey);
  const pool = new SimplePool();
  try {
    const events = await pool.querySync(readSessionRelays(), {
      kinds: [SESSION_KIND],
      authors: [pubkey],
      limit: 1000
    }, { maxWait: 2200 });
    return latestSessionsFromEvents(events as NostrSessionEvent[]);
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

function latestSessionLookupFromEvents(events: NostrSessionEvent[], sessionId: string): NostrSessionLookup {
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
    .sort(compareSessionCandidates);

  const latest = candidates[0];
  if (!latest) return { state: "missing" };
  if (isDeletedSession(latest.parsed, sessionId)) {
    return { state: "deleted", updatedAt: sessionSortTime(latest) };
  }
  return { state: "found", session: normalizeSession(latest.parsed, sessionId) };
}

function latestSessionsFromEvents(events: NostrSessionEvent[]): ZapBattleSession[] {
  const candidatesBySession = new Map<string, Array<{ event: NostrSessionEvent; parsed: unknown }>>();
  events.forEach((event) => {
    if (event.kind !== SESSION_KIND || !verifyEvent(event)) return;
    const sessionId = sessionIdFromEvent(event);
    if (!sessionId) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(event.content) as unknown;
    } catch {
      return;
    }
    const candidates = candidatesBySession.get(sessionId) ?? [];
    candidates.push({ event, parsed });
    candidatesBySession.set(sessionId, candidates);
  });

  return Array.from(candidatesBySession.entries()).flatMap(([sessionId, candidates]) => {
    const latest = candidates.sort(compareSessionCandidates)[0];
    if (!latest || isDeletedSession(latest.parsed, sessionId)) return [];
    const parsed = latest.parsed && typeof latest.parsed === "object" && !Array.isArray(latest.parsed)
      ? { ...latest.parsed, id: sessionId }
      : { id: sessionId };
    return [normalizeSession(parsed, sessionId)];
  });
}

function compareSessionCandidates(
  left: { event: NostrSessionEvent; parsed: unknown },
  right: { event: NostrSessionEvent; parsed: unknown }
): number {
  return (
    sessionSortTime(right) - sessionSortTime(left) ||
    right.event.created_at - left.event.created_at ||
    left.event.id.localeCompare(right.event.id)
  );
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

function sessionIdFromEvent(event: NostrSessionEvent): string | null {
  const dTag = event.tags.find((tag) => tag[0] === "d")?.[1];
  const prefix = "zap-battle:";
  if (!dTag?.startsWith(prefix)) return null;
  const sessionId = dTag.slice(prefix.length);
  return sessionId || null;
}

function sessionSummary(session: ZapBattleSession): ZapBattleSessionSummary {
  return {
    id: session.id,
    title: session.title,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  };
}

function readSessionRelays(): string[] {
  return relaysFromEnv(process.env.NOSTR_SESSION_RELAYS, process.env.NOSTR_RELAYS);
}

function currentSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
