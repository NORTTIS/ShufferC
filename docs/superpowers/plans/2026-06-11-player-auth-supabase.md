# Player Auth via Supabase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the client-side localStorage account system with real register/login backed by Supabase Auth, and link game saves to users (`GET /saves`, ownership checks, continue-from-any-device).

**Architecture:** Server-proxy auth — the client only talks to our Express REST API; the server calls Supabase GoTrue REST for register/login/refresh and verifies the returned JWTs locally with `jose`. A new `PlayerAuthStore` port has a Supabase adapter and an in-memory fake (tests / dev without Supabase). `save_states` gains a `user_id` column; all `/sessions*` routes require a Bearer token and enforce ownership.

**Tech Stack:** Express 5, Drizzle + Postgres (Supabase), Zod 4, `jose` (JWT verify), Jest + supertest, React Native / Expo web client.

**Spec:** `docs/superpowers/specs/2026-06-11-player-auth-supabase-design.md`

**Conventions used below:**
- All commands run from the repo root (`C:\Codespace\ShufferC`) unless noted.
- Root `npm test` runs Jest over `shared/`, `server/`, **and** `client/src/` (see `jest.config.js`).
- Error type: server code throws `GameError(message, status)` from `server/session.ts`; the central handler in `server/api.ts` maps it to JSON.
- API responses use the shape `AuthSession = { token, refreshToken, user: { id, email } }`.

---

### Task 1: Dependency + config plumbing

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `server/config.ts`
- Modify: `.env.example`

- [ ] **Step 1: Install jose**

```bash
npm install jose
```

Expected: `jose` appears under `dependencies` in `package.json`. (Node here is v25 — `require(esm)` works, so `jose` is fine under ts-jest's CJS output.)

- [ ] **Step 2: Add the supabase block to server config**

In `server/config.ts`, add inside the `config` object (after `admin`):

```ts
  supabase: {
    url: process.env.SUPABASE_URL ?? null,       // null → in-memory player auth (dev/test)
    anonKey: process.env.SUPABASE_ANON_KEY ?? null,
    jwtSecret: process.env.SUPABASE_JWT_SECRET ?? null, // only for legacy HS256 projects; default is JWKS
  },
```

- [ ] **Step 3: Document the new env vars**

Append to `.env.example`:

```
# Supabase Auth (player register/login). Both empty → in-memory player auth.
# Project Settings → API: Project URL + anon public key.
SUPABASE_URL=
SUPABASE_ANON_KEY=
# Only needed for legacy projects that still sign JWTs with the shared secret (HS256).
# Leave empty for new projects (asymmetric keys verified via JWKS).
SUPABASE_JWT_SECRET=
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json server/config.ts .env.example
git commit -m "chore(server): add jose dependency and supabase config block"
```

---

### Task 2: `PlayerAuthStore` port + in-memory adapter

**Files:**
- Create: `server/playerAuth/PlayerAuthStore.ts`
- Create: `server/playerAuth/memoryPlayerAuth.ts`
- Test: `server/playerAuth/memoryPlayerAuth.test.ts`

- [ ] **Step 1: Define the port**

Create `server/playerAuth/PlayerAuthStore.ts`:

```ts
export interface AuthUser { id: string; email: string; }

export interface AuthSession {
  token: string;         // access token (Bearer for game endpoints)
  refreshToken: string;
  user: AuthUser;
}

/**
 * Player auth port. Adapters throw GameError with an HTTP status:
 * 409 email taken, 401 bad credentials / bad token, 400 bad input.
 */
export interface PlayerAuthStore {
  register(email: string, password: string): Promise<AuthSession>;
  login(email: string, password: string): Promise<AuthSession>;
  refresh(refreshToken: string): Promise<AuthSession>;
  verifyToken(accessToken: string): Promise<AuthUser>;
}
```

- [ ] **Step 2: Write the failing tests**

Create `server/playerAuth/memoryPlayerAuth.test.ts`:

```ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest server/playerAuth -t memoryPlayerAuth`
Expected: FAIL — `Cannot find module './memoryPlayerAuth'`.

- [ ] **Step 4: Implement the memory adapter**

Create `server/playerAuth/memoryPlayerAuth.ts`:

```ts
import { randomUUID } from 'crypto';
import { GameError } from '../session';
import { PlayerAuthStore, AuthSession } from './PlayerAuthStore';

interface UserRec { id: string; email: string; password: string; }

/** In-memory fake for tests and for running without Supabase env vars. */
export function createMemoryPlayerAuth(): PlayerAuthStore {
  const users = new Map<string, UserRec>();        // email → user
  const access = new Map<string, string>();        // access token → userId
  const refreshTokens = new Map<string, string>(); // refresh token → userId

  function issue(user: UserRec): AuthSession {
    const token = randomUUID();
    const refreshToken = randomUUID();
    access.set(token, user.id);
    refreshTokens.set(refreshToken, user.id);
    return { token, refreshToken, user: { id: user.id, email: user.email } };
  }

  function byId(id: string): UserRec | undefined {
    for (const u of users.values()) if (u.id === id) return u;
    return undefined;
  }

  return {
    async register(email, password) {
      const e = email.trim().toLowerCase();
      if (users.has(e)) throw new GameError('Email already registered', 409);
      const user: UserRec = { id: randomUUID(), email: e, password };
      users.set(e, user);
      return issue(user);
    },
    async login(email, password) {
      const user = users.get(email.trim().toLowerCase());
      if (!user || user.password !== password) {
        throw new GameError('Invalid email or password', 401);
      }
      return issue(user);
    },
    async refresh(refreshToken) {
      const userId = refreshTokens.get(refreshToken);
      if (!userId) throw new GameError('Invalid refresh token', 401);
      refreshTokens.delete(refreshToken); // rotate
      return issue(byId(userId)!);
    },
    async verifyToken(accessToken) {
      const userId = access.get(accessToken);
      const user = userId ? byId(userId) : undefined;
      if (!user) throw new GameError('Unauthorized', 401);
      return { id: user.id, email: user.email };
    },
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest server/playerAuth`
Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add server/playerAuth
git commit -m "feat(server): PlayerAuthStore port with in-memory adapter"
```

---

### Task 3: Supabase adapter (GoTrue REST + local JWT verify)

**Files:**
- Create: `server/playerAuth/supabasePlayerAuth.ts`
- Test: `server/playerAuth/supabasePlayerAuth.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/playerAuth/supabasePlayerAuth.test.ts`. The adapter takes an injectable `fetchFn`, so no network is touched; JWT verification is tested via the HS256 path by signing a token with `jose` in the test.

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest server/playerAuth/supabasePlayerAuth`
Expected: FAIL — `Cannot find module './supabasePlayerAuth'`.

- [ ] **Step 3: Implement the adapter**

Create `server/playerAuth/supabasePlayerAuth.ts`:

```ts
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { GameError } from '../session';
import { PlayerAuthStore, AuthSession, AuthUser } from './PlayerAuthStore';

export interface SupabaseAuthConfig {
  url: string;                 // e.g. https://xyz.supabase.co
  anonKey: string;
  jwtSecret?: string | null;   // legacy HS256 projects; null/absent → remote JWKS
}

interface GoTrueSession {
  access_token: string;
  refresh_token: string;
  user: { id: string; email: string };
}

/**
 * Real adapter: register/login/refresh proxy Supabase GoTrue REST; verifyToken
 * checks the JWT locally (no network per request — JWKS is fetched once and
 * cached by jose).
 */
export function createSupabasePlayerAuth(
  cfg: SupabaseAuthConfig,
  fetchFn: typeof fetch = fetch,
): PlayerAuthStore {
  const base = cfg.url.replace(/\/$/, '');
  const hsKey = cfg.jwtSecret ? new TextEncoder().encode(cfg.jwtSecret) : null;
  const jwks = hsKey ? null : createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`));

  async function goTrue(path: string, body: unknown): Promise<GoTrueSession> {
    const res = await fetchFn(`${base}/auth/v1${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw mapGoTrueError(res.status, data);
    if (!data.access_token) {
      throw new GameError(
        'Supabase returned no session — email confirmation is still enabled; disable "Confirm email" in the dashboard',
        409,
      );
    }
    return data as unknown as GoTrueSession;
  }

  const toSession = (s: GoTrueSession): AuthSession => ({
    token: s.access_token,
    refreshToken: s.refresh_token,
    user: { id: s.user.id, email: s.user.email },
  });

  return {
    register: (email, password) => goTrue('/signup', { email, password }).then(toSession),
    login: (email, password) => goTrue('/token?grant_type=password', { email, password }).then(toSession),
    refresh: (refreshToken) =>
      goTrue('/token?grant_type=refresh_token', { refresh_token: refreshToken }).then(toSession),
    async verifyToken(accessToken): Promise<AuthUser> {
      try {
        const { payload } = hsKey
          ? await jwtVerify(accessToken, hsKey, { audience: 'authenticated' })
          : await jwtVerify(accessToken, jwks!, { audience: 'authenticated' });
        if (!payload.sub) throw new Error('missing sub claim');
        return { id: payload.sub, email: (payload.email as string | undefined) ?? '' };
      } catch {
        throw new GameError('Unauthorized', 401);
      }
    },
  };
}

function mapGoTrueError(status: number, data: Record<string, unknown>): GameError {
  const code = typeof data.error_code === 'string' ? data.error_code : '';
  const msg =
    (typeof data.msg === 'string' && data.msg) ||
    (typeof data.error_description === 'string' && data.error_description) ||
    (typeof data.message === 'string' && data.message) ||
    'Auth provider error';
  if (code === 'user_already_exists' || /already registered/i.test(msg)) {
    return new GameError('Email already registered', 409);
  }
  if (/invalid login credentials/i.test(msg) || code === 'invalid_credentials') {
    return new GameError('Invalid email or password', 401);
  }
  if (/refresh token/i.test(msg) || code.startsWith('refresh_token')) {
    return new GameError('Invalid refresh token', 401);
  }
  if (status === 400 || status === 401 || status === 422) return new GameError(msg, status === 422 ? 400 : status);
  return new GameError(msg, 502);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest server/playerAuth`
Expected: all pass (memory + supabase suites).

- [ ] **Step 5: Commit**

```bash
git add server/playerAuth
git commit -m "feat(server): supabase PlayerAuthStore adapter (GoTrue REST + local JWT verify)"
```

---

### Task 4: `/auth/*` endpoints + `requirePlayer` on game routes

**Files:**
- Modify: `server/api.ts`
- Modify: `server/index.ts`
- Test: `server/api.test.ts`

- [ ] **Step 1: Write the failing tests**

In `server/api.test.ts`:

1. Add imports at the top:

```ts
import { createMemoryPlayerAuth } from './playerAuth/memoryPlayerAuth';
```

2. Update the `app()` helper — `createApp` gains a third argument:

```ts
  return createApp(session, {
    provider, routes,
    content,
    auth: createAuth(ADMIN),
    novels, embeddings, embedder,
  }, { auth: createMemoryPlayerAuth() });
```

3. Add a player-token helper next to the admin `token()` helper:

```ts
const PLAYER = { email: 'p@test.co', password: 'secret1' };

async function playerToken(a: ReturnType<typeof app>): Promise<string> {
  const res = await request(a).post('/auth/register').send(PLAYER);
  return res.body.token as string;
}
```

4. Update every existing test that hits `/sessions...` to send the header. Pattern (apply to each):

```ts
  it('POST /sessions creates a session and returns the start node', async () => {
    const a = app();
    const t = await playerToken(a);
    const res = await request(a).post('/sessions').set('Authorization', `Bearer ${t}`).send({ backgroundId: 'rogue' });
    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBeDefined();
    expect(res.body.node.id).toBe('n1');
    expect(res.body.effectiveStats.str).toBe(9);
  });
```

Tests to update the same way (add `const t = await playerToken(a);` + `.set('Authorization', ...)` on every `/sessions` request; tests that previously used `request(app())` inline must capture `const a = app()` first so the token and the request hit the same instance):
- `POST /sessions creates a session...`
- `POST /sessions with bad background returns 400`
- `GET /sessions/:id returns 404 for an unknown id`
- `POST /sessions/:id/choice (sneak) advances the node`
- `POST /sessions/:id/choice (fight) without skillPriority returns 400`
- `POST /sessions/:id/continue returns 409...`
- `POST /sessions/:id/equip recomputes effective stats`
- Any other test in the file that creates a session (search the file for `/sessions`).

`GET /backgrounds` stays public — leave it unchanged.

5. Add a new describe block:

```ts
describe('Player auth', () => {
  it('POST /auth/register returns a session', async () => {
    const res = await request(app()).post('/auth/register').send(PLAYER);
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
    expect(res.body.user.email).toBe('p@test.co');
  });

  it('POST /auth/register rejects a duplicate email with 409', async () => {
    const a = app();
    await request(a).post('/auth/register').send(PLAYER);
    const res = await request(a).post('/auth/register').send(PLAYER);
    expect(res.status).toBe(409);
  });

  it('POST /auth/register rejects bad input with 400', async () => {
    expect((await request(app()).post('/auth/register').send({ email: 'nope', password: 'secret1' })).status).toBe(400);
    expect((await request(app()).post('/auth/register').send({ email: 'p@test.co', password: '123' })).status).toBe(400);
  });

  it('POST /auth/login round-trips and rejects wrong credentials', async () => {
    const a = app();
    await request(a).post('/auth/register').send(PLAYER);
    const ok = await request(a).post('/auth/login').send(PLAYER);
    expect(ok.status).toBe(200);
    expect(typeof ok.body.token).toBe('string');
    const bad = await request(a).post('/auth/login').send({ ...PLAYER, password: 'wrong1' });
    expect(bad.status).toBe(401);
  });

  it('POST /auth/refresh rotates tokens', async () => {
    const a = app();
    const reg = await request(a).post('/auth/register').send(PLAYER);
    const res = await request(a).post('/auth/refresh').send({ refreshToken: reg.body.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.token).not.toBe(reg.body.token);
  });

  it('game endpoints require a player token', async () => {
    const a = app();
    expect((await request(a).post('/sessions').send({ backgroundId: 'rogue' })).status).toBe(401);
    expect((await request(a).get('/sessions/some-id')).status).toBe(401);
    expect((await request(a).get('/backgrounds')).status).toBe(200); // stays public
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx jest server/api.test.ts`
Expected: FAIL — compile error (`createApp` arity) and/or 404s on `/auth/register`.

- [ ] **Step 3: Implement in `server/api.ts`**

1. Imports:

```ts
import { z } from 'zod';
import { PlayerAuthStore } from './playerAuth/PlayerAuthStore';
```

2. After the `AdminDeps` interface, add:

```ts
export interface PlayerDeps {
  auth: PlayerAuthStore;
}

interface PlayerRequest extends Request {
  player?: { id: string; email: string };
}

const credentials = z.object({ email: z.email(), password: z.string().min(6) });

function parseCredentials(body: unknown): { email: string; password: string } {
  const parsed = credentials.safeParse(body);
  if (!parsed.success) {
    throw new GameError('Valid email and a password of at least 6 characters are required', 400);
  }
  return { email: parsed.data.email.toLowerCase(), password: parsed.data.password };
}

/** Express middleware factory: requires a valid player Bearer token. */
function requirePlayer(auth: PlayerAuthStore) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return next(new GameError('Unauthorized', 401));
    try {
      (req as PlayerRequest).player = await auth.verifyToken(token);
      next();
    } catch (err) {
      next(err);
    }
  };
}
```

3. Change the signature:

```ts
export function createApp(session: GameSession, admin: AdminDeps, player: PlayerDeps): Express {
```

4. After the admin-login route, add the player-auth routes and middleware handle:

```ts
  // ── Player auth (no token required) ───────────────────────────────────
  app.post('/auth/register', wrap((req) => {
    const { email, password } = parseCredentials(req.body);
    return player.auth.register(email, password);
  }));

  app.post('/auth/login', wrap((req) => {
    const { email, password } = parseCredentials(req.body);
    return player.auth.login(email, password);
  }));

  app.post('/auth/refresh', wrap((req) => {
    const refreshToken = req.body?.refreshToken;
    if (typeof refreshToken !== 'string' || refreshToken === '') {
      throw new GameError('refreshToken is required', 400);
    }
    return player.auth.refresh(refreshToken);
  }));

  const playerOnly = requirePlayer(player.auth);
```

5. Add `playerOnly` to every `/sessions` route (NOT `/backgrounds`):

```ts
  app.post('/sessions', playerOnly, wrap((req) => session.newGame(req.body?.backgroundId, req.body?.routeId)));

  app.get('/sessions/:id', playerOnly, wrap((req) => session.getView(req.params.id as string)));

  app.post('/sessions/:id/choice', playerOnly, wrap((req) =>
    session.applyChoice(req.params.id as string, req.body?.choiceId, req.body?.skillPriority),
  ));

  app.post('/sessions/:id/continue', playerOnly, wrap((req) =>
    session.continueToNextRoute(req.params.id as string),
  ));

  app.post('/sessions/:id/equip', playerOnly, wrap((req) =>
    session.equip(req.params.id as string, req.body?.slot, req.body?.itemId ?? null),
  ));

  app.get('/sessions/:id/shop', playerOnly, wrap((req) => session.getShop(req.params.id as string)));

  app.post('/sessions/:id/buy', playerOnly, wrap((req) =>
    session.buy(req.params.id as string, req.body?.itemId),
  ));

  app.post('/sessions/:id/use', playerOnly, wrap((req) =>
    session.useItem(req.params.id as string, req.body?.itemId),
  ));
```

(Ownership comes in Task 5 — this task only adds authentication.)

- [ ] **Step 4: Wire `server/index.ts`**

Imports:

```ts
import { createMemoryPlayerAuth } from './playerAuth/memoryPlayerAuth';
import { createSupabasePlayerAuth } from './playerAuth/supabasePlayerAuth';
```

After the `embedder` line:

```ts
const playerAuth = config.supabase.url && config.supabase.anonKey
  ? createSupabasePlayerAuth({
      url: config.supabase.url,
      anonKey: config.supabase.anonKey,
      jwtSecret: config.supabase.jwtSecret,
    })
  : createMemoryPlayerAuth(); // no Supabase env → in-memory accounts (dev only, lost on restart)
```

Update the `createApp` call and the boot log:

```ts
  const app = createApp(session, {
    provider,
    routes,
    content,
    auth: createAuth(config.admin),
    novels,
    embeddings,
    embedder,
  }, { auth: playerAuth });
```

```ts
    console.log(`AI provider available: ${provider.available} · embedder available: ${embedder.available} · db: ${db ? 'postgres' : 'memory'} · player auth: ${config.supabase.url ? 'supabase' : 'memory'}`);
```

- [ ] **Step 5: Run the server test suite**

Run: `npx jest server`
Expected: all pass (api.test.ts updated tests + new Player auth block).

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck` → exit 0.

```bash
git add server/api.ts server/index.ts server/api.test.ts
git commit -m "feat(server): /auth register-login-refresh endpoints, Bearer auth on game routes"
```

---

### Task 5: Link saves to users (schema, stores, ownership, GET /saves)

**Files:**
- Modify: `server/store/SaveStore.ts`
- Modify: `server/store/memoryStore.ts`
- Modify: `server/store/pgSaveStore.ts`
- Modify: `server/db/schema.ts`
- Create: `server/db/migrations/0002_*.sql` (generated)
- Modify: `server/session.ts` (newGame signature)
- Modify: `server/api.ts` (ownership + /saves + pass userId)
- Test: `server/store/memoryStore.test.ts`, `server/api.test.ts`, `server/session.test.ts`, `server/e2e.test.ts`, `server/db/pgStores.integration.test.ts`

- [ ] **Step 1: Extend the SaveStore port**

Replace `server/store/SaveStore.ts` with:

```ts
import { SaveState } from '../../shared/types';

export interface SaveSummary { id: string; routeId: string; updatedAt: string; }

export interface SaveStore {
  create(save: SaveState, userId: string): Promise<string>;
  get(id: string): Promise<SaveState | null>;
  put(id: string, save: SaveState): Promise<void>;
  /** Owning user id; null if the save does not exist (or is a pre-auth legacy row). */
  owner(id: string): Promise<string | null>;
  /** Newest first. */
  listByUser(userId: string): Promise<SaveSummary[]>;
}
```

- [ ] **Step 2: Write failing memory-store tests**

In `server/store/memoryStore.test.ts`, update existing `create(...)` calls to pass a second argument `'u1'`, and add:

```ts
  it('tracks the owner and lists saves per user', async () => {
    const store = createMemoryStore();
    const a = await store.create(SAVE_FIXTURE, 'u1');   // reuse whatever SaveState fixture the file already uses
    const b = await store.create(SAVE_FIXTURE, 'u2');
    expect(await store.owner(a)).toBe('u1');
    expect(await store.owner('missing')).toBeNull();
    const mine = await store.listByUser('u1');
    expect(mine.map((s) => s.id)).toEqual([a]);
    expect(mine[0].routeId).toBe(SAVE_FIXTURE.routeId);
    expect(typeof mine[0].updatedAt).toBe('string');
    expect((await store.listByUser('u2')).map((s) => s.id)).toEqual([b]);
  });
```

(`SAVE_FIXTURE` = the existing SaveState object used by the file's current tests — reuse its actual variable name.)

Run: `npx jest server/store/memoryStore` → FAIL (compile: create arity / missing methods).

- [ ] **Step 3: Implement the memory store**

Replace `server/store/memoryStore.ts` with:

```ts
import { randomUUID } from 'crypto';
import { SaveState } from '../../shared/types';
import { SaveStore, SaveSummary } from './SaveStore';

interface Entry { save: SaveState; userId: string; updatedAt: string; }

export function createMemoryStore(): SaveStore {
  const map = new Map<string, Entry>();
  return {
    async create(save: SaveState, userId: string): Promise<string> {
      const id = randomUUID();
      map.set(id, { save: structuredClone(save), userId, updatedAt: new Date().toISOString() });
      return id;
    },
    async get(id: string): Promise<SaveState | null> {
      const found = map.get(id);
      return found ? structuredClone(found.save) : null;
    },
    async put(id: string, save: SaveState): Promise<void> {
      const found = map.get(id);
      map.set(id, {
        save: structuredClone(save),
        userId: found?.userId ?? '',
        updatedAt: new Date().toISOString(),
      });
    },
    async owner(id: string): Promise<string | null> {
      return map.get(id)?.userId ?? null;
    },
    async listByUser(userId: string): Promise<SaveSummary[]> {
      const out: SaveSummary[] = [];
      for (const [id, e] of map) {
        if (e.userId === userId) out.push({ id, routeId: e.save.routeId, updatedAt: e.updatedAt });
      }
      return out.sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
    },
  };
}
```

Run: `npx jest server/store/memoryStore` → PASS.

- [ ] **Step 4: Schema + migration**

In `server/db/schema.ts`, replace the `saveStates` table with:

```ts
export const saveStates = pgTable('save_states', {
  id: uuid('id').primaryKey().defaultRandom(),
  routeId: text('route_id').notNull(),
  userId: uuid('user_id'),                     // null = pre-auth legacy save (abandoned)
  save: jsonb('save').notNull(),               // full SaveState
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  userIdx: index('save_states_user_id_idx').on(t.userId),
}));
```

Generate and apply the migration (DATABASE_URL is set in `.env`):

```bash
npm run db:generate
npm run db:migrate
```

Expected: a new `server/db/migrations/0002_*.sql` containing `ALTER TABLE "save_states" ADD COLUMN "user_id" uuid;` and `CREATE INDEX "save_states_user_id_idx" ...`; migrate exits 0.

- [ ] **Step 5: Implement the pg store**

Replace `server/store/pgSaveStore.ts` with:

```ts
import { desc, eq } from 'drizzle-orm';
import { SaveState } from '../../shared/types';
import { SaveStore, SaveSummary } from './SaveStore';
import { Db } from '../db/client';
import { saveStates } from '../db/schema';

export function createPgSaveStore(db: Db): SaveStore {
  return {
    async create(save: SaveState, userId: string): Promise<string> {
      const rows = await db.insert(saveStates)
        .values({ routeId: save.routeId, save, userId })
        .returning({ id: saveStates.id });
      return rows[0].id;
    },
    async get(id: string): Promise<SaveState | null> {
      const rows = await db.select().from(saveStates).where(eq(saveStates.id, id));
      return rows[0] ? (rows[0].save as SaveState) : null;
    },
    async put(id: string, save: SaveState): Promise<void> {
      await db.update(saveStates)
        .set({ routeId: save.routeId, save, updatedAt: new Date() })
        .where(eq(saveStates.id, id));
    },
    async owner(id: string): Promise<string | null> {
      const rows = await db.select({ userId: saveStates.userId }).from(saveStates).where(eq(saveStates.id, id));
      return rows[0]?.userId ?? null;
    },
    async listByUser(userId: string): Promise<SaveSummary[]> {
      const rows = await db.select({ id: saveStates.id, routeId: saveStates.routeId, updatedAt: saveStates.updatedAt })
        .from(saveStates)
        .where(eq(saveStates.userId, userId))
        .orderBy(desc(saveStates.updatedAt));
      return rows.map((r) => ({ id: r.id, routeId: r.routeId, updatedAt: r.updatedAt.toISOString() }));
    },
  };
}
```

Check the pg integration test for save-store usage and update its `create(...)` calls to pass a userId (must be a valid UUID for the pg column, e.g. `'00000000-0000-4000-8000-000000000001'`):

```bash
npx rg -n "saves|saveStore|create\(" server/db/pgStores.integration.test.ts
```

- [ ] **Step 6: Thread userId through GameSession.newGame**

In `server/session.ts`:

Interface (line ~81):

```ts
  newGame(userId: string, backgroundId: string, routeId?: string): Promise<SessionView & { sessionId: string }>;
```

Implementation (line ~222): change the signature to `async newGame(userId: string, backgroundId: string, routeId?: string)` and the store call to:

```ts
      const sessionId = await store.create(save, userId);
```

- [ ] **Step 7: Fix existing newGame call sites in tests**

`server/session.test.ts` and `server/e2e.test.ts` call `*.newGame('rogue', ...)`. Prepend a test user id to every call — find-and-replace `.newGame('` → `.newGame('u-test', '` in both files (the memory store accepts any string id). Verify none were missed:

```bash
npx rg -n "newGame\('(rogue|fighter|mage|wizardlord)" server
```

Expected: no matches.

- [ ] **Step 8: Ownership middleware + GET /saves + failing API tests**

Add to `server/api.test.ts` (in the `Player auth` describe block or a new one):

```ts
  it("a player cannot access another player's session (404)", async () => {
    const a = app();
    const t1 = await playerToken(a);
    const reg2 = await request(a).post('/auth/register').send({ email: 'other@test.co', password: 'secret1' });
    const t2 = reg2.body.token as string;
    const created = await request(a).post('/sessions').set('Authorization', `Bearer ${t1}`).send({ backgroundId: 'rogue' });
    const id = created.body.sessionId as string;
    expect((await request(a).get(`/sessions/${id}`).set('Authorization', `Bearer ${t2}`)).status).toBe(404);
    expect((await request(a).get(`/sessions/${id}`).set('Authorization', `Bearer ${t1}`)).status).toBe(200);
  });

  it('GET /saves lists only my saves, newest first', async () => {
    const a = app();
    const t1 = await playerToken(a);
    const reg2 = await request(a).post('/auth/register').send({ email: 'other@test.co', password: 'secret1' });
    const t2 = reg2.body.token as string;
    const mine = await request(a).post('/sessions').set('Authorization', `Bearer ${t1}`).send({ backgroundId: 'rogue' });
    await request(a).post('/sessions').set('Authorization', `Bearer ${t2}`).send({ backgroundId: 'mage' });
    const res = await request(a).get('/saves').set('Authorization', `Bearer ${t1}`);
    expect(res.status).toBe(200);
    expect(res.body.map((s: { id: string }) => s.id)).toEqual([mine.body.sessionId]);
    expect(res.body[0].routeId).toBeDefined();
    expect(typeof res.body[0].updatedAt).toBe('string');
  });
```

Run: `npx jest server/api.test.ts` → the two new tests FAIL.

Implement in `server/api.ts`:

1. Import the store type and extend `PlayerDeps`:

```ts
import { SaveStore } from './store/SaveStore';
```

```ts
export interface PlayerDeps {
  auth: PlayerAuthStore;
  saves: SaveStore;
}
```

2. Below `requirePlayer`, add:

```ts
/** Requires that req.params.id is a save owned by the authenticated player. 404 otherwise (don't reveal existence). */
function requireOwner(saves: SaveStore) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const owner = await saves.owner(req.params.id as string);
      if (!owner || owner !== (req as PlayerRequest).player?.id) {
        return next(new GameError(`Session ${req.params.id} not found`, 404));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
```

3. Update the player routes: `POST /sessions` passes the user id, all `/sessions/:id*` routes get the owner check, and `/saves` is added:

```ts
  const playerOnly = requirePlayer(player.auth);
  const ownedSession = [playerOnly, requireOwner(player.saves)];

  app.post('/sessions', playerOnly, wrap((req) =>
    session.newGame((req as PlayerRequest).player!.id, req.body?.backgroundId, req.body?.routeId),
  ));

  app.get('/saves', playerOnly, wrap((req) =>
    player.saves.listByUser((req as PlayerRequest).player!.id),
  ));

  app.get('/sessions/:id', ownedSession, wrap((req) => session.getView(req.params.id as string)));

  app.post('/sessions/:id/choice', ownedSession, wrap((req) =>
    session.applyChoice(req.params.id as string, req.body?.choiceId, req.body?.skillPriority),
  ));

  app.post('/sessions/:id/continue', ownedSession, wrap((req) =>
    session.continueToNextRoute(req.params.id as string),
  ));

  app.post('/sessions/:id/equip', ownedSession, wrap((req) =>
    session.equip(req.params.id as string, req.body?.slot, req.body?.itemId ?? null),
  ));

  app.get('/sessions/:id/shop', ownedSession, wrap((req) => session.getShop(req.params.id as string)));

  app.post('/sessions/:id/buy', ownedSession, wrap((req) =>
    session.buy(req.params.id as string, req.body?.itemId),
  ));

  app.post('/sessions/:id/use', ownedSession, wrap((req) =>
    session.useItem(req.params.id as string, req.body?.itemId),
  ));
```

4. In `server/api.test.ts`, the `app()` helper must share the saves store with `createApp` — pull it out of the `createGameSession` call:

```ts
  const saves = createMemoryStore();
  const session = createGameSession(saves, {
    backgrounds: BACKGROUNDS, content,
    routes, provider, embedder, embeddings,
  });
  return createApp(session, {
    provider, routes,
    content,
    auth: createAuth(ADMIN),
    novels, embeddings, embedder,
  }, { auth: createMemoryPlayerAuth(), saves });
```

5. In `server/index.ts`, pass the saves store:

```ts
  }, { auth: playerAuth, saves });
```

Note: the existing test `GET /sessions/:id returns 404 for an unknown id` keeps passing — `owner('missing')` is null → 404 from `requireOwner`.

- [ ] **Step 9: Run the full server suite**

Run: `npx jest server shared`
Expected: all pass.

- [ ] **Step 10: Typecheck and commit**

Run: `npm run typecheck` → exit 0.

```bash
git add server/store server/db server/session.ts server/api.ts server/index.ts server/session.test.ts server/e2e.test.ts server/api.test.ts
git commit -m "feat(server): saves owned by users — user_id column, ownership 404, GET /saves"
```

---

### Task 6: Client REST layer — tokens, auto-refresh, new endpoints

**Files:**
- Modify: `client/src/services/api.ts`
- Test: `client/src/services/api.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `client/src/services/api.test.ts`:

```ts
import { setApiSession, onApiSessionChange } from './api';

describe('gameApi auth handling', () => {
  const origFetch = global.fetch;
  afterEach(() => {
    global.fetch = origFetch;
    setApiSession(null);
    onApiSessionChange(() => {});
  });

  it('attaches the Bearer token when a session is set', async () => {
    const f = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    global.fetch = f as unknown as typeof fetch;
    setApiSession({ token: 'at-1', refreshToken: 'rt-1' });
    await gameApi.listSaves();
    expect(f).toHaveBeenCalledWith(
      expect.stringContaining('/saves'),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer at-1' }) }),
    );
  });

  it('on 401 refreshes once, retries, and reports the new session', async () => {
    const f = jest.fn()
      // 1: original request → 401
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) })
      // 2: POST /auth/refresh → new tokens
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ token: 'at-2', refreshToken: 'rt-2', user: { id: 'u1', email: 'p@m.co' } }) })
      // 3: retried request → 200
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [{ id: 's1', routeId: 'r1', updatedAt: 'now' }] });
    global.fetch = f as unknown as typeof fetch;
    const changes: unknown[] = [];
    setApiSession({ token: 'at-1', refreshToken: 'rt-1' });
    onApiSessionChange((s) => changes.push(s));
    const res = await gameApi.listSaves();
    expect(res).toEqual([{ id: 's1', routeId: 'r1', updatedAt: 'now' }]);
    expect(f).toHaveBeenCalledTimes(3);
    expect(f.mock.calls[1][0]).toContain('/auth/refresh');
    expect(changes).toEqual([{ token: 'at-2', refreshToken: 'rt-2' }]);
  });

  it('when the refresh also fails, clears the session and rethrows the original 401', async () => {
    const f = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) })
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'Invalid refresh token' }) });
    global.fetch = f as unknown as typeof fetch;
    const changes: unknown[] = [];
    setApiSession({ token: 'at-1', refreshToken: 'rt-1' });
    onApiSessionChange((s) => changes.push(s));
    await expect(gameApi.listSaves()).rejects.toMatchObject({ status: 401 });
    expect(changes).toEqual([null]);
  });

  it('register POSTs credentials and returns the session', async () => {
    const body = { token: 'at', refreshToken: 'rt', user: { id: 'u1', email: 'p@m.co' } };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body }) as unknown as typeof fetch;
    const res = await gameApi.register('p@m.co', 'secret1');
    expect(res).toEqual(body);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/register'), expect.objectContaining({ method: 'POST' }));
  });
});
```

Run: `npx jest client/src/services` → FAIL (missing exports `setApiSession`, `listSaves`, ...).

- [ ] **Step 2: Implement in `client/src/services/api.ts`**

Add the types after `ApiError`:

```ts
export interface AuthUser { id: string; email: string; }
export interface AuthSession { token: string; refreshToken: string; user: AuthUser; }
export interface SaveSummary { id: string; routeId: string; updatedAt: string; }
export interface ApiSession { token: string; refreshToken: string; }
```

Replace the existing `call` function with:

```ts
let session: ApiSession | null = null;
let sessionListener: (s: ApiSession | null) => void = () => {};

/** Set (or clear, with null) the tokens attached to every API call. */
export function setApiSession(s: ApiSession | null): void { session = s; }
/** Fires when an automatic refresh rotates the tokens (persist them) or fails (logout). */
export function onApiSessionChange(cb: (s: ApiSession | null) => void): void { sessionListener = cb; }

async function rawCall<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session) headers.Authorization = `Bearer ${session.token}`;
  const res = await fetch(`${config.apiBase}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError((body as { error?: string }).error ?? `HTTP ${res.status}`, res.status);
  }
  return body as T;
}

async function tryRefresh(): Promise<boolean> {
  if (!session) return false;
  try {
    const next = await rawCall<AuthSession>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    session = { token: next.token, refreshToken: next.refreshToken };
    sessionListener(session);
    return true;
  } catch {
    session = null;
    sessionListener(null);
    return false;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await rawCall<T>(path, init);
  } catch (err) {
    const expired = err instanceof ApiError && err.status === 401
      && session !== null && !path.startsWith('/auth/');
    if (expired && (await tryRefresh())) return rawCall<T>(path, init);
    throw err;
  }
}
```

Add to `gameApi`:

```ts
  register: (email: string, password: string) =>
    call<AuthSession>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    call<AuthSession>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  listSaves: () => call<SaveSummary[]>('/saves'),
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx jest client/src/services`
Expected: all pass — including the two pre-existing describe blocks (they don't set a session, so no Authorization header is added and behavior is unchanged).

- [ ] **Step 4: Commit**

```bash
git add client/src/services
git commit -m "feat(client): bearer tokens with one-shot auto-refresh, auth + saves endpoints"
```

---

### Task 7: Client authCore rewrite + useAuth

**Files:**
- Modify: `client/src/auth/authCore.ts` (full rewrite)
- Modify: `client/src/hooks/useAuth.ts`
- Test: `client/src/auth/authCore.test.ts` (full rewrite)

- [ ] **Step 1: Rewrite the tests**

Replace `client/src/auth/authCore.test.ts` with:

```ts
import { createMemoryStore } from '../storage/playerStore';
import { createAuthCore, isValidEmail, isValidPassword } from './authCore';
import { setApiSession, onApiSessionChange } from '../services/api';

const SESSION_BODY = { token: 'at-1', refreshToken: 'rt-1', user: { id: 'u1', email: 'p@m.co' } };

describe('auth validation', () => {
  it('validates email + password', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('nope')).toBe(false);
    expect(isValidPassword('123456')).toBe(true);
    expect(isValidPassword('123')).toBe(false);
  });
});

describe('createAuthCore (server-backed)', () => {
  const origFetch = global.fetch;
  afterEach(() => {
    global.fetch = origFetch;
    setApiSession(null);
    onApiSessionChange(() => {});
  });

  function mockFetch(status: number, body: unknown) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as unknown as typeof fetch;
  }

  it('register calls the server, persists the session, returns the user', async () => {
    mockFetch(200, SESSION_BODY);
    const store = createMemoryStore();
    const c = createAuthCore(store);
    const res = await c.register('P@M.co', 'secret1', 'secret1');
    expect(res).toEqual({ ok: true, user: SESSION_BODY.user });
    expect(JSON.parse(store.get('shufferc_session')!)).toEqual(SESSION_BODY);
  });

  it('register validates locally before any network call', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    const c = createAuthCore(createMemoryStore());
    expect((await c.register('nope', 'secret1', 'secret1')).ok).toBe(false);
    expect((await c.register('p@m.co', '123', '123')).ok).toBe(false);
    expect((await c.register('p@m.co', 'secret1', 'other1')).ok).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('surfaces server errors as { ok: false }', async () => {
    mockFetch(409, { error: 'Email already registered' });
    const c = createAuthCore(createMemoryStore());
    const res = await c.register('p@m.co', 'secret1', 'secret1');
    expect(res).toEqual({ ok: false, error: 'Email already registered' });
  });

  it('login round-trips and persists; logout clears', async () => {
    mockFetch(200, SESSION_BODY);
    const store = createMemoryStore();
    const c = createAuthCore(store);
    const res = await c.login('p@m.co', 'secret1');
    expect(res.ok).toBe(true);
    expect(store.get('shufferc_session')).not.toBeNull();
    c.logout();
    expect(store.get('shufferc_session')).toBeNull();
  });

  it('restore returns the persisted user and arms the API session', async () => {
    const store = createMemoryStore({ shufferc_session: JSON.stringify(SESSION_BODY) });
    const c = createAuthCore(store);
    expect(c.restore()).toEqual(SESSION_BODY.user);
  });

  it('restore returns null without a stored session', () => {
    expect(createAuthCore(createMemoryStore()).restore()).toBeNull();
  });

  it('wipes legacy plaintext-account keys on creation', () => {
    const store = createMemoryStore({
      shufferc_accounts: '{"p@m.co":"secret1"}',
      shufferc_player: '{"email":"p@m.co"}',
    });
    createAuthCore(store);
    expect(store.get('shufferc_accounts')).toBeNull();
    expect(store.get('shufferc_player')).toBeNull();
  });

  it('fires onLogout when a token refresh fails (forced logout)', async () => {
    const store = createMemoryStore({ shufferc_session: JSON.stringify(SESSION_BODY) });
    const c = createAuthCore(store);
    c.restore();
    let loggedOut = false;
    c.onLogout(() => { loggedOut = true; });
    // 401 on a game call, then 401 on the refresh → forced logout
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) })
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'Invalid refresh token' }) }) as unknown as typeof fetch;
    const { gameApi } = await import('../services/api');
    await expect(gameApi.listSaves()).rejects.toMatchObject({ status: 401 });
    expect(loggedOut).toBe(true);
    expect(store.get('shufferc_session')).toBeNull();
  });
});
```

Run: `npx jest client/src/auth` → FAIL (old sync API).

- [ ] **Step 2: Rewrite authCore**

Replace `client/src/auth/authCore.ts` with:

```ts
import type { PlayerStore } from '../storage/playerStore';
import {
  gameApi, ApiError, setApiSession, onApiSessionChange,
  type AuthSession, type AuthUser,
} from '../services/api';

export type { AuthUser };
export type AuthResult = { ok: true; user: AuthUser } | { ok: false; error: string };

const SESSION_KEY = 'shufferc_session';
// Pre-server-auth era: accounts (email → plaintext password!) and user lived in localStorage.
const LEGACY_KEYS = ['shufferc_accounts', 'shufferc_player'];

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
export function isValidPassword(pw: string): boolean {
  return typeof pw === 'string' && pw.length >= 6;
}

interface StoredSession { token: string; refreshToken: string; user: AuthUser; }

export function createAuthCore(store: PlayerStore) {
  for (const k of LEGACY_KEYS) store.remove(k);

  let logoutListener: () => void = () => {};

  const read = (): StoredSession | null => {
    const raw = store.get(SESSION_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw) as StoredSession; } catch { return null; }
  };
  const persist = (s: StoredSession) => store.set(SESSION_KEY, JSON.stringify(s));

  const adopt = (s: AuthSession): AuthUser => {
    persist({ token: s.token, refreshToken: s.refreshToken, user: s.user });
    setApiSession({ token: s.token, refreshToken: s.refreshToken });
    return s.user;
  };

  // Auto-refresh rotated the tokens → persist them; refresh failed → forced logout.
  onApiSessionChange((apiSession) => {
    if (!apiSession) {
      store.remove(SESSION_KEY);
      logoutListener();
      return;
    }
    const current = read();
    if (current) persist({ ...current, token: apiSession.token, refreshToken: apiSession.refreshToken });
  });

  return {
    /** Restore the persisted session on app boot. Returns the user, or null. */
    restore(): AuthUser | null {
      const s = read();
      if (!s) return null;
      setApiSession({ token: s.token, refreshToken: s.refreshToken });
      return s.user;
    },
    async register(email: string, pw: string, confirm: string): Promise<AuthResult> {
      const e = email.trim().toLowerCase();
      if (!isValidEmail(e)) return { ok: false, error: 'Enter a valid email.' };
      if (!isValidPassword(pw)) return { ok: false, error: 'Password must be at least 6 characters.' };
      if (pw !== confirm) return { ok: false, error: 'Passwords do not match.' };
      try {
        return { ok: true, user: adopt(await gameApi.register(e, pw)) };
      } catch (err) {
        return { ok: false, error: err instanceof ApiError ? err.message : 'Network error' };
      }
    },
    async login(email: string, pw: string): Promise<AuthResult> {
      const e = email.trim().toLowerCase();
      if (!isValidEmail(e)) return { ok: false, error: 'Enter a valid email.' };
      try {
        return { ok: true, user: adopt(await gameApi.login(e, pw)) };
      } catch (err) {
        return { ok: false, error: err instanceof ApiError ? err.message : 'Network error' };
      }
    },
    logout(): void {
      store.remove(SESSION_KEY);
      setApiSession(null);
    },
    /** Invoked when a token refresh fails and the player is force-logged-out. */
    onLogout(cb: () => void): void { logoutListener = cb; },
  };
}

export type AuthCore = ReturnType<typeof createAuthCore>;
```

- [ ] **Step 3: Run the auth tests**

Run: `npx jest client/src/auth`
Expected: all pass.

- [ ] **Step 4: Update useAuth**

Replace `client/src/hooks/useAuth.ts` with:

```ts
import { useCallback, useEffect, useState } from 'react';
import { createPlayerStore } from '../storage/playerStore';
import { createAuthCore, type AuthUser, type AuthResult } from '../auth/authCore';

const core = createAuthCore(createPlayerStore());

export type AuthStatus = 'loading' | 'out' | 'in';
export interface AuthState { user: AuthUser | null; status: AuthStatus; }

export function useAuth() {
  const [state, setState] = useState<AuthState>({ user: null, status: 'loading' });

  useEffect(() => {
    core.onLogout(() => setState({ user: null, status: 'out' })); // refresh failed → back to login
    const user = core.restore();
    setState({ user, status: user ? 'in' : 'out' });
  }, []);

  const register = useCallback(async (email: string, pw: string, confirm: string): Promise<AuthResult> => {
    const res = await core.register(email, pw, confirm);
    if (res.ok) setState({ user: res.user, status: 'in' });
    return res;
  }, []);

  const login = useCallback(async (email: string, pw: string): Promise<AuthResult> => {
    const res = await core.login(email, pw);
    if (res.ok) setState({ user: res.user, status: 'in' });
    return res;
  }, []);

  const logout = useCallback(() => {
    core.logout();
    setState({ user: null, status: 'out' });
  }, []);

  return { ...state, register, login, logout };
}
```

- [ ] **Step 5: Run all client tests + typecheck**

Run: `npx jest client/src` — expected: all pass. Note: `client/src/screens/Auth/index.tsx` still types `onLogin` as sync `AuthResult` while useAuth is now async, so the **client** typecheck fails until Task 8 — run `cd client; npm run typecheck` only after Task 8.

- [ ] **Step 6: Commit**

```bash
git add client/src/auth client/src/hooks/useAuth.ts
git commit -m "feat(client): server-backed authCore — session in storage, accounts in Supabase"
```

---

### Task 8: AuthScreen — async submit

**Files:**
- Modify: `client/src/screens/Auth/index.tsx`

- [ ] **Step 1: Make the screen async-aware**

In `client/src/screens/Auth/index.tsx`:

1. Props become Promise-returning:

```ts
export function AuthScreen({
  onLogin, onRegister,
}: {
  onLogin: (email: string, pw: string) => Promise<AuthResult>;
  onRegister: (email: string, pw: string, confirm: string) => Promise<AuthResult>;
}) {
```

2. Add busy state and an async submit (replace the existing `submit`):

```ts
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = mode === 'login' ? await onLogin(email, pw) : await onRegister(email, pw, confirm);
    setBusy(false);
    if (!res.ok) setError(res.error);
  };
```

3. Wire busy into the submit line (replace the existing `ChoiceLine`):

```tsx
        <ChoiceLine
          text={busy ? 'opening…' : mode === 'login' ? 'Open the book' : 'Begin a new book'}
          disabled={busy}
          onPress={submit}
        />
```

4. The hint text is now wrong (data DOES leave the device). Replace:

```tsx
        <Text style={styles.hint}>Your account and saves live on the server — log in anywhere.</Text>
```

- [ ] **Step 2: Typecheck both packages**

Run: `npm run typecheck` then `cd client; npm run typecheck; cd ..`
Expected: both exit 0 (App.tsx already passes `auth.login`/`auth.register`, now async — types line up).

- [ ] **Step 3: Commit**

```bash
git add client/src/screens/Auth/index.tsx
git commit -m "feat(client): async auth screen with busy state"
```

---

### Task 9: Continue from a previous save

**Files:**
- Modify: `client/src/hooks/useGameSession.ts`
- Modify: `client/src/screens/CharCreate.tsx`
- Modify: `client/App.tsx`

- [ ] **Step 1: Add resume to useGameSession**

In `client/src/hooks/useGameSession.ts`, after the `choose` callback (so `screenAfter` is already defined above it), add:

```ts
  // Resume a save from GET /saves: load its view and route to the right screen.
  const resume = useCallback((saveId: string) => run(async () => {
    const res = await gameApi.getView(saveId);
    return { sessionId: saveId, view: res, lastChoice: null, screen: screenAfter(res) };
  }), [run]);
```

And export it:

```ts
  return { state, start, resume, choose, enterCombat, fight, equip, buy, useItem, openShop, goTo, continueRoute };
```

- [ ] **Step 2: List saves in CharCreate**

In `client/src/screens/CharCreate.tsx`:

1. Update imports and props:

```ts
import type { SaveSummary } from '../services/api';

export function CharCreate({ onPick, onResume, busy }: {
  onPick: (id: string) => void;
  onResume: (saveId: string) => void;
  busy: boolean;
}) {
```

2. Add state + fetch (replace the existing `useEffect`):

```ts
  const [saves, setSaves] = useState<SaveSummary[] | null>(null);

  useEffect(() => {
    gameApi.listBackgrounds().then(setBackgrounds).catch((e) => setError(String(e.message)));
    gameApi.listSaves().then(setSaves).catch(() => setSaves([])); // continue list is best-effort
  }, []);
```

3. Render the continue section inside `<BookPage>`, before the `prologue` heading:

```tsx
        {saves && saves.length > 0 && (
          <>
            <Text style={styles.chapter}>continue</Text>
            {saves.map((s) => (
              <Pressable key={s.id} disabled={busy} onPress={() => onResume(s.id)} style={styles.bg}>
                <Text style={styles.name}>{s.routeId}</Text>
                <Text style={styles.stats}>{new Date(s.updatedAt).toLocaleString()}</Text>
              </Pressable>
            ))}
          </>
        )}
```

- [ ] **Step 3: Wire App.tsx**

In `client/App.tsx`, destructure `resume` from `useGameSession()` and pass it down:

```ts
  const { state, start, resume, choose, enterCombat, fight, equip, buy, useItem, openShop, goTo, continueRoute } = useGameSession();
```

```tsx
        {state.screen === 'charcreate' && (
          <CharCreate onPick={start} onResume={resume} busy={state.busy} />
        )}
```

- [ ] **Step 4: Typecheck + full test run**

Run: `cd client; npm run typecheck; cd ..` → exit 0.
Run: `npm test` → all suites pass.

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/useGameSession.ts client/src/screens/CharCreate.tsx client/App.tsx
git commit -m "feat(client): continue screen — resume saves listed from GET /saves"
```

---

### Task 10: Final verification + manual smoke against real Supabase

**Files:** none (verification only)

- [ ] **Step 1: Full automated verification**

```bash
npm run typecheck
cd client; npm run typecheck; cd ..
npm test
```

Expected: both typechecks exit 0; the full Jest run is green.

- [ ] **Step 2: One-time Supabase dashboard setup (user-visible checklist)**

1. Supabase dashboard → **Authentication → Sign In / Providers** (older UI: Settings) → disable **Confirm email**.
2. **Project Settings → API**: copy *Project URL* → `SUPABASE_URL`, *anon public* key → `SUPABASE_ANON_KEY` in `.env`.
3. If (and only if) the project still uses the legacy shared JWT secret (Project Settings → API → JWT Settings shows an HS256 secret and no "JWT Signing Keys" section), also set `SUPABASE_JWT_SECRET`. Otherwise leave it empty — JWKS is used.
4. Confirm migration `0002` was applied (Task 5): `save_states` has a `user_id` column in the Supabase table editor.

- [ ] **Step 3: Manual smoke**

1. `npm run dev:server` — boot log must say `db: postgres · player auth: supabase`.
2. `cd client; npm run web` — open the app.
3. Register a fresh email → lands on character creation. Check Supabase dashboard → Authentication → Users: the user row exists.
4. Start a game, make one choice. Check `save_states` in the table editor: the new row has `user_id` set.
5. Press “close the book” (logout), log back in → the **continue** section lists the save; resuming returns to the same node.
6. Open the app in a private/incognito window, log in with the same account → the save list shows the same save (cross-device proof).
7. Wrong password → form shows “Invalid email or password”; duplicate register → “Email already registered”.
8. Admin console at `http://localhost:3000/admin` still logs in and lists routes (admin auth untouched).

- [ ] **Step 4: Final commit (if any stragglers) and wrap-up**

Use the superpowers:finishing-a-development-branch skill if working on a branch; otherwise confirm `git status` is clean.
