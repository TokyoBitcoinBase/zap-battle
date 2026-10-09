"use client";
import { TimeUpCelebration } from "@/src/ui/time-up-celebration";
import type { CSSProperties } from "react";
import { ZAP_CELEBRATION_TIERS, type CelebrationTarget, type ConfettiPiece, type ZapCelebrationTier } from "@/src/zap-celebration";
export function ZapCelebration({ side, tier, amount, confetti, locale = "en" }: { side: CelebrationTarget; tier: ZapCelebrationTier; amount?: number; confetti: ConfettiPiece[]; locale?: "en" | "ja" }) {
  if (side === "center") return <TimeUpCelebration locale={locale} />;
  return (
        <div className={`celebration ${side} ${ZAP_CELEBRATION_TIERS[tier].className}`} aria-hidden="true">
          <div className="zap-flash" />
          <div className="zap-ring ring-one" />
          {tier === "thousand" || tier === "tenThousand" ? <div className="zap-ring ring-two" /> : null}
          {tier === "tenThousand" ? <div className="zap-ring ring-three" /> : null}
          <div className="burst-text">
            <span>{ZAP_CELEBRATION_TIERS[tier].text}</span>
            {amount ? <small>{amount.toLocaleString()} sats</small> : null}
          </div>
          {confetti.map((piece) => (
            <span
              className="confetti"
              key={piece.id}
              style={{
                "--x": piece.x,
                "--y": piece.y,
                "--dx": piece.dx,
                "--dy": piece.dy,
                "--r": piece.r,
                "--color": piece.color,
                "--size": piece.size
              } as CSSProperties}
            />
          ))}
        </div>
  );
}
