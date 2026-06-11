import { useEffect, useState } from 'react';
import { revealCount } from '../lib/typewriter';

/**
 * Reveals `text` incrementally like ink being written. Resets when text changes.
 * `skip()` reveals everything at once (tap-to-skip).
 */
export function useTypewriter(text: string, opts?: { charsPerTick?: number; intervalMs?: number; enabled?: boolean }) {
  const { charsPerTick = 3, intervalMs = 30, enabled = true } = opts ?? {};
  const [tick, setTick] = useState(0);
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    setTick(0);
    setSkipped(false);
    if (!enabled) return;
    const timer = setInterval(() => {
      setTick((n) => {
        const next = n + 1;
        if (revealCount(text.length, next, charsPerTick) >= text.length) clearInterval(timer);
        return next;
      });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [text, enabled, charsPerTick, intervalMs]);

  const count = skipped || !enabled ? text.length : revealCount(text.length, tick, charsPerTick);
  return {
    shown: text.slice(0, count),
    done: count >= text.length,
    skip: () => setSkipped(true),
  };
}
