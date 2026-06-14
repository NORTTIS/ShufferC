// Attributes are data-driven (see AttributeDef). StatKey is now any attribute id.
export type StatKey = string;
export type Stats = Record<string, number>;

export interface ReputationDelta {
  hero?: number;
  villain?: number;
  factions?: Record<string, number>;
}
export type EffectKind = 'buff' | 'debuff' | 'dot' | 'hot' | 'control';
export type EquipSlot = 'weapon' | 'armor' | 'ring' | 'scroll' | 'quest';

export type AttributeRole = 'core' | 'defense' | 'maxHp';

export interface AttributeDef {
  id: string;                 // 'str', 'armor', ...
  name: string;               // 'Strength'
  abbrev: string;             // 'STR'
  roles: AttributeRole[];     // how the engine consumes it
  defaultBase?: number;       // value when an actor/save lacks this key (default 0)
  builtin: boolean;           // the original 6 → cannot be deleted
}

export type EffectArchetype = 'dot' | 'hot' | 'statMod' | 'control';

export interface EffectTemplate {
  id: string;
  name: string;
  archetype: EffectArchetype;
  kind: EffectKind;           // buff|debuff|dot|hot|control — normalized onto instances; drives hasControl + UI
  stat?: string;              // required when archetype === 'statMod' (an AttributeDef.id)
  magnitude?: number;         // default per-tick / per-apply amount
  duration?: number;          // default remaining turns
  instant?: boolean;          // duration-0 application: apply magnitude once, do not retain
  sprite?: string;
  builtin: boolean;
}

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
  kind: 'gear' | 'consumable';   // routes drops/purchases to inventory[] vs consumables{}
  cost?: number;                 // base shop price; a node merchant may override
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
  reward?: {
    gold?: [number, number];                       // inclusive min..max
    xp?: number;
    drops?: { itemId: string; chance: number }[];   // chance in [0,1]
    reputationDelta?: ReputationDelta;
  };
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
  reputationDelta?: ReputationDelta;
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
  merchant?: { stock: { itemId: string; price?: number }[] };  // price overrides Item.cost
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

/** Reward summary stored on a choiceLog entry / journal entry (subset of engine Rewards to avoid an import cycle). */
export interface JournalReward { gold: number; xp: number; itemIds: string[] }

export interface SaveState {
  version: number;
  routeId: string;
  character: CharacterState;
  reputation: Reputation;
  flags: Record<string, boolean>;
  choiceLog: {
    nodeId: string;
    choiceId: string;
    routeId?: string;        // route the entry belongs to (absent on pre-v4 saves)
    roll?: number;           // d20 result when the choice had a skill check
    checkPassed?: boolean;
    reward?: JournalReward;  // combat spoils, patched on by the session layer
  }[];
  currentNodeId: string;
  seed: number;
  gold: number;
  xp: number;
  level: number;
  consumables: Record<string, number>;   // itemId -> qty
  vitals: { currentHp: number; pendingBuffs: StatusEffect[] };
  playedRouteIds?: string[];
  liveNodes?: Record<string, LiveOverlay>;
}

/** Flash-generated text for one live node, overlaid onto its stub at view time. */
export interface LiveOverlay {
  prose: string;
  choiceTexts: string[];   // length === the stub node's choices.length, same order
}

// ── Sub-project C (framework generation) ──────────────────────────────

/** A route plus all of its nodes — the unit frameworkGen produces and RouteStore holds. */
export interface RouteBundle {
  route: GameRoute;                     // existing type; .status carries draft|published
  nodes: Record<string, StoryNode>;     // existing StoryNode
  stagedContent?: ContentSet;   // AI-created content pending commit; flushed + cleared on publish
}

/** A snapshot of all five content registries. Used as the global content passed into
 *  generation, as the per-generation staging set, and as the publish-time flush payload. */
export interface ContentSet {
  attributes: Record<string, AttributeDef>;
  effects: Record<string, EffectTemplate>;
  items: Record<string, Item>;
  skills: Record<string, Skill>;
  enemies: Record<string, Enemy>;
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
  attrDb: Record<string, AttributeDef>;
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

/** frameworkGen result — discriminated union. `toolCalls` = number of tool invocations made. */
export type GenerationResult =
  | { ok: true; bundle: RouteBundle; toolCalls: number }
  | { ok: false; errors: ValidationError[]; toolCalls: number };
