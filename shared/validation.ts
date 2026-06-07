import { RouteBundle, Registries, ValidationError } from './types';
import { STAT_KEYS } from './constants';

/**
 * Semantic/referential validation of a route bundle. Runs AFTER Zod shape-parse,
 * so structure is assumed well-formed; this layer guarantees the bundle only
 * references things that exist and is actually completable. Pure + deterministic.
 */
export function validateRouteBundle(b: RouteBundle, reg: Registries): ValidationError[] {
  const errors: ValidationError[] = [];
  const { route, nodes } = b;
  const nodeKeys = Object.keys(nodes);

  // 1. Non-empty — if the route is empty, nothing else is meaningful.
  if (route.acts.length === 0 || (route.acts[0]?.nodeIds.length ?? 0) === 0 || nodeKeys.length === 0) {
    errors.push({ path: 'route', code: 'EMPTY_ROUTE', message: 'route has no acts or nodes' });
    return errors;
  }

  // 2. Node-graph integrity.
  for (const act of route.acts) {
    for (const id of act.nodeIds) {
      if (!nodes[id]) {
        errors.push({ path: `acts.${act.id}`, code: 'DANGLING_NODE_REF', message: `act references missing node ${id}` });
      }
    }
  }
  for (const [nid, node] of Object.entries(nodes)) {
    for (const c of node.choices) {
      if (c.nextNodeId !== undefined && !nodes[c.nextNodeId]) {
        errors.push({ path: `nodes.${nid}.choices.${c.id}`, code: 'DANGLING_NODE_REF', message: `choice points to missing node ${c.nextNodeId}` });
      }
    }
  }

  // 3. Reference safety — the core AI guard.
  for (const [nid, node] of Object.entries(nodes)) {
    if (node.combat) {
      for (const eid of node.combat.enemyIds) {
        if (!reg.enemyDb[eid]) {
          errors.push({ path: `nodes.${nid}.combat`, code: 'UNKNOWN_ENEMY', message: `unknown enemy ${eid}` });
        }
      }
    }
    for (const c of node.choices) {
      if (c.skillCheck && !(STAT_KEYS as string[]).includes(c.skillCheck.stat)) {
        errors.push({ path: `nodes.${nid}.choices.${c.id}`, code: 'BAD_SHAPE', message: `bad stat ${c.skillCheck.stat}` });
      }
      const o = c.outcome;
      if (o) {
        for (const it of o.addItems ?? []) {
          if (!reg.itemDb[it]) errors.push({ path: `nodes.${nid}.choices.${c.id}.outcome.addItems`, code: 'UNKNOWN_ITEM_REF', message: `unknown item ${it}` });
        }
        for (const it of o.removeItems ?? []) {
          if (!reg.itemDb[it]) errors.push({ path: `nodes.${nid}.choices.${c.id}.outcome.removeItems`, code: 'UNKNOWN_ITEM_REF', message: `unknown item ${it}` });
        }
      }
    }
  }
  for (const eid of route.enemyPool) {
    if (!reg.enemyDb[eid]) errors.push({ path: 'route.enemyPool', code: 'UNKNOWN_ENEMY', message: `unknown enemy ${eid}` });
  }
  for (const it of route.itemPool) {
    if (!reg.itemDb[it]) errors.push({ path: 'route.itemPool', code: 'UNKNOWN_ITEM_REF', message: `unknown item ${it}` });
  }

  // 4. Reachability — BFS from the start node, following choice.nextNodeId
  //    (a winning combat advances via the fight choice's nextNodeId, so this covers combat too).
  const start = route.acts[0].nodeIds[0];
  const reached = new Set<string>();
  const queue: string[] = [start];
  while (queue.length) {
    const cur = queue.shift() as string;
    if (reached.has(cur)) continue;
    reached.add(cur);
    const node = nodes[cur];
    if (!node) continue;
    for (const c of node.choices) {
      if (c.nextNodeId && !reached.has(c.nextNodeId)) queue.push(c.nextNodeId);
    }
  }
  for (const nid of nodeKeys) {
    if (!reached.has(nid)) errors.push({ path: `nodes.${nid}`, code: 'UNREACHABLE_NODE', message: `node ${nid} not reachable from start` });
  }

  // 5. Endings — at least one reachable, terminal ending in the supported condition form.
  if (route.endings.length === 0) {
    errors.push({ path: 'route.endings', code: 'NO_REACHABLE_ENDING', message: 'no endings defined' });
  } else {
    let anyReachableTerminal = false;
    for (const e of route.endings) {
      const m = e.condition.match(/^currentNodeId === (\w+)$/);
      if (!m) {
        errors.push({ path: `route.endings.${e.id}`, code: 'BAD_ENDING_CONDITION', message: `unsupported condition "${e.condition}"` });
        continue;
      }
      const target = m[1];
      const node = nodes[target];
      if (node && reached.has(target) && node.choices.length === 0) anyReachableTerminal = true;
    }
    if (!anyReachableTerminal) {
      errors.push({ path: 'route.endings', code: 'NO_REACHABLE_ENDING', message: 'no ending targets a reachable terminal node' });
    }
  }

  return errors;
}
