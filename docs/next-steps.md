# Next Steps

## Yutaro

1. Confirm the employer can create or provide a GitHub repository.
2. Confirm the employer can connect that repository to Vercel.
3. Confirm the WordPress page where the iframe will be pasted.
4. Confirm the two first test contestants and their Lightning Addresses.

## Employer

1. Prepare GitHub access.
2. Prepare Vercel access.
3. Prepare WordPress admin access.
4. Decide the public event page URL.
5. Decide whether the admin page is private in WordPress or only shared by direct URL.

## Build Order

1. Scaffold Next.js app.
2. Build dance-battle style display with mock data.
3. Add celebration behavior when a Zap is received.
4. Add admin form for contestant names and Lightning Addresses.
5. Add development session API.
6. Replace development memory storage with Nostr `kind:30078` session events.
7. Add instant contestant profile creation with Nostr `kind:0` metadata.
8. Add reset cleanup that publishes blank metadata for app-created temporary profiles.
9. Add Nostr relay receipt subscription.
10. Add LNURL Pay QR generation.
11. Add Vercel LNURL Pay proxy.
12. Test end-to-end with a real Zap-enabled Lightning Address.
13. Test from WordPress iframe.

## Current Implementation Status

- Next.js app scaffolded.
- Dance-battle display page exists.
- Admin editor page exists.
- Development session GET/PUT/start/end API routes exist.
- Display page reads session data from the development API.
- Received Zap demo button triggers confetti and sound.
- Admin can create app-owned temporary Nostr profiles for contestants without accounts.
- Admin reset attempts to blank app-owned temporary profiles.
- Display QR now requests `/api/zap-live/token` and encodes the returned LNURL Pay URL.
- LNURL metadata endpoint exists.
- LNURL callback endpoint forwards to the recipient wallet callback with a signed anonymous Zap request.
- Admin mutation APIs can be protected with `ADMIN_TOKEN`.
- Display page subscribes to Nostr `kind:9735` Zap receipts and triggers the celebration on matching receipts.
- Display page also runs a 10-second Nostr receipt catch-up query, plus an immediate catch-up when the tab becomes visible again, to recover from relay disconnects or background-tab misses.
- Admin battle time accepts minutes and seconds, so dance battle durations like 2:30 can be entered directly.
- End Battle captures the current totals and recent Zap receipts as `finalResult` in the session event. The display switches to a fixed Final Result screen until Reset.
- Display page can show an Admin modal when opened with `?admin=1`. The normal WordPress iframe URL should omit this query parameter.
- Top page has an Admin Token gate before the Battle ID launcher. Operators enter an event-specific Battle ID and open either the operator display or public display from there.
- Public display does not auto-create unknown Battle IDs. Unknown IDs show `Battle not configured` until an operator creates the session with a valid Admin Token.
- QR/Zap request relay tag uses the smaller Blogstr battle set: `wss://yabu.me`, `wss://relay.primal.net`, `wss://nos.lol`. This keeps LNURL QR density lower for wallet scanning.
- Internal session/profile/receipt relay defaults use the standard Blogstr set: `wss://yabu.me`, `wss://relay.primal.net`, `wss://relay.damus.io`, `wss://nos.lol`.

The session store publishes and reads Nostr `kind:30078` session events when `SERVICE_PRIVATE_KEY` is configured. Without that env var, it falls back to local in-memory storage for development only.

See `docs/nostr-session-storage.md`.

## Display Requirements

- Dark event-screen design.
- Two large contestant sides.
- Center VS and balance bar.
- Large QR per contestant.
- Realtime Zap feed.
- Final Result mode after End Battle, with winner/draw, fixed final totals, and Final Zaps.
- Operator mode on the display page via `?admin=1`, with setup/start/end/reset controls in a modal.
- Event-specific Battle IDs are URL path segments such as `/zap-battle/tokyo-final/display`.
- Creating/configuring Battle IDs requires `ADMIN_TOKEN`; public viewing does not.
- Confetti/cracker animation on received Zap.
- Short sound effect on received Zap after the operator enables sound.
- Realtime path is Nostr WebSocket subscription. Catch-up runs every 10 seconds as a safety net, not as the primary receiver.

Browsers block autoplay audio, so the screen needs a visible sound toggle. After the operator turns sound on once, incoming Zaps can trigger the effect sound.
