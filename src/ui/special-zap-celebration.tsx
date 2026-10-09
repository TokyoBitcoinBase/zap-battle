"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { specialZapDigits, specialZapDurationMs, specialZapRevealMs } from "@/src/special-zap";

export function SpecialZapCelebration({ amount, recipient, side, locale = "en" }: {
  amount: number; recipient: string; side: "left" | "right"; locale?: "en" | "ja";
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const start = performance.now();
    let frame = 0;
    function tick() {
      const next = performance.now() - start;
      setElapsed(media.matches ? specialZapRevealMs(amount) : next);
      if (next < specialZapRevealMs(amount) && !media.matches) frame = requestAnimationFrame(tick);
    }
    tick();
    return () => cancelAnimationFrame(frame);
  }, [amount]);
  const digits = specialZapDigits(amount, elapsed);
  const settled = digits.every(digit => digit.settled);
  return <div className={`special-zap ${side} ${settled ? "settled" : "counting"}`} style={{ "--special-duration": `${specialZapDurationMs(amount)}ms`, "--special-digit-size": `min(17vw, ${Math.floor(100 / digits.length)}vw, 18vh, 160px)` } as CSSProperties} aria-hidden="true">
    <div className="special-zap-rays" />
    <div className="special-zap-ring" />
    <div className="special-zap-sparks">{Array.from({ length: 48 }, (_, index) => <i key={index} style={{ "--spark-angle": `${index * 137.5}deg`, "--spark-delay": `${index % 8 * 70}ms`, "--spark-distance": `${24 + index % 7 * 5}vmin` } as CSSProperties} />)}</div>
    <div className="special-zap-content">
      <p className="special-zap-label">JACKPOT ZAP</p>
      <p className="special-zap-recipient">{locale === "ja" ? "受け取り" : "FOR"} <strong>{recipient}</strong></p>
      <div className="special-zap-amount" aria-label={`${amount.toLocaleString("en-US")} sats`}>
        {digits.map((digit, index) => <span className="special-zap-place" key={index}>{index > 0 && (digits.length - index) % 3 === 0 ? <b className="special-zap-comma">,</b> : null}<span className={`special-zap-digit ${digit.settled ? "locked" : "rolling"}`}>{digit.digit}</span></span>)}
      </div>
      <p className="special-zap-unit">SATS</p>
      <p className="special-zap-caption">{settled ? locale === "ja" ? "会場を揺らすビッグZap！" : "THE CROWD GOES WILD" : locale === "ja" ? "ビッグZapが到着…" : "A BIG ZAP JUST LANDED"}</p>
    </div>
  </div>;
}
