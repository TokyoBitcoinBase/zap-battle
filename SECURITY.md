# Security

## Secrets

Do not commit production secrets.

Keep these values only in Vercel Environment Variables or another secure secret store:

- `ADMIN_TOKEN`
- `TOKEN_SECRET`
- `SERVICE_PRIVATE_KEY`

Do not paste service private keys into WordPress, public JavaScript, README examples, GitHub Issues, screenshots, or deployment logs.

## Admin Access

Public display URLs are intentionally public. Operator actions are protected by `ADMIN_TOKEN` in production:

- Save
- Start
- End
- Reset
- Session creation through operator flow

If `ADMIN_TOKEN` is not configured, local development remains open. Production deployments must set `ADMIN_TOKEN`.

## Nostr Keys

`SERVICE_PRIVATE_KEY` signs session events and anonymous Zap requests. Treat it as a production secret.

Temporary contestant profiles are generated in the operator browser. Their temporary private keys are stored only in that browser's `localStorage`. Reset can blank those temporary profiles only if the same browser still has the key.

## Contestant Names

Contestant display names are public on the event screen and may also be included in Nostr session/profile metadata. Use only public nicknames, stage names, or names that the contestant has explicitly approved for public display. Do not enter legal names or private personal identifiers by default.

## Reporting

Report security issues privately to the project owner or employer repository maintainers. Do not open public issues containing secrets, private keys, tokens, or exploit details.
