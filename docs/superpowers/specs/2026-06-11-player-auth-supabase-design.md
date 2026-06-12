# Player Auth via Supabase — Design

**Date:** 2026-06-11
**Status:** Approved by user (brainstorming session)

## Goal

Replace the client-side localStorage account system (plaintext passwords in
`shufferc_accounts`) with real register/login backed by Supabase Auth, and link
game saves to users so a player can log in from any device and continue.

## Decisions made

| Question | Decision |
| --- | --- |
| Link saves to users? | Yes — `user_id` on `save_states`, `GET /saves` lists own saves |
| Token model | Supabase Auth (JWT access token + refresh token) |
| Email confirmation | Off (disable "Confirm email" in Supabase dashboard) |
| Guest play | No — login required for all game sessions |
| Architecture | **Server proxy**: client only talks to our REST API; server talks to Supabase. Preserves the one-REST-layer invariant. |

## Out of scope (YAGNI)

- Password reset, email change, social login.
- Migrating existing anonymous saves (dev data; left with `user_id = NULL`, unreachable).
- Admin auth changes — the existing single-admin token system is untouched.
- A profiles table — the Supabase user id (UUID) and email are sufficient.

## Architecture

```
client (Expo/RN web)                server (Express)              Supabase
┌──────────────────┐   REST   ┌──────────────────────┐   GoTrue REST
│ useAuth / screens│ ───────► │ /auth/register|login │ ───────────► auth.users
│ gameApi (api.ts) │          │ /auth/refresh        │
│ Bearer token     │ ───────► │ requirePlayer (jose  │   JWKS (cached)
│                  │          │  local JWT verify)   │ ───────────► /.well-known/jwks.json
└──────────────────┘          │ /sessions*, /saves   │
                              └──────────────────────┘   Postgres (DATABASE_URL)
                                                          save_states.user_id
```

## Manual Supabase setup (one-time, dashboard)

1. Auth → Sign In / Up → disable **Confirm email**.
2. Copy project values into `.env`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
   Optional `SUPABASE_JWT_SECRET` for legacy HS256 projects.
3. All three read **only** in `server/config.ts` (env invariant). Secrets stay
   in `.env`, never committed.

## Server

### New port: `PlayerAuthStore`

Follows the existing port/adapter pattern (`RouteStore`/`SaveStore`).

```ts
interface PlayerAuthStore {
  register(email: string, password: string): Promise<AuthSession>;
  login(email: string, password: string): Promise<AuthSession>;
  refresh(refreshToken: string): Promise<AuthSession>;
  verifyToken(accessToken: string): Promise<{ userId: string; email: string }>;
}
// AuthSession = { token, refreshToken, user: { id, email } }
```

- **`supabasePlayerAuth.ts`** (real adapter): calls GoTrue REST with the anon
  key — `POST {SUPABASE_URL}/auth/v1/signup`,
  `POST /auth/v1/token?grant_type=password`,
  `POST /auth/v1/token?grant_type=refresh_token`.
  `verifyToken` verifies the JWT **locally** with `jose`:
  - primary: remote JWKS from `{SUPABASE_URL}/auth/v1/.well-known/jwks.json` (cached by jose);
  - fallback: HS256 with `SUPABASE_JWT_SECRET` when set.
  Extracts `sub` (userId) and `email` claims.
- **`memoryPlayerAuth.ts`** (fake adapter): in-memory users + opaque tokens.
  Used by tests and when Supabase env vars are absent (dev without Supabase).

Wiring in `server/index.ts`: Supabase env present → real adapter, else memory
(same shape as the `DATABASE_URL` switch).

### New endpoints (in `server/api.ts`)

These are player endpoints, not `/admin/*` — the admin-console-form rule does
not apply.

| Endpoint | Body | Success | Errors |
| --- | --- | --- | --- |
| `POST /auth/register` | `{email, password}` | `200 AuthSession` | `400` invalid input, `409` email taken |
| `POST /auth/login` | `{email, password}` | `200 AuthSession` | `401` "Email hoặc mật khẩu không đúng" |
| `POST /auth/refresh` | `{refreshToken}` | `200 AuthSession` | `401` invalid/expired refresh token |

- Zod validation: valid email, password length ≥ 6.
- Supabase error mapping lives in the adapter; API layer sees typed errors.
- Missing Supabase config never yields `503`: the memory adapter is the
  fallback, so auth endpoints always work (a boot-time log line states which
  adapter is active).

### Auth middleware

`requirePlayer`: reads `Authorization: Bearer <token>`, calls
`verifyToken`, sets `req.userId`. Missing/invalid token → `401`.

Applied to **all** `/sessions*` routes and `/saves`. `/backgrounds` stays
public (no user data).

### Saves linked to users

- Migration `0002`: `ALTER TABLE save_states ADD COLUMN user_id uuid;` plus an
  index on `user_id`. Existing rows keep `NULL` (abandoned dev data).
- `SaveStore` interface changes (memory + pg adapters both updated):
  - `create(save, userId)` stores the owner;
  - `listByUser(userId)` → `[{ id, routeId, updatedAt }]`.
- `POST /sessions` records `req.userId` on the new save.
- Every `/sessions/{id}*` route checks ownership; non-owner (or unknown id) →
  **404** (do not reveal existence).
- New `GET /saves` → current user's save list (powers "Chơi tiếp" / continue
  from another device).

## Client

### `client/src/auth/authCore.ts` — rewritten

- Delete the `shufferc_accounts` localStorage dict entirely (accounts now live
  in Supabase Postgres).
- localStorage keeps only the session: key `shufferc_session` =
  `{token, refreshToken, user}`. Storing tokens client-side is standard; what
  is removed is storing *accounts and passwords*.
- `register`/`login` call the server via `gameApi`; no client-side password
  handling.

### `client/src/services/api.ts` — the single REST layer

- New: `gameApi.register`, `gameApi.login`, `gameApi.refresh`, `gameApi.listSaves`.
- `call()` attaches `Authorization: Bearer <token>` when a session exists.
- On `401`: attempt **one** refresh, retry the original request; if refresh
  fails, clear the session and route to the login screen.

### `useAuth` hook

Same interface (`register`, `login`, `logout`) but async against the server.
Adds session restore on app boot: read `shufferc_session`; token present →
straight into the game.

### Screens

- Existing login/register UI kept; only the data source changes.
- New **"Chơi tiếp" (Continue)** section: `GET /saves` → pick a save →
  `getView(id)` → into the game.
- Login is required before any game session (no guest branch).

## Error handling summary

- Server maps Supabase errors to clear codes: `401` bad credentials, `409`
  duplicate email, `400` bad input.
- Client surfaces `ApiError` messages on the forms (existing pattern).

## Testing

- **Server (Jest + supertest, no network):** wire `memoryPlayerAuth` +
  memory stores. Cover: register → login → authed session create;
  refresh flow; `401` without/with bad token; ownership `404` on someone
  else's session; `GET /saves` returns only own saves; duplicate email `409`.
- **Adapters:** `memoryPlayerAuth` behavior tests; pg `SaveStore.listByUser`
  covered by existing store-test pattern if present.
- **Manual smoke:** run server with real `.env`, register a real account,
  confirm the user row in Supabase dashboard, play, confirm
  `save_states.user_id` is set, log in from a fresh browser profile and
  continue from `GET /saves`.
