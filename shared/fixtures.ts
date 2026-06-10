import { Item, Skill, Enemy, CharacterState, StoryNode, GameRoute, RouteBundle, AttributeDef, EffectTemplate } from './types';

export const SKILL_DB: Record<string, Skill> = {
  slash: { id: 'slash', name: 'Slash', targetStat: 'str', power: 1, effectTarget: 'enemy', sprite: 'skill.slash' },
  freezeBolt: {
    id: 'freezeBolt', name: 'Freeze Bolt', targetStat: 'int', power: 1, effectTarget: 'enemy',
    effects: [{ id: 'freeze', kind: 'control', duration: 1 }], sprite: 'skill.freeze',
  },
  meditate: {
    id: 'meditate', name: 'Meditate', effectTarget: 'self', power: 0,
    effects: [{ id: 'regen', kind: 'hot', duration: 3, magnitude: 3 }], sprite: 'skill.regen',
  },
};

export const ITEM_DB: Record<string, Item> = {
  dagger: { id: 'dagger', name: 'Dagger', slot: 'weapon', kind: 'gear', cost: 15, statMods: { str: 2 }, storyTags: ['rogue'], sprite: 'item.dagger' },
  ringOfRegen: {
    id: 'ringOfRegen', name: 'Ring of Regen', slot: 'ring', kind: 'gear', cost: 30, statMods: { con: 2 },
    onEquip: [{ id: 'regen', kind: 'hot', duration: 99, magnitude: 1 }], storyTags: ['mystic'], sprite: 'item.ring',
  },
  torch: { id: 'torch', name: 'Torch', slot: 'quest', kind: 'gear', storyTags: ['dungeon'], sprite: 'item.torch' },
  healPotion: { id: 'healPotion', name: 'Healing Potion', slot: 'scroll', kind: 'consumable', cost: 10, onUse: [{ id: 'heal', kind: 'hot', duration: 0, magnitude: 15 }], storyTags: [], sprite: 'item.potion' },
  regenScroll: { id: 'regenScroll', name: 'Scroll of Regen', slot: 'scroll', kind: 'consumable', cost: 18, onUse: [{ id: 'regen', kind: 'hot', duration: 3, magnitude: 3 }], storyTags: [], sprite: 'item.scroll' },
};

export const ENEMY_DB: Record<string, Enemy> = {
  goblin: {
    id: 'goblin', name: 'Goblin', stats: { str: 6, dex: 6, int: 2, wis: 2, cha: 2, con: 3 }, hp: 18,
    skillPriority: ['slash'], sprite: 'enemy.goblin',
    reward: { gold: [8, 14], xp: 25, drops: [{ itemId: 'healPotion', chance: 1 }], reputationDelta: { hero: 1 } },
  },
};

export const SAMPLE_CHARACTER: CharacterState = {
  background: 'rogue',
  baseStats: { str: 9, dex: 8, int: 7, wis: 5, cha: 6, con: 6 },
  inventory: ['dagger', 'ringOfRegen', 'torch'],
  equipped: { weapon: 'dagger', ring: 'ringOfRegen' },
  skillPriority: ['freezeBolt', 'slash'],
};

export const SAMPLE_NODES: Record<string, StoryNode> = {
  n1: {
    id: 'n1', source: 'pregen', prose: 'You reach a guarded gate.',
    choices: [
      { id: 'fight', text: 'Fight the goblin', nextNodeId: 'n2' },
      { id: 'sneak', text: 'Sneak past', skillCheck: { stat: 'dex', dc: 8 }, outcome: { reputationDelta: { hero: 1 } }, nextNodeId: 'n3' },
    ],
    combat: { enemyIds: ['goblin'] },
  },
  n2: {
    id: 'n2', source: 'pregen', prose: 'The goblin lies defeated. A travelling merchant nods at your loot.',
    choices: [{ id: 'end', text: 'Continue', nextNodeId: 'n3' }],
    merchant: { stock: [{ itemId: 'healPotion' }, { itemId: 'regenScroll' }, { itemId: 'ringOfRegen', price: 25 }] },
  },
  n3: { id: 'n3', source: 'pregen', prose: 'You enter the keep. The end of the demo route.', choices: [] },
};

export const SAMPLE_ROUTE: GameRoute = {
  id: 'demo-route', title: 'The Guarded Keep', sourceNovelId: 'hardcoded',
  acts: [{ id: 'act1', title: 'The Gate', nodeIds: ['n1', 'n2', 'n3'] }],
  itemPool: ['dagger', 'ringOfRegen', 'torch'], enemyPool: ['goblin'],
  endings: [{ id: 'reach-keep', title: 'Reached the Keep', condition: 'currentNodeId === n3' }],
  status: 'published',
};

export const SAMPLE_BUNDLE: RouteBundle = { route: SAMPLE_ROUTE, nodes: SAMPLE_NODES };

export const ATTRIBUTE_DB: Record<string, AttributeDef> = {
  str: { id: 'str', name: 'Strength',     abbrev: 'STR', roles: ['core'], builtin: true },
  dex: { id: 'dex', name: 'Dexterity',    abbrev: 'DEX', roles: ['core'], builtin: true },
  int: { id: 'int', name: 'Intelligence', abbrev: 'INT', roles: ['core'], builtin: true },
  wis: { id: 'wis', name: 'Wisdom',       abbrev: 'WIS', roles: ['core'], builtin: true },
  cha: { id: 'cha', name: 'Charisma',     abbrev: 'CHA', roles: ['core'], builtin: true },
  con: { id: 'con', name: 'Constitution', abbrev: 'CON', roles: ['core', 'defense', 'maxHp'], builtin: true },
};

export const EFFECT_DB: Record<string, EffectTemplate> = {
  poison:       { id: 'poison',       name: 'Poison',       archetype: 'dot',     kind: 'dot',     magnitude: 1,  builtin: true },
  regen:        { id: 'regen',        name: 'Regen',        archetype: 'hot',     kind: 'hot',     magnitude: 1,  builtin: true },
  heal:         { id: 'heal',         name: 'Heal',         archetype: 'hot',     kind: 'hot',     instant: true, builtin: true },
  attack_buff:  { id: 'attack_buff',  name: 'Attack Up',    archetype: 'statMod', kind: 'buff',    stat: 'str', magnitude: 1,  builtin: true },
  defense_down: { id: 'defense_down', name: 'Defense Down', archetype: 'statMod', kind: 'debuff',  stat: 'con', magnitude: -1, builtin: true },
  freeze:       { id: 'freeze',       name: 'Freeze',       archetype: 'control', kind: 'control', builtin: true },
  stun:         { id: 'stun',         name: 'Stun',         archetype: 'control', kind: 'control', builtin: true },
};
