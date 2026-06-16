# Vercel Deployment

The app is deployed to Vercel from the employer's GitHub repository.

## Recommended Setup

- Framework: Next.js
- Runtime: Vercel Functions / Next.js Route Handlers
- Production domain: `zap-battle.example.com`
- WordPress embed: iframe

## Environment Variables

Required later for production:

```text
TOKEN_SECRET=
ADMIN_TOKEN=
SERVICE_PRIVATE_KEY=
NOSTR_SESSION_RELAYS=wss://yabu.me,wss://relay.primal.net,wss://relay.damus.io,wss://nos.lol
NEXT_PUBLIC_NOSTR_SESSION_RELAYS=wss://yabu.me,wss://relay.primal.net,wss://relay.damus.io,wss://nos.lol
ZAP_REQUEST_RELAYS=wss://yabu.me,wss://relay.primal.net,wss://nos.lol
ALLOWED_ORIGINS=https://example.com
NEXT_PUBLIC_SITE_URL=https://zap-battle.example.com
```

Do not store service private keys in WordPress or browser JavaScript.

## Public Site / Admin Safety

The deployed Vercel site can be used directly, not only through a WordPress iframe.

Recommended public URLs:

```text
https://zap-battle.example.com/zap-battle/<session_id>/display
https://zap-battle.example.com/zap-battle/<session_id>/display?admin=1
```

The display URL without `?admin=1` is intentionally public.

The top page and operator display use an Admin Token gate. Production mutation APIs also require `ADMIN_TOKEN`. The admin UI stores the token in the operator browser and sends it as `x-admin-token` for Save, Start, End, Reset, and session creation. If `ADMIN_TOKEN` is not configured, local development remains open.

## Session Storage Requirement

The local prototype uses an in-memory session store. This is not production-safe on Vercel because serverless instances can be recreated and memory can be lost.

Before production, replace it with Nostr relay-backed session storage:

- publish battle settings as `kind:30078`
- fetch battle settings from configured relays
- allow only the organizer/service pubkey
- store app-created temporary contestant private keys only in the admin browser

The replacement point is:

```text
src/server/session-store.ts
```

This project intentionally avoids an app DB for battle/session configuration.

If `SERVICE_PRIVATE_KEY` is not set, the local development server falls back to in-memory sessions. In production, set `SERVICE_PRIVATE_KEY` so session changes are published to Nostr relays as `kind:30078` events.

## Vercel Flow

1. Create a GitHub repository for this project.
2. Push this project.
3. Import it from Vercel.
4. Add environment variables.
5. Deploy Preview.
6. Assign production domain.
7. Put the production iframe URL into WordPress.

## Runtime Boundary

Vercel handles HTTP request/response APIs:

- Session CRUD
- LNURL Pay metadata
- LNURL Pay callback
- Signed QR token generation
- Anonymous Zap request signing

Vercel should not be used as a long-running relay watcher. Browser pages connect directly to Nostr relays for realtime receipt updates.

Current implementation note:

- `/api/zap-live/token` is implemented.
- `/api/zap-live/lnurl` is implemented.
- `/api/zap-live/lnurl/callback` fetches the recipient LNURL Pay metadata, creates a signed Zap request, and forwards the invoice request to the recipient wallet callback.
- Callback forwarding requires `SERVICE_PRIVATE_KEY`.
