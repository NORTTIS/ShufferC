import { STAT_KEYS } from '../../../shared/constants';
import type { Stats } from '../../../shared/types';

const SHORT: string[] = ['str', 'dex', 'int', 'con'];

/** "STR 9 · DEX 8 · …" — short form shows str/dex/int/con; full shows every core stat. */
export function formatStats(stats: Stats, full = false): string {
  const keys = full ? STAT_KEYS : STAT_KEYS.filter((k) => SHORT.includes(k));
  return keys.map((k) => `${k.toUpperCase()} ${stats[k] ?? 0}`).join(' · ');
}
