import { GenerationParams, Registries, ValidationError, StoryNode, GameRoute } from '../../shared/types';

/** Build the framework-generation prompt. On retry, prior errors are appended for self-correction. */
export function buildFrameworkPrompt(
  params: GenerationParams,
  reg: Registries,
  lastErrors?: ValidationError[],
): string {
  const enemyIds = Object.keys(reg.enemyDb);
  const itemIds = Object.keys(reg.itemDb);
  const nodeCount = params.nodeCount ?? 4;

  const example = JSON.stringify({
    route: {
      id: 'route-1',
      title: params.title,
      sourceNovelId: 'adhoc',
      acts: [{ id: 'act1', title: 'Act One', nodeIds: ['n1', 'n2', 'n3'] }],
      itemPool: [],
      enemyPool: enemyIds.slice(0, 1),
      endings: [{ id: 'end1', title: 'The End', condition: 'currentNodeId === n3' }],
      status: 'draft',
    },
    nodes: [
      { id: 'n1', prose: 'Opening scene…', source: 'pregen', choices: [{ id: 'c1', text: 'Go on', nextNodeId: 'n2' }] },
      { id: 'n2', prose: 'Middle scene…', source: 'pregen', choices: [{ id: 'c2', text: 'Continue', nextNodeId: 'n3' }] },
      { id: 'n3', prose: 'Final scene.', source: 'pregen', choices: [] },
    ],
  });

  const lines = [
    'You are a game-route author. Output ONLY a single JSON object that matches the provided schema. No markdown, no prose outside the JSON.',
    `Produce a playable route titled "${params.title}" with exactly 1 act and ${nodeCount} story nodes.`,
    'The JSON has two top-level fields:',
    '- "route": an object with id, title, sourceNovelId, acts (array of { id, title, nodeIds }), itemPool (array), enemyPool (array), endings (array of { id, title, condition }), and status.',
    '- "nodes": an ARRAY of node objects. Each node has a unique "id", a "prose" string, a "choices" array, optional "combat", and "source".',
    'Each choice has: id, text, optional skillCheck { stat, dc }, optional outcome { addItems?, removeItems?, reputationDelta?, statDelta?, setFlags? }, and nextNodeId.',
    'Rules:',
    `- Produce exactly ${nodeCount} entries in the "nodes" array, with ids like n1, n2, … and list those same ids in acts[0].nodeIds.`,
    `- Use ONLY these enemy ids in any node "combat".enemyIds: ${enemyIds.join(', ') || '(none)'}.`,
    `- Use ONLY these item ids in any outcome addItems/removeItems and in route.itemPool: ${itemIds.join(', ') || '(none)'}.`,
    '- Every choice.nextNodeId must reference a node id that exists in the "nodes" array.',
    '- Set every node "source" to "pregen".',
    '- The route must be completable: at least one terminal node (a node with an empty "choices" array) must be reachable from the first node.',
    '- Provide at least one ending whose "condition" is EXACTLY the string `currentNodeId === <id>` where <id> is that terminal node id.',
    '- Set route.status to "draft".',
    'Shape example (structure only — write your own content):',
    example,
    'Source material to adapt into the prose and choices:',
    params.contextText,
  ];

  if (lastErrors && lastErrors.length) {
    lines.push('Your previous attempt had these problems; fix them:');
    for (const e of lastErrors) lines.push(`- [${e.code}] ${e.path}: ${e.message}`);
  }

  return lines.join('\n');
}

/**
 * Build the live event-gen prompt for ONE node. Flash enriches the stub's prose and
 * each choice's display text only — it must NOT add, drop, or re-target choices.
 * The stub's current text is the seed; RAG novel context grounds the rewrite.
 * On retry, prior errors are appended for self-correction.
 */
export function buildEventPrompt(
  stub: StoryNode,
  route: GameRoute,
  ragText: string,
  pathSummary: string,
  lastErrors?: ValidationError[],
): string {
  const n = stub.choices.length;
  const example = JSON.stringify({
    prose: 'A richer, novel-grounded retelling of this beat…',
    choiceTexts: stub.choices.map((c) => `(reworded) ${c.text}`),
  });

  const lines = [
    'You are a game narrator enriching ONE story node at play time. Output ONLY a single JSON object that matches the provided schema. No markdown, no prose outside the JSON.',
    `The route is titled "${route.title}". Keep tone consistent and suitable for ages 13+.`,
    'The JSON has exactly two fields:',
    '- "prose": a vivid retelling of this scene.',
    `- "choiceTexts": an array of EXACTLY ${n} strings, one per existing choice, in the SAME order.`,
    'Rules:',
    '- Enrich WORDING only. Do NOT change what a choice does or where it leads; do NOT add or remove choices.',
    `- "choiceTexts" MUST contain exactly ${n} non-empty entries (one per existing choice).`,
    '- Stay faithful to the source novel context provided below; do not invent contradicting facts.',
    'Current node prose (the beat to enrich):',
    stub.prose,
    'Current choice texts (reword these, same order, same meaning):',
    stub.choices.map((c, i) => `${i + 1}. ${c.text}`).join('\n') || '(no choices)',
    'Player context so far:',
    pathSummary || '(none)',
    'Source novel context (for grounding):',
    ragText || '(none provided)',
    'Shape example (structure only — write your own content):',
    example,
  ];

  if (lastErrors && lastErrors.length) {
    lines.push('Your previous attempt had these problems; fix them:');
    for (const e of lastErrors) lines.push(`- [${e.code}] ${e.path}: ${e.message}`);
  }

  return lines.join('\n');
}
