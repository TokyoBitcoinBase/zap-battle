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
- Existing participant npubs that were manually entered are not blanked, because this app does not have their private keys.

## What Vercel Still Does

Vercel is still useful, but not as a session DB:

- LNURL Pay proxy
- anonymous Zap request signing
- QR token signing
- optional service-signed session event publishing
- health checks

Realtime Zap receipt display remains browser-to-relay.

## Receipt Subscription

The display page subscribes to Nostr `kind:9735` Zap receipt events from the browser.

Current matching logic:

- Use session `startsAt` as the opening boundary and `endsAt + graceSeconds` as the closing boundary. The 30-second grace period is only a hidden receipt settlement window; it is not shown as extra battle time.
- Subscribe with `#p` for the left/right contestant pubkeys.
- Parse the receipt `description` tag as a signed `kind:9734` Zap request.
- Prefer `zap_live` and `zap_live_side` tags when present.
- Fall back to the Zap request/receipt `p` tag matching the left/right contestant pubkey.
- Use the Zap request `amount` tag for the current MVP.

When a matching receipt is added to the feed, the display page triggers the confetti/cracker animation and the optional sound effect.
