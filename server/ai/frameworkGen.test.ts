import { generateFramework } from './frameworkGen';
import { createFakeProvider } from './provider';
import { SAMPLE_BUNDLE, ITEM_DB, SKILL_DB, ENEMY_DB } from '../../shared/fixtures';
import { Registries, RouteBundle } from '../../shared/types';

const reg: Registries = { itemDb: ITEM_DB, skillDb: SKILL_DB, enemyDb: ENEMY_DB };
const params = { contextText: 'ctx', title: 'T' };

const validRaw = (): RouteBundle => structuredClone(SAMPLE_BUNDLE);
const invalidRefRaw = (): RouteBundle => {
  const b = structuredClone(SAMPLE_BUNDLE);
  b.nodes['n1'].combat = { enemyIds: ['dragon'] }; // UNKNOWN_ENEMY → ref error
  return b;
};

describe('generateFramework', () => {
  it('succeeds on the first attempt and marks the route draft', async () => {
    const provider = createFakeProvider([validRaw()]);
    const res = await generateFramework(provider, params, reg);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.attempts).toBe(1);
      expect(res.bundle.route.status).toBe('draft');
      expect(res.bundle.route.sourceNovelId).toBe('adhoc');
    }
  });

  it('retries after a referential error then succeeds, feeding errors back', async () => {
    const provider = createFakeProvider([invalidRefRaw(), validRaw()]);
    const res = await generateFramework(provider, params, reg);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.attempts).toBe(2);
  });

  it('fails after maxAttempts with collected errors', async () => {
    const provider = createFakeProvider([{}, invalidRefRaw(), invalidRefRaw()]);
    const res = await generateFramework(provider, params, reg, { maxAttempts: 3 });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.attempts).toBe(3);
      expect(res.errors.length).toBeGreaterThan(0);
    }
  });

  it('treats moderation-blocked prose as a failed attempt', async () => {
    const bad = structuredClone(SAMPLE_BUNDLE);
    bad.nodes['n1'].prose = 'There is gore everywhere.'; // banned term
    const provider = createFakeProvider([bad]);
    const res = await generateFramework(provider, params, reg, { maxAttempts: 1 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e: { message: string }) => e.message.includes('moderation'))).toBe(true);
  });
});
