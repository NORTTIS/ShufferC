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

  const lines = [
    'You are a game-route author. Output ONLY a JSON object that matches the provided schema. No prose outside the JSON.',
    `Produce a playable route titled "${params.title}" with 1 act and ${nodeCount} story nodes.`,
    'Rules:',
    `- Use ONLY these enemy ids in any node combat: ${enemyIds.join(', ') || '(none)'}.`,
    `- Use ONLY these item ids in any outcome addItems/removeItems and in route.itemPool: ${itemIds.join(', ') || '(none)'}.`,
    '- Every node has a unique id; each choice.nextNodeId must reference a node id you define.',
    '- Set every node "source" to "pregen".',
    '- The route must be completable: at least one terminal node (empty choices array) reachable from the first node.',
    '- Provide at least one ending whose "condition" is exactly `currentNodeId === <terminalNodeId>`.',
    '- Set route.status to "draft".',
    'Source material to adapt:',
    params.contextText,
  ];

  if (lastErrors && lastErrors.length) {
    lines.push('Your previous attempt had these problems; fix them:');
    for (const e of lastErrors) lines.push(`- [${e.code}] ${e.path}: ${e.message}`);
  }

  return lines.join('\n');
}
