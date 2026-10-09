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
  accent: "#ffd238", background: "#070813", text: "#f8f7ff", left: "#20d4ff", right: "#ff3e88", font: "sans", backgroundDim: 65
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
  return { "--green": t.left, "--gold": t.accent, "--cyan": t.left, "--pink": t.right, "--text": t.text,
    "--muted": `color-mix(in srgb, ${t.text} 65%, ${t.background})`, "--bg": t.background,
    "--panel": `color-mix(in srgb, ${t.background} 90%, ${t.text})`,
    "--theme-overlay": t.backgroundImageUrl ? `rgba(0, 0, 0, ${t.backgroundDim / 100})` : "transparent", "--battle-font": FONTS[t.font].css,
    "--theme-image": t.backgroundImageUrl ? `url(${JSON.stringify(t.backgroundImageUrl)})` : "none"
  } as CSSProperties;
}
