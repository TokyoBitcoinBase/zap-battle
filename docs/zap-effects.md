# Zap effects

Each battle stores `specialZapThresholdSats` in its existing Nostr session configuration. The default is 100,000 sats. A positive safe integer enables the effect at that amount **or above**; `null` disables it. The threshold checks a single receipt, not the player's accumulated score.

Admin → Zap effects provides the threshold, enable/disable checkbox and Preview all effects. The same controls appear in the display's Settings panel. Save applies configuration to the public display on its next session refresh. Invalid input disables saving.

Preview buttons cover the five existing tiers (1, 10, 100, 1,000 and 10,000 sats), the configured special amount and Time up. Choose PLAYER 1 or PLAYER 2 to inspect positioning. Previews reuse the production renderers, are silent, auto-close and can be dismissed early. They do not publish settings, initiate payments or modify scores. Previewing a regular tier deliberately plays that tier even if its amount exceeds a very low special threshold, so all designs remain inspectable.

Special receipts use a full-screen jackpot treatment: dark backdrop, gold rays, sparks, sequential digit reveal from units to the most significant place, exact received amount and recipient. Each digit cycles upward until it locks. Longer amounts get longer reveal times and smaller digits to remain within the viewport. The amount stays visible before fading. The normal receipt celebration queue serializes effects; receipt-ID deduplication applies to both kinds. Starting/resetting a run clears pending effects. The existing sound toggle also controls special receipts (using the existing tier sound); previews remain silent.

Reduced-motion preference removes movement and immediately reveals the final digits. Existing regular effects also use a static amount label under this preference.

Validation covers threshold boundaries, persistence/disable, exact right-to-left digit locking, normal tier selection, browser preview/save/reload, mobile/desktop rendering, receipt queue behavior and duplicate receipts. Browser fixtures intercept session/receipt responses; no actual Zap payment is performed.
