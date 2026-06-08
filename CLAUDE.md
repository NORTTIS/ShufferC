# ShufferC — project instructions for Claude

## Admin API ⇒ always ship the UI too

**Every time you add or change an admin REST endpoint (`/admin/*`), you MUST also add/update the matching form in the admin console (`server/admin/index.html`) in the same change.**

- The user tests admin features through the **browser** at `http://localhost:3000/admin`, not via curl/PowerShell. An endpoint without a form is considered incomplete.
- Each endpoint needs an interactive control: inputs/textarea for the body, a button to call it, a visible success/error message, and (for list/create/delete) a table that refreshes after the action.
- Match the existing console style (cards, `authHeaders()`, the `api()` helper, `loadX()/doX()` pattern, 401→logout, 503/400 messaging).
- This applies to player-facing screens too only if asked; the hard rule here is specifically **admin endpoints ↔ admin console forms**.

## Architecture invariants (from the design doc)

- Env vars read only in `server/config.ts` (server) / `client/src/config.ts` (client). No scattered `process.env`.
- Shared types/constants only in `shared/`. One REST layer in `client/src/services/api.ts` (`gameApi`, throws `ApiError`).
- Pure logic (engine/dice/combat/effects/rag chunk+retrieve) stays free of I/O; stores sit behind ports (`RouteStore`/`SaveStore`/`NovelStore`/`EmbeddingStore`) with memory + pg adapters.
- Secrets (`DATABASE_URL`, service keys) live only in `.env` (gitignored) — never commit or paste them.
