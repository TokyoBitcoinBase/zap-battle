import assert from "node:assert/strict";
import test, { afterEach, beforeEach, mock } from "node:test";
import { NextRequest } from "next/server";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { SimplePool } from "nostr-tools/pool";
import { GET as readSession, PUT } from "../app/api/zap-live/sessions/[sessionId]/route";
import { POST as start } from "../app/api/zap-live/sessions/[sessionId]/start/route";
import { POST as pause } from "../app/api/zap-live/sessions/[sessionId]/pause/route";
import { POST as end } from "../app/api/zap-live/sessions/[sessionId]/end/route";
import { POST as token } from "../app/api/zap-live/token/route";
import { GET as lnurl } from "../app/api/zap-live/lnurl/route";
import { GET as callback } from "../app/api/zap-live/lnurl/callback/route";
import { normalizeSession, validateSessionReady } from "../src/session-validation";
import { fetchZapReceiptsOnce, parseZapReceipt, subscribeToZapReceipts } from "../src/nostr-zap-receipts";
import { ensureSession, listSessions, saveSession } from "../src/server/session-store";
import { mockSession } from "../src/mock-session";
import { soloStats } from "../src/solo-stats";
import { createContestantQrLoader } from "../src/contestant-qr";

const id = "solo-test";
const context = { params: Promise.resolve({ sessionId: id }) };
const recipientKey = new Uint8Array(32).fill(3);
const recipientPubkey = getPublicKey(recipientKey);
const envKeys = ["SERVICE_PRIVATE_KEY", "SERVICE_NSEC", "ADMIN_TOKEN"] as const;
const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
const globalStore = globalThis as typeof globalThis & { __zapBattleSessions?: Map<string, unknown>; __zapBattleDeletedSessions?: Map<string, number> };

beforeEach(() => {
  delete process.env.SERVICE_PRIVATE_KEY;
  delete process.env.SERVICE_NSEC;
  process.env.ADMIN_TOKEN = "test-only-admin";
  delete globalStore.__zapBattleSessions;
  delete globalStore.__zapBattleDeletedSessions;
});
afterEach(() => {
  mock.restoreAll();
  envKeys.forEach(key => {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  });
  delete globalStore.__zapBattleSessions;
  delete globalStore.__zapBattleDeletedSessions;
});

function soloSession() {
  return normalizeSession({ ...mockSession, id, mode: "solo", contestants: {
    left: { side: "left", displayName: "Comedian", lightningAddress: "comedian@example.com", nostrPubkey: recipientPubkey },
    right: { ...mockSession.contestants.right, nostrPubkey: getPublicKey(new Uint8Array(32).fill(4)), lightningAddress: "hidden@example.com" }
  } }, id);
}
function request(path: string, method = "POST", body?: unknown) {
  return new NextRequest(`https://example.com${path}`, { method, headers: { "x-admin-token": "test-only-admin", "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}

test("legacy sessions require two complete contestants while solo requires only one", () => {
  const solo = soloSession();
  assert.deepEqual(validateSessionReady(solo), []);
  assert.ok(validateSessionReady({ ...solo, mode: undefined }).some(error => error.startsWith("right ")));
  assert.equal(normalizeSession(mockSession, id).mode, "battle");
  solo.contestants.left.nostrPubkey = undefined;
  assert.match(validateSessionReady(solo).join(" "), /left Nostr profile is required/);
});

test("explicit solo creation persists mode, lists it, and cannot change an existing battle via a query", async () => {
  const response = await readSession(request(`/api/zap-live/sessions/${id}?create=1&mode=solo`, "GET"), context);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).session.mode, "solo");
  assert.equal((await listSessions()).find(session => session.id === id)?.mode, "solo");
  const battle = await ensureSession("existing-battle");
  assert.equal((await ensureSession(battle.id, "solo")).mode, "battle");
  const unauthenticated = await readSession(new NextRequest(`https://example.com/api/zap-live/sessions/unauthorized?create=1&mode=solo`), { params: Promise.resolve({ sessionId: "unauthorized" }) });
  assert.equal(unauthenticated.status, 401);
});

test("solo can start, pause, resume and end without a second performer", async () => {
  await saveSession(soloSession());
  const started = await start(request(`/api/zap-live/sessions/${id}/start`), context);
  assert.equal(started.status, 200);
  assert.equal((await started.json()).session.status, "live");
  assert.equal((await (await pause(request(`/api/zap-live/sessions/${id}/pause`), context)).json()).session.status, "paused");
  assert.equal((await (await pause(request(`/api/zap-live/sessions/${id}/pause`), context)).json()).session.status, "live");
  const ended = await end(request(`/api/zap-live/sessions/${id}/end`, "POST", { finalResult: {
    winner: "left", left: { totalSats: 1234, count: 2, averageSats: 617 }, right: { totalSats: 900, count: 1 }, receipts: []
  } }), context);
  const final = (await ended.json()).session;
  assert.equal(final.status, "ended");
  assert.equal(final.mode, "solo");
  assert.equal(final.finalResult.winner, "solo");
  assert.equal(final.finalResult.left.totalSats, 1234);
  assert.equal(final.finalResult.right.totalSats, 0);
});

test("changing mode requires clearing the active run", async () => {
  const solo = soloSession();
  await saveSession({ ...solo, status: "live", startsAt: 100 });
  const locked = await PUT(request(`/api/zap-live/sessions/${id}`, "PUT", { mode: "battle" }), context);
  assert.equal(locked.status, 409);
  const cleared = await PUT(request(`/api/zap-live/sessions/${id}`, "PUT", { mode: "battle", status: "draft", startsAt: null, endsAt: null }), context);
  assert.equal(cleared.status, 200);
});

test("solo rejects hidden second-recipient QR, LNURL and invoice requests before contacting a wallet", async () => {
  await saveSession(soloSession());
  const fetch = mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected wallet call"); });
  assert.equal((await token(request("/api/zap-live/token", "POST", { sessionId: id, side: "right" }))).status, 400);
  assert.equal((await lnurl(request(`/l?s=${id}&side=right`, "GET"))).status, 400);
  assert.equal((await callback(request(`/c?s=${id}&side=right&amount=1000`, "GET"))).status, 400);
  assert.equal(fetch.mock.callCount(), 0);
});

test("solo's wallet metadata and callback point to the one active performer", async () => {
  await saveSession(soloSession());
  mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ tag: "payRequest", callback: "https://wallet.example/callback", minSendable: 1000, maxSendable: 1000000, metadata: "[]", allowsNostr: true, nostrPubkey: recipientPubkey })));
  const qrResponse = await token(request("/api/zap-live/token", "POST", { sessionId: id, side: "left" }));
  assert.equal(qrResponse.status, 200);
  const qr = await qrResponse.json();
  assert.equal(new URL(qr.lnurlPayUrl).searchParams.get("side"), "left");
  const metadata = await (await lnurl(request(`/l?s=${id}&side=left`, "GET"))).json();
  assert.match(metadata.metadata, /Solo Zap: Comedian/);
  assert.equal(new URL(metadata.callback).searchParams.get("side"), "left");
});

for (const mode of ["solo", "battle"] as const) {
  test(`${mode} reuses the same QR through start, pause, end, restart and reload`, async () => {
    const initial = { ...soloSession(), mode };
    initial.contestants.right.displayName = "Second performer";
    await saveSession(initial);
    let walletCalls = 0;
    let now = 2_000_000_000_000;
    mock.method(Date, "now", () => now);
    mock.method(globalThis, "fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
      if (url === "/api/zap-live/token") {
        return token(request(url, "POST", JSON.parse(String(init?.body))));
      }
      walletCalls += 1;
      return new Response(JSON.stringify({ tag: "payRequest", callback: "https://wallet.example/callback", minSendable: 1000, maxSendable: 1000000, metadata: "[]" }));
    });
    const loadQr = createContestantQrLoader();
    const contestants = mode === "solo" ? [initial.contestants.left] : [initial.contestants.left, initial.contestants.right];
    const originalQrs = await Promise.all(contestants.map(contestant => loadQr(id, contestant)));
    originalQrs.forEach(qr => assert.match(qr, /^data:image\/png;base64,/));
    if (mode === "battle") assert.notEqual(originalQrs[0], originalQrs[1]);
    for (const action of [start, pause, pause, end, start]) {
      now += 10_000;
      const response = await action(request(`/api/zap-live/sessions/${id}/action`), context);
      assert.equal(response.status, 200);
      const { session } = await response.json();
      for (const [index, contestant] of contestants.entries()) {
        assert.equal(await loadQr(session.id, session.contestants[contestant.side]), originalQrs[index]);
      }
    }
    assert.equal(walletCalls, contestants.length, "lifecycle changes must not request another QR");
    const reloadQr = createContestantQrLoader();
    for (const [index, contestant] of contestants.entries()) {
      assert.equal(await reloadQr(id, contestant), originalQrs[index], "a page reload must encode the same fixed URL");
    }
  });
}

test("a failed QR request can be retried and a different event cannot reuse the previous event's QR", async () => {
  const loadQr = createContestantQrLoader();
  const contestant = soloSession().contestants.left;
  let requests = 0;
  mock.method(globalThis, "fetch", async (_url: RequestInfo | URL, init?: RequestInit) => {
    requests += 1;
    if (requests === 1) return new Response(JSON.stringify({ error: "temporarily_unavailable" }), { status: 503 });
    const { sessionId, side } = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ lnurlPayUrl: `https://example.com/l?s=${sessionId}&side=${side}` }));
  });
  await assert.rejects(loadQr(id, contestant), /temporarily_unavailable/);
  const firstQr = await loadQr(id, contestant);
  assert.equal(await loadQr(id, contestant), firstQr);
  assert.notEqual(await loadQr("another-event", contestant), firstQr);
  assert.equal(requests, 3);
});

test("solo aggregates signed receipts for its performer and excludes right or unrelated recipients", () => {
  const session = { ...soloSession(), status: "live" as const, startsAt: 1000, endsAt: 1600 };
  const receipt = (side: string, pubkey = recipientPubkey) => {
    const zap = finalizeEvent({ kind: 9734, created_at: 1010, content: "Great show!", tags: [["p", pubkey], ["amount", "100000"], ["zap_live", id], ["zap_live_side", side], ["zap_live_starts_at", "1000"]] }, new Uint8Array(32).fill(5));
    return finalizeEvent({ kind: 9735, created_at: 1011, content: "", tags: [["p", pubkey], ["description", JSON.stringify(zap)]] }, recipientKey);
  };
  assert.equal(parseZapReceipt(receipt("left"), session)?.item.amountSats, 100);
  assert.equal(parseZapReceipt(receipt("right"), session), null);
  assert.equal(parseZapReceipt(receipt("left", session.contestants.right.nostrPubkey), session), null);
  assert.equal(parseZapReceipt(receipt("right"), { ...session, mode: "battle" })?.item.side, "right");
});

test("solo relay catch-up and live subscription query only the active recipient", async () => {
  const session = { ...soloSession(), status: "live" as const, startsAt: 1000, endsAt: 1600 };
  const query = mock.method(SimplePool.prototype, "querySync", async () => []);
  const subscribe = mock.method(SimplePool.prototype, "subscribe", () => ({ close() {} }));
  await fetchZapReceiptsOnce({ session });
  const stop = subscribeToZapReceipts({ session, onReceipt() {} });
  assert.deepEqual(query.mock.calls[0].arguments[1]?.["#p"], [recipientPubkey]);
  assert.deepEqual(subscribe.mock.calls[0].arguments[1]?.["#p"], [recipientPubkey]);
  stop();
});

test("solo final-result normalization drops second-recipient receipts and keeps the mode on reload", () => {
  const session = soloSession();
  const persisted = normalizeSession({ ...session, status: "ended", finalResult: { winner: "right", left: { totalSats: 100, count: 1 }, right: { totalSats: 200, count: 1 }, receipts: [
    { id: "solo-receipt", side: "left", amountSats: 100, senderName: "Audience", createdAt: 1000 },
    { id: "hidden-receipt", side: "right", amountSats: 200, senderName: "Other", createdAt: 1000 }
  ] } }, id);
  const reloaded = normalizeSession(JSON.parse(JSON.stringify(persisted)), id);
  assert.equal(reloaded.mode, "solo");
  assert.equal(reloaded.finalResult?.winner, "solo");
  assert.deepEqual(reloaded.finalResult?.receipts.map(receipt => receipt.id), ["solo-receipt"]);
});

test("solo keeps the full final total when only the last 80 receipts are stored", () => {
  const history = Array.from({ length: 80 }, (_, i) => ({ id: String(i), side: "left" as const, amountSats: 10, senderName: "Audience", comment: "", createdAt: 1000 + i }));
  const saved = { totalSats: 1000, count: 100, averageSats: 10 };
  assert.deepEqual(soloStats(history, saved), saved);
  const fullCatchUp = Array.from({ length: 101 }, (_, i) => ({ ...history[0], id: String(i) }));
  assert.deepEqual(soloStats(fullCatchUp, saved), { totalSats: 1010, count: 101, averageSats: 10 });
});
