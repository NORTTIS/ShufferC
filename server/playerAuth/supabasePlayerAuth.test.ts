import { SignJWT } from 'jose';
import { createSupabasePlayerAuth } from './supabasePlayerAuth';

const CFG = { url: 'https://proj.supabase.co', anonKey: 'anon-key', jwtSecret: 'test-secret' };

function fakeFetch(status: number, body: unknown): typeof fetch {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

const GOTRUE_SESSION = {
  access_token: 'at-1',
  refresh_token: 'rt-1',
  user: { id: 'uuid-1', email: 'p@m.co' },
};

describe('supabasePlayerAuth REST mapping', () => {
  it('register maps a GoTrue session to AuthSession and calls /signup with the anon key', async () => {
    const f = fakeFetch(200, GOTRUE_SESSION);
    const auth = createSupabasePlayerAuth(CFG, f);
    const s = await auth.register('p@m.co', 'secret1');
    expect(s).toEqual({ token: 'at-1', refreshToken: 'rt-1', user: { id: 'uuid-1', email: 'p@m.co' } });
    expect(f).toHaveBeenCalledWith(
      'https://proj.supabase.co/auth/v1/signup',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ apikey: 'anon-key' }),
      }),
    );
  });

  it('maps user_already_exists to 409', async () => {
    const auth = createSupabasePlayerAuth(CFG, fakeFetch(422, { error_code: 'user_already_exists', msg: 'User already registered' }));
    await expect(auth.register('p@m.co', 'secret1')).rejects.toMatchObject({ status: 409 });
  });

  it('maps invalid login credentials to 401', async () => {
    const auth = createSupabasePlayerAuth(CFG, fakeFetch(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' }));
    await expect(auth.login('p@m.co', 'wrong1')).rejects.toMatchObject({ status: 401 });
  });

  it('maps an invalid refresh token to 401', async () => {
    const auth = createSupabasePlayerAuth(CFG, fakeFetch(400, { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' }));
    await expect(auth.refresh('stale')).rejects.toMatchObject({ status: 401 });
  });

  it('a signup 200 without a session means email confirmation is still on → 409 with a clear message', async () => {
    const auth = createSupabasePlayerAuth(CFG, fakeFetch(200, { user: { id: 'uuid-1', email: 'p@m.co' } }));
    await expect(auth.register('p@m.co', 'secret1')).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/confirmation/i) });
  });
});

describe('supabasePlayerAuth verifyToken (HS256 path)', () => {
  const key = new TextEncoder().encode(CFG.jwtSecret);
  const auth = createSupabasePlayerAuth(CFG, fakeFetch(500, {}));

  function sign(opts: { sub?: string; aud?: string; secret?: Uint8Array } = {}) {
    let jwt = new SignJWT({ email: 'p@m.co' })
      .setProtectedHeader({ alg: 'HS256' })
      .setAudience(opts.aud ?? 'authenticated')
      .setExpirationTime('1h');
    if (opts.sub !== undefined) jwt = jwt.setSubject(opts.sub);
    else jwt = jwt.setSubject('uuid-1');
    return jwt.sign(opts.secret ?? key);
  }

  it('accepts a valid token and returns id + email', async () => {
    await expect(auth.verifyToken(await sign())).resolves.toEqual({ id: 'uuid-1', email: 'p@m.co' });
  });

  it('rejects a token signed with a different secret', async () => {
    const bad = await sign({ secret: new TextEncoder().encode('other-secret') });
    await expect(auth.verifyToken(bad)).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a token with the wrong audience', async () => {
    await expect(auth.verifyToken(await sign({ aud: 'anon' }))).rejects.toMatchObject({ status: 401 });
  });

  it('rejects garbage', async () => {
    await expect(auth.verifyToken('not-a-jwt')).rejects.toMatchObject({ status: 401 });
  });
});
