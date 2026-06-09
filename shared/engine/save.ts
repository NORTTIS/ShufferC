import { SaveState, StatusEffect } from '../types';
import { SAVE_VERSION, BASE_HP, HP_PER_CON } from '../constants';

export function serialize(save: SaveState): string {
  return JSON.stringify(save);
}

export function deserialize(json: string): SaveState {
  const data = JSON.parse(json) as Partial<SaveState> & { version: number };
  if (data.version > SAVE_VERSION) {
    throw new Error(`Unsupported save version ${data.version}, max ${SAVE_VERSION}`);
  }
  // Backfill fields added in v3. deserialize has no item DB, so currentHp is
  // approximated from baseStats con; the session clamps it to the equip-adjusted max.
  const con = data.character?.baseStats?.con ?? 0;
  const migrated: SaveState = {
    ...(data as SaveState),
    version: SAVE_VERSION,
    gold: data.gold ?? 0,
    xp: data.xp ?? 0,
    level: data.level ?? 1,
    consumables: data.consumables ?? {},
    vitals: data.vitals ?? { currentHp: BASE_HP + con * HP_PER_CON, pendingBuffs: [] as StatusEffect[] },
  };
  return migrated;
}
