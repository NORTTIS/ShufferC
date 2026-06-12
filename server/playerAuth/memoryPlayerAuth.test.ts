import { createMemoryPlayerAuth } from './memoryPlayerAuth';

describe('memoryPlayerAuth', () => {
  it('register returns a session and verifyToken resolves the user', async () => {
    const auth = createMemoryPlayerAuth();
    const s = await auth.register('Player@Mail.com', 'secret1');
    expect(s.token).toBeTruthy();
    expect(s.refreshToken).toBeTruthy();
    expect(s.user.email).toBe('player@mail.com'); // lowercased
    await expect(auth.verifyToken(s.token)).resolves.toEqual(s.user);
  });

  it('rejects a duplicate email with 409', async () => {
    const auth = createMemoryPlayerAuth();
    await auth.register('p@m.co', 'secret1');
    await expect(auth.register('p@m.co', 'other1')).rejects.toMatchObject({ status: 409 });
  });

  it('login succeeds with correct credentials, 401 otherwise', async () => {
    const auth = createMemoryPlayerAuth();
    await auth.register('p@m.co', 'secret1');
    const s = await auth.login('p@m.co', 'secret1');
    expect(s.user.email).toBe('p@m.co');
    await expect(auth.login('p@m.co', 'wrong1')).rejects.toMatchObject({ status: 401 });
    await expect(auth.login('ghost@m.co', 'secret1')).rejects.toMatchObject({ status: 401 });
  });

  it('refresh rotates the refresh token (old one stops working)', async () => {
    const auth = createMemoryPlayerAuth();
    const s1 = await auth.register('p@m.co', 'secret1');
    const s2 = await auth.refresh(s1.refreshToken);
    expect(s2.user).toEqual(s1.user);
    expect(s2.token).not.toBe(s1.token);
    await expect(auth.refresh(s1.refreshToken)).rejects.toMatchObject({ status: 401 });
  });

  it('verifyToken rejects an unknown token with 401', async () => {
    const auth = createMemoryPlayerAuth();
    await expect(auth.verifyToken('nope')).rejects.toMatchObject({ status: 401 });
  });
});
