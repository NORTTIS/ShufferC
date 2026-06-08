import {
  SaveState, StoryNode, Stats, Item, Skill, Enemy, EquipSlot, CombatResult, GameRoute, RouteBundle,
} from '../shared/types';
import { SAVE_VERSION, EQUIP_SLOTS } from '../shared/constants';
import { Background, BACKGROUNDS } from '../shared/backgrounds';
import { SKILL_DB, ITEM_DB, ENEMY_DB, SAMPLE_BUNDLE } from '../shared/fixtures';
import { effectiveStats, buildPlayerActor, buildEnemyActor } from '../shared/engine/character';
import { runCombat } from '../shared/engine/combat';
import { resolveChoice } from '../shared/engine/story';
import { mulberry32 } from '../shared/engine/dice';
import { SaveStore } from './store/SaveStore';
import { RouteStore } from './store/RouteStore';
import { createMemoryRouteStore } from './store/memoryRouteStore';

// Fixed starting seed: the vertical slice is intentionally deterministic so the
// client can replay the combat log and match the server exactly (acceptance #6).
// A later sub-project will randomise the seed per session.
const START_SEED = 7;

export class GameError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'GameError';
  }
}

export interface SessionDeps {
  backgrounds: Record<string, Background>;
  itemDb: Record<string, Item>;
  skillDb: Record<string, Skill>;
  enemyDb: Record<string, Enemy>;
  routes: RouteStore;
  random?: () => number;
}

const DEFAULT_DEPS: SessionDeps = {
  backgrounds: BACKGROUNDS,
  itemDb: ITEM_DB,
  skillDb: SKILL_DB,
  enemyDb: ENEMY_DB,
  routes: createMemoryRouteStore([SAMPLE_BUNDLE]),
  random: Math.random,
};

export interface SessionView {
  save: SaveState;
  node: StoryNode;
  effectiveStats: Stats;
  ending?: string;
  hasNextRoute?: boolean;
}

export interface ChoiceView extends SessionView {
  checkPassed?: boolean;
  roll?: number;
  combat?: CombatResult;
}

export interface GameSession {
  listBackgrounds(): Background[];
  newGame(backgroundId: string, routeId?: string): Promise<SessionView & { sessionId: string }>;
  getView(id: string): Promise<SessionView>;
  continueToNextRoute(id: string): Promise<SessionView>;
  applyChoice(id: string, choiceId: string, skillPriority?: string[]): Promise<ChoiceView>;
  equip(id: string, slot: string, itemId: string | null): Promise<{ save: SaveState; effectiveStats: Stats }>;
}

export function createGameSession(store: SaveStore, deps: SessionDeps = DEFAULT_DEPS): GameSession {
  // Slice simplification (spec §4.3): endings are matched by a simple
  // `currentNodeId === <id>` condition string. Richer ending conditions are
  // sub-project E. A non-matching/different condition format yields no ending.
  function computeEnding(save: SaveState, route: GameRoute): string | undefined {
    for (const e of route.endings) {
      const m = e.condition.match(/currentNodeId === (\w+)/);
      if (m && save.currentNodeId === m[1]) return e.id;
    }
    return undefined;
  }

  async function loadBundle(routeId: string): Promise<RouteBundle> {
    const bundle = await deps.routes.get(routeId);
    if (!bundle) throw new GameError(`Route ${routeId} not found`, 404);
    return bundle;
  }

  const random = deps.random ?? Math.random;

  // Pick a random published route id not already consumed; null if none remain.
  async function pickRoute(played: string[]): Promise<string | null> {
    const pool = (await deps.routes.list())
      .filter((r) => r.status === 'published' && !played.includes(r.id));
    if (pool.length === 0) return null;
    return pool[Math.floor(random() * pool.length)].id;
  }

  // Annotate a view that ended (non-defeat) with whether a further route remains.
  async function withNextRoute<T extends SessionView>(v: T): Promise<T> {
    if (v.ending && v.ending !== 'defeat') {
      const played = v.save.playedRouteIds ?? [v.save.routeId];
      v.hasNextRoute = (await pickRoute(played)) !== null;
    }
    return v;
  }

  function view(save: SaveState, bundle: RouteBundle): SessionView {
    const node = bundle.nodes[save.currentNodeId];
    if (!node) throw new GameError(`Node ${save.currentNodeId} not found`, 500);
    return {
      save,
      node,
      effectiveStats: effectiveStats(save.character, deps.itemDb),
      ending: computeEnding(save, bundle.route),
    };
  }

  async function load(id: string): Promise<SaveState> {
    const save = await store.get(id);
    if (!save) throw new GameError(`Session ${id} not found`, 404);
    return save;
  }

  return {
    listBackgrounds(): Background[] {
      return Object.values(deps.backgrounds);
    },

    async newGame(backgroundId: string, routeId?: string) {
      const bg = deps.backgrounds[backgroundId];
      if (!bg) throw new GameError(`Unknown background ${backgroundId}`, 400);

      let resolvedRouteId = routeId;
      if (!resolvedRouteId) {
        const picked = await pickRoute([]);
        if (!picked) throw new GameError('No published routes available', 409);
        resolvedRouteId = picked;
      }

      const bundle = await loadBundle(resolvedRouteId);
      if (bundle.route.status !== 'published') {
        throw new GameError(`Route ${resolvedRouteId} is not published`, 409);
      }
      const startNodeId = bundle.route.acts[0].nodeIds[0];
      const save: SaveState = {
        version: SAVE_VERSION,
        routeId: bundle.route.id,
        character: {
          background: bg.id,
          baseStats: { ...bg.baseStats },
          inventory: [...bg.inventory],
          equipped: { ...bg.equipped },
          skillPriority: [...bg.skillPriority],
        },
        reputation: { hero: 0, villain: 0, factions: {} },
        flags: {},
        choiceLog: [],
        currentNodeId: startNodeId,
        seed: START_SEED,
        playedRouteIds: [bundle.route.id],
      };
      const sessionId = await store.create(save);
      return { sessionId, ...view(save, bundle) };
    },

    async getView(id: string) {
      const save = await load(id);
      const bundle = await loadBundle(save.routeId);
      return withNextRoute(view(save, bundle));
    },

    async continueToNextRoute(id: string): Promise<SessionView> {
      const save = await load(id);
      const played = save.playedRouteIds ?? [save.routeId];
      const nextId = await pickRoute(played);
      if (!nextId) throw new GameError('No more routes', 409);

      const bundle = await loadBundle(nextId);
      save.routeId = nextId;
      save.currentNodeId = bundle.route.acts[0].nodeIds[0];
      save.playedRouteIds = [...played, nextId];
      // character, reputation, flags, choiceLog, seed are intentionally preserved
      await store.put(id, save);
      return view(save, bundle);
    },

    async applyChoice(id, choiceId, skillPriority) {
      const save = await load(id);
      const bundle = await loadBundle(save.routeId);
      const node = bundle.nodes[save.currentNodeId];
      if (!node) throw new GameError(`Node ${save.currentNodeId} not found`, 500);
      const choice = node.choices.find((c) => c.id === choiceId);
      if (!choice) throw new GameError(`Choice ${choiceId} not in node ${node.id}`, 400);

      // Path 1: skill-check choice (e.g. "sneak")
      if (choice.skillCheck) {
        const res = resolveChoice(save, node, choiceId, mulberry32(save.seed));
        await store.put(id, res.save);
        return withNextRoute({ ...view(res.save, bundle), checkPassed: res.checkPassed, roll: res.roll });
      }

      // Path 2: combat choice ("fight") — node has combat and choice has no skill check
      if (node.combat) {
        if (!skillPriority || skillPriority.length === 0) {
          throw new GameError('skillPriority required for a combat choice', 400);
        }
        const player = buildPlayerActor({ ...save.character, skillPriority }, deps.itemDb, deps.skillDb);
        const enemies = node.combat.enemyIds.map((eid) => {
          const enemy = deps.enemyDb[eid];
          if (!enemy) throw new GameError(`Enemy ${eid} not found`, 500);
          return buildEnemyActor(enemy, deps.skillDb);
        });
        const combat = runCombat({ player, enemies, seed: save.seed });

        if (combat.winner === 'player') {
          const res = resolveChoice(save, node, choiceId); // apply outcome + advance
          res.save.character.skillPriority = [...skillPriority]; // persist pre-battle ordering
          await store.put(id, res.save);
          return withNextRoute({ ...view(res.save, bundle), combat });
        }
        // Defeat: do not advance or persist progress
        return { ...view(save, bundle), combat, ending: 'defeat' };
      }

      // Path 3: plain advance (no check, no combat)
      const res = resolveChoice(save, node, choiceId);
      await store.put(id, res.save);
      return withNextRoute(view(res.save, bundle));
    },

    async equip(id, slot, itemId) {
      const save = await load(id);
      if (!EQUIP_SLOTS.includes(slot as EquipSlot)) {
        throw new GameError(`Invalid slot ${slot}`, 400);
      }
      if (itemId === null) {
        delete save.character.equipped[slot as EquipSlot];
      } else {
        if (!save.character.inventory.includes(itemId)) {
          throw new GameError(`Item ${itemId} not in inventory`, 400);
        }
        const item = deps.itemDb[itemId];
        if (!item) throw new GameError(`Item ${itemId} not found`, 400);
        if (item.slot !== slot) {
          throw new GameError(`Item ${itemId} cannot occupy slot ${slot}`, 400);
        }
        save.character.equipped[slot as EquipSlot] = itemId;
      }
      await store.put(id, save);
      const stored = structuredClone(save);
      return { save: stored, effectiveStats: effectiveStats(stored.character, deps.itemDb) };
    },
  };
}
