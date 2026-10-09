"use client";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { DEFAULT_SPECIAL_ZAP_THRESHOLD, normalizeSpecialZapThreshold, specialZapDurationMs } from "@/src/special-zap";
import { createConfetti, ZAP_CELEBRATION_TIERS, zapCelebrationTier, type CelebrationTarget, type ConfettiPiece, type ZapCelebrationTier } from "@/src/zap-celebration";
import { SpecialZapCelebration } from "@/src/ui/special-zap-celebration";
import { ZapCelebration } from "@/src/ui/zap-celebration";
import { themeStyle } from "@/src/battle-theme";
import type { ZapBattleSession } from "@/src/types";

type Preview = { amount?: number; special: boolean; side: CelebrationTarget; tier: ZapCelebrationTier; confetti: ConfettiPiece[]; nonce: number };
export function BattleZapSettings({ session, onChange, disabled, locale, onValidChange }: {
  session: ZapBattleSession; onChange: Dispatch<SetStateAction<ZapBattleSession>>; disabled: boolean; locale: "en" | "ja"; onValidChange(valid: boolean): void;
}) {
  const threshold = normalizeSpecialZapThreshold(session.specialZapThresholdSats);
  const [draft, setDraft] = useState(String(threshold ?? DEFAULT_SPECIAL_ZAP_THRESHOLD));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [side, setSide] = useState<"left" | "right">("left");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ja = locale === "ja";
  const value = Number(draft);
  const valid = threshold === null || (/^\d+$/.test(draft) && Number.isSafeInteger(value) && value > 0);
  useEffect(() => { setDraft(String(threshold ?? DEFAULT_SPECIAL_ZAP_THRESHOLD)); }, [threshold]);
  useEffect(() => { onValidChange(valid); }, [valid, onValidChange]);
  useEffect(() => () => clearTimeout(timer.current), []);
  function stop() { clearTimeout(timer.current); setPreview(null); }
  function play(amount?: number, special = false, target: CelebrationTarget = side) {
    clearTimeout(timer.current);
    const tier = amount ? zapCelebrationTier(amount) : "hundred";
    setPreview({ amount, special, side: target, tier, confetti: createConfetti(target, tier), nonce: Date.now() });
    timer.current = setTimeout(() => setPreview(null), special && amount ? specialZapDurationMs(amount) : ZAP_CELEBRATION_TIERS[tier].durationMs);
  }
  return <section className="admin-card zap-settings">
    <h2>{ja ? "Zapの演出" : "Zap effects"}</h2>
    <fieldset disabled={disabled}>
      <label className="checkbox-field"><input type="checkbox" checked={threshold !== null} onChange={e => { const next = e.target.checked ? DEFAULT_SPECIAL_ZAP_THRESHOLD : null; onChange(current => ({ ...current, specialZapThresholdSats: next })); }} /><span>{ja ? "特別演出を有効にする" : "Enable special effect"}</span></label>
      <label className="field"><span>{ja ? "特別演出の発動額（sats）" : "Special effect threshold (sats)"}</span><input aria-label={ja ? "特別演出の発動額（sats）" : "Special effect threshold (sats)"} inputMode="numeric" type="text" value={draft} disabled={threshold === null} aria-invalid={!valid} onChange={e => { const next = e.target.value; setDraft(next); const amount = Number(next); if (/^\d+$/.test(next) && Number.isSafeInteger(amount) && amount > 0) onChange(current => ({ ...current, specialZapThresholdSats: amount })); }} /></label>
      {!valid ? <p role="alert">{ja ? "1以上の整数を入力してください。" : "Enter a positive whole number."}</p> : null}
      <p className="theme-note">{ja ? "1回のZapがこの額以上なら特別演出を再生します。合計得点ではありません。設定は「保存」で反映します。" : "A single Zap at or above this amount triggers the special effect. Save to apply."}</p>
    </fieldset>
    <div className="zap-preview-controls">
      <h3>{ja ? "すべての演出を確認" : "Preview all effects"}</h3>
      <p className="theme-note">{ja ? "演出だけを再生します。Zapの送信や得点の加算、設定の保存は行いません。プレビューは無音です。" : "Visual preview only. No payment, score change or saving. Previews are silent."}</p>
      <label className="field"><span>{ja ? "受け取り側" : "Recipient"}</span><select aria-label={ja ? "演出の受け取り側" : "Effect recipient"} value={side} onChange={e => setSide(e.target.value as "left" | "right")}><option value="left">PLAYER 1</option><option value="right">PLAYER 2</option></select></label>
      <div className="zap-preview-buttons">{[1, 10, 100, 1000, 10000].map(amount => <button className="button" type="button" key={amount} onClick={() => play(amount)}>{amount.toLocaleString("en-US")} sats</button>)}<button className="button gold" type="button" disabled={!valid || threshold === null} onClick={() => play(value, true)}>{ja ? "特別演出" : "Special effect"}{threshold !== null && valid ? ` · ${value.toLocaleString("en-US")} sats` : ""}</button><button className="button" type="button" onClick={() => play(undefined, false, "center")}>{ja ? "タイムアップ" : "Time up"}</button></div>
    </div>
    {preview ? <div className="zap-preview-stage" style={themeStyle(session.theme)}>
      {preview.special && preview.amount ? <SpecialZapCelebration key={preview.nonce} amount={preview.amount} side={preview.side === "right" ? "right" : "left"} recipient={session.contestants[preview.side === "right" ? "right" : "left"].displayName || (preview.side === "right" ? "PLAYER 2" : "PLAYER 1")} locale={locale} /> : <ZapCelebration key={preview.nonce} side={preview.side} tier={preview.tier} amount={preview.amount} confetti={preview.confetti} />}
      <button className="button zap-preview-close" type="button" onClick={stop}>{ja ? "プレビューを閉じる" : "Close preview"}</button>
    </div> : null}
  </section>;
}
