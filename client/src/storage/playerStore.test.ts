import { createMemoryStore } from './playerStore';

describe('memory PlayerStore', () => {
  it('round-trips set → get', () => {
    const s = createMemoryStore();
    expect(s.get('k')).toBeNull();
    s.set('k', 'v');
    expect(s.get('k')).toBe('v');
  });

  it('remove clears a key', () => {
    const s = createMemoryStore({ k: 'v' });
    s.remove('k');
    expect(s.get('k')).toBeNull();
  });
});
