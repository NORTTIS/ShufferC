# Admin Login + Admin UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bearer-token admin login plus a static browser console (served at `GET /admin`) that drives the existing C1 route-generation endpoints.

**Architecture:** A pure `server/auth.ts` (credential check + in-memory token set) feeds an Express `requireAuth` middleware guarding `/admin/routes*` and `/admin/status`. A single self-contained `server/admin/index.html` (vanilla JS) logs in, shows provider status, generates routes, and publishes them — all via `fetch` with `Authorization: Bearer <token>`.

**Tech Stack:** TypeScript 5, Express 5, Jest + ts-jest, supertest. Vanilla HTML/CSS/JS for the UI (no build).

**Reference spec:** `docs/superpowers/specs/2026-06-07-admin-auth-ui-design.md`

**Conventions (follow exactly):**
- Env vars only in `server/config.ts` (invariant #1).
- `server/auth.ts` stays pure: no Express, no `GameError`. It returns `string | null` / `boolean`; `api.ts` translates to HTTP.
- `GameError(message, status)` carries an HTTP status; the central error handler in `api.ts` maps it.
- Tests run from repo root: `npx jest <path>`. Typecheck: `npm run typecheck`.
- Commit trailer (every commit), on its own line after a blank line:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Branch: this work continues on `feature/c1-framework-gen` (do not branch/switch).

**Current state (already implemented, do not recreate):** `server/api.ts` exports `createApp(session, admin)` where `admin: AdminDeps = { provider, routes, registries }`, with player routes + admin routes `/admin/routes(/:id)(/generate|/publish)`, a CORS block, and a central error handler. `server/config.ts` has `{ port, gemini }`. `server/index.ts` builds one shared `routes` store and picks Gemini-or-Fake provider.

---

## Task 1: Admin credentials in config + env

**Files:**
- Modify: `server/config.ts`
- Modify: `.env.example`
- Modify: `.env`

This is config/env only; verification is a successful typecheck.

- [ ] **Step 1: Add the `admin` block to `server/config.ts`**

The file currently is:
```ts
import 'dotenv/config'; // loads root .env into process.env before any read below

export const config = {
  port: Number(process.env.PORT ?? 3000),
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? null,        // null → provider unavailable
    proModel: process.env.GEMINI_PRO_MODEL ?? 'gemini-2.5-pro',
    flashModel: process.env.GEMINI_FLASH_MODEL ?? 'gemini-2.5-flash', // reserved for C3 live event-gen
  },
};
```
Add an `admin` block so it becomes:
```ts
import 'dotenv/config'; // loads root .env into process.env before any read below

export const config = {
  port: Number(process.env.PORT ?? 3000),
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? null,        // null → provider unavailable
    proModel: process.env.GEMINI_PRO_MODEL ?? 'gemini-2.5-pro',
    flashModel: process.env.GEMINI_FLASH_MODEL ?? 'gemini-2.5-flash', // reserved for C3 live event-gen
  },
  // Admin console credentials. Local/academic only — NOT production auth.
  admin: {
    email: process.env.ADMIN_EMAIL ?? 'adminshufferc@gmail.com',
    password: process.env.ADMIN_PASSWORD ?? 'admin12345678',
  },
};
```

- [ ] **Step 2: Document the vars in `.env.example`**

Append to `.env.example`, after the Gemini block and before the Client section:
```
# Admin console credentials (local/academic only — NOT production auth).
ADMIN_EMAIL=adminshufferc@gmail.com
ADMIN_PASSWORD=admin12345678
```

- [ ] **Step 3: Add the same vars to `.env`**

Append to `.env`:
```
ADMIN_EMAIL=adminshufferc@gmail.com
ADMIN_PASSWORD=admin12345678
```

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit** (`.env` is git-ignored and will not be staged — that is expected)

```bash
git add server/config.ts .env.example
git commit -m "feat: add admin credentials to config + env example"
```

---

## Task 2: Pure auth module

**Files:**
- Create: `server/auth.ts`
- Test: `server/auth.test.ts`

- [ ] **Step 1: Write the failing tests — create `server/auth.test.ts`:**

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest server/auth.test.ts`
Expected: FAIL — `Cannot find module './auth'`.

- [ ] **Step 3: Implement `server/auth.ts`:**

```ts
import { randomUUID } from 'crypto';

export interface AdminCredentials { email: string; password: string; }

export interface Auth {
  /** Returns a fresh bearer token on success, or null on bad credentials. */
  login(email: string, password: string): string | null;
  /** True iff the token was issued by this Auth instance. */
  verify(token: string): boolean;
}

/**
 * Minimal single-admin auth. Credentials come from config (env-backed). Issued
 * tokens are held in an in-memory Set (no expiry, resets on restart). Local/
 * academic only — real auth (Supabase, hashing, expiry) is sub-project D.
 */
export function createAuth(creds: AdminCredentials): Auth {
  const tokens = new Set<string>();
  return {
    login(email: string, password: string): string | null {
      if (email !== creds.email || password !== creds.password) return null;
      const token = randomUUID();
      tokens.add(token);
      return token;
    },
    verify(token: string): boolean {
      return tokens.has(token);
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest server/auth.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/auth.ts server/auth.test.ts
git commit -m "feat: add pure admin auth (token login + verify)"
```

---

## Task 3: Admin UI static page

**Files:**
- Create: `server/admin/index.html`

No unit test — this static file is exercised by the `GET /admin` test in Task 4 (which checks the served body contains known markers). Build it first so that route has a file to serve.

- [ ] **Step 1: Create `server/admin/index.html`** with this exact content:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ShufferC Admin</title>
  <style>
    :root { --bg:#0f1117; --card:#1a1d27; --fg:#e6e8ee; --muted:#8a90a2; --accent:#5b8cff; --ok:#3fb950; --warn:#d29922; --err:#f85149; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: system-ui, sans-serif; background:var(--bg); color:var(--fg); }
    header { padding:16px 24px; border-bottom:1px solid #2a2e3a; display:flex; justify-content:space-between; align-items:center; }
    h1 { font-size:18px; margin:0; }
    main { max-width:880px; margin:0 auto; padding:24px; }
    .card { background:var(--card); border:1px solid #2a2e3a; border-radius:10px; padding:18px; margin-bottom:18px; }
    label { display:block; font-size:13px; color:var(--muted); margin:10px 0 4px; }
    input, textarea { width:100%; padding:9px 11px; background:#0c0e14; color:var(--fg); border:1px solid #2a2e3a; border-radius:6px; font:inherit; }
    textarea { min-height:140px; resize:vertical; }
    button { background:var(--accent); color:#fff; border:0; border-radius:6px; padding:9px 16px; font:inherit; cursor:pointer; }
    button.secondary { background:#2a2e3a; }
    button:disabled { opacity:.5; cursor:default; }
    table { width:100%; border-collapse:collapse; margin-top:8px; }
    th, td { text-align:left; padding:8px 6px; border-bottom:1px solid #2a2e3a; font-size:14px; }
    .status { font-size:13px; }
    .ok { color:var(--ok); } .warn { color:var(--warn); } .err { color:var(--err); }
    pre { background:#0c0e14; padding:12px; border-radius:6px; overflow:auto; max-height:320px; font-size:12px; }
    .hidden { display:none; }
    .row { display:flex; gap:12px; }
    .row > div { flex:1; }
    .msg { margin-top:10px; font-size:13px; }
  </style>
</head>
<body>
  <header>
    <h1>ShufferC Admin</h1>
    <button id="logout" class="secondary hidden">Log out</button>
  </header>
  <main>
    <!-- Login -->
    <section id="login" class="card">
      <h2 style="margin-top:0;font-size:15px;">Log in</h2>
      <label>Email</label>
      <input id="email" type="email" autocomplete="username" />
      <label>Password</label>
      <input id="password" type="password" autocomplete="current-password" />
      <div style="margin-top:14px;"><button id="loginBtn">Log in</button></div>
      <div id="loginMsg" class="msg err"></div>
    </section>

    <!-- Console -->
    <div id="console" class="hidden">
      <section class="card">
        <div id="status" class="status">Checking provider…</div>
      </section>

      <section class="card">
        <h2 style="margin-top:0;font-size:15px;">Generate a route</h2>
        <div class="row">
          <div><label>Title</label><input id="title" placeholder="The Bridge" /></div>
          <div><label>Node count</label><input id="nodeCount" type="number" value="4" min="3" max="8" /></div>
        </div>
        <label>Source text (novel excerpt)</label>
        <textarea id="contextText" placeholder="Paste a few paragraphs of source material…"></textarea>
        <div style="margin-top:14px;"><button id="genBtn">Generate</button></div>
        <div id="genMsg" class="msg"></div>
        <pre id="genOut" class="hidden"></pre>
      </section>

      <section class="card">
        <h2 style="margin-top:0;font-size:15px;">Routes</h2>
        <table>
          <thead><tr><th>ID</th><th>Title</th><th>Status</th><th></th></tr></thead>
          <tbody id="routesBody"></tbody>
        </table>
        <pre id="viewOut" class="hidden"></pre>
      </section>
    </div>
  </main>

  <script>
    const TOKEN_KEY = 'shufferc_admin_token';
    const $ = (id) => document.getElementById(id);
    let token = localStorage.getItem(TOKEN_KEY) || '';

    function authHeaders() { return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }; }

    async function api(path, opts = {}) {
      const res = await fetch(path, opts);
      if (res.status === 401) { logout(); throw new Error('unauthorized'); }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(body.error || ('HTTP ' + res.status)), { status: res.status, body });
      return body;
    }

    function showConsole(on) {
      $('login').classList.toggle('hidden', on);
      $('console').classList.toggle('hidden', !on);
      $('logout').classList.toggle('hidden', !on);
    }

    function logout() {
      token = '';
      localStorage.removeItem(TOKEN_KEY);
      showConsole(false);
    }

    async function doLogin() {
      $('loginMsg').textContent = '';
      try {
        const body = await api('/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: $('email').value, password: $('password').value }),
        });
        token = body.token;
        localStorage.setItem(TOKEN_KEY, token);
        showConsole(true);
        await Promise.all([loadStatus(), loadRoutes()]);
      } catch (e) {
        $('loginMsg').textContent = e.status === 401 ? 'Invalid credentials.' : ('Login failed: ' + e.message);
      }
    }

    async function loadStatus() {
      const s = $('status');
      try {
        const body = await api('/admin/status', { headers: authHeaders() });
        s.innerHTML = body.providerAvailable
          ? 'Gemini provider: <span class="ok">available</span>'
          : 'Gemini provider: <span class="warn">not configured</span> — set GEMINI_API_KEY in .env to enable generation.';
      } catch (e) { s.innerHTML = '<span class="err">Status error: ' + e.message + '</span>'; }
    }

    async function loadRoutes() {
      const tbody = $('routesBody');
      tbody.innerHTML = '';
      const rows = await api('/admin/routes', { headers: authHeaders() });
      for (const r of rows) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td>' + r.id + '</td><td>' + r.title + '</td><td>' + r.status + '</td>';
        const td = document.createElement('td');
        const view = document.createElement('button');
        view.className = 'secondary'; view.textContent = 'View JSON';
        view.onclick = () => viewRoute(r.id);
        td.appendChild(view);
        if (r.status !== 'published') {
          const pub = document.createElement('button');
          pub.textContent = 'Publish'; pub.style.marginLeft = '8px';
          pub.onclick = () => publishRoute(r.id);
          td.appendChild(pub);
        }
        tr.appendChild(td);
        tbody.appendChild(tr);
      }
    }

    async function viewRoute(id) {
      const bundle = await api('/admin/routes/' + id, { headers: authHeaders() });
      const out = $('viewOut'); out.classList.remove('hidden');
      out.textContent = JSON.stringify(bundle, null, 2);
    }

    async function publishRoute(id) {
      await fetch('/admin/routes/' + id + '/publish', { method: 'POST', headers: authHeaders() });
      await loadRoutes();
    }

    async function doGenerate() {
      const msg = $('genMsg'); const out = $('genOut');
      msg.textContent = 'Generating…'; msg.className = 'msg'; out.classList.add('hidden');
      $('genBtn').disabled = true;
      try {
        const body = await api('/admin/routes/generate', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            title: $('title').value,
            nodeCount: Number($('nodeCount').value) || 4,
            contextText: $('contextText').value,
          }),
        });
        msg.className = 'msg ok';
        msg.textContent = 'Created draft route: ' + body.routeId;
        out.classList.remove('hidden');
        out.textContent = JSON.stringify(body.bundle, null, 2);
        await loadRoutes();
      } catch (e) {
        msg.className = 'msg err';
        if (e.status === 422 && e.body && e.body.errors) {
          msg.textContent = 'Generation failed after ' + e.body.attempts + ' attempts:';
          out.classList.remove('hidden');
          out.textContent = e.body.errors.map((x) => '[' + x.code + '] ' + x.path + ': ' + x.message).join('\n');
        } else if (e.status === 503) {
          msg.textContent = 'Provider unavailable — set GEMINI_API_KEY in .env and restart the server.';
        } else {
          msg.textContent = 'Error: ' + e.message;
        }
      } finally {
        $('genBtn').disabled = false;
      }
    }

    $('loginBtn').onclick = doLogin;
    $('logout').onclick = logout;
    $('genBtn').onclick = doGenerate;

    // Boot: if we already hold a token, try the console; a stale token bounces back to login on the first 401.
    if (token) { showConsole(true); loadStatus(); loadRoutes().catch(() => {}); }
    else { showConsole(false); }
  </script>
</body>
</html>
```

- [ ] **Step 2: Sanity check the file is valid by serving it once (optional manual)**

There is no automated test in this task. Confirm the file exists:
Run: `node -e "const s=require('fs').readFileSync('server/admin/index.html','utf8'); if(!s.includes('id=\"login\"')) throw new Error('marker missing'); console.log('ok', s.length)"`
Expected: prints `ok <length>`.

- [ ] **Step 3: Commit**

```bash
git add server/admin/index.html
git commit -m "feat: add static admin console page"
```

---

## Task 4: Wire auth + page into the REST layer

**Files:**
- Modify: `server/api.ts`
- Modify: `server/api.test.ts`

- [ ] **Step 1: Update `server/api.test.ts` (write failing tests)**

Replace the import block + `app()` helper (current lines 1–16) with:
```ts
import request from 'supertest';
import path from 'path';
import { createApp } from './api';
import { createGameSession } from './session';
import { createMemoryStore } from './store/memoryStore';
import { createMemoryRouteStore } from './store/memoryRouteStore';
import { createFakeProvider, AIProvider } from './ai/provider';
import { createAuth } from './auth';
import { BACKGROUNDS } from '../shared/backgrounds';
import { SKILL_DB, ITEM_DB, ENEMY_DB, SAMPLE_BUNDLE } from '../shared/fixtures';

const ADMIN = { email: 'admin@test', password: 'pw' };

function app(provider: AIProvider = createFakeProvider([])) {
  const routes = createMemoryRouteStore([structuredClone(SAMPLE_BUNDLE)]);
  const session = createGameSession(createMemoryStore(), {
    backgrounds: BACKGROUNDS, itemDb: ITEM_DB, skillDb: SKILL_DB, enemyDb: ENEMY_DB, routes,
  });
  return createApp(session, {
    provider, routes,
    registries: { itemDb: ITEM_DB, skillDb: SKILL_DB, enemyDb: ENEMY_DB },
    auth: createAuth(ADMIN),
  });
}

async function token(a: ReturnType<typeof app>): Promise<string> {
  const res = await request(a).post('/admin/login').send(ADMIN);
  return res.body.token as string;
}
```

Replace the entire `describe('Admin REST + AI route e2e', ...)` block (current lines 71–118) with:
```ts
describe('Admin auth', () => {
  it('POST /admin/login with correct creds returns a token', async () => {
    const res = await request(app()).post('/admin/login').send(ADMIN);
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
  });

  it('POST /admin/login with wrong creds returns 401', async () => {
    const res = await request(app()).post('/admin/login').send({ email: 'admin@test', password: 'bad' });
    expect(res.status).toBe(401);
  });

  it('GET /admin/routes without a token returns 401', async () => {
    const res = await request(app()).get('/admin/routes');
    expect(res.status).toBe(401);
  });

  it('GET /admin/routes with a bearer token returns 200', async () => {
    const a = app();
    const t = await token(a);
    const res = await request(a).get('/admin/routes').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /admin serves the console HTML', async () => {
    const res = await request(app()).get('/admin');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="login"');
  });

  it('GET /admin/status with a token reports provider availability', async () => {
    const a = app();
    const t = await token(a);
    const res = await request(a).get('/admin/status').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.providerAvailable).toBe('boolean');
  });
});

describe('Admin REST + AI route e2e', () => {
  function genBundle() {
    const b = structuredClone(SAMPLE_BUNDLE);
    b.route.id = 'ai-route-1';
    b.route.title = 'AI Generated';
    b.route.status = 'draft';
    return b;
  }

  it('generate → publish → play a generated route end-to-end', async () => {
    const a = app(createFakeProvider([genBundle()]));
    const t = await token(a);
    const auth = { Authorization: `Bearer ${t}` };

    const gen = await request(a).post('/admin/routes/generate').set(auth).send({ contextText: 'ctx', title: 'AI Generated' });
    expect(gen.status).toBe(200);
    expect(gen.body.routeId).toBe('ai-route-1');

    const list = await request(a).get('/admin/routes').set(auth);
    expect(list.body.map((r: { id: string }) => r.id)).toContain('ai-route-1');

    const pub = await request(a).post('/admin/routes/ai-route-1/publish').set(auth);
    expect(pub.status).toBe(204);

    // player route stays unauthenticated
    const play = await request(a).post('/sessions').send({ backgroundId: 'rogue', routeId: 'ai-route-1' });
    expect(play.status).toBe(200);
    expect(play.body.save.routeId).toBe('ai-route-1');
    expect(play.body.node.id).toBe('n1');
  });

  it('returns 422 with errors when generation never validates', async () => {
    const a = app(createFakeProvider([{}, {}, {}]));
    const t = await token(a);
    const res = await request(a).post('/admin/routes/generate').set('Authorization', `Bearer ${t}`).send({ contextText: 'ctx', title: 'X' });
    expect(res.status).toBe(422);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.attempts).toBe(3);
  });

  it('returns 503 when the provider is unavailable', async () => {
    const unavailable: AIProvider = { available: false, async generateStructured() { throw new Error('x'); } };
    const a = app(unavailable);
    const t = await token(a);
    const res = await request(a).post('/admin/routes/generate').set('Authorization', `Bearer ${t}`).send({ contextText: 'ctx', title: 'X' });
    expect(res.status).toBe(503);
  });

  it('publish of an unknown route returns 404', async () => {
    const a = app();
    const t = await token(a);
    const res = await request(a).post('/admin/routes/ghost/publish').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(404);
  });
});
```
(Note `import path from 'path'` is added for symmetry with api.ts; if the linter flags it as unused in the test file, remove that one line — it is only required in `api.ts`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest server/api.test.ts`
Expected: FAIL — `createApp` admin arg now needs `auth`; `/admin/login`, `/admin/status`, `/admin` routes don't exist; `/admin/routes` isn't guarded.

- [ ] **Step 3: Replace the ENTIRE contents of `server/api.ts` with:**

```ts
import express, { Request, Response, NextFunction, Express } from 'express';
import path from 'path';
import { GameSession, GameError } from './session';
import { AIProvider } from './ai/provider';
import { RouteStore } from './store/RouteStore';
import { Registries } from '../shared/types';
import { generateFramework } from './ai/frameworkGen';
import { Auth } from './auth';

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;

export interface AdminDeps {
  provider: AIProvider;
  routes: RouteStore;
  registries: Registries;
  auth: Auth;
}

function wrap(handler: Handler) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = await handler(req, res);
      if (!res.headersSent) res.json(body);
    } catch (err) {
      next(err);
    }
  };
}

/** Express middleware factory: requires a valid `Authorization: Bearer <token>`. */
function requireAuth(auth: Auth) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? '';
    const tokenValue = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!auth.verify(tokenValue)) return next(new GameError('Unauthorized', 401));
    next();
  };
}

export function createApp(session: GameSession, admin: AdminDeps): Express {
  const app = express();

  // CORS: the Expo web client runs on a different origin (e.g. :8081) than the
  // API (:3000). Allow cross-origin requests and answer preflight OPTIONS.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    next();
  });
  app.options(/.*/, (_req: Request, res: Response) => res.sendStatus(204));

  app.use(express.json());

  // ── Admin console page (no auth — it IS the login screen) ─────────────
  app.get('/admin', (_req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, 'admin', 'index.html'));
  });

  // ── Admin login (no auth) ─────────────────────────────────────────────
  app.post('/admin/login', wrap((req) => {
    const tokenValue = admin.auth.login(req.body?.email, req.body?.password);
    if (!tokenValue) throw new GameError('Invalid credentials', 401);
    return { token: tokenValue };
  }));

  // ── Player ──────────────────────────────────────────────────────────
  app.get('/backgrounds', wrap(() => session.listBackgrounds()));

  app.post('/sessions', wrap((req) => session.newGame(req.body?.backgroundId, req.body?.routeId)));

  app.get('/sessions/:id', wrap((req) => session.getView(req.params.id as string)));

  app.post('/sessions/:id/choice', wrap((req) =>
    session.applyChoice(req.params.id as string, req.body?.choiceId, req.body?.skillPriority),
  ));

  app.post('/sessions/:id/equip', wrap((req) =>
    session.equip(req.params.id as string, req.body?.slot, req.body?.itemId ?? null),
  ));

  // ── Admin data endpoints (auth required; unauthenticated → 401) ───────
  app.get('/admin/status', requireAuth(admin.auth), wrap(() => ({ providerAvailable: admin.provider.available })));

  app.use('/admin/routes', requireAuth(admin.auth));

  app.post('/admin/routes/generate', wrap(async (req, res) => {
    if (!admin.provider.available) throw new GameError('AI provider unavailable', 503);
    const { contextText, title, nodeCount } = req.body ?? {};
    const result = await generateFramework(admin.provider, { contextText, title, nodeCount }, admin.registries);
    if (!result.ok) {
      res.status(422).json({ errors: result.errors, attempts: result.attempts });
      return undefined;
    }
    const routeId = await admin.routes.create(result.bundle);
    return { routeId, bundle: result.bundle };
  }));

  app.get('/admin/routes', wrap(() => admin.routes.list()));

  app.get('/admin/routes/:id', wrap(async (req) => {
    const bundle = await admin.routes.get(req.params.id as string);
    if (!bundle) throw new GameError(`Route ${req.params.id} not found`, 404);
    return bundle;
  }));

  app.post('/admin/routes/:id/publish', wrap(async (req, res) => {
    const id = req.params.id as string;
    const bundle = await admin.routes.get(id);
    if (!bundle) throw new GameError(`Route ${id} not found`, 404);
    await admin.routes.publish(id);
    res.status(204).end();
    return undefined;
  }));

  // Centralised error handler — maps GameError.status, defaults to 500.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof GameError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'Internal error';
    res.status(status).json({ error: message });
  });

  return app;
}
```

Key ordering notes for the implementer: `GET /admin` and `POST /admin/login` are registered BEFORE `app.use('/admin/routes', requireAuth(...))`, and `requireAuth` is mounted before the `/admin/routes*` handlers so it guards all of them. `GET /admin/status` carries `requireAuth` as route-level middleware.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest server/api.test.ts`
Expected: PASS — player tests + 6 admin-auth tests + 4 admin e2e tests.

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npx jest`
Expected: all suites pass. (NOTE: `server/index.ts` still calls `createApp(session, { ... })` WITHOUT `auth`, so `npm run typecheck` will report ONE error in `server/index.ts` — expected, fixed in Task 5. Confirm the error is only in `server/index.ts`.)

Run: `npm run typecheck`
Expected: a single error in `server/index.ts` (missing `auth`), nothing else.

- [ ] **Step 6: Commit**

```bash
git add server/api.ts server/api.test.ts
git commit -m "feat: add admin login, status, console page + auth-guard admin routes"
```

---

## Task 5: Bootstrap wiring

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Replace the ENTIRE contents of `server/index.ts` with:**

```ts
import { createApp } from './api';
import { createGameSession } from './session';
import { createMemoryStore } from './store/memoryStore';
import { createMemoryRouteStore } from './store/memoryRouteStore';
import { createFakeProvider } from './ai/provider';
import { createGeminiProvider } from './ai/gemini';
import { createAuth } from './auth';
import { BACKGROUNDS } from '../shared/backgrounds';
import { SKILL_DB, ITEM_DB, ENEMY_DB, SAMPLE_BUNDLE } from '../shared/fixtures';
import { config } from './config';

// One RouteStore instance is shared between the player session (reads routes) and
// the admin endpoints (write routes), so a freshly generated+published route is
// immediately playable.
const routes = createMemoryRouteStore([SAMPLE_BUNDLE]);

const provider = config.gemini.apiKey
  ? createGeminiProvider(config.gemini)
  : createFakeProvider([]); // no key → AI generation endpoints report 503

const session = createGameSession(createMemoryStore(), {
  backgrounds: BACKGROUNDS, itemDb: ITEM_DB, skillDb: SKILL_DB, enemyDb: ENEMY_DB, routes,
});

const app = createApp(session, {
  provider,
  routes,
  registries: { itemDb: ITEM_DB, skillDb: SKILL_DB, enemyDb: ENEMY_DB },
  auth: createAuth(config.admin),
});

app.listen(config.port, () => {
  console.log(`ShufferC server listening on http://localhost:${config.port}`);
  console.log(`Admin console: http://localhost:${config.port}/admin`);
  console.log(`AI provider available: ${provider.available}`);
});
```

- [ ] **Step 2: Verify typecheck (now fully clean)**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Run the full suite**

Run: `npx jest`
Expected: ALL suites pass.

- [ ] **Step 4: Commit**

```bash
git add server/index.ts
git commit -m "feat: wire admin auth into server bootstrap"
```

---

## Manual smoke test (after the plan completes — not automated)

1. Ensure `.env` has `GEMINI_API_KEY` set (optional; generation needs it).
2. `npm run dev:server` → console prints the admin URL + `AI provider available: true/false`.
3. Open `http://localhost:3000/admin` in a browser.
4. Log in with `adminshufferc@gmail.com` / `admin12345678`.
5. Status bar shows the provider state. Paste novel text → set title → **Generate**. On success a draft `routeId` + JSON appears and the routes table refreshes.
6. Click **Publish** on the draft → status flips to `published`.
7. In the client (`cd client; npm run web`), start a game; to play the new route, `gameApi.newGame('rogue', '<routeId>')`.

---

## Self-Review (completed by plan author)

**Spec coverage:**
- §0/§2 auth (bearer login, env creds, in-memory tokens) → Task 1 (config/env) + Task 2 (`auth.ts`).
- §3 REST surface (login open, status+routes guarded, page open, requireAuth, 401 mapping) → Task 4.
- §4 admin UI (login, status, generate, routes table, publish/view, bearer fetch, 401 bounce, logout) → Task 3 (`index.html`) + served in Task 4.
- §5 bootstrap (createAuth, pass into createApp) → Task 5.
- §6 config + env (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) → Task 1.
- §7 tests (auth unit tests; login 200/401; routes 401-without/200-with; GET /admin HTML; status; e2e updated to authenticate; player /sessions stays open) → Task 2 (`auth.test.ts`) + Task 4 (`api.test.ts`).

**Type consistency:** `Auth`/`AdminCredentials`/`createAuth` defined in Task 2, imported by Task 4 (`api.ts`) and Task 5 (`index.ts`). `AdminDeps` gains `auth` in Task 4 and the matching object is built in Task 4's test helper and Task 5's bootstrap. `config.admin` defined in Task 1, consumed in Task 5. `requireAuth(auth)` mounted before `/admin/routes*` handlers and on `/admin/status`.

**Placeholder scan:** no TBD/TODO; every code step has complete code; every test step has real assertions; every run step states the expected result. The one conditional note (unused `import path` in the test) gives an explicit instruction rather than a vague placeholder.
