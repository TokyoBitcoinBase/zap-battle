import assert from "node:assert/strict";
import test from "node:test";
import type { SimplePool } from "nostr-tools/pool";
import { querySessionRelays } from "../src/server/session-relay-query";

type Relay = Awaited<ReturnType<SimplePool["ensureRelay"]>>;

test("a relay timeout is not a confirmed empty result", async () => {
  let closed = false;
  const pool = {
    async ensureRelay() {
      return {
        subscribe(_filters, callbacks) {
          assert.ok((callbacks.eoseTimeout ?? 0) > 20);
          return { close() { closed = true; callbacks.onclose?.("closed"); } };
        }
      } as Relay;
    }
  };

  const result = await querySessionRelays(pool, ["wss://slow.example"], { kinds: [30078] }, { queryTimeout: 20 });
  assert.deepEqual(result, { events: [], complete: false });
  assert.equal(closed, true);
});

test("an actual EOSE confirms an empty relay response", async () => {
  const pool = {
    async ensureRelay() {
      return {
        subscribe(_filters, callbacks) {
          queueMicrotask(() => callbacks.oneose?.());
          return { close() { callbacks.onclose?.("closed"); } };
        }
      } as Relay;
    }
  };

  assert.deepEqual(await querySessionRelays(pool, ["wss://empty.example"], { kinds: [30078] }), {
    events: [], complete: true
  });
});

test("one empty relay cannot confirm absence when another relay failed", async () => {
  const pool = {
    async ensureRelay(url: string) {
      if (url.includes("offline")) throw new Error("Connection failed");
      return {
        subscribe(_filters, callbacks) {
          queueMicrotask(() => callbacks.oneose?.());
          return { close() { callbacks.onclose?.("closed"); } };
        }
      } as Relay;
    }
  };

  assert.deepEqual(await querySessionRelays(pool, ["wss://empty.example", "wss://offline.example"], { kinds: [30078] }), {
    events: [], complete: false
  });
});
