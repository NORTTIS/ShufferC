import { GenerationParams, Registries, ValidationError } from '../../shared/types';

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
