import {
  SaveState, StoryNode, Stats, Item, Skill, Enemy, EquipSlot, CombatResult, GameRoute,
} from '../shared/types';
import { SAVE_VERSION, EQUIP_SLOTS } from '../shared/constants';
import { Background, BACKGROUNDS } from '../shared/backgrounds';
import {
  SKILL_DB, ITEM_DB, ENEMY_DB, SAMPLE_NODES, SAMPLE_ROUTE,
} from '../shared/fixtures';
import { effectiveStats, buildPlayerActor, buildEnemyActor } from '../shared/engine/character';
import { runCombat } from '../shared/engine/combat';
import { resolveChoice } from '../shared/engine/story';
import { mulberry32 } from '../shared/engine/dice';
import { SaveStore } from './store/SaveStore';

const START_SEED = 7;

export class GameError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'GameError';
  }
}

export interface SessionDeps {
  backgrounds: Record<string, Background>;
  nodeDb: Record<string, StoryNode>;
  itemDb: Record<string, Item>;
  skillDb: Record<string, Skill>;
  enemyDb: Record<string, Enemy>;
  route: GameRoute;
}

const DEFAULT_DEPS: SessionDeps = {
  backgrounds: BACKGROUNDS,
  nodeDb: SAMPLE_NODES,
  itemDb: ITEM_DB,
  skillDb: SKILL_DB,
  enemyDb: ENEMY_DB,
  route: SAMPLE_ROUTE,
};

export interface SessionView {
  save: SaveState;
  node: StoryNode;
  effectiveStats: Stats;
  ending?: string;
}

export interface ChoiceView extends SessionView {
  checkPassed?: boolean;
  roll?: number;
  combat?: CombatResult;
}

export interface GameSession {
  listBackgrounds(): Background[];
  newGame(backgroundId: string): Promise<SessionView & { sessionId: string }>;
  getView(id: string): Promise<SessionView>;
  applyChoice(id: string, choiceId: string, skillPriority?: string[]): Promise<ChoiceView>;
  equip(id: string, slot: string, itemId: string | null): Promise<{ save: SaveState; effectiveStats: Stats }>;
}

export function createGameSession(store: SaveStore, deps: SessionDeps = DEFAULT_DEPS): GameSession {
  function computeEnding(save: SaveState): string | undefined {
    for (const e of deps.route.endings) {
      const m = e.condition.match(/currentNodeId === (\w+)/);
      if (m && save.currentNodeId === m[1]) return e.id;
    }
    return undefined;
  }

  function view(save: SaveState): SessionView {
    const node = deps.nodeDb[save.currentNodeId];
    if (!node) throw new GameError(`Node ${save.currentNodeId} not found`, 500);
    return { save, node, effectiveStats: effectiveStats(save.character, deps.itemDb), ending: computeEnding(save) };
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

    async newGame(backgroundId: string) {
      const bg = deps.backgrounds[backgroundId];
      if (!bg) throw new GameError(`Unknown background ${backgroundId}`, 400);
      const startNodeId = deps.route.acts[0].nodeIds[0];
      const save: SaveState = {
        version: SAVE_VERSION,
        routeId: deps.route.id,
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
      };
      const sessionId = await store.create(save);
      return { sessionId, ...view(save) };
    },

    async getView(id: string) {
      return view(await load(id));
    },

    async applyChoice(id, choiceId, skillPriority) {
      const save = await load(id);
      const node = deps.nodeDb[save.currentNodeId];
      if (!node) throw new GameError(`Node ${save.currentNodeId} not found`, 500);
      const choice = node.choices.find((c) => c.id === choiceId);
      if (!choice) throw new GameError(`Choice ${choiceId} not in node ${node.id}`, 400);

      // Path 1: skill-check choice (e.g. "sneak")
      if (choice.skillCheck) {
        const res = resolveChoice(save, node, choiceId, mulberry32(save.seed));
        await store.put(id, res.save);
        return { ...view(res.save), checkPassed: res.checkPassed, roll: res.roll };
      }

      // Path 2: combat choice ("fight") — node has combat and choice has no skill check
      if (node.combat) {
        if (!skillPriority || skillPriority.length === 0) {
          throw new GameError('skillPriority required for a combat choice', 400);
        }
        const player = buildPlayerActor(
          { ...save.character, skillPriority },
          deps.itemDb,
          deps.skillDb,
        );
        const enemies = node.combat.enemyIds.map((eid) => {
          const enemy = deps.enemyDb[eid];
          if (!enemy) throw new GameError(`Enemy ${eid} not found`, 500);
          return buildEnemyActor(enemy, deps.skillDb);
        });
        const combat = runCombat({ player, enemies, seed: save.seed });

        if (combat.winner === 'player') {
          const res = resolveChoice(save, node, choiceId); // apply outcome + advance (no skillCheck)
          res.save.character.skillPriority = [...skillPriority]; // persist the pre-battle ordering
          await store.put(id, res.save);
          return { ...view(res.save), combat };
        }
        // Defeat: do not advance or persist progress
        return { ...view(save), combat, ending: 'defeat' };
      }

      // Path 3: plain advance (no check, no combat)
      const res = resolveChoice(save, node, choiceId);
      await store.put(id, res.save);
      return view(res.save);
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
      return { save, effectiveStats: effectiveStats(save.character, deps.itemDb) };
    },
  };
}
