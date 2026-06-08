# Player UI — Design System, Auth & Walkthrough Reskin — Design Doc

> Part of **Life in Adventure: AI Chronicles** (Sub-project B/E — player client polish).
> Goal: academic / learning project — full, cohesive player-facing UI from authentication through the game walkthrough, in a **dark fantasy tome** aesthetic.
> Date: 2026-06-08.
> Branch: continues on `feature/c1-framework-gen`.
> Implementation note: the **frontend-design** skill (`anthropics/skills`) is to be used during the implementation phase, after this spec → plan.

---

## 0. Scope & decisions (decision log)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Player auth | **UI-only mock auth.** Login/Register screens wired to local client state + persistence. No backend, no network, no real token. Real Supabase auth remains a future sub-project. |
| 2 | Visual style | **Dark fantasy tome.** Dark warm-parchment palette, serif prose/headings, gold accents — reads like a magic book. |
| 3 | Form factor | **Responsive both.** One layout adapts: narrow (phone) = single column; wide (tablet/web) = centered reading column + optional side rail. |
| 4 | Build scope | **Design system + reskin all.** Theme tokens + component primitives + new Auth screen + reskin of CharCreate / Story / Combat / Inventory / Ending. |
| 5 | Route-select | **Deferred.** No player route picker this round; auth goes straight to CharCreate on the server's default route. No `GET /routes` endpoint added. |
| 6 | Architecture | **Approach A — lightweight theme + primitives, no new deps.** Pure RN + react-native-web, matching existing `StyleSheet` house style. (Rejected: RN UI kit — heavy/fights custom look; NativeWind — adds build config + new model.) |
| 7 | Backend | **No server change.** REST surface (`services/api.ts`) untouched; game session stays anonymous server-side. |

### Explicit notes (kept visible)
- **Mock auth is not real auth.** No password hashing, no server verification, no token. It exists purely for UX/demo continuity. Real auth (Supabase email/password, roles, sessions) is future Sub-project E. No credentials are transmitted anywhere.

### Out of scope
- Real auth / Supabase, password hashing, token/session, account recovery.
- Route-select screen + `GET /routes` public endpoint, any server change.
- New sprite/audio art (registry **keys** only; no new asset files required).
- Drag-reorder mechanic redesign for Combat (keep existing mechanism, only reskin).
- Navigation library (App.tsx remains the screen switch).

---

## 1. Architecture & invariants

Approach A: a small theme module + a set of reusable component primitives, consumed by all screens. No new dependencies.

**Invariants preserved (carry-over, non-negotiable):**
1. Env vars read only in `client/src/config.ts`. No new env needed.
2. Shared types/constants only from `shared/`. No local redefinition.
3. REST only via `services/api.ts` (`gameApi`) — **untouched** this round.
4. Sprites/sfx only via the `ASSETS` registry, keyed by screen. No inline `require()`/emoji literal at use site.
5. Large screen → folder-pattern: screen file is glue; extract `styles.ts`, sub-components.
6. **New invariant:** no raw hex / magic spacing in screens — all visual values come from `theme/tokens.ts`.

---

## 2. Visual language (dark fantasy tome)

### Palette (`theme/tokens.ts`)
| Token | Hex | Use |
|---|---|---|
| `bg.base` | `#16110d` | App background (near-black warm brown). |
| `bg.panel` | `#211a13` | Cards / panels (aged parchment-dark). |
| `bg.raised` | `#2c2218` | Pressed/hover, inputs. |
| `ink.primary` | `#ece3d0` | Prose, headings (warm parchment text). |
| `ink.muted` | `#a89a80` | Secondary text, labels. |
| `gold` | `#c8a24a` | Accents, headings, active borders, dividers. |
| `gold.dim` | `#7a6531` | Inactive / hairline borders. |
| `danger` | `#b0432f` | Fight, defeat, HP. |
| `mana` | `#4a6fa5` | Skill-check, INT. |
| `success` | `#5b8a4a` | Pass, heal. |

### Typography
- **Serif** (`Georgia` + platform serif fallback): prose + headings — the tome voice.
- **System sans**: labels, stats, captions.
- Scale: `display 28`, `title 22`, `heading 18`, `body 16 / lineHeight 24`, `label 13`, `caption 12`.
- Numeric stats use `fontVariant: ['tabular-nums']`.

### Spacing / radii / borders
- Space scale (4-base): `xs 4`, `sm 8`, `md 12`, `lg 16`, `xl 24`, `xxl 32`.
- Radii: `sm 6`, `md 10`, `lg 16`.
- Borders: hairline = `gold.dim`; accent/active = `gold`.

### Motion (subtle)
- Button press: opacity/scale feedback.
- Prose: fade-in on node change.
- Combat log: lines reveal sequentially.
- No heavy animation (cheap + reliable on web).

### Texture
- Flat color first (reliable on web). Optional later: faint parchment-grain overlay via `ASSETS` registry — noted, not required.

---

## 3. Component primitives (`client/src/components/`)

Each consumes theme tokens; zero hardcoded hex in screens. Folder-pattern if a component grows.

| Component | Props | Role |
|---|---|---|
| `Screen` | `children`, `scroll?`, `center?` | Root wrapper: `bg.base`, safe-area, applies responsive centered column (§4). Replaces per-screen `SafeAreaView`/`ScrollView`. |
| `Card` | `children`, `onPress?`, `tone?`, `active?` | Panel `bg.panel` + hairline border, radius `md`. Pressable variant for choices/backgrounds; `active` → gold-glow border. |
| `Button` | `label`, `onPress`, `variant`(`primary`\|`ghost`\|`danger`), `busy?`, `disabled?` | primary = gold fill on dark; ghost = bordered; danger = `danger`. Spinner when `busy`. |
| `Heading` | `children`, `level`(`display`\|`title`\|`heading`) | Serif + gold, sized from scale. |
| `Prose` | `children` | Serif `body`, `ink.primary` — story text. |
| `Label` / `Caption` | `children` | Sans muted small — stats, hints. |
| `Tag` | `text`, `tone?` | Pill: ending name, status-effect, faction, check result. Tone → palette. |
| `StatRow` | `stats` | STR/DEX/INT/CON row, tabular-nums. Reused in CharCreate / Inventory / Ending / side rail. |
| `Divider` | — | Thin gold rule with center ornament (`❖`) — tome feel. |
| `Banner` | `text`, `tone` | Inline error/notice; replaces raw red `state.error` Text. |

---

## 4. Responsive layout

`useResponsive()` → `useWindowDimensions()` → breakpoint:
- `width < 700` → **narrow** (phone): single column, full-width cards, padding `lg`.
- `width >= 700` → **wide** (tablet/web): content in **centered column `maxWidth 680`**, extra gutter. Reading column never spans edge-to-edge (long-prose readability).

`Screen` primitive applies this: narrow → fluid; wide → centered max-width box on `bg.base`.

**Side rail (wide only, `width >= 1000`):** Story / Combat show a right rail (`width 240`) — persistent character summary: name/background, `StatRow`, HP, equipped slots, reputation. Narrow → that data lives behind the Inventory button / a collapsible header strip. Rail is additive; degrades cleanly.

**Header band (all game screens):** thin top bar — route/act title (left), logout affordance (right), gold `Divider` under. Keeps tome framing + orientation.

No nav library: `App.tsx` stays the screen switch. Responsive = pure layout.

---

## 5. Mock auth (UI-only)

### State — `hooks/useAuth.ts`
- Shape: `{ user: { email: string } | null, status: 'loading' | 'out' | 'in' }`.
- Persistence via `storage/playerStore.ts`: `localStorage` (web) / `AsyncStorage` (native), key `shufferc_player`. On boot, read → auto-login if present.
- API: `register(email, pw)`, `login(email, pw)`, `logout()`.
- Validation only: email format + password length ≥ 6. A local map (email→pw) stored alongside so register-then-login behaves consistently. Mismatch → `Banner` error.
- **No network, no real token.**

### Screen — `screens/Auth/`
- Single screen, **Login / Register** segmented toggle.
- Fields: email, password (+ confirm on register). `Button` primary "Enter" (login) / "Create" (register).
- Tome styling: centered `Card` on `bg.base`, game title (`display` Heading) + ornament `Divider` + tagline.

### Gating — `App.tsx`
- `status === 'loading'` → splash (title + spinner).
- `status === 'out'` → `AuthScreen`.
- `status === 'in'` → existing game flow (`useGameSession`) + logout in header band.

Server session stays anonymous; auth gate is client-only.

---

## 6. Screen reskins

Behavior unchanged unless noted; swap to primitives + tokens; extract Ending from `App.tsx`.

**CharCreate** — `Screen` + `Heading` "Choose your background" + ornament `Divider`. Each background = pressable `Card`: name (`Heading.heading`), blurb (`Prose`), `StatRow`. Loading → centered spinner; load-fail → `Banner`. Selected → `active` gold glow.

**Story** — header band (act title + logout). `Prose` node text, fade-in. Skill-check result → `Tag` (`success`/`danger`): "DEX check · rolled 14 → PASS" (replaces italic line). Choices = ghost `Button`/`Card`; fight choice = `danger` tone + ⚔ icon; skill-check choice shows stat `Tag` (`mana`). Inventory = ghost Button. Wide → character side rail.

**Combat** — pre-fight: `Heading` "Arrange skill priority" + reorderable list of skill `Card`s (keep existing reorder mechanism, reskinned) + primary "Fight" Button. Replay: combat-log lines reveal sequentially; actor names + `danger`/`success` colored deltas; status `Tag`s; HP bars (`danger` fill). Winner banner → continue.

**Inventory** — `Screen`, slot grid of `Card`s (weapon/armor/ring/scroll); equipped item shown; tap to equip/unequip (existing `onEquip`). Live `StatRow` from `effectiveStats`. Ghost "Back" Button.

**Ending** — extract `App.tsx` inline logic → `screens/Ending.tsx`, same 3 branches:
- *Continue* (more routes): `display` "The End" + `Prose` + ending `Tag` + primary "Continue".
- *Defeat*: `danger` "You have fallen" + `Prose`.
- *Finale*: "Your journey ends" + `Prose` + routes-completed + final `StatRow` + reputation `Tag`s. Ornamented, ceremonial.

`App.tsx` slims to: auth gate + header + screen switch (no inline ending JSX/styles).

---

## 7. File structure

```
client/src/
  theme/
    tokens.ts        NEW  colors / type / space / radii / motion
    index.ts         NEW  theme export + helpers (tone→color)
  components/        NEW  Screen, Card, Button, Heading, Prose,
                          Label, Tag, StatRow, Divider, Banner
  hooks/
    useAuth.ts       NEW  mock auth + persistence
    useResponsive.ts NEW  breakpoint hook
    useGameSession.ts     (unchanged)
  storage/
    playerStore.ts   NEW  local persist (localStorage / AsyncStorage)
  screens/
    Auth/            NEW  index.tsx + styles + LoginForm / RegisterForm
    CharCreate.tsx   RESKIN
    Story.tsx        RESKIN (+ side rail)
    Combat.tsx       RESKIN
    Inventory.tsx    RESKIN
    Ending.tsx       NEW  (extracted from App.tsx)
  App.tsx            SLIM  auth gate + header + screen switch
```

No `process.env` outside `config.ts`; sprites via `ASSETS`; no raw hex in screens; REST via `services/api.ts` (unchanged).

---

## 8. Testing / verification

- **Unit (Jest):**
  - `useAuth`: register→login happy path; wrong password → rejected; persistence round-trip (mock storage).
  - `useResponsive`: breakpoint boundaries (699 vs 700; 999 vs 1000 for rail).
  - Pure helpers: `tone → color` maps.
- **Type:** `npm run typecheck` (client `tsc --noEmit`) clean.
- **Component smoke:** light render tests for primitives if React-Native-Testing-Library is available; otherwise rely on typecheck + manual.
- **Manual (Expo, `expo start --web`):** narrow + wide window → splash → register → login → CharCreate → Story (skill-check + fight) → Combat replay → Inventory equip → Ending (all 3 branches) → logout. Confirm tome theme + responsive column + side rail at wide.
- **verification-before-completion:** run typecheck + jest, paste output, before claiming done.

---

## 9. Acceptance criteria

1. Theme tokens centralized in `theme/tokens.ts`; **no raw hex** remains in any screen.
2. All 10 primitives implemented and consumed by screens.
3. Mock auth: register, login, logout, auto-login-on-reload all work; bad credentials show a `Banner`; nothing is sent over the network.
4. Responsive: narrow = single column; wide = centered `maxWidth 680`; side rail appears only at `width >= 1000` and never breaks narrow.
5. All five existing screens + Ending render in the dark-fantasy-tome theme with prior behavior intact (choices, skill-check, fight→combat→ending, equip, continue/finale).
6. `App.tsx` no longer contains inline ending JSX or styles.
7. `typecheck` + `jest` green; manual walkthrough passes end-to-end.
8. No server / REST change; `services/api.ts` untouched.

---

## 10. Risks / notes

- **`AsyncStorage` dependency:** native persistence needs `@react-native-async-storage/async-storage`. To honor "no new deps", the store abstracts platform: web uses `localStorage`; if the native package is absent, fall back to in-memory (auto-login simply won't persist on native). Decide at plan time whether to add the package.
- **Serif on RN native:** `Georgia` resolves on web and iOS; Android maps to its serif. Acceptable; custom font embedding is out of scope.
- **Side rail data:** requires character name/reputation already present in `SessionView.save` — confirmed available; no new fields.
- **Drag-reorder on web:** existing Combat reorder must keep working under react-native-web after reskin — verify in manual pass.

---

## 11. Next steps
1. (This doc) User review.
2. → **writing-plans** to produce the detailed implementation plan.
3. Implement with the **frontend-design** skill; verify (typecheck + jest + manual) before completion.
