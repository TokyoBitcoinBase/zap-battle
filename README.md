# Zap Battle

Zap Battle is an event scoreboard for dance battles and live competitions. Audience members scan a Lightning QR code to send Zaps to either contestant, and the screen updates totals, zap count, recent Zap history, animations, and final results in realtime.

The app is designed to be deployed on Vercel and embedded in WordPress with an iframe. WordPress only displays the public page; the web app and API live on Vercel.

Live demo:

```text
https://zap-battle.tokyobitcoin.space
```

## Features

- Two-player Zap battle display
- Event-specific Battle IDs
- Saved Battle URL list after Admin Token verification
- Operator mode on the display page via `?admin=1`
- Admin Token gate for setup, save, start, end, and reset operations
- LNURL Pay QR generation through Vercel API routes
- Anonymous signed Zap requests with `zap_live` and `zap_live_side` tags
- Returned BOLT11 amount and Zap Request `description_hash` validation
- NIP-44-encrypted invoice/Zap Request audit events for incident investigation
- Browser-side Nostr relay subscription for realtime Zap receipts
- 10-second server-side catch-up query for missed or browser-blocked receipts
- 24-hour delayed-receipt recovery for payments initiated during the battle
- Final Result screen after `End Battle`
- No app database: sessions/results are stored as Nostr `kind:30078` events
- Temporary contestant Nostr profiles for entrants without Nostr accounts
- WordPress iframe embed support
- English/Japanese display toggle

## Architecture

```text
WordPress page
  iframe -> Vercel public display

Vercel / Next.js
  app UI
  API routes
  LNURL Pay proxy
  signed Zap request callback

Browser
  subscribes directly to Nostr relays for Zap receipts

Nostr relays
  session events
  encrypted invoice audit events
  temporary profiles
  Zap receipts
```

## Routes

```text
/                              Battle ID launcher
/zap-battle/:battleId/display  Public display
/zap-battle/:battleId/display?admin=1  Operator display
/zap-battle/:battleId/display?admin=1&create=1  Explicit creation from the top page
/zap-battle/admin/:battleId    Admin fallback page
/api/zap-live/sessions         Admin-only saved Battle URL list
/api/zap-live/sessions/:battleId/invoice-audits  Admin-only decrypted invoice audits
/api/zap-live/*                API routes
```

Public and existing operator display pages do not create unknown Battle IDs. The
token-gated top page explicitly creates a new Battle ID, then removes the one-time
`create=1` query parameter from the browser URL.

## Local Development

```bash
pnpm install
pnpm test
pnpm dev
```

Open:

```text
http://localhost:3000
```

When `ADMIN_TOKEN` is not set, local development admin checks are open. Production should always set `ADMIN_TOKEN`.

## Environment Variables

Copy `.env.example` and set production values in Vercel Environment Variables.

Required for production:

```text
ADMIN_TOKEN
TOKEN_SECRET
SERVICE_PRIVATE_KEY
NEXT_PUBLIC_SITE_URL
```

Recommended:

```text
NOSTR_SESSION_RELAYS
NEXT_PUBLIC_NOSTR_SESSION_RELAYS
ZAP_REQUEST_RELAYS
ALLOWED_ORIGINS
```

Never commit real tokens, nsecs, private keys, or production secrets.

## WordPress Embed

Use the public display URL without `?admin=1`.

```html
<iframe
  src="https://zap-battle.example.com/zap-battle/tokyo-final/display"
  style="width:100%;min-height:900px;border:0;"
  loading="lazy"
  referrerpolicy="strict-origin-when-cross-origin"
  title="Zap Battle"
></iframe>
```

Operators should use:

```text
https://zap-battle.example.com/zap-battle/tokyo-final/display?admin=1
```

## Production Flow

1. Set Vercel environment variables.
2. Open the top page and enter the Admin Token.
3. Create a Battle ID such as `tokyo-final`.
4. Open the operator display.
5. Enter contestants, Lightning Addresses, optional Nostr public keys, and battle time.
   Use only public nicknames or stage names for contestant display names.
6. Copy the public display iframe into WordPress.
7. On event day, press `Start`.
8. Press `End` to capture and show Final Result.
9. Press `Reset` before reusing the same Battle ID.

## URL Deactivation

`Deactivate URL` publishes a newer service-signed `kind:30078` tombstone for the
Battle ID. The public display becomes not configured and the ID is omitted from
the saved Battle URL list. It does not remove the application route itself.

The admin browser also tries to publish blank metadata for app-created temporary
Nostr profiles when their private keys are still available locally. Manually
entered participant profiles are never modified.

Nostr relays and caches may retain earlier session events, and Zap receipts are
independent events that remain on Nostr. Deactivation is therefore not a guarantee
of complete physical erasure. A deactivated Battle ID can be deliberately reused
from the top page as a new session.

## Nostr Relays

Internal session/profile/receipt defaults follow Blogstr:

```text
wss://yabu.me
wss://relay.primal.net
wss://relay.damus.io
wss://nos.lol
```

Zap request relay tags retain the same public fallback set so receiving wallets have
multiple publication targets:

```text
wss://yabu.me
wss://relay.primal.net
wss://relay.damus.io
wss://nos.lol
```

## Security Notes

- Store `ADMIN_TOKEN`, `TOKEN_SECRET`, and `SERVICE_PRIVATE_KEY` only in Vercel Environment Variables.
- Do not place service keys in WordPress, client-side JavaScript, or committed files.
- Public display URLs are intentionally public.
- Admin mutations require `ADMIN_TOKEN` in production.
- Invoice audits contain the exact invoice and signed Zap Request, so they are NIP-44 encrypted to the service key before relay publication. Read them with the admin-only audit endpoint and the `x-admin-token` header; do not put the token in a URL.
- Keep `SERVICE_PRIVATE_KEY` stable and backed up. Rotating or losing it makes earlier encrypted invoice audits unreadable.
- A temporary outage of every audit relay is logged with the invoice hash and Zap Request ID but does not reject an otherwise valid invoice.
- Contestant display names are public. Use nicknames or stage names only, unless the contestant has explicitly approved public display of their legal name.
- Reset and URL deactivation only blank app-created temporary Nostr profiles when the same browser still has the temporary key.

See [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).

## Status

This is an MVP intended for event use.

Still required before public OSS release:

- Verify real Zap end-to-end with an actual Lightning Address and wallet.
