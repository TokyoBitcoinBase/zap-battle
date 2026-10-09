# Battle appearance and images

Appearance is saved with each existing Nostr session event. Sessions without a theme retain their original appearance. The admin editor provides presets, five colors, three system-font stacks, background darkness, background/player image uploads and a live sample preview. Save applies the draft to the public display on its next refresh.

## Employer's Vercel project

Do not create or connect storage in the developer's personal Vercel account. GitHub push triggers the existing deployment integration; no Vercel account/settings changes are part of this implementation.

An administrator of the employer's Vercel project must create a **public** Blob store in the project's Storage tab and connect it to the required environments. The SDK can use `BLOB_STORE_ID` with Vercel OIDC, or `BLOB_READ_WRITE_TOKEN`. Neither credential is exposed to the browser. `ADMIN_TOKEN` must also be configured; image writes reject requests if it is absent. After connecting storage, redeploy so the environment variables are available.

Without storage connected, theme controls continue to work; image uploads return a connection error. No store is provisioned automatically.

## Image handling

Uploads accept JPEG, PNG and WebP, up to 2 MiB and 24 megapixels. The server verifies the decoded format, applies orientation, strips metadata, resizes within 1920 × 1920 without enlarging and encodes WebP at quality 80. Uploads have unique names under `battles/<battle-id>/`; browsers fetch the public Blob URL directly. Only the URL is included in the session event.

Uploading a file persists it immediately; saving the battle attaches its URL to the session. Removing an image from the editor, resetting the design or deactivating a battle does **not** physically delete the Blob. Old and abandoned uploads are retained for now, to avoid breaking another battle that references the same public URL. An employer administrator can review unused assets in Storage and delete them manually. Automatic cross-session cleanup is not implemented.

Images are public. Old Nostr events can retain old URLs. Storage, operations and delivery contribute to usage; monitor the employer team's plan and usage. Uploads go through a Function and also contribute to its request/transfer usage.

## Verification

Theme normalization tests cover legacy compatibility, allowed colors/fonts/URLs and bounds. Upload tests cover fail-closed authentication, JPEG-to-WebP resizing, metadata removal and rejection of SVG/non-images. Browser checks use intercepted session responses (no production writes) to verify Save/reload, public display styles and desktop/mobile layouts. Actual relay publication and Blob writes require the employer's configured deployment and were not exercised locally.
