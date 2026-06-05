import { StatKey, EquipSlot } from './types';

export const STAT_KEYS: StatKey[] = ['str', 'dex', 'int', 'wis', 'cha', 'con'];
export const EQUIP_SLOTS: EquipSlot[] = ['weapon', 'armor', 'ring', 'scroll', 'quest'];

export const DICE_MIN_MULT = 0.1;
export const DICE_MAX_MULT = 2.0;

export const BASE_HP = 20;
export const HP_PER_CON = 5;

export const SAVE_VERSION = 1;
