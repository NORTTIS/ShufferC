import { Stats, EquipSlot } from './types';

export interface Background {
  id: string;
  name: string;
  blurb: string;
  baseStats: Stats;
  inventory: string[];
  equipped: Partial<Record<EquipSlot, string>>;
  skillPriority: string[];
}

export const BACKGROUNDS: Record<string, Background> = {
  rogue: {
    id: 'rogue',
    name: 'Rogue',
    blurb: 'Quick and cunning. Strikes first, talks second.',
    baseStats: { str: 7, dex: 10, int: 7, wis: 5, cha: 8, con: 5 },
    inventory: ['dagger', 'torch'],
    equipped: { weapon: 'dagger' },
    skillPriority: ['slash'],
  },
  fighter: {
    id: 'fighter',
    name: 'Fighter',
    blurb: 'Tough and direct. Wins by outlasting.',
    baseStats: { str: 10, dex: 6, int: 5, wis: 6, cha: 6, con: 9 },
    inventory: ['dagger', 'ringOfRegen'],
    equipped: { weapon: 'dagger', ring: 'ringOfRegen' },
    skillPriority: ['slash'],
  },
  mage: {
    id: 'mage',
    name: 'Mage',
    blurb: 'Frail but freezes foes before they strike.',
    baseStats: { str: 5, dex: 6, int: 10, wis: 9, cha: 7, con: 5 },
    inventory: ['dagger', 'ringOfRegen', 'torch'],
    equipped: { ring: 'ringOfRegen' },
    skillPriority: ['freezeBolt', 'slash'],
  },
};
