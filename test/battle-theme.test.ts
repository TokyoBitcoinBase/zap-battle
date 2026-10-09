import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_THEME, normalizeTheme, safeImageUrl, themeStyle } from "../src/battle-theme";
import { normalizeSession } from "../src/session-validation";

test("legacy sessions keep their original appearance and customized sessions retain the theme", () => {
  assert.equal(normalizeSession({}, "legacy").theme, undefined);
  const theme = { ...DEFAULT_THEME, left: "#123456", font: "serif", backgroundImageUrl: "https://example.com/photo.webp" };
  assert.deepEqual(normalizeSession({ theme }, "custom").theme, theme);
});
test("untrusted theme values cannot introduce CSS or unsafe image schemes", () => {
  const theme = normalizeTheme({ left: "red; background:url(x)", font: "unknown", backgroundImageUrl: "javascript:alert(1)", backgroundDim: Infinity });
  assert.equal(theme.left, DEFAULT_THEME.left);
  assert.equal(theme.font, "sans");
  assert.equal(theme.backgroundImageUrl, undefined);
  assert.equal(theme.backgroundDim, 65);
  assert.equal(safeImageUrl("https://user:password@example.com/photo"), undefined);
  assert.equal(normalizeTheme({ backgroundDim: 999 }).backgroundDim, 100);
  assert.equal(themeStyle(theme)["background"], undefined);
});
