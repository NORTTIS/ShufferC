/**
 * Parse a supported ending condition into its target node id.
 *
 * The one supported form is `currentNodeId === <nodeId>`. The node id may be
 * bare or wrapped in matching single/double quotes — AI route generators tend to
 * quote it (`currentNodeId === 'n7'`), and that variant is semantically identical.
 * Surrounding whitespace is tolerated. Returns the node id, or null if the
 * condition is not a supported form.
 *
 * Shared by the route validator (shared/validation.ts) and the runtime ending
 * check (server/session.ts) so the two layers can never disagree about which
 * conditions are valid — a route that validates always triggers at runtime.
 */
export function parseEndingCondition(condition: string): string | null {
  const m = condition.trim().match(/^currentNodeId === (['"]?)(\w+)\1$/);
  return m ? m[2] : null;
}
