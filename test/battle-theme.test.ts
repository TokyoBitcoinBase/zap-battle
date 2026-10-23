import assert from "node:assert/strict";
import test from "node:test";
import { contrastRatio, DEFAULT_THEME, normalizeTheme, safeImageUrl, themeStyle } from "../src/battle-theme";
import { normalizeSession } from "../src/session-validation";

test("legacy sessions keep their original appearance and customized sessions retain the theme", () => {
  assert.equal(normalizeSession({}, "legacy").theme, undefined);
  const theme = { ...DEFAULT_THEME, left: "#123456", font: "serif", backgroundImageUrl: "https://example.com/photo.webp" };
  assert.deepEqual(normalizeSession({ theme }, "custom").theme, theme);
});

test("changing only the background keeps ordinary text and controls readable without rewriting the theme", () => {
  assert.equal(contrastRatio("#000000", "#ffffff"), 21);
  for (const background of ["#ffffff", "#070813", "#ffff00", "#128ab2", "#777777"]) {
    const theme = { ...DEFAULT_THEME, background };
    const original = structuredClone(theme);
    const style = themeStyle(theme) as Record<string, string>;
    for (const surface of [style["--bg"], style["--panel"], style["--panel-strong"]]) {
      for (const ink of ["--text", "--muted", "--gold", "--cyan", "--pink"]) {
        assert.ok(contrastRatio(style[ink], surface) >= 4.5, `${background}: ${ink} on ${surface}`);
      }
    }
    assert.ok(contrastRatio(style["--gold"], style["--on-accent"]) >= 4.5);
    assert.equal(style["--bg"], background);
    assert.deepEqual(theme, original);
  }
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
