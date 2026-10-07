import { finalizeEvent, getPublicKey, verifyEvent } from "nostr-tools/pure";
import { SimplePool } from "nostr-tools/pool";
import { mockSession } from "@/src/mock-session";
import { relaysFromEnv } from "@/src/relays";
import { nextSessionUpdatedAt, normalizeSession } from "@/src/session-validation";
import { hexToBytes, readServicePrivateKey } from "@/src/server/service-key";
import { querySessionRelays } from "@/src/server/session-relay-query";
import type { ZapBattleSession, ZapBattleSessionSummary } from "@/src/types";

const GLOBAL_KEY = "__zapBattleSessions";
const DELETED_KEY = "__zapBattleDeletedSessions";
const SESSION_KIND = 30078;

type SessionGlobal = typeof globalThis & {
  [GLOBAL_KEY]?: Map<string, ZapBattleSession>;
  [DELETED_KEY]?: Map<string, number>;
};

function deletedSessions(): Map<string, number> {
  const storeGlobal = globalThis as SessionGlobal;
  return storeGlobal[DELETED_KEY] ??= new Map();
}

export class SessionStorageUnavailableError extends Error {
  constructor() {
    super("Could not read session data from the configured Nostr relays.");
    this.name = "SessionStorageUnavailableError";
  }
}

function sessions(): Map<string, ZapBattleSession> {
  const storeGlobal = globalThis as SessionGlobal;
  if (!storeGlobal[GLOBAL_KEY]) {
    storeGlobal[GLOBAL_KEY] = new Map();
    if (!nostrSessionStorageEnabled()) {
      const initial = normalizeSession(mockSession, mockSession.id);
      storeGlobal[GLOBAL_KEY].set(initial.id, initial);
    }
  }
  return storeGlobal[GLOBAL_KEY];
}

export async function getSession(sessionId: string): Promise<ZapBattleSession | null> {
  const lookup = await lookupSession(sessionId);
  if (lookup.state === "unavailable") throw new SessionStorageUnavailableError();
  return lookup.state === "found" ? lookup.session : null;
}

export async function lookupSession(sessionId: string): Promise<NostrSessionLookup> {
  if (nostrSessionStorageEnabled()) {
    const lookup = await lookupNostrSession(sessionId);
    const cachedSession = sessions().get(sessionId);
    const cachedDeletion = deletedSessions().get(sessionId);
    const cachedUpdatedAt = cachedDeletion ?? cachedSession?.updatedAt ?? 0;
    const fetchedUpdatedAt = lookup.state === "found"
      ? lookup.session.updatedAt ?? 0
      : lookup.state === "deleted" ? lookup.updatedAt : -1;
    if (fetchedUpdatedAt >= cachedUpdatedAt && lookup.state === "found") {
      sessions().set(sessionId, lookup.session);
      deletedSessions().delete(sessionId);
      return lookup;
    }
    if (fetchedUpdatedAt >= cachedUpdatedAt && lookup.state === "deleted") {
      sessions().delete(sessionId);
      deletedSessions().set(sessionId, lookup.updatedAt);
      return lookup;
    }
    if (cachedDeletion !== undefined) return { state: "deleted", updatedAt: cachedDeletion };
    if (cachedSession) return { state: "found", session: cachedSession };
    return lookup;
  }
  const deletedAt = deletedSessions().get(sessionId);
  if (deletedAt !== undefined) return { state: "deleted", updatedAt: deletedAt };
  const session = sessions().get(sessionId);
  return session ? { state: "found", session } : { state: "missing" };
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
  const lookup = await lookupSession(sessionId);
  if (lookup.state === "unavailable") throw new SessionStorageUnavailableError();
  const previousUpdatedAt = lookup.state === "found"
    ? lookup.session.updatedAt
    : lookup.state === "deleted" ? lookup.updatedAt : undefined;
  const deletedAt = nextSessionUpdatedAt(previousUpdatedAt);
  if (nostrSessionStorageEnabled()) {
    await publishNostrSessionDeletion(sessionId, deletedAt);
  }
  sessions().delete(sessionId);
  deletedSessions().set(sessionId, deletedAt);
}

export async function saveSession(session: ZapBattleSession): Promise<ZapBattleSession> {
  if (nostrSessionStorageEnabled()) {
    await publishNostrSession(session);
  }
  sessions().set(session.id, session);
  deletedSessions().delete(session.id);
  return session;
}

export async function ensureSession(sessionId: string): Promise<ZapBattleSession> {
  const lookup = await lookupSession(sessionId);
  if (lookup.state === "found") return lookup.session;
  if (lookup.state === "unavailable") throw new SessionStorageUnavailableError();
  const previousUpdatedAt = lookup.state === "deleted" ? lookup.updatedAt : undefined;
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

export type NostrSessionLookup =
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
    const { events, complete } = await querySessionRelays(pool, readSessionRelays(), {
      kinds: [SESSION_KIND],
      authors: [pubkey],
      "#d": [sessionDTag(sessionId)]
    });
    const lookup = latestSessionLookupFromEvents(events as NostrSessionEvent[], sessionId);
    return lookup.state === "missing" && !complete ? { state: "unavailable" } : lookup;
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
    const { events, complete } = await querySessionRelays(pool, readSessionRelays(), {
      kinds: [SESSION_KIND],
      authors: [pubkey],
      limit: 1000
    });
    if (!complete && events.length === 0) throw new SessionStorageUnavailableError();
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
  const pubkey = getPublicKey(readServicePrivateKey()!);
  const candidates = events
    .filter((event) => event.kind === SESSION_KIND &&
      event.pubkey === pubkey &&
      sessionIdFromEvent(event) === sessionId && verifyEvent(event))
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
  const pubkey = getPublicKey(readServicePrivateKey()!);
  const candidatesBySession = new Map<string, Array<{ event: NostrSessionEvent; parsed: unknown }>>();
  events.forEach((event) => {
    if (event.kind !== SESSION_KIND || event.pubkey !== pubkey || !verifyEvent(event)) return;
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
