"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { SPECIAL_ZAP_FADE_MS, SPECIAL_ZAP_HOLD_MS, SPECIAL_ZAP_ROLL_STEP_MS, specialZapDigits, specialZapRevealMs } from "@/src/special-zap";

import { CONFETTI_COLORS } from "@/src/zap-celebration";

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
  return <div className={`special-zap ${side} ${settled ? "settled" : "counting"}`} style={{ "--special-fade-delay": `${specialZapRevealMs(amount) + SPECIAL_ZAP_HOLD_MS}ms`, "--special-fade-duration": `${SPECIAL_ZAP_FADE_MS}ms`, "--special-digit-size": `min(20vw, ${Math.floor(110 / digits.length)}vw, 20vh, 192px)`, "--special-roll-duration": `${SPECIAL_ZAP_ROLL_STEP_MS}ms`, "--special-progress": Math.min(1, elapsed / specialZapRevealMs(amount)) } as CSSProperties} aria-hidden="true">
    <div className="special-zap-stage" />
    <div className="special-zap-impact" />
    <div className="special-zap-frame" />
    <div className="special-zap-sparks">{Array.from({ length: 40 }, (_, index) => <i key={index} style={{ "--spark-x": `${index % 2 ? 84 : 16}%`, "--spark-shift": `${(index % 2 ? -1 : 1) * (8 + index * 17 % 24)}vw`, "--spark-delay": `${index % 10 * 35}ms`, "--spark-lift": `${24 + index * 13 % 46}vh` } as CSSProperties} />)}</div>
    <div className="special-zap-confetti">{Array.from({ length: 96 }, (_, index) => <i key={index} style={{
      "--confetti-color": CONFETTI_COLORS[index % CONFETTI_COLORS.length],
      "--confetti-x": `${(index * 37) % 100}%`,
      "--confetti-drift": `${(index % 9 - 4) * 4}vw`,
      "--confetti-delay": `${(index * 43 % 29) * 45}ms`,
      "--confetti-size": `${5 + (index * 7 % 5)}px`,
      "--confetti-rotation": `${(index % 2 ? 1 : -1) * (360 + index % 5 * 180)}deg`
    } as CSSProperties} />)}</div>
    <div className="special-zap-content">
      <div className="special-zap-heading">
        <div className="special-zap-wordmark">
          <svg className="special-zap-bolt" viewBox="0 0 24 32" fill="currentColor"><path d="M14 0 1 18h9L7 32l16-21H13z" /></svg>
          <p className="special-zap-label">LEGEND <span>ZAP</span></p>
        </div>
        <p className="special-zap-recipient"><span>{locale === "ja" ? "受け取り" : "FOR"}</span> <strong>{recipient}</strong></p>
      </div>
      <div className="special-zap-score">
        <div className="special-zap-amount" aria-label={`${amount.toLocaleString("en-US")} sats`}>
          {digits.map((digit, index) => <span className="special-zap-place" key={index}>{index > 0 && (digits.length - index) % 3 === 0 ? <b className="special-zap-comma">,</b> : null}<span className={`special-zap-digit ${digit.settled ? "locked" : "rolling"}`}>{digit.digit}</span></span>)}
        </div>
        <p className="special-zap-unit">SATS</p>
        <div className="special-zap-charge"><i /></div>
      </div>
      <p className="special-zap-caption">{settled ? locale === "ja" ? "会場を揺らすビッグZap！" : "THE CROWD GOES WILD" : locale === "ja" ? "ビッグZapが到着…" : "A BIG ZAP JUST LANDED"}</p>
    </div>
  </div>;
}
