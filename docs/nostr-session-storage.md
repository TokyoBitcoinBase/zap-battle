# Nostr Session Storage

Zap Battle should avoid an application database for battle/session configuration.

## Policy

- Do not store battle sessions in an app DB as the source of truth.
- Store battle/session configuration as Nostr events on relays.
- Use browser `localStorage` only for local admin drafts and temporary private keys.
- Use Vercel API for LNURL Pay proxy and service signing, not as a session database.

## Session Event

Store each battle session as an addressable application event.

Recommended event:

```json
{
  "kind": 30078,
  "content": "{\"title\":\"Breakin Final\",\"durationSeconds\":600,\"contestants\":{\"left\":{...},\"right\":{...}}}",
  "tags": [
    ["d", "zap-battle:<session_id>"],
    ["type", "zap_battle_session"],
    ["client", "zap-battle"],
    ["t", "zapbattle"]
  ]
}
```

The display page can load:

```text
/zap-battle/<session_id>/display
```

and fetch the latest `kind:30078` with:

```json
{
  "kinds": [30078],
  "#d": ["zap-battle:<session_id>"]
}
```

If multiple events are found, use the latest valid event from the trusted organizer/service pubkey.

## Read Failures and Recovery

The server waits for actual relay `EOSE` responses before treating an empty query
as a missing session. A connection failure or timeout is not evidence that a Battle
URL is invalid. If no session is found and any configured relay failed to complete
the query, the API returns `503 session_relays_unavailable`; a completed empty query
returns `404 not_configured`. A signed deactivation tombstone returns
`410 session_deactivated`.

Successfully read sessions and tombstones are cached in server memory as a fallback
during transient relay failures. Older relay events cannot roll back a newer cached
session or deactivation. This cache is disposable; Nostr remains the source of truth.
Explicit session creation also fails during an uncached relay outage, so a retry
cannot overwrite an existing session with an empty draft.

The display retries reads after failures and missing-session responses. It keeps an
already loaded scoreboard visible during transient read failures. Reads are scheduled
five seconds after the previous request completes, avoiding overlapping relay queries.
Only an explicit local deactivation stops polling; opening a public or existing
operator URL never creates a session.

## Trust Model

For production, the display page must not accept arbitrary session events from any pubkey.

Use one of:

- A configured organizer pubkey allowlist.
- A Vercel service key that signs session events after admin authorization.
- A Nostr signer flow where the organizer signs the session event.

The simplest first production version is:

```text
Admin page -> Vercel API -> service key signs kind:30078 -> relay
Display page -> relay -> allow service pubkey
```

This still avoids an app DB. Vercel stores only secrets in environment variables.

## Contestants Without Nostr Accounts

If a contestant has no Nostr account:

1. Generate a temporary private key in the admin browser.
2. Publish a `kind:0` metadata event with:
   - display name
   - Lightning Address (`lud16`)
   - optional image
3. Store the temporary private key only in the admin browser `localStorage`.
4. Add the temporary pubkey to the session event.

Current admin UI behavior:

- `Create temp profile` publishes the contestant metadata as `kind:0`.
- The generated pubkey is written into the contestant's Nostr public key field.
- The temporary private key is saved only in the admin browser localStorage.
- The session is saved after the temporary profile is created.

## Reset / Cleanup

When the battle is reset or the contestant is removed:

1. If the contestant was created by this app and the temporary private key is still available, publish a blank `kind:0` metadata event.
2. Remove that temporary key from localStorage.
3. Publish an updated session event without that contestant or with blank values.

Blank metadata content:

```json
{}
```

Important limitation: if the admin browser loses the temporary private key, the app cannot blank that temporary profile later. This is the same operational boundary as Blogstr's instant contestant behavior.

Current admin UI behavior:

- `Blank temp profile` clears one app-created temporary profile if the key is still in this browser.
- `Reset` tries to blank both app-created temporary profiles, then clears the session back to draft values.
- `Deactivate URL` publishes a newer session tombstone, omits the ID from the saved URL list, and tries to blank both app-created temporary profiles after the tombstone is accepted.
- Existing participant npubs that were manually entered are not blanked, because this app does not have their private keys.

## URL Deactivation

URL deactivation is a logical Nostr deletion, not guaranteed physical erasure:

1. Publish a newer service-signed `kind:30078` event with the same `d` tag and
   `deleted: true`.
2. Treat that tombstone as distinct from a Battle ID that has never existed, so
   stale server-memory data cannot restore the session.
3. Stop operator polling from recreating the session. Only the top-page new-ID
   flow may send the one-time explicit `create=1` request.
4. Try to blank app-created temporary profiles when their keys remain in the
   current browser.

The public route remains part of the app, earlier relay or cache copies may
remain, and Zap receipt events are not deleted. Reusing the same ID from the top
page deliberately publishes a new session event after the tombstone.

## What Vercel Still Does

Vercel is still useful, but not as a session DB:

- LNURL Pay proxy
- anonymous Zap request signing
- fixed QR LNURL generation
- optional service-signed session event publishing
- health checks

Realtime Zap receipt display remains browser-to-relay. A server-side catch-up endpoint
queries both the configured receipt relays and the relay targets included in Zap requests
every 10 seconds so receipt updates can recover when browser WebSocket access is blocked
or interrupted.

## Receipt Subscription

The display page subscribes to Nostr `kind:9735` Zap receipt events from the browser.
It uses the app API for periodic catch-up and final result reconciliation.

Current matching logic:

- Use the signed Zap Request `created_at` with session `startsAt` as the opening boundary and `endsAt + graceSeconds` as the closing boundary. The 30-second grace period is hidden and is not shown as extra battle time.
- Accept a signed Zap Receipt event for up to 24 hours after that closing boundary when its embedded signed Zap Request was created inside the battle window. This covers wallet settlement and receipt-publication delays without counting a Zap initiated after the battle.
- Re-query receipts on the Final Result screen and merge newly found receipt IDs into the displayed result. A persisted final snapshot remains the fallback if relays are unavailable.
- QR images are stable for each Battle ID and side. The callback adds `zap_live_starts_at` only while the session is live, so pre-Start payments can complete but do not count toward a run.
- Subscribe with `#p` for the left/right contestant pubkeys.
- Parse the receipt `description` tag as a signed `kind:9734` Zap request.
- Prefer `zap_live` and `zap_live_side` tags when present.
- Fall back to the Zap request/receipt `p` tag matching the left/right contestant pubkey.
- Use the Zap request `amount` tag for the current MVP.

When a matching receipt is added to the feed, the display page triggers the confetti/cracker animation and the optional sound effect.

## Invoice Validation and Audit

Before the LNURL callback returns a wallet invoice to the payer, the server validates
the returned BOLT11 invoice against the exact serialized, signed `kind:9734` Zap Request:

1. The invoice amount must exactly equal the requested millisatoshi amount.
2. The invoice must contain one 32-byte `description_hash` tag.
3. That tag must equal `SHA-256(JSON.stringify(zapRequest))` byte for byte.

This prevents a recipient callback from substituting a different amount or returning
an invoice that is not bound to the signed Zap Request. Invalid invoices are never
returned to the payer.

For each valid invoice, the service publishes a separate addressable audit event:

```json
{
  "kind": 30078,
  "content": "<NIP-44 ciphertext>",
  "tags": [
    ["d", "zap-battle-invoice-audit:<zap_request_id>:<invoice_hash>"],
    ["type", "zap_battle_invoice_audit"],
    ["client", "zap-battle"],
    ["p", "<service_pubkey>"],
    ["t", "zap-battle-audit:<session_id>"]
  ]
}
```

The encrypted content includes the exact invoice, exact Zap Request JSON and ID,
payment hash, actual/expected description hashes, Lightning Address, callback URL,
side, session timing, and validation result. A rejected invoice is also audited when
relay publication is available. Raw invoices and Lightning Addresses are not placed
in public event tags. Including both hashes in the addressable event key preserves
different invoices returned for the same Zap Request. The admin response also includes
the signed audit event ID as `auditEventId`.

The audit is self-encrypted with NIP-44 using `SERVICE_PRIVATE_KEY`. Only the service
can decrypt it, and the key must remain stable to read historical audits. Admins can
retrieve records with:

```bash
curl -H "x-admin-token: <ADMIN_TOKEN>" \
  https://zap-battle.example.com/api/zap-live/sessions/<session_id>/invoice-audits
```

Do not put the admin token in the query string. If every configured audit relay is
temporarily unavailable, the failure is written to server logs using only the invoice
hash and Zap Request ID. A valid invoice is still returned so an audit outage does not
break the existing Zap flow.
