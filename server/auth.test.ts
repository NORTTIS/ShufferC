import { createAuth } from './auth';

const creds = { email: 'admin@test', password: 'pw' };

describe('createAuth', () => {
  it('returns a non-empty token for correct credentials', () => {
    const auth = createAuth(creds);
    const token = auth.login('admin@test', 'pw');
    expect(typeof token).toBe('string');
    expect((token as string).length).toBeGreaterThan(0);
  });

  it('returns null for a wrong password', () => {
    const auth = createAuth(creds);
    expect(auth.login('admin@test', 'nope')).toBeNull();
  });

  it('returns null for a wrong email', () => {
    const auth = createAuth(creds);
    expect(auth.login('someone@else', 'pw')).toBeNull();
  });

  it('verifies an issued token and rejects garbage', () => {
    const auth = createAuth(creds);
    const token = auth.login('admin@test', 'pw') as string;
    expect(auth.verify(token)).toBe(true);
    expect(auth.verify('garbage')).toBe(false);
  });

  it('issues two distinct tokens that both verify', () => {
    const auth = createAuth(creds);
    const t1 = auth.login('admin@test', 'pw') as string;
    const t2 = auth.login('admin@test', 'pw') as string;
    expect(t1).not.toBe(t2);
    expect(auth.verify(t1)).toBe(true);
    expect(auth.verify(t2)).toBe(true);
  });
});
