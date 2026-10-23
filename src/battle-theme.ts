import type { CSSProperties } from "react";

export const FONTS = {
  sans: { label: "ゴシック / Sans", css: 'Arial, "Hiragino Sans", "Yu Gothic", Meiryo, sans-serif' },
  serif: { label: "明朝 / Serif", css: '"Hiragino Mincho ProN", "Yu Mincho", Georgia, serif' },
  mono: { label: "等幅 / Mono", css: '"SFMono-Regular", Consolas, "Hiragino Sans", monospace' }
};
export type BattleTheme = {
  accent: string; background: string; text: string; left: string; right: string;
  font: keyof typeof FONTS; backgroundImageUrl?: string; backgroundDim: number;
};
export const DEFAULT_THEME: BattleTheme = {
  accent: "#ff7a1a", background: "#111216", text: "#f6f6f7", left: "#7ad8d1", right: "#e9a1a9", font: "sans", backgroundDim: 65
};
export const THEME_PRESETS: { label: string; theme: BattleTheme }[] = [
  { label: "放送用スコアボード", theme: DEFAULT_THEME },
  { label: "明るいイベント会場", theme: { ...DEFAULT_THEME, background: "#f2f4f7", text: "#172238", accent: "#936000", left: "#007caa", right: "#bc2355" } },
  { label: "写真を使う大会", theme: { ...DEFAULT_THEME, background: "#181818", accent: "#ffffff", left: "#ffb347", right: "#a9c7ff", backgroundDim: 40 } }
];
export function safeImageUrl(input: unknown): string | undefined {
  if (typeof input !== "string" || input.length > 600) return undefined;
  try { const url = new URL(input); return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}
export function normalizeTheme(input: unknown): BattleTheme {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const color = (key: "accent" | "background" | "text" | "left" | "right") => typeof value[key] === "string" && /^#[0-9a-f]{6}$/i.test(value[key] as string) ? value[key] as string : DEFAULT_THEME[key];
  return { accent: color("accent"), background: color("background"), text: color("text"), left: color("left"), right: color("right"),
    font: value.font === "serif" || value.font === "mono" ? value.font : "sans",
    backgroundImageUrl: safeImageUrl(value.backgroundImageUrl),
    backgroundDim: typeof value.backgroundDim === "number" && Number.isFinite(value.backgroundDim) ? Math.max(0, Math.min(100, value.backgroundDim)) : DEFAULT_THEME.backgroundDim };
}
export function themeStyle(input: unknown): CSSProperties {
  const t = normalizeTheme(input);
  // Correct display colors only. The saved theme and image settings remain editable as entered.
  const initialText = readableColor(t.text, t.background, 7);
  const panelTone = contrastRatio("#000000", t.background) > contrastRatio("#ffffff", t.background) ? "#ffffff" : "#000000";
  const panel = mixColor(t.background, panelTone, 0.04);
  const raised = mixColor(t.background, panelTone, 0.09);
  const text = initialText;
  const accent = readableColor(t.accent, t.background, 4.5);
  const left = readableColor(t.left, t.background, 4.5);
  const right = readableColor(t.right, t.background, 4.5);
  return { "--green": left, "--gold": accent, "--cyan": left, "--pink": right, "--text": text,
    "--muted": readableColor(mixColor(text, t.background, 0.3), t.background, 4.5), "--bg": t.background,
    "--panel": panel, "--panel-strong": raised, "--line": mixColor(raised, text, 0.22),
    "--on-accent": contrastRatio(accent, "#000000") >= contrastRatio(accent, "#ffffff") ? "#000000" : "#ffffff",
    "--theme-overlay": t.backgroundImageUrl ? `rgba(0, 0, 0, ${t.backgroundDim / 100})` : "transparent", "--battle-font": FONTS[t.font].css,
    "--theme-image": t.backgroundImageUrl ? `url(${JSON.stringify(t.backgroundImageUrl)})` : "none"
  } as CSSProperties;
}

export function contrastRatio(first: string, second: string): number {
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function mixColor(first: string, second: string, weight: number): string {
  return "#" + [1, 3, 5].map(index => Math.round(parseInt(first.slice(index, index + 2), 16) * (1 - weight) + parseInt(second.slice(index, index + 2), 16) * weight).toString(16).padStart(2, "0")).join("");
}

function readableColor(preferred: string, background: string, minimum: number): string {
  if (contrastRatio(preferred, background) >= minimum) return preferred;
  const target = contrastRatio("#000000", background) > contrastRatio("#ffffff", background) ? "#000000" : "#ffffff";
  for (let percent = 1; percent <= 100; percent++) {
    const candidate = mixColor(preferred, target, percent / 100);
    if (contrastRatio(candidate, background) >= minimum) return candidate;
  }
  return target;
}
