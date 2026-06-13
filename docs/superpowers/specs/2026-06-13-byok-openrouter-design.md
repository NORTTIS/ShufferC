# BYOK + OpenRouter Provider Design

**Date:** 2026-06-13  
**Status:** Approved

## Summary

Add admin-managed BYOK (Bring Your Own Key) for OpenRouter as a second text-generation provider alongside Gemini. Admin configures keys and per-task provider selection at runtime via the admin console. Gemini remains the sole embedding provider.

## Scope

- New `server_settings` DB table for runtime config
- `ProviderRegistry` singleton with hot-reload
- `OpenRouterProvider` implementing existing `AIProvider` interface
- Two new admin REST endpoints (`GET/PATCH /admin/settings`)
- Updated `GET /admin/status`
- New "Provider settings" card in admin console (`server/admin/index.html`)

Out of scope: player-facing BYOK, per-player keys, non-Gemini embeddings.

## Data Model

New drizzle table in `server/db/schema.ts`:

```typescript
export const serverSettings = pgTable('server_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
```

### Settings keys

| key | type | default |
|-----|------|---------|
| `openrouter_api_key` | string | — |
| `framework_gen_provider` | `'gemini' \| 'openrouter'` | `'gemini'` |
| `framework_gen_model` | model ID string | `'google/gemini-2.5-pro'` |
| `live_event_provider` | `'gemini' \| 'openrouter'` | `'gemini'` |
| `live_event_model` | model ID string | `'google/gemini-2.5-flash'` |

Settings absent from DB resolve to their defaults at read time.

## ProviderRegistry

**File:** `server/ai/providerRegistry.ts`

```typescript
export interface ProviderRegistry {
  getFrameworkProvider(): AIProvider;
  getLiveEventProvider(): AIProvider;
  reload(db: Db): Promise<void>;
}

export function createProviderRegistry(db: Db, geminiCfg: GeminiConfig): ProviderRegistry;
```

- Loaded once on server startup via `await registry.reload(db)`
- `getFrameworkProvider()` / `getLiveEventProvider()` return current in-memory provider instance
- `reload(db)` reads all settings from DB, rebuilds provider instances, swaps atomically
- If `openrouter_api_key` absent and provider set to `openrouter`, falls back to `FakeProvider` (→ 503)

`frameworkGen.ts` calls `registry.getFrameworkProvider()` per invocation instead of holding a direct ref. Same for `eventGen.ts`.

## OpenRouter Provider

**File:** `server/ai/openrouter.ts`

Implements `AIProvider`. Uses OpenRouter's OpenAI-compatible endpoint via `fetch` — no new npm packages.

```typescript
export function createOpenRouterProvider(opts: {
  apiKey: string;
  proModel: string;   // default: 'google/gemini-2.5-pro'
  flashModel: string; // default: 'google/gemini-2.5-flash'
}): AIProvider;
```

### `generateStructured` flow

1. System message: `"Respond with valid JSON matching this schema: ${JSON.stringify(jsonSchema)}"`
2. `POST https://openrouter.ai/api/v1/chat/completions` with:
   - `model`: proModel or flashModel based on `opts.model`
   - `response_format: { type: "json_object" }`
   - `messages: [{ role: "system", content }, { role: "user", content: prompt }]`
3. Parse `choices[0].message.content` as JSON → return
4. HTTP 4xx/5xx → throw `Error` with status + body (caller's retry loop handles)

`available`: `true` when `apiKey` non-empty.

No embedding method — registry never routes embeddings through OpenRouter.

## REST Endpoints

All under existing admin auth middleware.

### `GET /admin/settings`

Returns current settings. API key masked.

```json
{
  "openrouterApiKey": "configured",
  "frameworkGenProvider": "gemini",
  "frameworkGenModel": "google/gemini-2.5-pro",
  "liveEventProvider": "openrouter",
  "liveEventModel": "google/gemini-2.5-flash"
}
```

`openrouterApiKey` is `"configured"` when set, `null` when absent.

### `PATCH /admin/settings`

Body: partial — any subset of the fields above (key field uses plain value, not masked). After DB write, calls `registry.reload(db)`. Returns updated settings (masked).

### `GET /admin/status` (updated)

```json
{
  "providerAvailable": true,
  "frameworkGenProvider": "openrouter",
  "liveEventProvider": "gemini"
}
```

`providerAvailable` is `true` if both configured providers are `available`.

## Admin Console UI

New **"Provider settings"** card added to `server/admin/index.html`, following existing card/`api()`/`authHeaders()` patterns.

**Layout:**
- OpenRouter API key: `<input type="password">` — placeholder shows `"configured"` or `"not set"`, never echoes stored value
- Framework generation: provider `<select>` (Gemini / OpenRouter) + model `<input type="text">`
- Live events: provider `<select>` + model `<input type="text">`
- Save button → `PATCH /admin/settings`
- Inline success/error message

**Load:** `GET /admin/settings` on view open, populates form. Model fields pre-filled with defaults when server returns defaults.

**Status card** updated to show per-task provider:
```
Framework gen: Gemini ✓   Live events: OpenRouter ✓
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| OpenRouter key set, provider = openrouter, key invalid | 401 from OpenRouter → propagates as attempt failure → 503 after retries exhausted |
| Provider = openrouter, key not configured | `available = false` → 503 immediately |
| PATCH with unknown provider value | 400 Bad Request |
| DB unavailable during reload | Keep existing provider instances, log error |

## Migration

One drizzle migration: `CREATE TABLE server_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`.

No seeding required — all keys resolve to defaults when absent.

## Testing

- `createOpenRouterProvider` unit tests: mock `fetch`, verify JSON mode request shape, error propagation
- `ProviderRegistry` tests: verify hot-reload swaps provider, fallback on missing key
- Admin settings route tests: GET masked output, PATCH triggers reload, 401 on bad auth
- Existing `frameworkGen` / `eventGen` tests unchanged — they use `FakeProvider` already
