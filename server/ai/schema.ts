import { z } from 'zod';
import { ToolDef } from './provider';

const StatKeySchema = z.enum(['str', 'dex', 'int', 'wis', 'cha', 'con']);

const OutcomeSchema = z
  .object({
    statDelta: z.record(StatKeySchema, z.number()).optional(),
    reputationDelta: z
      .object({
        hero: z.number().optional(),
        villain: z.number().optional(),
        factions: z.record(z.string(), z.number()).optional(),
      })
      .optional(),
    addItems: z.array(z.string()).optional(),
    removeItems: z.array(z.string()).optional(),
    setFlags: z.record(z.string(), z.boolean()).optional(),
  });

const ChoiceSchema = z.object({
  id: z.string(),
  text: z.string(),
  skillCheck: z.object({ stat: StatKeySchema, dc: z.number() }).optional(),
  outcome: OutcomeSchema.optional(),
  nextNodeId: z.string().optional(),
});

const NodeSchema = z.object({
  id: z.string(),
  prose: z.string(),
  choices: z.array(ChoiceSchema),
  combat: z.object({ enemyIds: z.array(z.string()) }).optional(),
  source: z.enum(['pregen', 'live']),
});

const RouteSchema = z.object({
  id: z.string(),
  title: z.string(),
  sourceNovelId: z.string(),
  acts: z.array(z.object({ id: z.string(), title: z.string(), nodeIds: z.array(z.string()) })),
  itemPool: z.array(z.string()),
  enemyPool: z.array(z.string()),
  endings: z.array(z.object({ id: z.string(), title: z.string(), condition: z.string() })),
  status: z.enum(['draft', 'published']),
});

// The model emits `nodes` as an ARRAY (each node carries its own `id`). Gemini's
// structured output cannot express a dynamic-keyed object/record, so frameworkGen
// converts this array into the Record<string, StoryNode> that RouteBundle uses,
// keyed by node id.
export const GenBundleSchema = z.object({
  route: RouteSchema,
  nodes: z.array(NodeSchema),
});

export type ParsedGenBundle = z.infer<typeof GenBundleSchema>;

/** JSON Schema fed to Gemini's responseSchema so the model emits matching JSON. */
export const GEN_BUNDLE_JSON_SCHEMA = z.toJSONSchema(GenBundleSchema) as object;

// ── Live event-gen (slice C3): one node's enriched text ───────────────
export const EventOverlaySchema = z.object({
  prose: z.string().trim().min(1),
  choiceTexts: z.array(z.string().trim().min(1)),
});

export type ParsedEventOverlay = z.infer<typeof EventOverlaySchema>;

/** JSON Schema fed to Gemini's responseSchema for live event-gen. */
export const EVENT_OVERLAY_JSON_SCHEMA = z.toJSONSchema(EventOverlaySchema) as object;

// ── Content-authoring tool argument schemas (shape hints for the model; the
//    authoritative referential checks remain the validate*() functions). ──
const RoleSchema = z.enum(['core', 'defense', 'maxHp']);
const StatusEffectRefSchema = z.object({
  id: z.string(),
  duration: z.number(),
  magnitude: z.number().optional(),
});

const AttributeArgsSchema = z.object({
  id: z.string(), name: z.string(), abbrev: z.string(),
  roles: z.array(RoleSchema).min(1),
  defaultBase: z.number().optional(),
});

const EffectArgsSchema = z.object({
  id: z.string(), name: z.string(),
  archetype: z.enum(['dot', 'hot', 'statMod', 'control']),
  kind: z.enum(['buff', 'debuff', 'dot', 'hot', 'control']),
  stat: z.string().optional(),
  magnitude: z.number().optional(),
  duration: z.number().optional(),
  instant: z.boolean().optional(),
});

const ItemArgsSchema = z.object({
  id: z.string(), name: z.string(),
  slot: z.enum(['weapon', 'armor', 'ring', 'scroll', 'quest']),
  kind: z.enum(['gear', 'consumable']),
  cost: z.number().optional(),
  statMods: z.record(z.string(), z.number()).optional(),
  onEquip: z.array(StatusEffectRefSchema).optional(),
  onUse: z.array(StatusEffectRefSchema).optional(),
  grantsSkills: z.array(z.string()).optional(),
  storyTags: z.array(z.string()).optional(),
});

const SkillArgsSchema = z.object({
  id: z.string(), name: z.string(),
  targetStat: z.string().optional(),
  effectTarget: z.enum(['self', 'enemy']).optional(),
  power: z.number().optional(),
  effects: z.array(StatusEffectRefSchema).optional(),
});

const EnemyArgsSchema = z.object({
  id: z.string(), name: z.string(),
  stats: z.record(z.string(), z.number()),
  hp: z.number(),
  skillPriority: z.array(z.string()).optional(),
  reward: z.object({
    gold: z.array(z.number()).optional(),
    xp: z.number().optional(),
    drops: z.array(z.object({ itemId: z.string(), chance: z.number() })).optional(),
  }).optional(),
});

const SubmitRouteArgsSchema = z.object({ route: RouteSchema, nodes: z.array(NodeSchema) });

const J = (s: z.ZodTypeAny): object => z.toJSONSchema(s) as object;

export const CONTENT_TOOL_DEFS: ToolDef[] = [
  { name: 'create_attribute', description: 'Create a reusable character attribute (stat). Args: id, name, abbrev, roles[], defaultBase?.', parameters: J(AttributeArgsSchema) },
  { name: 'create_effect', description: 'Create a status-effect template from a fixed archetype (dot|hot|statMod|control). For statMod, set "stat" to an attribute id.', parameters: J(EffectArgsSchema) },
  { name: 'create_skill', description: 'Create a combat skill. effects[] reference effect ids; targetStat is an attribute id.', parameters: J(SkillArgsSchema) },
  { name: 'create_item', description: 'Create an item (gear|consumable). statMods keys are attribute ids; onEquip/onUse reference effect ids; grantsSkills reference skill ids.', parameters: J(ItemArgsSchema) },
  { name: 'create_enemy', description: 'Create an enemy. stats keys are attribute ids; skillPriority references skill ids; reward.drops reference item ids.', parameters: J(EnemyArgsSchema) },
  { name: 'submit_route', description: 'Submit the finished route. Args: { route, nodes } where nodes is an ARRAY of node objects. Call exactly once when all content exists.', parameters: J(SubmitRouteArgsSchema) },
];
