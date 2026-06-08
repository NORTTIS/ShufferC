# Admin Login + Admin UI — Design Doc

> Part of **ShufferC: AI Chronicles**. A minimal slice of Sub-project D (Admin CMS): a simple admin login plus a browser UI that drives the Sub-project C (slice C1) route-generation endpoints.
> Goal: academic / learning project — easy local setup over production hardening.
> Date: 2026-06-07.
> Depends on: Sub-project C slice C1 (admin REST endpoints) — complete on branch `feature/c1-framework-gen`, where this work continues.

---

## 0. Scope & decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Auth mechanism | **Bearer token login.** `POST /admin/login {email,password}` → `{token}`; admin data endpoints require `Authorization: Bearer <token>`. |
| 2 | Credential storage | Env vars `ADMIN_EMAIL` / `ADMIN_PASSWORD`, defaulting to `adminshufferc@gmail.com` / `admin12345678`. Read only in `server/config.ts`. |
| 3 | Token storage | In-memory `Set` of issued tokens (resets on server restart). No DB, no expiry. |
| 4 | Admin UI | **Single static HTML+CSS+JS file** served by Express at `GET /admin`. No build step, no Expo coupling. |
| 5 | UI scope | Login · provider-status indicator · generate-route form · routes table with publish/view. |
| 6 | Branch | Continue on `feature/c1-framework-gen` (secures + fronts C1's endpoints; ships together). |

### Security note (explicit, non-negotiable to keep visible)
Hardcoded credentials and non-expiring in-memory tokens are acceptable **only** for a local/academic project. This is NOT production-grade auth. Real auth (Supabase roles, hashed credentials, token expiry) is the full Sub-project D. The real password is never committed — it is a default in `config.ts` and lives in the git-ignored `.env`; only `.env.example` placeholders are committed.

### Out of scope
- Supabase auth / roles, password hashing, token expiry/refresh, logout-all, rate limiting.
- Multi-user admin, audit logging.
- Editing routes/nodes by hand (only generate + publish + view in this slice).
- Managing the registry / asset packs (later Sub-project D).

---

## 1. Architecture & files

```
server/
  config.ts          # MODIFY: add admin { email, password }
  auth.ts            # NEW: createAuth(adminCfg) → { login, verify }  (pure, no Express)
  api.ts             # MODIFY: AdminDeps gains `auth`; add /admin (page), /admin/login,
                     #         /admin/status; requireAuth on /admin/routes + /admin/status
  admin/
    index.html       # NEW: self-contained admin UI (vanilla HTML+CSS+JS)
  index.ts           # MODIFY: build auth from config, pass into createApp admin deps
.env / .env.example  # MODIFY: document ADMIN_EMAIL / ADMIN_PASSWORD
```

**Invariants preserved:** env only in `server/config.ts`; `auth.ts` is pure (no Express/DB import, no `GameError` dependency — it returns `string | null` / `boolean`, and `api.ts` translates to HTTP); one REST layer.

---

## 2. Auth module (`server/auth.ts`)

Pure and self-contained. No Express, no `GameError`.

```ts
import { randomUUID } from 'crypto';

export interface AdminCredentials { email: string; password: string; }

export interface Auth {
  /** Returns a fresh token on success, or null on bad credentials. */
  login(email: string, password: string): string | null;
  /** True iff the token was issued by this Auth instance and not since invalidated. */
  verify(token: string): boolean;
}

export function createAuth(creds: AdminCredentials): Auth { /* ... */ }
```

Behaviour:
- `login`: compares `email` and `password` to `creds`. On match, generates `randomUUID()`, adds it to an in-memory `Set<string>`, returns it. On mismatch, returns `null`.
- `verify`: returns whether the token is in the `Set`.
- Comparison is a plain strict equality on both fields (constant-time not required at this scale; noted as a deliberate simplification).

---

## 3. REST surface (`server/api.ts`)

`AdminDeps` becomes:
```ts
export interface AdminDeps {
  provider: AIProvider;
  routes: RouteStore;
  registries: Registries;
  auth: Auth;
}
```

Routes (player routes unchanged):

| Method + path | Auth | Behaviour |
|---|---|---|
| `GET /admin` | none | Serves `server/admin/index.html` (the login + console page). |
| `POST /admin/login` | none | Body `{email,password}` → `auth.login`. On token → `200 {token}`. On null → `GameError(401)` `{error}`. |
| `GET /admin/status` | **required** | `200 { providerAvailable: boolean }` (from `provider.available`). |
| `GET /admin/routes` | **required** | `RouteSummary[]` |
| `GET /admin/routes/:id` | **required** | `RouteBundle` or `404` |
| `POST /admin/routes/generate` | **required** | unchanged from C1 (503 if provider unavailable, 422 on failure, 200 `{routeId,bundle}`) |
| `POST /admin/routes/:id/publish` | **required** | `204` or `404` |

`requireAuth` middleware:
```ts
function requireAuth(auth: Auth) {
  return (req, res, next) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!auth.verify(token)) return next(new GameError('Unauthorized', 401));
    next();
  };
}
```
Mounted with `app.use('/admin/routes', requireAuth(admin.auth))` and added directly on `GET /admin/status`. The page (`GET /admin`) and `POST /admin/login` are deliberately left open. The static page is served with `res.sendFile(path.join(__dirname, 'admin', 'index.html'))`.

The existing central error handler maps `GameError(401)` → HTTP 401 `{error}`.

---

## 4. Admin UI (`server/admin/index.html`)

One self-contained file (inline `<style>` + `<script>`, vanilla JS, no framework, no build). Served at `GET /admin`. Talks only to the REST endpoints above with `fetch`.

Behaviour:
- On load, read `localStorage['shufferc_admin_token']`. If absent → show **Login** panel only.
- **Login panel:** email + password inputs + "Log in" button → `POST /admin/login`. On 200, store token, hide login, show console + load status & routes. On 401, show "Invalid credentials".
- **Status bar:** `GET /admin/status` → render "Gemini provider: ✅ available" or "⚠️ not configured (set GEMINI_API_KEY)".
- **Generate panel:** `title` input, `nodeCount` input (default 4), `contextText` textarea, "Generate" button → `POST /admin/routes/generate`. On 200, show `routeId` + collapsible bundle JSON, refresh routes table. On 422, list `errors` (`[code] path: message`) and `attempts`. On 503, show "provider unavailable".
- **Routes table:** `GET /admin/routes` → rows of `id · title · status`. Each draft row has a **Publish** button (`POST /admin/routes/:id/publish` → refresh). Each row has **View JSON** (`GET /admin/routes/:id` → show in a `<pre>`).
- Every authenticated `fetch` sends `Authorization: Bearer <token>`. Any `401` clears the stored token and returns to the login panel.
- A "Log out" button clears the token client-side and shows the login panel (server-side token stays valid until restart — acceptable for this slice).

No styling framework; minimal readable CSS (system font, simple cards/buttons). The page is an ops tool, not a polished product surface.

---

## 5. Bootstrap (`server/index.ts`)

```ts
import { createAuth } from './auth';
// ...
const auth = createAuth(config.admin);
const app = createApp(session, { provider, routes, registries: {...}, auth });
```

---

## 6. Config + env

`server/config.ts` adds:
```ts
admin: {
  email: process.env.ADMIN_EMAIL ?? 'adminshufferc@gmail.com',
  password: process.env.ADMIN_PASSWORD ?? 'admin12345678',
},
```
`.env` and `.env.example` gain:
```
# Admin console credentials (local/academic only — not production auth).
ADMIN_EMAIL=adminshufferc@gmail.com
ADMIN_PASSWORD=admin12345678
```
(In `.env.example` these stay as the documented defaults; the real `.env` may override.)

---

## 7. Testing

- **`server/auth.test.ts`**
  - correct email+password → returns a non-empty string token
  - wrong password → `null`; wrong email → `null`
  - `verify` of an issued token → `true`; `verify('garbage')` → `false`
  - two logins issue two distinct tokens, both verifiable
- **`server/api.test.ts`** (extend; update existing admin tests to authenticate)
  - add a `token(app)` helper that `POST /admin/login` with the default creds and returns the token
  - `POST /admin/login` wrong creds → 401
  - `GET /admin/routes` **without** `Authorization` → 401
  - `GET /admin/routes` **with** bearer token → 200
  - `GET /admin` → 200 and body contains a recognizable marker (e.g. `id="login"` or the page title)
  - `GET /admin/status` with token → `{ providerAvailable: true|false }`
  - existing generate→publish→play e2e updated to send the token on admin calls; the player `POST /sessions` stays unauthenticated
- **Manual:** boot server, open `http://localhost:3000/admin`, log in with the default creds, confirm status shows the Gemini provider (key is set in `.env`), paste novel text → Generate → Publish → then play that `routeId` in the client.

---

## 8. Risks / notes
- The `app()` test helper and `server/index.ts` must pass the SAME objects; `auth` is independent per app instance (fine — tests build their own).
- `__dirname`-based `sendFile` works under ts-node (runs from source, so `server/admin/index.html` resolves). If a future build step compiles to `dist/`, the HTML must be copied alongside — noted for later, not handled now.
- Because tokens are in-memory, restarting the server logs everyone out; the UI handles a stale token by bouncing to login on the first 401.
