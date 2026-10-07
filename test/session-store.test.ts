import assert from "node:assert/strict";
import test, { afterEach, beforeEach, mock } from "node:test";
import { NextRequest } from "next/server";
import { finalizeEvent, type Event } from "nostr-tools/pure";
import { SimplePool } from "nostr-tools/pool";
import { GET } from "../app/api/zap-live/sessions/[sessionId]/route";
import { mockSession } from "../src/mock-session";
import {
  ensureSession,
  lookupSession,
  SessionStorageUnavailableError
} from "../src/server/session-store";

const sessionId = "zap-battle-zap-battle-4-open-final";
const privateKey = new Uint8Array(32).fill(1);
const relayUrls = ["wss://first.example", "wss://second.example"];
const originalEnv = {
  SERVICE_PRIVATE_KEY: process.env.SERVICE_PRIVATE_KEY,
  SERVICE_NSEC: process.env.SERVICE_NSEC,
  NOSTR_SESSION_RELAYS: process.env.NOSTR_SESSION_RELAYS,
  ADMIN_TOKEN: process.env.ADMIN_TOKEN
};
const globalStore = globalThis as typeof globalThis & {
  __zapBattleSessions?: Map<string, unknown>;
  __zapBattleDeletedSessions?: Map<string, number>;
};

beforeEach(() => {
  process.env.SERVICE_PRIVATE_KEY = "01".repeat(32);
  delete process.env.SERVICE_NSEC;
  process.env.NOSTR_SESSION_RELAYS = relayUrls.join(",");
  process.env.ADMIN_TOKEN = "test-only-admin";
  delete globalStore.__zapBattleSessions;
  delete globalStore.__zapBattleDeletedSessions;
});

afterEach(() => {
  mock.restoreAll();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete globalStore.__zapBattleSessions;
  delete globalStore.__zapBattleDeletedSessions;
});

function sessionEvent(updatedAt = 100, overrides: Record<string, unknown> = {}, key = privateKey): Event {
  return finalizeEvent({
    kind: 30078,
    created_at: updatedAt,
    tags: [["d", `zap-battle:${sessionId}`]],
    content: JSON.stringify({
      ...mockSession,
      id: sessionId,
      title: "Open Final",
      status: "ended",
      updatedAt,
      finalResult: {
        capturedAt: updatedAt,
        winner: "left",
        left: { totalSats: 802939, count: 13, averageSats: 61765 },
        right: { totalSats: 5359, count: 15, averageSats: 357 },
        receipts: []
      },
      ...overrides
    })
  }, key);
}

function mockRelays(results: Map<string, Event[] | Error>, delayMs = 0) {
  return mock.method(SimplePool.prototype, "ensureRelay", async (url: string) => {
    const result = results.get(url);
    if (result instanceof Error) throw result;
    return {
      subscribe(_filters, callbacks) {
        const timer = setTimeout(() => {
          result?.forEach((event) => callbacks.onevent?.(event));
          callbacks.oneose?.();
        }, delayMs);
        return { close() { clearTimeout(timer); callbacks.onclose?.("closed"); } };
      }
    } as Awaited<ReturnType<SimplePool["ensureRelay"]>>;
  });
}

function readRequest(create = false) {
  return GET(new NextRequest(`https://example.com/api/zap-live/sessions/${sessionId}${create ? "?create=1" : ""}`, {
    headers: create ? { "x-admin-token": "test-only-admin" } : {}
  }), { params: Promise.resolve({ sessionId }) });
}

test("an uncached relay outage returns retryable 503 instead of invalid URL 404", async () => {
  mockRelays(new Map(relayUrls.map((url) => [url, new Error("Offline")])));
  const response = await readRequest();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "session_relays_unavailable" });
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
});

test("partial relay failure does not turn an existing Battle URL into not configured", async () => {
  mockRelays(new Map<string, Event[] | Error>([
    [relayUrls[0], []],
    [relayUrls[1], new Error("Offline")]
  ]));
  assert.equal((await readRequest()).status, 503);
});

test("a session arriving after the old 1.2-second deadline is loaded", async () => {
  const event = sessionEvent();
  mockRelays(new Map(relayUrls.map((url) => [url, [event]])), 1300);
  const response = await readRequest();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).session.finalResult.left.totalSats, 802939);
});

test("loaded final results remain available during a later relay outage", async () => {
  const results = new Map<string, Event[] | Error>([
    [relayUrls[0], [sessionEvent()]],
    [relayUrls[1], new Error("Offline")]
  ]);
  mockRelays(results);
  assert.equal((await readRequest()).status, 200);
  results.set(relayUrls[0], new Error("Offline"));
  const response = await readRequest();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).session.title, "Open Final");
});

test("the local demo seed cannot override a relay-backed demo session", async () => {
  const event = finalizeEvent({
    kind: 30078,
    created_at: 100,
    tags: [["d", "zap-battle:demo"]],
    content: JSON.stringify({ ...mockSession, title: "Stored Demo", updatedAt: 100 })
  }, privateKey);
  mockRelays(new Map(relayUrls.map((url) => [url, [event]])));
  const lookup = await lookupSession("demo");
  assert.equal(lookup.state, "found");
  if (lookup.state === "found") assert.equal(lookup.session.title, "Stored Demo");
});

test("confirmed missing sessions return 404 without publishing or creating data", async () => {
  mockRelays(new Map(relayUrls.map((url) => [url, []])));
  const publish = mock.method(SimplePool.prototype, "publish", () => []);
  assert.equal((await readRequest()).status, 404);
  assert.equal(publish.mock.callCount(), 0);
  assert.equal(globalStore.__zapBattleSessions?.has(sessionId), false);
});

test("explicit creation cannot overwrite a session while relays are unavailable", async () => {
  mockRelays(new Map(relayUrls.map((url) => [url, new Error("Offline")])));
  const publish = mock.method(SimplePool.prototype, "publish", () => []);
  await assert.rejects(ensureSession(sessionId), SessionStorageUnavailableError);
  assert.equal((await readRequest(true)).status, 503);
  assert.equal(publish.mock.callCount(), 0);
});

test("a signed tombstone returns 410 and remains deactivated during relay failure", async () => {
  const results = new Map<string, Event[] | Error>(relayUrls.map((url) => [url, [sessionEvent(200, { deleted: true })]]));
  mockRelays(results);
  const response = await readRequest();
  assert.equal(response.status, 410);
  assert.deepEqual(await response.json(), { error: "session_deactivated" });
  relayUrls.forEach((url) => results.set(url, new Error("Offline")));
  assert.equal((await readRequest()).status, 410);
});

test("stale relay data cannot restore a cached deactivation", async () => {
  const results = new Map<string, Event[] | Error>(relayUrls.map((url) => [url, [sessionEvent(200, { deleted: true })]]));
  mockRelays(results);
  assert.equal((await readRequest()).status, 410);
  relayUrls.forEach((url) => results.set(url, [sessionEvent(100)]));
  assert.equal((await readRequest()).status, 410);
});

test("older relay events cannot roll back an already loaded final result", async () => {
  const results = new Map<string, Event[] | Error>(relayUrls.map((url) => [url, [sessionEvent(200)]]));
  mockRelays(results);
  assert.equal((await readRequest()).status, 200);
  relayUrls.forEach((url) => results.set(url, [sessionEvent(100, { status: "draft" })]));
  const lookup = await lookupSession(sessionId);
  assert.equal(lookup.state, "found");
  if (lookup.state === "found") assert.equal(lookup.session.status, "ended");
});

test("a newer session can deliberately reuse a deactivated Battle URL", async () => {
  const results = new Map<string, Event[] | Error>(relayUrls.map((url) => [url, [sessionEvent(200, { deleted: true })]]));
  mockRelays(results);
  assert.equal((await readRequest()).status, 410);
  relayUrls.forEach((url) => results.set(url, [sessionEvent(300)]));
  assert.equal((await readRequest()).status, 200);
});

test("session reads reject events from another signer or another Battle ID", async () => {
  const wrongId = finalizeEvent({
    kind: 30078,
    created_at: 100,
    tags: [["d", "zap-battle:another-battle"]],
    content: sessionEvent().content
  }, privateKey);
  const wrongSigner = sessionEvent(200, {}, new Uint8Array(32).fill(2));
  mockRelays(new Map(relayUrls.map((url) => [url, [wrongId, wrongSigner]])));
  assert.equal((await readRequest()).status, 404);
});
