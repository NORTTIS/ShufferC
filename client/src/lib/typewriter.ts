/** Number of characters revealed after `tick` intervals. Pure. */
export function revealCount(textLength: number, tick: number, charsPerTick: number): number {
  return Math.min(textLength, Math.max(0, tick) * charsPerTick);
}
