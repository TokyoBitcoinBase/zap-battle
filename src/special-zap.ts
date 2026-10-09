export const DEFAULT_SPECIAL_ZAP_THRESHOLD = 100_000;
export function normalizeSpecialZapThreshold(value: unknown): number | null {
  if (value === null) return null;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value : DEFAULT_SPECIAL_ZAP_THRESHOLD;
}
export function isSpecialZap(amount: number | undefined, threshold: number | null): boolean {
  return threshold !== null && typeof amount === "number" && Number.isSafeInteger(amount) && amount >= threshold;
}
export function specialZapRevealMs(amount: number): number {
  return 700 + (String(amount).length - 1) * 180;
}
export function specialZapDurationMs(amount: number): number {
  return specialZapRevealMs(amount) + 2600;
}
// Units settle first; the most significant digit settles last.
export function specialZapDigits(amount: number, elapsedMs: number): { digit: string; settled: boolean }[] {
  const digits = String(amount).split("");
  return digits.map((digit, index) => {
    const settleAt = 700 + (digits.length - 1 - index) * 180;
    const settled = elapsedMs >= settleAt;
    return { digit: settled ? digit : String(Math.floor(Math.max(0, elapsedMs) / 65) % 10), settled };
  });
}
