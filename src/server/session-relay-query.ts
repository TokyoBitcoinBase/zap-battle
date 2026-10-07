import type { Event } from "nostr-tools/core";
import type { Filter } from "nostr-tools/filter";
import type { SimplePool } from "nostr-tools/pool";

type SessionRelayQuery = {
  events: Event[];
  complete: boolean;
};

// querySync returns an empty array for both an empty relay and a timed-out relay.
// Only an actual EOSE response can confirm that a session was not found.
export async function querySessionRelays(
  pool: Pick<SimplePool, "ensureRelay">,
  relays: string[],
  filter: Filter,
  { connectionTimeout = 2500, queryTimeout = 3500 } = {}
): Promise<SessionRelayQuery> {
  const results = await Promise.all(relays.map(async (url): Promise<SessionRelayQuery> => {
    try {
      const relay = await pool.ensureRelay(url, { connectionTimeout });
      return await new Promise<SessionRelayQuery>((resolve) => {
        const events: Event[] = [];
        let settled = false;
        let subscription: ReturnType<typeof relay.subscribe> | undefined;
        const finish = (complete: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ events, complete });
          subscription?.close();
        };
        const timer = setTimeout(() => finish(false), queryTimeout);
        try {
          subscription = relay.subscribe([filter], {
            // Our deadline runs first, so the library's synthetic EOSE on timeout
            // cannot be mistaken for a response from the relay.
            eoseTimeout: queryTimeout + 1000,
            onevent: (event) => { if (!settled) events.push(event); },
            oneose: () => finish(true),
            onclose: () => finish(false)
          });
          if (settled) subscription.close();
        } catch {
          finish(false);
        }
      });
    } catch {
      return { events: [], complete: false };
    }
  }));

  return {
    events: results.flatMap((result) => result.events),
    complete: results.length > 0 && results.every((result) => result.complete)
  };
}
