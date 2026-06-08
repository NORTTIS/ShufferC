import { createMemoryStore } from '../storage/playerStore';
import { createAuthCore, isValidEmail, isValidPassword } from './authCore';

describe('auth validation', () => {
  it('validates email + password', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('nope')).toBe(false);
    expect(isValidPassword('123456')).toBe(true);
    expect(isValidPassword('123')).toBe(false);
  });
});

describe('createAuthCore', () => {
  function core() { return createAuthCore(createMemoryStore()); }

  it('registers then reports the current user', () => {
    const c = core();
    const res = c.register('Player@Mail.com', 'secret1', 'secret1');
    expect(res.ok).toBe(true);
    expect(c.current()).toEqual({ email: 'player@mail.com' });
  });

  it('rejects mismatched confirm and short passwords', () => {
    const c = core();
    expect(c.register('p@m.co', 'secret1', 'other1').ok).toBe(false);
    expect(c.register('p@m.co', '123', '123').ok).toBe(false);
  });

  it('rejects a duplicate email', () => {
    const c = core();
    c.register('p@m.co', 'secret1', 'secret1');
    expect(c.register('p@m.co', 'secret1', 'secret1').ok).toBe(false);
  });

  it('logs in with correct credentials and rejects wrong ones', () => {
    const c = core();
    c.register('p@m.co', 'secret1', 'secret1');
    c.logout();
    expect(c.current()).toBeNull();
    expect(c.login('p@m.co', 'wrongpw').ok).toBe(false);
    const ok = c.login('p@m.co', 'secret1');
    expect(ok.ok).toBe(true);
    expect(c.current()).toEqual({ email: 'p@m.co' });
  });
});
