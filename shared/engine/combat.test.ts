import { runCombat } from './combat';
import { CombatActor, Skill } from '../types';

const slash: Skill = { id: 'slash', name: 'Slash', targetStat: 'str', power: 1, effectTarget: 'enemy' };
const freezeBolt: Skill = {
  id: 'freezeBolt', name: 'Freeze Bolt', targetStat: 'int', power: 1, effectTarget: 'enemy',
  effects: [{ id: 'freeze', kind: 'control', duration: 1 }],
};

function mkActor(id: string, str: number, hp: number, skills: Skill[], priority: string[]): CombatActor {
  const skillBook: Record<string, Skill> = {};
  for (const s of skills) skillBook[s.id] = s;
  return {
    id, name: id,
    stats: { str, dex: 5, int: str, wis: 5, cha: 5, con: 0 },
    hp, maxHp: hp, statuses: [], skillPriority: priority, skillBook,
  };
}

describe('runCombat', () => {
  it('is deterministic for the same seed', () => {
    const r1 = runCombat({ player: mkActor('player', 12, 30, [slash], ['slash']), enemies: [mkActor('goblin', 6, 18, [slash], ['slash'])], seed: 99 });
    const r2 = runCombat({ player: mkActor('player', 12, 30, [slash], ['slash']), enemies: [mkActor('goblin', 6, 18, [slash], ['slash'])], seed: 99 });
    expect(r1.winner).toBe(r2.winner);
    expect(r1.rounds).toBe(r2.rounds);
    expect(r1.log).toEqual(r2.log);
  });

  it('player wins against a much weaker enemy', () => {
    const result = runCombat({ player: mkActor('player', 20, 60, [slash], ['slash']), enemies: [mkActor('goblin', 2, 6, [slash], ['slash'])], seed: 1 });
    expect(result.winner).toBe('player');
  });

  it('player loses against a much stronger enemy', () => {
    const result = runCombat({ player: mkActor('player', 2, 6, [slash], ['slash']), enemies: [mkActor('dragon', 25, 80, [slash], ['slash'])], seed: 1 });
    expect(result.winner).toBe('enemies');
  });

  it('a controlled enemy skips its turn (skip event present)', () => {
    const player = mkActor('player', 12, 40, [freezeBolt, slash], ['freezeBolt', 'slash']);
    const enemy = mkActor('goblin', 6, 40, [slash], ['slash']);
    const result = runCombat({ player, enemies: [enemy], seed: 3 });
    const goblinSkipped = result.log.some((e) => e.actorId === 'goblin' && e.type === 'skip');
    expect(goblinSkipped).toBe(true);
  });

  it('uses the first usable skill by priority', () => {
    const player = mkActor('player', 12, 40, [freezeBolt, slash], ['freezeBolt', 'slash']);
    const enemy = mkActor('goblin', 6, 40, [slash], ['slash']);
    const result = runCombat({ player, enemies: [enemy], seed: 5 });
    const firstPlayerSkill = result.log.find((e) => e.actorId === 'player' && e.type === 'skill');
    expect(firstPlayerSkill?.skillId).toBe('freezeBolt');
  });
});
