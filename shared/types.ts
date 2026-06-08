export type StatKey = 'str' | 'dex' | 'int' | 'wis' | 'cha' | 'con';
export type Stats = Record<StatKey, number>;
export type EffectKind = 'buff' | 'debuff' | 'dot' | 'hot' | 'control';
export type EquipSlot = 'weapon' | 'armor' | 'ring' | 'scroll' | 'quest';

export interface StatusEffect {
  id: string;          // key into EFFECT_REGISTRY: "freeze" | "poison" | ...
  kind: EffectKind;    // set/normalized from the registry when applied
  duration: number;    // remaining turns; 0 = instantaneous (not retained)
  magnitude?: number;  // damage/heal/stat amount per the behavior
}

export interface EffectBehavior {
  kind: EffectKind;
  apply?(target: CombatActor, e: StatusEffect): void;
  tick?(target: CombatActor, e: StatusEffect): void;
  onExpire?(target: CombatActor, e: StatusEffect): void;
}

export interface Skill {
  id: string;
  name: string;
  targetStat?: StatKey;              // stat used for effectiveness; default 'str'
  effectTarget?: 'self' | 'enemy';   // where effects[] land; default 'enemy'
  power?: number;                    // base damage coefficient; default 1
  effects?: StatusEffect[];          // references effects by id; applied on use
  sprite?: string;
}

export interface Item {
  id: string;
  name: string;
  slot: EquipSlot;
  statMods?: Partial<Stats>;
  onEquip?: StatusEffect[];
  onUse?: StatusEffect[];
  grantsSkills?: string[];
  sprite?: string;
  storyTags: string[];
}

export interface Enemy {
  id: string;
  name: string;
  stats: Stats;
  hp: number;
  skillPriority: string[];
  sprite?: string;
}

export interface CombatActor {
  id: string;
  name: string;
  stats: Stats;                      // effective stats (after equip)
  hp: number;
  maxHp: number;
  statuses: StatusEffect[];
  skillPriority: string[];
  skillBook: Record<string, Skill>;
}

export interface CombatEvent {
  round: number;
  actorId: string;
  type: 'skill' | 'skip' | 'pass' | 'death';
  skillId?: string;
  targetId?: string;
  roll?: number;
  multiplier?: number;
  damage?: number;
  note?: string;
}

export interface CombatResult {
  winner: 'player' | 'enemies' | 'draw';
  rounds: number;
  log: CombatEvent[];
}

export interface ChoiceOutcome {
  statDelta?: Partial<Stats>;
  reputationDelta?: { hero?: number; villain?: number; factions?: Record<string, number> };
  addItems?: string[];
  removeItems?: string[];
  setFlags?: Record<string, boolean>;
}

export interface Choice {
  id: string;
  text: string;
  skillCheck?: { stat: StatKey; dc: number };
  outcome?: ChoiceOutcome;
  nextNodeId?: string;
}

export interface StoryNode {
  id: string;
  prose: string;
  choices: Choice[];
  combat?: { enemyIds: string[] };
  source: 'pregen' | 'live';
}

export interface Ending { id: string; title: string; condition: string; }
export interface Act { id: string; title: string; nodeIds: string[]; }

export interface GameRoute {
  id: string;
  title: string;
  sourceNovelId: string;
  acts: Act[];
  itemPool: string[];
  enemyPool: string[];
  endings: Ending[];
  status: 'draft' | 'published';
}

export interface CharacterState {
  background: string;
  baseStats: Stats;
  inventory: string[];                       // item ids owned
  equipped: Partial<Record<EquipSlot, string>>;
  skillPriority: string[];
}

export interface Reputation { hero: number; villain: number; factions: Record<string, number>; }

export interface SaveState {
  version: number;
  routeId: string;
  character: CharacterState;
  reputation: Reputation;
  flags: Record<string, boolean>;
  choiceLog: { nodeId: string; choiceId: string }[];
  currentNodeId: string;
  seed: number;
  playedRouteIds?: string[];   // route ids already consumed; never re-picked
}

// ── Sub-project C (framework generation) ──────────────────────────────

/** A route plus all of its nodes — the unit frameworkGen produces and RouteStore holds. */
export interface RouteBundle {
  route: GameRoute;                     // existing type; .status carries draft|published
  nodes: Record<string, StoryNode>;     // existing StoryNode
}

/** Input to framework generation. */
export interface GenerationParams {
  contextText: string;                  // novel excerpt, plain text (no RAG yet)
  title: string;                        // desired route title
  nodeCount?: number;                   // target 3–6, default 4
  sourceNovelId?: string;               // provenance tag, default 'adhoc'
}

/** Registries injected into the prompt + validator (fixtures now, DB later). */
export interface Registries {
  itemDb: Record<string, Item>;
  skillDb: Record<string, Skill>;
  enemyDb: Record<string, Enemy>;
}

export type ValidationCode =
  | 'EMPTY_ROUTE'
  | 'DANGLING_NODE_REF'
  | 'UNKNOWN_ENEMY'
  | 'UNKNOWN_ITEM_REF'
  | 'BAD_SHAPE'
  | 'UNREACHABLE_NODE'
  | 'BAD_ENDING_CONDITION'
  | 'NO_REACHABLE_ENDING';

export interface ValidationError { path: string; code: ValidationCode; message: string; }

/** frameworkGen result — discriminated union. */
export type GenerationResult =
  | { ok: true; bundle: RouteBundle; attempts: number }
  | { ok: false; errors: ValidationError[]; attempts: number; lastRaw?: unknown };
