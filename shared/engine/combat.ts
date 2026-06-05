import { CombatActor, CombatEvent, CombatResult, Skill, StatKey } from '../types';
import { RNG, mulberry32, rollD20, faceToMultiplier } from './dice';
import { applyEffect, tickEffects, hasControl } from './effects';

const MAX_ROUNDS = 50;

export interface CombatInput {
  player: CombatActor;
  enemies: CombatActor[];
  seed: number;
}

function pickSkill(actor: CombatActor): Skill | null {
  for (const id of actor.skillPriority) {
    const skill = actor.skillBook[id];
    if (skill) return skill;
  }
  return null;
}

function computeDamage(actor: CombatActor, skill: Skill, target: CombatActor, mult: number): number {
  const stat: StatKey = skill.targetStat ?? 'str';
  const base = actor.stats[stat] * (skill.power ?? 1);
  const defense = Math.floor(target.stats.con / 2);
  return Math.max(1, Math.round(base * mult) - defense);
}

export function runCombat(input: CombatInput): CombatResult {
  const rng: RNG = mulberry32(input.seed);
  const log: CombatEvent[] = [];
  const { player, enemies } = input;
  let round = 0;

  const alive = (a: CombatActor) => a.hp > 0;
  const enemiesAlive = () => enemies.some(alive);

  while (player.hp > 0 && enemiesAlive() && round < MAX_ROUNDS) {
    round += 1;
    const order: CombatActor[] = [player, ...enemies];
    for (const actor of order) {
      if (actor.hp <= 0) continue;
      if (player.hp <= 0 || !enemiesAlive()) break;

      if (hasControl(actor)) {
        log.push({ round, actorId: actor.id, type: 'skip', note: 'controlled' });
        tickEffects(actor); // tick (including duration countdown) even on skip
        continue;
      }
      tickEffects(actor); // poison/regen + duration countdown at start of turn
      if (actor.hp <= 0) {
        log.push({ round, actorId: actor.id, type: 'death', note: 'died from effect' });
        continue;
      }

      const skill = pickSkill(actor);
      if (!skill) {
        log.push({ round, actorId: actor.id, type: 'pass' });
        continue;
      }

      const isPlayer = actor.id === player.id;
      const enemyTarget = isPlayer ? enemies.find(alive)! : player;
      const effectTarget = skill.effectTarget ?? 'enemy';
      const recipient = effectTarget === 'self' ? actor : enemyTarget;

      const roll = rollD20(rng);
      const mult = faceToMultiplier(roll);

      let damage = 0;
      if (effectTarget === 'enemy') {
        damage = computeDamage(actor, skill, enemyTarget, mult);
        enemyTarget.hp = Math.max(0, enemyTarget.hp - damage);
      }
      for (const eff of skill.effects ?? []) applyEffect(recipient, eff);

      log.push({ round, actorId: actor.id, type: 'skill', skillId: skill.id, targetId: recipient.id, roll, multiplier: mult, damage });

      if (effectTarget === 'enemy' && enemyTarget.hp <= 0) {
        log.push({ round, actorId: enemyTarget.id, type: 'death' });
      }
    }
  }

  const winner: CombatResult['winner'] =
    player.hp > 0 && !enemiesAlive() ? 'player' : player.hp <= 0 ? 'enemies' : 'draw';

  return { winner, rounds: round, log };
}
