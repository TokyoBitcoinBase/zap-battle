"use client";
import { useState, type Dispatch, type SetStateAction } from "react";
import { DEFAULT_THEME, FONTS, normalizeTheme, THEME_PRESETS, themeStyle, type BattleTheme } from "@/src/battle-theme";
import type { ZapBattleSession } from "@/src/types";

export function BattleThemeEditor({ session, onChange, adminToken, disabled, locale, onBusyChange }: {
  session: ZapBattleSession; onChange: Dispatch<SetStateAction<ZapBattleSession>>; adminToken: string; disabled: boolean; locale: "en" | "ja"; onBusyChange(busy: boolean): void;
}) {
  const theme = normalizeTheme(session.theme);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const ja = locale === "ja";
  const update = (patch: Partial<BattleTheme>) => onChange(current => ({ ...current, theme: { ...normalizeTheme(current.theme), ...patch } }));
  async function upload(file: File | undefined, target: "background" | "left" | "right") {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setMessage(ja ? "画像は2MB以下にしてください。" : "Choose an image up to 2 MB."); return; }
    setUploading(true); onBusyChange(true); setMessage("");
    try {
      const response = await fetch(`/api/zap-live/sessions/${encodeURIComponent(session.id)}/images`, { method: "POST", headers: { "x-admin-token": adminToken, "content-type": file.type }, body: file });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || "Upload failed.");
      if (target === "background") update({ backgroundImageUrl: result.url });
      else onChange(current => ({ ...current, contestants: { ...current.contestants, [target]: { ...current.contestants[target], profileImageUrl: result.url } } }));
      setMessage(ja ? "アップロードしました。「保存」で表示画面に反映します。" : "Uploaded. Save the battle to apply the image.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed."); }
    finally { setUploading(false); onBusyChange(false); }
  }
  const labels = { accent: ja ? "テーマ色" : "Accent", background: ja ? "背景色" : "Background", text: ja ? "文字色" : "Text", left: "PLAYER 1", right: "PLAYER 2" };
  const busy = disabled || uploading;
  return <section className="admin-card theme-editor">
    <h2>{ja ? "表示デザイン" : "Display design"}</h2>
    <p className="theme-note">{ja ? "このバトルだけに適用します。プレビューで調整し、保存してください。" : "Customize this battle, then save to apply your changes."}</p>
    <fieldset disabled={busy} className="theme-controls">
      <label className="field"><span>{ja ? "プリセット" : "Preset"}</span><select aria-label={ja ? "プリセット" : "Preset"} value="" onChange={e => { const preset = THEME_PRESETS[Number(e.target.value)]; if (preset) onChange({ ...session, theme: { ...preset.theme, backgroundImageUrl: theme.backgroundImageUrl } }); }}><option value="" disabled>{ja ? "デザインを選ぶ" : "Choose a design"}</option>{THEME_PRESETS.map((p, i) => <option key={i} value={i}>{ja ? p.label : ["Broadcast", "Light event", "Photo arena"][i]}</option>)}</select></label>
      <div className="theme-colors">{(Object.keys(labels) as (keyof typeof labels)[]).map(key => <label key={key}><span>{labels[key]}</span><input aria-label={labels[key]} type="color" value={theme[key]} onChange={e => update({ [key]: e.target.value })} /><code>{theme[key]}</code></label>)}</div>
      <label className="field"><span>{ja ? "フォント" : "Font"}</span><select aria-label={ja ? "フォント" : "Font"} value={theme.font} onChange={e => update({ font: e.target.value as BattleTheme["font"] })}>{Object.entries(FONTS).map(([key, font]) => <option key={key} value={key}>{ja ? font.label : { sans: "Sans serif", serif: "Serif", mono: "Monospace" }[key as keyof typeof FONTS]}</option>)}</select></label>
      <label className="field"><span>{ja ? "背景画像の暗さ" : "Background darkness"} · {theme.backgroundDim}%</span><input type="range" min="0" max="100" value={theme.backgroundDim} onChange={e => update({ backgroundDim: Number(e.target.value) })} /></label>
      <div className="theme-uploads">{(["background", "left", "right"] as const).map(target => {
        const url = target === "background" ? theme.backgroundImageUrl : session.contestants[target].profileImageUrl;
        return <div key={target}><label className="field"><span>{target === "background" ? ja ? "背景画像" : "Background image" : `${target === "left" ? "PLAYER 1" : "PLAYER 2"} ${ja ? "画像" : "image"}`}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { void upload(e.target.files?.[0], target); e.target.value = ""; }} /></label>{url ? <button className="button" type="button" onClick={() => target === "background" ? update({ backgroundImageUrl: undefined }) : onChange({ ...session, contestants: { ...session.contestants, [target]: { ...session.contestants[target], profileImageUrl: undefined } } })}>{ja ? "画像を外す" : "Remove image"}</button> : null}</div>;
      })}</div>
      <p className="theme-note">{ja ? "JPEG・PNG・WebP / 2MB以下。公開画像として保存します。" : "JPEG, PNG or WebP / up to 2 MB. Images are stored publicly."}</p>
      <button className="button" type="button" onClick={() => onChange({ ...session, theme: { ...DEFAULT_THEME } })}>{ja ? "標準デザインに戻す" : "Reset design"}</button>
    </fieldset>
    <div className="theme-preview" style={themeStyle(theme)} aria-label={ja ? "デザインのプレビュー" : "Design preview"}>
      <strong className="theme-preview-title">{session.title || "Zap Battle"}</strong>
      <div className="theme-preview-players">{(["left", "right"] as const).map(side => <div className={side} key={side}>{session.contestants[side].profileImageUrl ? <img src={session.contestants[side].profileImageUrl} alt="" /> : null}<span>{session.contestants[side].displayName || (side === "left" ? "PLAYER 1" : "PLAYER 2")}</span><strong>12,345 <small>sats</small></strong></div>)}</div>
      <p>{ja ? "プレビュー · サンプル得点" : "Preview · sample scores"}</p>
    </div>
    {(uploading || message) ? <p role="status">{uploading ? ja ? "アップロード中…" : "Uploading…" : message}</p> : null}
  </section>;
}
