import { z } from 'zod';

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

export const RouteBundleSchema = z.object({
  route: RouteSchema,
  nodes: z.record(z.string(), NodeSchema),
});

export type ParsedBundle = z.infer<typeof RouteBundleSchema>;

/** JSON Schema fed to Gemini's responseSchema so the model emits matching JSON. */
export const ROUTE_BUNDLE_JSON_SCHEMA = z.toJSONSchema(RouteBundleSchema) as object;
