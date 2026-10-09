import type { BattleSide } from "@/src/types";
export type ConfettiPiece = {
  id: string;
  x: string;
  y: string;
  dx: string;
  dy: string;
  r: string;
  color: string;
  size: string;
};

export type CelebrationTarget = BattleSide | "center";
export type ZapCelebrationTier = "one" | "ten" | "hundred" | "thousand" | "tenThousand";
const CONFETTI_COLORS = ["#ffd238", "#20d4ff", "#ff3e88", "#20f0b0", "#ffffff", "#ff8a1f"];
export const DEFAULT_ZAP_CELEBRATION_TIER: ZapCelebrationTier = "hundred";
export const ZAP_CELEBRATION_TIERS = {
  one: {
    className: "tier-one",
    durationMs: 760,
    confettiCount: 32,
    spreadMin: 52,
    spreadMax: 170,
    lift: 130,
    fall: 280,
    text: "ZAP!"
  },
  ten: {
    className: "tier-ten",
    durationMs: 880,
    confettiCount: 52,
    spreadMin: 70,
    spreadMax: 230,
    lift: 170,
    fall: 330,
    text: "ZAP!"
  },
  hundred: {
    className: "tier-hundred",
    durationMs: 980,
    confettiCount: 72,
    spreadMin: 80,
    spreadMax: 260,
    lift: 220,
    fall: 420,
    text: "BIG ZAP!"
  },
  thousand: {
    className: "tier-thousand",
    durationMs: 1240,
    confettiCount: 112,
    spreadMin: 120,
    spreadMax: 380,
    lift: 290,
    fall: 520,
    text: "MEGA ZAP!"
  },
  tenThousand: {
    className: "tier-ten-thousand",
    durationMs: 1520,
    confettiCount: 160,
    spreadMin: 160,
    spreadMax: 540,
    lift: 360,
    fall: 660,
    text: "LEGEND ZAP!"
  }
} satisfies Record<ZapCelebrationTier, {
  className: string;
  confettiCount: number;
  durationMs: number;
  fall: number;
  lift: number;
  spreadMax: number;
  spreadMin: number;
  text: string;
}>;


export function zapCelebrationTier(amountSats: number): ZapCelebrationTier {
  if (amountSats >= 10000) return "tenThousand";
  if (amountSats >= 1000) return "thousand";
  if (amountSats >= 100) return "hundred";
  if (amountSats >= 10) return "ten";
  return "one";
}

export function createConfetti(target: CelebrationTarget, tierName: ZapCelebrationTier): ConfettiPiece[] {
  const tier = ZAP_CELEBRATION_TIERS[tierName];
  const centerX = target === "left" ? 25 : target === "right" ? 75 : 50;
  const centerY = target === "center" ? 42 : 36;
  return Array.from({ length: tier.confettiCount }, (_, index) => {
    const side = index % 2 === 0 ? -1 : 1;
    const spread = tier.spreadMin + Math.random() * (tier.spreadMax - tier.spreadMin);
    const size = tierName === "tenThousand" ? 10 + Math.random() * 12 : tierName === "thousand" ? 8 + Math.random() * 10 : 6 + Math.random() * 8;
    return {
      id: `${Date.now()}-${index}`,
      x: `${centerX - 4 + Math.random() * 8}%`,
      y: `${centerY - 6 + Math.random() * 12}%`,
      dx: `${side * spread}px`,
      dy: `${-tier.lift + Math.random() * tier.fall}px`,
      r: `${Math.random() * 360}deg`,
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length] ?? "#ffd238",
      size: `${size}px`
    };
  });
}

