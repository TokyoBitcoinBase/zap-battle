# WordPress iframe Embed

The first WordPress integration should be iframe based.

## Why iframe

- Avoids WordPress theme CSS conflicts.
- Avoids plugin JavaScript conflicts.
- Keeps service keys and API logic outside WordPress.
- Lets Vercel handle both the Zap Battle page and the API.

## Public Screen Page

Paste this into a WordPress custom HTML block:

```html
<iframe
  src="https://zap-battle.example.com/zap-battle/SESSION_ID/display"
  style="width:100%;min-height:900px;border:0;"
  loading="lazy"
  referrerpolicy="strict-origin-when-cross-origin"
  title="Zap Battle"
></iframe>
```

Replace:

- `SESSION_ID` with the battle session ID.

## Admin Page

If the organizer wants the admin UI inside WordPress too:

```html
<iframe
  src="https://zap-battle.example.com/zap-battle/admin/SESSION_ID"
  style="width:100%;min-height:1000px;border:0;"
  loading="lazy"
  referrerpolicy="strict-origin-when-cross-origin"
  title="Zap Battle Admin"
></iframe>
```

For production, admin URLs must require an admin token or another access check.

The Vercel app can also be opened directly without WordPress:

```text
https://zap-battle.example.com/zap-battle/SESSION_ID/display
```

This is fine for public display. The admin page must be protected by `ADMIN_TOKEN` before real events.

## WordPress Responsibilities

WordPress only displays the iframe. It should not:

- Store Nostr service private keys.
- Generate Zap requests.
- Handle LNURL callbacks.
- Run Node.js.
- Subscribe to Nostr relays on the server.
