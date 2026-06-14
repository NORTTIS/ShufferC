import { generateEvent } from './eventGen';
import { createFakeProvider, AIProvider } from './provider';
import { StoryNode, GameRoute } from '../../shared/types';

const stub: StoryNode = {
  id: 's1', source: 'live', prose: 'stub prose',
  choices: [{ id: 'a', text: 'stub choice', nextNodeId: 's2' }],
};
const route: GameRoute = {
  id: 'r', title: 'T', sourceNovelId: 'adhoc', acts: [], itemPool: [], enemyPool: [], endings: [], status: 'published',
};
const params = { stub, route, ragText: '', pathSummary: '' };
const goodOverlay = { prose: 'rich prose', choiceTexts: ['rich choice'] };

describe('generateEvent', () => {
  it('returns the overlay on a valid first attempt', async () => {
    const r = await generateEvent(createFakeProvider([goodOverlay]), params);
    expect(r.fallback).toBe(false);
    expect(r.attempts).toBe(1);
    expect(r.overlay).toEqual(goodOverlay);
  });

  it('retries past a bad-shape response then succeeds', async () => {
    const r = await generateEvent(createFakeProvider([{ nope: true }, goodOverlay]), params);
    expect(r.fallback).toBe(false);
    expect(r.attempts).toBe(2);
  });

  it('falls back to stub text when choiceTexts count is always wrong', async () => {
    const wrong = { prose: 'x', choiceTexts: ['a', 'b'] }; // stub has 1 choice
    const r = await generateEvent(createFakeProvider([wrong, wrong]), params);
    expect(r.fallback).toBe(true);
    expect(r.overlay).toEqual({ prose: 'stub prose', choiceTexts: ['stub choice'] });
  });

  it('treats moderation-blocked prose as a failed attempt', async () => {
    // 'gore' is in moderate()'s BANNED_TERMS (see moderate.ts). Both attempts blocked → fallback.
    const blocked = { prose: 'blood and gore everywhere', choiceTexts: ['ok'] };
    const r = await generateEvent(createFakeProvider([blocked, blocked]), params);
    expect(r.fallback).toBe(true);
  });

  it('falls back immediately with no network call when the provider is unavailable', async () => {
    let called = false;
    const dead: AIProvider = {
      available: false,
      async generateStructured() { called = true; return {}; },
      async generateWithTools() { throw new Error('unavailable'); },
    };
    const r = await generateEvent(dead, params);
    expect(r.fallback).toBe(true);
    expect(r.attempts).toBe(0);
    expect(called).toBe(false);
    expect(r.overlay).toEqual({ prose: 'stub prose', choiceTexts: ['stub choice'] });
  });
});
