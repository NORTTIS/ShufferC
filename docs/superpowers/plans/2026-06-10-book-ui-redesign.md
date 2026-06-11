# Book UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Player client becomes a "living journal" book (prose writes itself, past choices accumulate on the page, status/inventory as pinned paper notes); journal survives reload by being rebuilt from the save; admin console gets a CSS-only polish.

**Architecture:** `choiceLog` entries gain optional result annotations (`routeId`, `roll`, `checkPassed`, `reward`) written by the pure engine; a pure `buildJournal(bundle, save)` in `shared/engine/` reconstructs the journal at view time; `SessionView` grows a `journal` field (no new endpoints). The client gets a new component layer (Desk/BookPage/InkProse/PaperNote/…) on top of theme tokens v2 + Google fonts, and all 6 screens are reskinned without changing `useGameSession` logic.

**Tech Stack:** TypeScript, Express, Jest (root, `**/*.test.ts` only — no `.tsx` tests), Expo / React Native Web, `expo-font` + `@expo-google-fonts/crimson-pro` + `@expo-google-fonts/patrick-hand`.

**Spec:** `docs/superpowers/specs/2026-06-10-book-ui-redesign-design.md`

**Branch:** create `feature/book-ui-redesign` off the current branch before Task 1 (`git checkout -b feature/book-ui-redesign`). Use the superpowers:using-git-worktrees skill if isolation is needed.

**Verification commands used throughout:**
- Server/shared tests: `npx jest <file>` from repo root; full suite `npm test`
- Server typecheck: `npm run typecheck` (repo root)
- Client typecheck: `cd client && npm run typecheck`
- Run app: `npm run dev:server` (root) + `cd client && npm run web`

---

## Phase 1 — Journal data (shared + server)

### Task 1: Annotate `choiceLog` entries in the engine

**Files:**
- Modify: `shared/types.ts:176` (choiceLog field, add `JournalReward`)
- Modify: `shared/engine/story.ts:53`
- Test: `shared/engine/choiceLog.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `shared/engine/choiceLog.test.ts`:

```ts
import { resolveChoice } from './story';
import { mulberry32 } from './dice';
import { SAMPLE_NODES, SAMPLE_CHARACTER } from '../fixtures';
import { SAVE_VERSION } from '../constants';
import { SaveState } from '../types';

function freshSave(): SaveState {
  return {
    version: SAVE_VERSION,
    routeId: 'demo-route',
    character: structuredClone(SAMPLE_CHARACTER),
    reputation: { hero: 0, villain: 0, factions: {} },
    flags: {},
    choiceLog: [],
    currentNodeId: 'n1',
    seed: 7,
    gold: 0,
    xp: 0,
    level: 1,
    consumables: {},
    vitals: { currentHp: 40, pendingBuffs: [] },
  };
}

describe('choiceLog annotations', () => {
  it('records routeId, roll and checkPassed on skill-check choices', () => {
    const res = resolveChoice(freshSave(), SAMPLE_NODES.n1, 'sneak', mulberry32(7));
    const entry = res.save.choiceLog[0];
    expect(entry.nodeId).toBe('n1');
    expect(entry.choiceId).toBe('sneak');
    expect(entry.routeId).toBe('demo-route');
    expect(entry.roll).toBe(res.roll);
    expect(entry.roll).toBeGreaterThanOrEqual(1);
    expect(entry.roll).toBeLessThanOrEqual(20);
    expect(entry.checkPassed).toBe(res.checkPassed);
  });

  it('records only routeId for plain choices (no roll fields)', () => {
    const res = resolveChoice(freshSave(), SAMPLE_NODES.n2, 'end');
    expect(res.save.choiceLog[0]).toEqual({ nodeId: 'n2', choiceId: 'end', routeId: 'demo-route' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest shared/engine/choiceLog.test.ts`
Expected: FAIL — `entry.routeId` is `undefined` (and TS may error on the new fields first).

- [ ] **Step 3: Extend the types**

In `shared/types.ts`, immediately before `export interface SaveState` add:

```ts
/** Reward summary stored on a choiceLog entry / journal entry (subset of engine Rewards to avoid an import cycle). */
export interface JournalReward { gold: number; xp: number; itemIds: string[] }
```

and replace the `choiceLog` line inside `SaveState`:

```ts
  choiceLog: {
    nodeId: string;
    choiceId: string;
    routeId?: string;        // route the entry belongs to (absent on pre-v4 saves)
    roll?: number;           // d20 result when the choice had a skill check
    checkPassed?: boolean;
    reward?: JournalReward;  // combat spoils, patched on by the session layer
  }[];
```

- [ ] **Step 4: Write the engine change**

In `shared/engine/story.ts` replace line 53 (`next.choiceLog.push({ nodeId: node.id, choiceId });`) with:

```ts
  next.choiceLog.push({
    nodeId: node.id,
    choiceId,
    routeId: next.routeId,
    ...(roll !== undefined ? { roll, checkPassed } : {}),
  });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest shared/engine/choiceLog.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Run the full suite (other tests assert choiceLog shape)**

Run: `npm test`
Expected: mostly PASS. If a test does an exact `toEqual` on a choiceLog entry (e.g. `shared/engine/integration.test.ts`), update its expectation to include `routeId` (and roll fields where the choice had a skill check). Do not weaken assertions — extend them.

- [ ] **Step 7: Commit**

```bash
git add shared/types.ts shared/engine/story.ts shared/engine/choiceLog.test.ts
git commit -m "feat(engine): record routeId/roll/checkPassed on choiceLog entries"
```

---

### Task 2: Bump `SAVE_VERSION` to 4 and migrate old saves

**Files:**
- Modify: `shared/constants.ts:12`
- Modify: `shared/engine/save.ts`
- Test: `shared/engine/save.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `shared/engine/save.test.ts` (inside the existing top-level `describe`, or as a new `describe` if the file has none — match the file's structure):

```ts
  it('migrates a v3 save: version bumps to 4 and bare choiceLog entries survive', () => {
    const v3 = {
      version: 3, routeId: 'r1',
      character: { background: 'rogue', baseStats: { str: 1, dex: 1, int: 1, wis: 1, cha: 1, con: 2 }, inventory: [], equipped: {}, skillPriority: [] },
      reputation: { hero: 0, villain: 0, factions: {} },
      flags: {}, choiceLog: [{ nodeId: 'n1', choiceId: 'go' }], currentNodeId: 'n2', seed: 1,
      gold: 5, xp: 0, level: 1, consumables: {}, vitals: { currentHp: 10, pendingBuffs: [] },
    };
    const migrated = deserialize(JSON.stringify(v3));
    expect(migrated.version).toBe(4);
    expect(migrated.choiceLog).toEqual([{ nodeId: 'n1', choiceId: 'go' }]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest shared/engine/save.test.ts`
Expected: FAIL — `migrated.version` is `3`… actually `deserialize` always stamps `SAVE_VERSION`, so it fails with `Expected: 4, Received: 3` because the constant is still 3.

- [ ] **Step 3: Bump the constant and backfill**

`shared/constants.ts:12`:

```ts
export const SAVE_VERSION = 4;
```

In `shared/engine/save.ts`, add a `choiceLog` backfill to the migrated object (after the `consumables` line):

```ts
    consumables: data.consumables ?? {},
    choiceLog: data.choiceLog ?? [],
```

(keep the existing `vitals` line after it).

- [ ] **Step 4: Run tests**

Run: `npx jest shared/engine/save.test.ts && npm test`
Expected: PASS. If any test hardcodes the literal `3` as a save version, replace it with the `SAVE_VERSION` import.

- [ ] **Step 5: Commit**

```bash
git add shared/constants.ts shared/engine/save.ts shared/engine/save.test.ts
git commit -m "feat(engine): bump SAVE_VERSION to 4 for annotated choiceLog"
```

---

### Task 3: Pure journal builder

**Files:**
- Create: `shared/engine/journal.ts`
- Test: `shared/engine/journal.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `shared/engine/journal.test.ts`:

```ts
import { buildJournal } from './journal';
import { SAMPLE_BUNDLE } from '../fixtures';
import { SAVE_VERSION } from '../constants';
import { SaveState } from '../types';

function save(log: SaveState['choiceLog'], liveNodes?: SaveState['liveNodes']): SaveState {
  return {
    version: SAVE_VERSION, routeId: 'demo-route',
    character: { background: 'rogue', baseStats: {}, inventory: [], equipped: {}, skillPriority: [] },
    reputation: { hero: 0, villain: 0, factions: {} },
    flags: {}, choiceLog: log, currentNodeId: 'n3', seed: 1,
    gold: 0, xp: 0, level: 1, consumables: {}, vitals: { currentHp: 10, pendingBuffs: [] },
    liveNodes,
  };
}

describe('buildJournal', () => {
  it('maps choiceLog entries to prose + chosen text with annotations', () => {
    const j = buildJournal(SAMPLE_BUNDLE, save([
      { nodeId: 'n1', choiceId: 'sneak', routeId: 'demo-route', roll: 17, checkPassed: true },
    ]));
    expect(j).toEqual([{
      prose: 'You reach a guarded gate.',
      chosenText: 'Sneak past',
      roll: 17,
      checkPassed: true,
      reward: undefined,
    }]);
  });

  it('applies live-node overlays to prose and chosen text', () => {
    const j = buildJournal(SAMPLE_BUNDLE, save(
      [{ nodeId: 'n1', choiceId: 'sneak', routeId: 'demo-route' }],
      { n1: { prose: 'Mist coils around the gate.', choiceTexts: ['Cut them down', 'Slip past unseen'] } },
    ));
    expect(j[0].prose).toBe('Mist coils around the gate.');
    expect(j[0].chosenText).toBe('Slip past unseen'); // 'sneak' is choice index 1
  });

  it('skips entries whose node or choice no longer exists', () => {
    const j = buildJournal(SAMPLE_BUNDLE, save([
      { nodeId: 'ghost', choiceId: 'x', routeId: 'demo-route' },
      { nodeId: 'n1', choiceId: 'deleted-choice', routeId: 'demo-route' },
      { nodeId: 'n2', choiceId: 'end', routeId: 'demo-route' },
    ]));
    expect(j).toHaveLength(1);
    expect(j[0].chosenText).toBe('Continue');
  });

  it('skips entries from other routes but keeps legacy entries without routeId', () => {
    const j = buildJournal(SAMPLE_BUNDLE, save([
      { nodeId: 'n1', choiceId: 'fight', routeId: 'older-route' }, // other route → skip
      { nodeId: 'n1', choiceId: 'fight' },                          // legacy, node exists → keep
    ]));
    expect(j).toHaveLength(1);
    expect(j[0].chosenText).toBe('Fight the goblin');
  });

  it('passes the reward annotation through', () => {
    const reward = { gold: 9, xp: 4, itemIds: ['torch'] };
    const j = buildJournal(SAMPLE_BUNDLE, save([
      { nodeId: 'n1', choiceId: 'fight', routeId: 'demo-route', reward },
    ]));
    expect(j[0].reward).toEqual(reward);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest shared/engine/journal.test.ts`
Expected: FAIL — `Cannot find module './journal'`

- [ ] **Step 3: Implement**

Create `shared/engine/journal.ts`:

```ts
import { RouteBundle, SaveState, JournalReward } from '../types';

/** One past step of the story, reconstructed from the save for display. */
export interface JournalEntry {
  prose: string;        // node prose at that step (live overlay applied)
  chosenText: string;   // text of the option the player picked (overlay applied)
  roll?: number;
  checkPassed?: boolean;
  reward?: JournalReward;
}

/**
 * Rebuild the play-through journal for the CURRENT route by walking choiceLog.
 * Entries from other routes, or whose node/choice no longer exists, are skipped
 * (admin edits must never crash a session). Pure: no I/O.
 */
export function buildJournal(bundle: RouteBundle, save: SaveState): JournalEntry[] {
  const entries: JournalEntry[] = [];
  for (const log of save.choiceLog) {
    if (log.routeId && log.routeId !== save.routeId) continue;
    const raw = bundle.nodes[log.nodeId];
    if (!raw) continue;
    const idx = raw.choices.findIndex((c) => c.id === log.choiceId);
    if (idx === -1) continue;
    const overlay = save.liveNodes?.[log.nodeId];
    entries.push({
      prose: overlay?.prose ?? raw.prose,
      chosenText: overlay?.choiceTexts[idx] ?? raw.choices[idx].text,
      roll: log.roll,
      checkPassed: log.checkPassed,
      reward: log.reward,
    });
  }
  return entries;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest shared/engine/journal.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add shared/engine/journal.ts shared/engine/journal.test.ts
git commit -m "feat(engine): pure buildJournal reconstructs the story journal from a save"
```

---

### Task 4: Serve the journal in `SessionView`; patch combat reward onto the log

**Files:**
- Modify: `server/session.ts` (imports, `SessionView`, `view()`, combat path of `applyChoice`)
- Test: `server/session.test.ts` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `server/session.test.ts`:

```ts
describe('GameSession journal', () => {
  it('serves a journal entry per choice and it survives a reload (getView)', async () => {
    const s = newSession();
    const { sessionId } = await s.newGame('rogue');
    const choice = await s.applyChoice(sessionId, 'sneak');
    expect(choice.journal).toHaveLength(1);
    expect(choice.journal[0].prose).toBe('You reach a guarded gate.');
    expect(choice.journal[0].chosenText).toBe('Sneak past');
    expect(choice.journal[0].roll).toBe(choice.roll);

    // a fresh view (reload) rebuilds the same journal from the save
    const view = await s.getView(sessionId);
    expect(view.journal).toEqual(choice.journal);
  });

  it('patches combat spoils onto the journal entry', async () => {
    const s = newSession();
    const { sessionId } = await s.newGame('fighter');
    const res = await s.applyChoice(sessionId, 'fight', ['slash']);
    expect(res.combat).toBeDefined();
    if (res.combat!.winner === 'player') {
      const entry = res.save.choiceLog[res.save.choiceLog.length - 1];
      expect(entry.reward).toEqual({ gold: res.reward!.gold, xp: res.reward!.xp, itemIds: res.reward!.itemIds });
      expect(res.journal[res.journal.length - 1].reward).toEqual(entry.reward);
    } else {
      // defeat path returns the pre-choice view; no journal entry is written
      expect(res.journal).toHaveLength(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest server/session.test.ts -t journal`
Expected: FAIL — `journal` is undefined (TS compile error on `choice.journal` first).

- [ ] **Step 3: Implement**

In `server/session.ts`:

1. Add to the engine imports:

```ts
import { buildJournal, JournalEntry } from '../shared/engine/journal';
```

2. Extend `SessionView` (line ~58):

```ts
export interface SessionView {
  save: SaveState;
  node: StoryNode;
  effectiveStats: Stats;
  journal: JournalEntry[];
  ending?: string;
  hasNextRoute?: boolean;
}
```

3. In `view()` (line ~149), add the journal to the returned object:

```ts
    return {
      save,
      node,
      effectiveStats: effectiveStats(save.character, itemDb),
      journal: buildJournal(bundle, save),
      ending: computeEnding(save, bundle.route),
    };
```

4. In the combat-victory branch of `applyChoice` (after `applyRepDelta(res.save.reputation, reward.repDelta);`, before `res.save.vitals = …`), patch the entry `resolveChoice` just pushed:

```ts
          const lastEntry = res.save.choiceLog[res.save.choiceLog.length - 1];
          lastEntry.reward = { gold: reward.gold, xp: reward.xp, itemIds: reward.itemIds };
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx jest server/session.test.ts && npm test && npm run typecheck`
Expected: PASS. `server/api.test.ts` / `server/e2e.test.ts` may compare view bodies — extend expectations with `journal` where needed.

- [ ] **Step 5: Commit**

```bash
git add server/session.ts server/session.test.ts
git commit -m "feat(api): SessionView carries the reconstructed journal; combat spoils land on the log"
```

---

### Task 5: Client API types

**Files:**
- Modify: `client/src/services/api.ts` (SessionView)

- [ ] **Step 1: Add the journal field**

In `client/src/services/api.ts`, add the import and field:

```ts
import type { JournalEntry } from '../../../shared/engine/journal';
```

```ts
export interface SessionView {
  save: SaveState;
  node: StoryNode;
  effectiveStats: Stats;
  journal: JournalEntry[];
  ending?: string;
  hasNextRoute?: boolean;
}
```

- [ ] **Step 2: Typecheck + existing client tests**

Run: `cd client && npm run typecheck && cd .. && npx jest client/src`
Expected: PASS (api.test.ts mocks may need `journal: []` added to fixture views — add it).

- [ ] **Step 3: Commit**

```bash
git add client/src/services/api.ts client/src/services/api.test.ts
git commit -m "feat(client): SessionView type includes the journal"
```

---

## Phase 2 — Theme tokens v2 + fonts

### Task 6: Tokens v2 (additive — legacy keys stay until Task 19)

**Files:**
- Modify: `client/src/theme/tokens.ts`
- Test: `client/src/theme/tokens.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `client/src/theme/tokens.test.ts` (inside the `describe`):

```ts
  it('exposes the book palette', () => {
    expect(colors.deskWood).toBe('#221710');
    expect(colors.page).toBe('#f4ead6');
    expect(colors.ink).toBe('#3a2f23');
    expect(colors.noteYellow).toBe('#f5e9a9');
    expect(colors.noteBlue).toBe('#cfe2ef');
    expect(colors.notePink).toBe('#f0d4d2');
  });

  it('defines book typography and note tilts', () => {
    expect(type.prose.fontFamily).toBe(fonts.serif);
    expect(type.hand.fontFamily).toBe(fonts.hand);
    expect(tilts.length).toBeGreaterThanOrEqual(4);
  });
```

and extend the import line:

```ts
import { colors, space, radii, type, toneColor, fonts, tilts } from './tokens';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest client/src/theme/tokens.test.ts`
Expected: FAIL — `fonts`/`tilts` not exported.

- [ ] **Step 3: Implement**

Replace `client/src/theme/tokens.ts` with:

```ts
export const colors = {
  // ── book palette (UI v2) ──
  deskWood: '#221710',     // desk background
  page: '#f4ead6',         // parchment
  pageEdge: '#d9c7a4',     // page border / rules
  ink: '#3a2f23',          // primary ink
  inkFaded: '#8d7d66',     // past journal entries
  inkAccent: '#6b4f2a',    // choices, links
  inkRed: '#a23329',       // failure, danger, stamps
  inkGreen: '#5b7a3e',     // success
  noteYellow: '#f5e9a9',   // status note
  noteBlue: '#cfe2ef',     // inventory note
  notePink: '#f0d4d2',     // reputation / error note
  noteInk: '#4a3d1f',      // text on notes
  notePin: '#b03a2e',      // pin dot

  // ── legacy palette (removed in the cleanup task once no component uses it) ──
  bgBase: '#16110d',
  bgPanel: '#211a13',
  bgRaised: '#2c2218',
  inkPrimary: '#ece3d0',
  inkMuted: '#a89a80',
  gold: '#c8a24a',
  goldDim: '#7a6531',
  danger: '#b0432f',
  mana: '#4a6fa5',
  success: '#5b8a4a',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radii = { sm: 6, md: 10, lg: 16 } as const;

export const fonts = {
  serif: 'CrimsonPro_400Regular',
  serifSemi: 'CrimsonPro_600SemiBold',
  hand: 'PatrickHand_400Regular',
} as const;

/** Small rotations applied to paper notes, picked by index (i % tilts.length). */
export const tilts = [-2.5, 1.8, -1.2, 2.2] as const;

export const type = {
  // legacy entries (removed in cleanup)
  display: { fontSize: 28, lineHeight: 34, fontFamily: 'Georgia', fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 28, fontFamily: 'Georgia', fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 24, fontFamily: 'Georgia', fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontFamily: 'Georgia' },
  label: { fontSize: 13, lineHeight: 18 },
  caption: { fontSize: 12, lineHeight: 16 },

  // book typography (UI v2)
  prose: { fontSize: 18, lineHeight: 30, fontFamily: fonts.serif },
  chapter: { fontSize: 14, lineHeight: 20, fontFamily: fonts.serifSemi, letterSpacing: 1.5 },
  hand: { fontSize: 17, lineHeight: 24, fontFamily: fonts.hand },
  handSmall: { fontSize: 14, lineHeight: 19, fontFamily: fonts.hand },
} as const;

export type Tone = 'gold' | 'danger' | 'mana' | 'success' | 'muted';

export function toneColor(tone: Tone): string {
  switch (tone) {
    case 'gold': return colors.gold;
    case 'danger': return colors.danger;
    case 'mana': return colors.mana;
    case 'success': return colors.success;
    case 'muted': return colors.inkMuted;
  }
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx jest client/src/theme && cd client && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/theme/tokens.ts client/src/theme/tokens.test.ts
git commit -m "feat(theme): book palette, fonts and note-tilt tokens (v2, additive)"
```

---

### Task 7: Install and load fonts

**Files:**
- Modify: `client/package.json` (via expo install)
- Modify: `client/App.tsx` (font gate only — full restyle is Task 18)

- [ ] **Step 1: Install packages**

Run (in `client/`): `npx expo install expo-font @expo-google-fonts/crimson-pro @expo-google-fonts/patrick-hand`
Expected: three packages added to `client/package.json` dependencies.

- [ ] **Step 2: Gate the app on font loading**

In `client/App.tsx`, add imports:

```tsx
import { useFonts } from 'expo-font';
import { CrimsonPro_400Regular, CrimsonPro_600SemiBold } from '@expo-google-fonts/crimson-pro';
import { PatrickHand_400Regular } from '@expo-google-fonts/patrick-hand';
```

At the top of the `App` component body (before the `auth.status` checks):

```tsx
  const [fontsLoaded, fontError] = useFonts({
    CrimsonPro_400Regular, CrimsonPro_600SemiBold, PatrickHand_400Regular,
  });
```

and extend the existing splash condition so the splash also shows while fonts load (never block forever — `fontError` releases the gate with system fallbacks):

```tsx
  if (auth.status === 'loading' || (!fontsLoaded && !fontError)) {
```

- [ ] **Step 3: Verify**

Run: `cd client && npm run typecheck`, then `npm run web` and open the app.
Expected: typecheck PASS; app boots; in browser devtools → Network, the two font families load. Vietnamese check: in devtools console run `document.fonts.check('16px PatrickHand_400Regular', 'ữệạơ')` → `true` (both chosen families ship a Vietnamese subset).

- [ ] **Step 4: Commit**

```bash
git add client/package.json client/package-lock.json client/App.tsx
git commit -m "feat(client): load Crimson Pro + Patrick Hand via expo-font"
```

(If there is no `client/package-lock.json`, commit the root `package-lock.json` if the install touched it.)

---

## Phase 3 — Component layer

### Task 8: Pure helpers — `formatStats`, typewriter math, `useTypewriter`

**Files:**
- Create: `client/src/lib/format.ts`, `client/src/lib/format.test.ts`
- Create: `client/src/lib/typewriter.ts`, `client/src/lib/typewriter.test.ts`
- Create: `client/src/hooks/useTypewriter.ts`

- [ ] **Step 1: Write the failing tests**

`client/src/lib/format.test.ts`:

```ts
import { formatStats } from './format';

describe('formatStats', () => {
  const stats = { str: 9, dex: 8, int: 7, wis: 5, cha: 6, con: 6 };
  it('formats core stats in STAT_KEYS order', () => {
    expect(formatStats(stats)).toBe('STR 9 · DEX 8 · INT 7 · CON 6');
  });
  it('formats all stats when full', () => {
    expect(formatStats(stats, true)).toBe('STR 9 · DEX 8 · INT 7 · WIS 5 · CHA 6 · CON 6');
  });
  it('treats missing keys as 0', () => {
    expect(formatStats({ str: 3 })).toBe('STR 3 · DEX 0 · INT 0 · CON 0');
  });
});
```

`client/src/lib/typewriter.test.ts`:

```ts
import { revealCount } from './typewriter';

describe('revealCount', () => {
  it('grows by charsPerTick and clamps at the text length', () => {
    expect(revealCount(10, 0, 3)).toBe(0);
    expect(revealCount(10, 2, 3)).toBe(6);
    expect(revealCount(10, 4, 3)).toBe(10);
    expect(revealCount(10, 99, 3)).toBe(10);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest client/src/lib`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the pure modules**

`client/src/lib/format.ts`:

```ts
import { STAT_KEYS } from '../../../shared/constants';
import type { Stats } from '../../../shared/types';

const SHORT: string[] = ['str', 'dex', 'int', 'con'];

/** "STR 9 · DEX 8 · …" — short form shows str/dex/int/con; full shows every core stat. */
export function formatStats(stats: Stats, full = false): string {
  const keys = full ? STAT_KEYS : STAT_KEYS.filter((k) => SHORT.includes(k));
  return keys.map((k) => `${k.toUpperCase()} ${stats[k] ?? 0}`).join(' · ');
}
```

`client/src/lib/typewriter.ts`:

```ts
/** Number of characters revealed after `tick` intervals. Pure. */
export function revealCount(textLength: number, tick: number, charsPerTick: number): number {
  return Math.min(textLength, Math.max(0, tick) * charsPerTick);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest client/src/lib`
Expected: PASS (4 tests)

- [ ] **Step 5: Implement the hook (visual glue — no unit test, covered by typecheck + manual run)**

`client/src/hooks/useTypewriter.ts`:

```ts
import { useEffect, useState } from 'react';
import { revealCount } from '../lib/typewriter';

/**
 * Reveals `text` incrementally like ink being written. Resets when text changes.
 * `skip()` reveals everything at once (tap-to-skip).
 */
export function useTypewriter(text: string, opts?: { charsPerTick?: number; intervalMs?: number; enabled?: boolean }) {
  const { charsPerTick = 3, intervalMs = 30, enabled = true } = opts ?? {};
  const [tick, setTick] = useState(0);
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    setTick(0);
    setSkipped(false);
    if (!enabled) return;
    const timer = setInterval(() => {
      setTick((n) => {
        const next = n + 1;
        if (revealCount(text.length, next, charsPerTick) >= text.length) clearInterval(timer);
        return next;
      });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [text, enabled, charsPerTick, intervalMs]);

  const count = skipped || !enabled ? text.length : revealCount(text.length, tick, charsPerTick);
  return {
    shown: text.slice(0, count),
    done: count >= text.length,
    skip: () => setSkipped(true),
  };
}
```

- [ ] **Step 6: Typecheck + commit**

Run: `cd client && npm run typecheck`

```bash
git add client/src/lib client/src/hooks/useTypewriter.ts
git commit -m "feat(client): formatStats + typewriter primitives"
```

---

### Task 9: `Desk` and `BookPage`

**Files:**
- Create: `client/src/components/Desk.tsx`
- Create: `client/src/components/BookPage.tsx`

No unit tests (visual components; jest only runs `.ts`). Verification = typecheck + the screen tasks' manual checks.

- [ ] **Step 1: Implement `Desk`**

`client/src/components/Desk.tsx`:

```tsx
import React, { useEffect, useRef } from 'react';
import { SafeAreaView, ScrollView, View, StyleSheet, type ViewStyle } from 'react-native';
import { colors, space } from '../theme';

/**
 * The wooden desk every screen sits on. Scrollable; when `scrollToEndKey`
 * changes the desk scrolls to the bottom (used by Story as prose grows).
 */
export function Desk({
  children, center = false, maxWidth = 760, scrollToEndKey, style,
}: {
  children: React.ReactNode;
  center?: boolean;
  maxWidth?: number;
  scrollToEndKey?: string | number;
  style?: ViewStyle;
}) {
  const ref = useRef<ScrollView>(null);
  useEffect(() => {
    if (scrollToEndKey === undefined) return;
    const t = setTimeout(() => ref.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [scrollToEndKey]);

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView ref={ref} contentContainerStyle={[styles.scroll, center && styles.center]}>
        <View style={[styles.inner, { maxWidth }, style]}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.deskWood },
  scroll: { flexGrow: 1, padding: space.lg },
  center: { justifyContent: 'center' },
  inner: { width: '100%', alignSelf: 'center', gap: space.lg },
});
```

- [ ] **Step 2: Implement `BookPage`**

`client/src/components/BookPage.tsx`:

```tsx
import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { colors, space } from '../theme';

/** A parchment sheet. tone="note" renders it as an enlarged sticky note (ledger screens). */
export function BookPage({
  children, tone = 'page', style,
}: {
  children: React.ReactNode;
  tone?: 'page' | 'note';
  style?: ViewStyle;
}) {
  return <View style={[styles.page, tone === 'note' && styles.note, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.page,
    borderWidth: 1,
    borderColor: colors.pageEdge,
    borderRadius: 4,
    paddingVertical: space.xl,
    paddingHorizontal: space.xl,
    gap: space.md,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  note: { backgroundColor: colors.noteYellow },
});
```

- [ ] **Step 3: Typecheck + commit**

Run: `cd client && npm run typecheck`

```bash
git add client/src/components/Desk.tsx client/src/components/BookPage.tsx
git commit -m "feat(client): Desk and BookPage primitives"
```

---

### Task 10: Ink text components — `InkProse`, `ChoiceLine`, `InkButton`, `InkStamp`

**Files:**
- Create: `client/src/components/InkProse.tsx`
- Create: `client/src/components/ChoiceLine.tsx`
- Create: `client/src/components/InkButton.tsx`
- Create: `client/src/components/InkStamp.tsx`

- [ ] **Step 1: Implement `InkProse`**

`client/src/components/InkProse.tsx`:

```tsx
import React from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import { colors, type } from '../theme';
import { useTypewriter } from '../hooks/useTypewriter';

/** Story prose. animate=true writes it out with an ink cursor; tap reveals everything. */
export function InkProse({
  children, animate = false, faded = false,
}: {
  children: string;
  animate?: boolean;
  faded?: boolean;
}) {
  const { shown, done, skip } = useTypewriter(children, { enabled: animate });
  const body = (
    <Text style={[styles.prose, faded && styles.faded]}>
      {animate ? shown : children}
      {animate && !done ? <Text style={styles.cursor}>▍</Text> : null}
    </Text>
  );
  if (!animate || done) return body;
  return <Pressable onPress={skip}>{body}</Pressable>;
}

const styles = StyleSheet.create({
  prose: { ...type.prose, color: colors.ink },
  faded: { color: colors.inkFaded },
  cursor: { color: colors.inkAccent },
});
```

- [ ] **Step 2: Implement `ChoiceLine`**

`client/src/components/ChoiceLine.tsx`:

```tsx
import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { colors, space, type } from '../theme';

/** A story choice rendered as a handwritten line at the bottom of the page. */
export function ChoiceLine({
  text, onPress, disabled = false, tone = 'default',
}: {
  text: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.line, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={[styles.text, tone === 'danger' && styles.danger]}>❧ {text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  line: {
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderStyle: 'dotted',
    borderColor: colors.pageEdge,
  },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.4 },
  text: { ...type.hand, color: colors.inkAccent },
  danger: { color: colors.inkRed },
});
```

- [ ] **Step 3: Implement `InkButton`**

`client/src/components/InkButton.tsx`:

```tsx
import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { colors, space, type } from '../theme';

/** Small handwritten action ("use", "unequip", "buy") for ledger rows and headers. */
export function InkButton({
  label, onPress, disabled = false, tone = 'ink', busy = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'ink' | 'red';
  busy?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed, (disabled || busy) && styles.disabled]}
    >
      <Text style={[styles.label, tone === 'red' && styles.red]}>{busy ? '…' : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { paddingVertical: space.xs, paddingHorizontal: space.sm },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.4 },
  label: { ...type.handSmall, color: colors.inkAccent, textDecorationLine: 'underline' },
  red: { color: colors.inkRed },
});
```

- [ ] **Step 4: Implement `InkStamp`**

`client/src/components/InkStamp.tsx`:

```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, space, type } from '../theme';

/** A tilted ink stamp pressed onto the page ("⚄ 17 — PASS", "winner: player"). */
export function InkStamp({ text, tone = 'ink' }: { text: string; tone?: 'ink' | 'red' | 'green' }) {
  const c = tone === 'red' ? colors.inkRed : tone === 'green' ? colors.inkGreen : colors.inkAccent;
  return (
    <View style={[styles.stamp, { borderColor: c }]}>
      <Text style={[styles.text, { color: c }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stamp: {
    alignSelf: 'flex-start',
    borderWidth: 2,
    borderRadius: 4,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    transform: [{ rotate: '-2deg' }],
  },
  text: { ...type.handSmall, letterSpacing: 1, textTransform: 'uppercase' },
});
```

- [ ] **Step 5: Typecheck + commit**

Run: `cd client && npm run typecheck`

```bash
git add client/src/components/InkProse.tsx client/src/components/ChoiceLine.tsx client/src/components/InkButton.tsx client/src/components/InkStamp.tsx
git commit -m "feat(client): ink text components (prose, choices, buttons, stamps)"
```

---

### Task 11: Paper notes + journal entry; export everything

**Files:**
- Create: `client/src/components/PaperNote.tsx`
- Create: `client/src/components/NoteRail.tsx`
- Create: `client/src/components/JournalEntryView.tsx`
- Modify: `client/src/components/index.ts`

- [ ] **Step 1: Implement `PaperNote` (+ `NoteText`)**

`client/src/components/PaperNote.tsx`:

```tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, space, type } from '../theme';

export type NoteTone = 'yellow' | 'blue' | 'pink';

const TONE_BG: Record<NoteTone, string> = {
  yellow: colors.noteYellow,
  blue: colors.noteBlue,
  pink: colors.notePink,
};

/** A pinned sticky note. Pass `tilt` (degrees) from theme `tilts` for variety. */
export function PaperNote({
  children, tone = 'yellow', tilt = 0, onPress, compact = false,
}: {
  children: React.ReactNode;
  tone?: NoteTone;
  tilt?: number;
  onPress?: () => void;
  compact?: boolean;
}) {
  const inner = (
    <View style={[
      styles.note,
      { backgroundColor: TONE_BG[tone], transform: [{ rotate: `${tilt}deg` }] },
      compact && styles.compact,
    ]}>
      <View style={styles.pin} />
      {children}
    </View>
  );
  if (!onPress) return inner;
  return <Pressable onPress={onPress} style={({ pressed }) => (pressed ? styles.pressed : null)}>{inner}</Pressable>;
}

/** Handwritten text on a note. */
export function NoteText({ children }: { children: React.ReactNode }) {
  return <Text style={styles.text}>{children}</Text>;
}

const styles = StyleSheet.create({
  note: {
    padding: space.md,
    paddingTop: space.sm,
    gap: 2,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 2, height: 3 },
    elevation: 5,
  },
  compact: { padding: space.sm, minWidth: 150 },
  pin: {
    width: 9, height: 9, borderRadius: 5,
    backgroundColor: colors.notePin,
    alignSelf: 'center', marginBottom: space.xs,
  },
  pressed: { opacity: 0.8 },
  text: { ...type.handSmall, color: colors.noteInk },
});
```

- [ ] **Step 2: Implement `NoteRail`**

`client/src/components/NoteRail.tsx`:

```tsx
import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { space } from '../theme';

/**
 * Lays out paper notes: a vertical column beside the page (desktop) or a
 * horizontal strip above it (narrow screens). The caller decides via useResponsive.
 */
export function NoteRail({ notes, horizontal = false }: { notes: React.ReactNode[]; horizontal?: boolean }) {
  if (!horizontal) {
    return (
      <View style={styles.rail}>
        {notes.map((n, i) => <View key={i}>{n}</View>)}
      </View>
    );
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
      {notes.map((n, i) => <View key={i}>{n}</View>)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: { width: 230, gap: space.lg, paddingTop: space.md },
  strip: { gap: space.md, paddingVertical: space.sm, paddingHorizontal: space.xs },
});
```

- [ ] **Step 3: Implement `JournalEntryView`**

`client/src/components/JournalEntryView.tsx`:

```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, space, type } from '../theme';
import type { JournalEntry } from '../../../shared/engine/journal';

/** A past step of the story: faded prose + the handwritten line of what was chosen. */
export function JournalEntryView({ entry }: { entry: JournalEntry }) {
  const rollNote = entry.roll != null
    ? `  (⚄ ${entry.roll} — ${entry.checkPassed ? 'passed' : 'failed'})`
    : '';
  return (
    <View style={styles.wrap}>
      <Text style={styles.prose}>{entry.prose}</Text>
      <Text style={styles.chosen}>→ {entry.chosenText}{rollNote}</Text>
      {entry.reward && (
        <Text style={styles.chosen}>
          ✦ +{entry.reward.gold} gold · +{entry.reward.xp} xp
          {entry.reward.itemIds.length ? ` · ${entry.reward.itemIds.join(', ')}` : ''}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs, marginBottom: space.md },
  prose: { ...type.prose, color: colors.inkFaded },
  chosen: { ...type.handSmall, color: colors.inkFaded },
});
```

Note: skill-check rolls and combat spoils render here (the journal's last entry is always the step just taken), so the Story screen does NOT add separate `InkStamp`s — that would duplicate the same information. `InkStamp` is used by Combat and Ending.

- [ ] **Step 4: Export the new layer**

Replace `client/src/components/index.ts` with (legacy exports stay until Task 19):

```ts
// legacy (deleted in the cleanup task)
export { Screen } from './Screen';
export { Heading } from './Heading';
export { Prose } from './Prose';
export { Label, Caption } from './Label';
export { Button } from './Button';
export { Card } from './Card';
export { Tag } from './Tag';
export { StatRow } from './StatRow';
export { Divider } from './Divider';
export { Banner } from './Banner';

// book UI v2
export { Desk } from './Desk';
export { BookPage } from './BookPage';
export { InkProse } from './InkProse';
export { ChoiceLine } from './ChoiceLine';
export { InkButton } from './InkButton';
export { InkStamp } from './InkStamp';
export { PaperNote, NoteText, type NoteTone } from './PaperNote';
export { NoteRail } from './NoteRail';
export { JournalEntryView } from './JournalEntryView';
```

- [ ] **Step 5: Typecheck + commit**

Run: `cd client && npm run typecheck`

```bash
git add client/src/components
git commit -m "feat(client): paper notes, note rail and journal entry components"
```

---

## Phase 4 — Screens

### Task 12: Story screen

**Files:**
- Rewrite: `client/src/screens/Story.tsx`

- [ ] **Step 1: Rewrite the screen**

Replace `client/src/screens/Story.tsx` with:

```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  Desk, BookPage, InkProse, ChoiceLine, PaperNote, NoteText, NoteRail, JournalEntryView,
} from '../components';
import { colors, space, type, tilts } from '../theme';
import { useResponsive } from '../hooks/useResponsive';
import { formatStats } from '../lib/format';
import type { SessionView, ChoiceView } from '../services/api';

export function Story({
  view, lastChoice, busy, onChoose, onFight, onInventory, onShop,
}: {
  view: SessionView;
  lastChoice: ChoiceView | null;
  busy: boolean;
  onChoose: (choiceId: string) => void;
  onFight: (choiceId: string) => void;
  onInventory: () => void;
  onShop: () => void;
}) {
  const layout = useResponsive();
  const save = view.save;
  const nodeHasCombat = !!view.node.combat;
  const chapter = save.playedRouteIds?.length ?? 1;

  const notes = [
    <PaperNote tone="yellow" tilt={tilts[0]} compact={!layout.showRail}>
      <NoteText>HP {save.vitals.currentHp} ❤</NoteText>
      <NoteText>{formatStats(view.effectiveStats)}</NoteText>
    </PaperNote>,
    <PaperNote tone="blue" tilt={tilts[1]} compact={!layout.showRail} onPress={busy ? undefined : onInventory}>
      <NoteText>satchel — {save.character.inventory.length} items</NoteText>
      <NoteText>{save.gold} gold · tap to open</NoteText>
    </PaperNote>,
    <PaperNote tone="pink" tilt={tilts[2]} compact={!layout.showRail}>
      <NoteText>reputation</NoteText>
      <NoteText>hero {save.reputation.hero} · villain {save.reputation.villain}</NoteText>
    </PaperNote>,
    ...(view.node.merchant ? [
      <PaperNote tone="yellow" tilt={tilts[3]} compact={!layout.showRail} onPress={busy ? undefined : onShop}>
        <NoteText>a merchant is here</NoteText>
        <NoteText>tap to trade</NoteText>
      </PaperNote>,
    ] : []),
  ];

  const page = (
    <BookPage>
      <Text style={styles.chapter}>{save.character.background} — chapter {chapter}</Text>
      {view.journal.map((e, i) => <JournalEntryView key={i} entry={e} />)}
      <InkProse animate>{view.node.prose}</InkProse>
      <View style={styles.choices}>
        {view.node.choices.map((c) => {
          const isFight = nodeHasCombat && !c.skillCheck;
          const label = `${c.text}${c.skillCheck ? ` (${c.skillCheck.stat.toUpperCase()} check)` : ''}${isFight ? ' ⚔' : ''}`;
          return (
            <ChoiceLine
              key={c.id}
              text={label}
              tone={isFight ? 'danger' : 'default'}
              disabled={busy}
              onPress={() => (isFight ? onFight(c.id) : onChoose(c.id))}
            />
          );
        })}
      </View>
    </BookPage>
  );

  return (
    <Desk scrollToEndKey={save.currentNodeId} maxWidth={layout.showRail ? 1020 : 760}>
      {layout.showRail ? (
        <View style={styles.split}>
          <View style={styles.main}>{page}</View>
          <NoteRail notes={notes} />
        </View>
      ) : (
        <>
          <NoteRail notes={notes} horizontal />
          {page}
        </>
      )}
    </Desk>
  );
}

const styles = StyleSheet.create({
  split: { flexDirection: 'row', gap: space.lg },
  main: { flex: 1 },
  chapter: { ...type.chapter, color: colors.inkFaded, textTransform: 'uppercase' },
  choices: { marginTop: space.md },
});
```

- [ ] **Step 2: Typecheck**

Run: `cd client && npm run typecheck`
Expected: PASS

- [ ] **Step 3: Manual verify**

Run server + client (`npm run dev:server`, `cd client && npm run web`), log in, start a game.
Expected: dark desk, parchment page, prose types itself with a `▍` cursor, tap reveals all; choices are handwritten `❧` lines; pinned notes beside (wide window) or above (narrow window) the page; picking a choice appends the previous step as a faded entry and the desk scrolls down; a browser reload (same session via `getView`) still shows the full journal.

- [ ] **Step 4: Commit**

```bash
git add client/src/screens/Story.tsx
git commit -m "feat(client): Story screen as a living journal page with pinned notes"
```

---

### Task 13: Combat screen

**Files:**
- Rewrite: `client/src/screens/Combat.tsx`

- [ ] **Step 1: Rewrite the screen** (same two phases and the same reveal-interval logic as before — only the shell changes)

Replace `client/src/screens/Combat.tsx` with:

```tsx
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Desk, BookPage, InkProse, ChoiceLine, InkStamp } from '../components';
import { colors, space, type } from '../theme';
import { sprite } from '../assets';
import type { SessionView, ChoiceView } from '../services/api';

export function Combat({
  view, lastChoice, busy, onFight,
}: {
  view: SessionView;
  lastChoice: ChoiceView | null;
  busy: boolean;
  onFight: (skillPriority: string[]) => void;
}) {
  const [priority, setPriority] = useState<string[]>(view.save.character.skillPriority);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= priority.length) return;
    const next = [...priority];
    [next[i], next[j]] = [next[j], next[i]];
    setPriority(next);
  };

  const log = lastChoice?.combat?.log ?? [];
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const events = lastChoice?.combat?.log ?? [];
    if (events.length === 0) { setShown(0); return; }
    setShown(0);
    let n = 0;
    const timer = setInterval(() => {
      n += 1;
      setShown(n);
      if (n >= events.length) clearInterval(timer);
    }, 600);
    return () => clearInterval(timer);
  }, [lastChoice]);

  if (log.length === 0) {
    return (
      <Desk center>
        <BookPage>
          <Text style={styles.chapter}>before the battle</Text>
          <InkProse>You ready yourself, deciding which skill to lead with.</InkProse>
          {priority.map((id, i) => (
            <View key={id} style={styles.row}>
              <Text style={styles.skill}>{i + 1}. {id}</Text>
              <Pressable disabled={busy} onPress={() => move(i, -1)}><Text style={styles.arrow}>▲</Text></Pressable>
              <Pressable disabled={busy} onPress={() => move(i, 1)}><Text style={styles.arrow}>▼</Text></Pressable>
            </View>
          ))}
          <ChoiceLine text="Engage ⚔" tone="danger" disabled={busy} onPress={() => onFight(priority)} />
        </BookPage>
      </Desk>
    );
  }

  return (
    <Desk scrollToEndKey={shown}>
      <BookPage>
        <Text style={styles.chapter}>the battle</Text>
        {log.slice(0, shown).map((e, i) => (
          <Text key={i} style={styles.event}>
            R{e.round} {e.actorId} {e.type}
            {e.skillId ? ` ${sprite('skill.' + e.skillId)} ${e.skillId}` : ''}
            {e.damage ? ` → ${e.damage} dmg` : ''}
            {e.note ? ` (${e.note})` : ''}
          </Text>
        ))}
        {shown >= log.length && (
          <InkStamp
            text={`winner: ${lastChoice?.combat?.winner}`}
            tone={lastChoice?.combat?.winner === 'player' ? 'green' : 'red'}
          />
        )}
      </BookPage>
    </Desk>
  );
}

const styles = StyleSheet.create({
  chapter: { ...type.chapter, color: colors.inkFaded, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  skill: { ...type.hand, flex: 1, color: colors.ink },
  arrow: { fontSize: 18, paddingHorizontal: space.sm, color: colors.inkAccent },
  event: { ...type.handSmall, color: colors.ink },
});
```

- [ ] **Step 2: Typecheck + manual verify**

Run: `cd client && npm run typecheck`; in the app pick the fight choice.
Expected: priority page on parchment; ▲▼ reorder works; "Engage ⚔" fires combat.

- [ ] **Step 3: Commit**

```bash
git add client/src/screens/Combat.tsx
git commit -m "feat(client): Combat as a battle-account page"
```

---

### Task 14: Inventory screen

**Files:**
- Rewrite: `client/src/screens/Inventory.tsx`

- [ ] **Step 1: Rewrite the screen**

Replace `client/src/screens/Inventory.tsx` with:

```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Desk, BookPage, InkButton, ChoiceLine } from '../components';
import { colors, space, type } from '../theme';
import { sprite } from '../assets';
import { formatStats } from '../lib/format';
import type { SessionView } from '../services/api';

export function Inventory({
  view, busy, onEquip, onUse, onBack,
}: {
  view: SessionView;
  busy: boolean;
  onEquip: (slot: string, itemId: string | null) => void;
  onUse: (itemId: string) => void;
  onBack: () => void;
}) {
  const equipped = view.save.character.equipped;

  return (
    <Desk>
      <BookPage tone="note">
        <Text style={styles.title}>satchel & gear</Text>
        <Text style={styles.line}>{formatStats(view.effectiveStats, true)}</Text>
        <Text style={styles.line}>HP {view.save.vitals.currentHp} ❤</Text>

        <Text style={styles.section}>— equipped —</Text>
        {Object.entries(equipped).map(([slot, id]) => {
          if (!id) return null;
          return (
            <View key={slot} style={styles.row}>
              <Text style={styles.item}>{slot}: {sprite('item.' + id)} {id}</Text>
              <InkButton label="unequip" disabled={busy} onPress={() => onEquip(slot, null)} />
            </View>
          );
        })}

        <Text style={styles.section}>— carried —</Text>
        {view.save.character.inventory.map((id, i) => (
          <View key={`${id}-${i}`} style={styles.row}>
            <Text style={styles.item}>{sprite('item.' + id)} {id}</Text>
          </View>
        ))}

        <Text style={styles.section}>— potions & scrolls —</Text>
        {Object.entries(view.save.consumables).map(([id, qty]) => (
          <View key={id} style={styles.row}>
            <Text style={styles.item}>{sprite('item.' + id)} {id} ×{qty}</Text>
            <InkButton label="use" disabled={busy} onPress={() => onUse(id)} />
          </View>
        ))}

        <ChoiceLine text="Back to the story" disabled={busy} onPress={onBack} />
      </BookPage>
    </Desk>
  );
}

const styles = StyleSheet.create({
  title: { ...type.chapter, color: colors.noteInk, textTransform: 'uppercase' },
  line: { ...type.handSmall, color: colors.noteInk },
  section: { ...type.handSmall, color: colors.noteInk, opacity: 0.7, marginTop: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  item: { ...type.hand, color: colors.noteInk, flexShrink: 1 },
});
```

(Note the `key={`${id}-${i}`}` on carried items — the inventory can contain duplicate ids, which the old screen got away with but a strict list shouldn't.)

- [ ] **Step 2: Typecheck + manual verify**

Run: `cd client && npm run typecheck`; in the app tap the blue satchel note.
Expected: enlarged yellow-note ledger; unequip/use work and update the page.

- [ ] **Step 3: Commit**

```bash
git add client/src/screens/Inventory.tsx
git commit -m "feat(client): Inventory as an expanded sticky-note ledger"
```

---

### Task 15: Shop screen

**Files:**
- Rewrite: `client/src/screens/Shop.tsx`

- [ ] **Step 1: Rewrite the screen**

Replace `client/src/screens/Shop.tsx` with:

```tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Desk, BookPage, InkButton, ChoiceLine, PaperNote, NoteText } from '../components';
import { colors, space, type, tilts } from '../theme';
import { sprite } from '../assets';
import type { ShopView } from '../services/api';

export function Shop({ shop, gold, busy, onBuy, onBack }: {
  shop: ShopView; gold: number; busy: boolean; onBuy: (itemId: string) => void; onBack: () => void;
}) {
  // ids bought during this visit — marked with a ✓ in the ledger (stock itself never depletes)
  const [bought, setBought] = useState<Set<string>>(new Set());
  const buy = (id: string) => {
    onBuy(id);
    setBought((s) => new Set(s).add(id));
  };

  return (
    <Desk>
      <PaperNote tone="yellow" tilt={tilts[1]}>
        <NoteText>purse: {gold} gold</NoteText>
      </PaperNote>
      <BookPage tone="note">
        <Text style={styles.title}>merchant's ledger</Text>
        {shop.stock.map(({ item, price }) => (
          <View key={item.id} style={styles.row}>
            <Text style={styles.item}>
              {sprite('item.' + item.id)} {item.name} — {price}g{bought.has(item.id) ? '  ✓' : ''}
            </Text>
            <InkButton label="buy" disabled={busy || gold < price} onPress={() => buy(item.id)} />
          </View>
        ))}
        <ChoiceLine text="Back to the story" disabled={busy} onPress={onBack} />
      </BookPage>
    </Desk>
  );
}

const styles = StyleSheet.create({
  title: { ...type.chapter, color: colors.noteInk, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  item: { ...type.hand, color: colors.noteInk, flexShrink: 1 },
});
```

- [ ] **Step 2: Typecheck + manual verify**

Run: `cd client && npm run typecheck`; reach a merchant node, tap the merchant note.
Expected: ledger page + purse note; buying marks `✓` and the purse note shows the new gold (it re-renders from `gold`).

- [ ] **Step 3: Commit**

```bash
git add client/src/screens/Shop.tsx
git commit -m "feat(client): Shop as the merchant's ledger"
```

---

### Task 16: CharCreate screen

**Files:**
- Rewrite: `client/src/screens/CharCreate.tsx`

- [ ] **Step 1: Rewrite the screen** (flow change per spec: tap selects a background, "Take up the pen ✒" confirms)

Replace `client/src/screens/CharCreate.tsx` with:

```tsx
import React, { useEffect, useState } from 'react';
import { Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Desk, BookPage, InkProse, ChoiceLine, PaperNote, NoteText } from '../components';
import { colors, space, type } from '../theme';
import { formatStats } from '../lib/format';
import { gameApi } from '../services/api';
import type { Background } from '../../../shared/backgrounds';

export function CharCreate({ onPick, busy }: { onPick: (id: string) => void; busy: boolean }) {
  const [backgrounds, setBackgrounds] = useState<Background[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    gameApi.listBackgrounds().then(setBackgrounds).catch((e) => setError(String(e.message)));
  }, []);

  if (error) {
    return (
      <Desk center>
        <PaperNote tone="pink" tilt={-1.5}>
          <NoteText>failed to load: {error}</NoteText>
        </PaperNote>
      </Desk>
    );
  }
  if (!backgrounds) {
    return (
      <Desk center>
        <ActivityIndicator color={colors.page} />
      </Desk>
    );
  }

  return (
    <Desk center>
      <BookPage>
        <Text style={styles.chapter}>prologue</Text>
        <InkProse>Every story begins with a soul. Choose whose tale this book will tell.</InkProse>
        {backgrounds.map((bg) => (
          <Pressable
            key={bg.id}
            disabled={busy}
            onPress={() => setSelected(bg.id)}
            style={[styles.bg, selected === bg.id && styles.bgActive]}
          >
            <Text style={styles.name}>{bg.name}</Text>
            <Text style={styles.blurb}>{bg.blurb}</Text>
            <Text style={styles.stats}>{formatStats(bg.baseStats, true)}</Text>
          </Pressable>
        ))}
        <ChoiceLine
          text="Take up the pen ✒"
          disabled={busy || !selected}
          onPress={() => selected && onPick(selected)}
        />
      </BookPage>
    </Desk>
  );
}

const styles = StyleSheet.create({
  chapter: { ...type.chapter, color: colors.inkFaded, textTransform: 'uppercase' },
  bg: {
    borderWidth: 1, borderColor: 'transparent', borderRadius: 4,
    padding: space.md, gap: space.xs,
  },
  bgActive: { borderColor: colors.inkAccent, backgroundColor: 'rgba(107,79,42,0.07)' },
  name: { ...type.hand, fontSize: 20, color: colors.ink },
  blurb: { ...type.prose, fontSize: 16, lineHeight: 24, color: colors.ink },
  stats: { ...type.handSmall, color: colors.inkAccent },
});
```

- [ ] **Step 2: Typecheck + manual verify**

Run: `cd client && npm run typecheck`; log out/in to reach CharCreate.
Expected: prologue page; tapping a background frames it in ink; "Take up the pen ✒" is disabled until one is selected, then starts the game.

- [ ] **Step 3: Commit**

```bash
git add client/src/screens/CharCreate.tsx
git commit -m "feat(client): CharCreate as the book's prologue page"
```

---

### Task 17: Ending screen

**Files:**
- Rewrite: `client/src/screens/Ending.tsx`

- [ ] **Step 1: Rewrite the screen**

Replace `client/src/screens/Ending.tsx` with:

```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Desk, BookPage, InkProse, ChoiceLine, InkStamp, PaperNote, NoteText } from '../components';
import { colors, space, type, tilts } from '../theme';
import { formatStats } from '../lib/format';
import type { SessionView, ChoiceView } from '../services/api';

export function Ending({
  view, lastChoice, busy, onContinue,
}: {
  view: SessionView;
  lastChoice: ChoiceView | null;
  busy: boolean;
  onContinue: () => void;
}) {
  const isDefeat = lastChoice?.ending === 'defeat';
  const canContinue = !isDefeat && view.hasNextRoute;

  if (canContinue) {
    return (
      <Desk center>
        <BookPage>
          <Text style={styles.chapter}>epilogue</Text>
          <InkProse animate>{view.node.prose}</InkProse>
          {view.ending && <InkStamp text={`ending: ${view.ending}`} tone="green" />}
          <ChoiceLine text="Write the next chapter" disabled={busy} onPress={onContinue} />
        </BookPage>
      </Desk>
    );
  }

  if (isDefeat) {
    return (
      <Desk center>
        <BookPage>
          <Text style={styles.chapter}>the final page</Text>
          <InkProse animate>{view.node.prose}</InkProse>
          <InkStamp text="you have fallen" tone="red" />
        </BookPage>
      </Desk>
    );
  }

  // Finale: no further published routes remain.
  const rep = view.save.reputation;
  const routesPlayed = view.save.playedRouteIds?.length ?? 1;
  return (
    <Desk center>
      <BookPage>
        <Text style={styles.chapter}>the book closes</Text>
        <InkProse animate>{view.node.prose}</InkProse>
        {view.ending && <InkStamp text={`ending: ${view.ending}`} tone="ink" />}
      </BookPage>
      <View style={styles.notes}>
        <PaperNote tone="yellow" tilt={tilts[0]}>
          <NoteText>chapters written: {routesPlayed}</NoteText>
          <NoteText>{formatStats(view.effectiveStats, true)}</NoteText>
        </PaperNote>
        <PaperNote tone="pink" tilt={tilts[1]}>
          <NoteText>hero {rep.hero} · villain {rep.villain}</NoteText>
        </PaperNote>
      </View>
    </Desk>
  );
}

const styles = StyleSheet.create({
  chapter: { ...type.chapter, color: colors.inkFaded, textTransform: 'uppercase' },
  notes: { flexDirection: 'row', gap: space.xl, justifyContent: 'center' },
});
```

- [ ] **Step 2: Typecheck + commit**

Run: `cd client && npm run typecheck`

```bash
git add client/src/screens/Ending.tsx
git commit -m "feat(client): Ending as the book's final pages"
```

---

### Task 18: Auth screen + App shell

**Files:**
- Rewrite: `client/src/screens/Auth/index.tsx`
- Modify: `client/App.tsx`

- [ ] **Step 1: Rewrite Auth**

Replace `client/src/screens/Auth/index.tsx` with:

```tsx
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Desk, BookPage, InkButton, ChoiceLine, PaperNote, NoteText } from '../../components';
import { colors, space, type } from '../../theme';
import type { AuthResult } from '../../auth/authCore';

export function AuthScreen({
  onLogin, onRegister,
}: {
  onLogin: (email: string, pw: string) => AuthResult;
  onRegister: (email: string, pw: string, confirm: string) => AuthResult;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const switchMode = (m: 'login' | 'register') => { setMode(m); setError(null); };
  const submit = () => {
    const res = mode === 'login' ? onLogin(email, pw) : onRegister(email, pw, confirm);
    if (!res.ok) setError(res.error);
  };

  return (
    <Desk center maxWidth={460}>
      <BookPage>
        <Text style={styles.brand}>ShufferC</Text>
        <Text style={styles.sub}>AI Chronicles</Text>
        <View style={styles.tabs}>
          <InkButton label={mode === 'login' ? '● log in' : 'log in'} onPress={() => switchMode('login')} />
          <InkButton label={mode === 'register' ? '● register' : 'register'} onPress={() => switchMode('register')} />
        </View>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.inkFaded}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.inkFaded}
          secureTextEntry
          value={pw}
          onChangeText={setPw}
        />
        {mode === 'register' && (
          <TextInput
            style={styles.input}
            placeholder="Confirm password"
            placeholderTextColor={colors.inkFaded}
            secureTextEntry
            value={confirm}
            onChangeText={setConfirm}
          />
        )}
        {error && (
          <PaperNote tone="pink" tilt={-1}>
            <NoteText>{error}</NoteText>
          </PaperNote>
        )}
        <ChoiceLine text={mode === 'login' ? 'Open the book' : 'Begin a new book'} onPress={submit} />
        <Text style={styles.hint}>A local sign-in for the demo — no data leaves your device.</Text>
      </BookPage>
    </Desk>
  );
}

const styles = StyleSheet.create({
  brand: { ...type.prose, fontSize: 30, lineHeight: 38, fontFamily: 'CrimsonPro_600SemiBold', color: colors.ink, textAlign: 'center' },
  sub: { ...type.handSmall, color: colors.inkFaded, textAlign: 'center' },
  tabs: { flexDirection: 'row', justifyContent: 'center', gap: space.lg },
  input: {
    backgroundColor: '#fdf6e7',
    borderWidth: 1,
    borderColor: colors.pageEdge,
    borderRadius: 4,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    color: colors.ink,
    fontSize: 16,
    fontFamily: 'CrimsonPro_400Regular',
  },
  hint: { ...type.handSmall, color: colors.inkFaded, textAlign: 'center' },
});
```

- [ ] **Step 2: Restyle the App shell**

In `client/App.tsx`:

1. Replace the components import line with:

```tsx
import { Desk, PaperNote, NoteText } from './src/components';
```

2. Replace the splash block with:

```tsx
  if (auth.status === 'loading' || (!fontsLoaded && !fontError)) {
    return (
      <Desk center>
        <View style={styles.splash}>
          <Text style={styles.splashTitle}>{APP_TITLE}</Text>
          <ActivityIndicator color={colors.page} />
        </View>
      </Desk>
    );
  }
```

3. Replace the header + error banner JSX inside the signed-in return with:

```tsx
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{APP_TITLE}</Text>
        <Pressable onPress={auth.logout}><Text style={styles.logout}>close the book ✕</Text></Pressable>
      </View>
      {state.error && (
        <View style={styles.bannerWrap}>
          <PaperNote tone="pink" tilt={-1}>
            <NoteText>{state.error}</NoteText>
          </PaperNote>
        </View>
      )}
```

(keep the `<View style={styles.body}>…` screen-switch block unchanged) and add `Text, Pressable` to the `react-native` import.

4. Replace the styles with:

```tsx
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.deskWood, paddingTop: 24 },
  splash: { alignItems: 'center', gap: space.lg },
  splashTitle: { fontSize: 30, fontFamily: 'CrimsonPro_600SemiBold', color: colors.page },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.lg, paddingVertical: space.sm,
    borderBottomWidth: 1, borderBottomColor: 'rgba(244,234,214,0.15)',
  },
  headerTitle: { fontSize: 20, fontFamily: 'CrimsonPro_600SemiBold', color: colors.page },
  logout: { ...type.handSmall, color: colors.pageEdge },
  bannerWrap: { paddingHorizontal: space.lg, paddingTop: space.sm, alignItems: 'flex-start' },
  body: { flex: 1 },
});
```

and update the theme import to `import { colors, space, type } from './src/theme';`.

- [ ] **Step 3: Typecheck + manual verify**

Run: `cd client && npm run typecheck`, then run the app.
Expected: login page is a small book page on the desk; header is serif on dark wood; errors appear as pink notes.

- [ ] **Step 4: Commit**

```bash
git add client/src/screens/Auth/index.tsx client/App.tsx
git commit -m "feat(client): Auth title-page and book-styled app shell"
```

---

### Task 19: Delete the legacy component layer and tokens

**Files:**
- Delete: `client/src/components/{Banner,Button,Card,Divider,Heading,Label,Prose,Screen,StatRow,Tag}.tsx`
- Modify: `client/src/components/index.ts`, `client/src/theme/tokens.ts`
- Test: `client/src/theme/tokens.test.ts` (rewrite assertions)

- [ ] **Step 1: Confirm nothing imports the legacy layer**

Run from repo root:

```bash
grep -rn "Screen\|Heading\|Prose\|Label\|Caption\|Button\|Card\|Tag\|StatRow\|Divider\|Banner" client/src/screens client/App.tsx | grep "from '.*components'"
```

Expected: only v2 names (Desk, BookPage, InkProse, …). If any legacy name appears, fix that screen first — do not delete a component still in use.

- [ ] **Step 2: Delete the legacy files and exports**

```bash
git rm client/src/components/Banner.tsx client/src/components/Button.tsx client/src/components/Card.tsx client/src/components/Divider.tsx client/src/components/Heading.tsx client/src/components/Label.tsx client/src/components/Prose.tsx client/src/components/Screen.tsx client/src/components/StatRow.tsx client/src/components/Tag.tsx
```

In `client/src/components/index.ts`, delete the entire `// legacy` block (keep only the book UI v2 exports).

- [ ] **Step 3: Remove legacy tokens**

In `client/src/theme/tokens.ts`: delete the legacy palette block (`bgBase` … `success`), the legacy `type` entries (`display`, `title`, `heading`, `body`, `label`, `caption`), and the `Tone` type + `toneColor` function.

Rewrite `client/src/theme/tokens.test.ts` as:

```ts
import { colors, space, radii, type, fonts, tilts } from './tokens';

describe('theme tokens', () => {
  it('exposes the book palette', () => {
    expect(colors.deskWood).toBe('#221710');
    expect(colors.page).toBe('#f4ead6');
    expect(colors.ink).toBe('#3a2f23');
    expect(colors.noteYellow).toBe('#f5e9a9');
    expect(colors.noteBlue).toBe('#cfe2ef');
    expect(colors.notePink).toBe('#f0d4d2');
  });

  it('has a 4-base spacing scale and radii', () => {
    expect(space.md).toBe(12);
    expect(space.lg).toBe(16);
    expect(radii.md).toBe(10);
  });

  it('defines book typography and note tilts', () => {
    expect(type.prose.fontFamily).toBe(fonts.serif);
    expect(type.prose.fontSize).toBe(18);
    expect(type.hand.fontFamily).toBe(fonts.hand);
    expect(tilts.length).toBeGreaterThanOrEqual(4);
  });
});
```

- [ ] **Step 4: Typecheck + full tests**

Run: `cd client && npm run typecheck && cd .. && npm test`
Expected: PASS — any remaining reference to a deleted token/component is a missed consumer; fix it, don't restore the token.

- [ ] **Step 5: Commit**

```bash
git add -A client/src
git commit -m "refactor(client): remove legacy component layer and dark-fantasy tokens"
```

---

## Phase 5 — Admin polish

### Task 20: CSS-only polish of the admin console

**Files:**
- Modify: `server/admin/index.html` (the `<style>` block ONLY — no markup, ids, or JS changes)

- [ ] **Step 1: Update the palette**

Replace the `:root` line with:

```css
    :root { --bg:#0e1015; --card:#171a23; --fg:#e8eaf0; --muted:#8d93a5; --accent:#6a96ff; --ok:#42b35c; --warn:#d9a73a; --err:#f2594b; --line:#272c39; --input:#0b0d12; }
```

- [ ] **Step 2: Append a polish block** immediately before `</style>`:

```css
    /* ── polish pass (book-ui-redesign) — visual only, no structural changes ── */
    input, textarea, select { background: var(--input); transition: border-color .12s ease; }
    input:focus, textarea:focus, select:focus {
      outline: none; border-color: var(--accent);
      box-shadow: 0 0 0 2px rgba(106,150,255,.22);
    }
    button { transition: filter .12s ease, background .12s ease; }
    button:hover:not(:disabled) { filter: brightness(1.1); }
    .card { border-radius: 12px; padding: 20px; }
    th { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }
    tbody tr:nth-child(even) { background: rgba(255,255,255,.02); }
    tbody tr:hover { background: rgba(106,150,255,.06); }
    .navbtn.active { box-shadow: inset 2px 0 0 var(--accent); }
    .msg { padding: 6px 0; }
    .pill { background: rgba(255,255,255,.03); }
```

- [ ] **Step 3: Verify**

1. `npm run dev:server`, open `http://localhost:3000/admin`, log in.
2. Click through all eight sidebar views; exercise one list + one create + one update flow.
3. Run the server suites that cover admin endpoints: `npx jest server/api.test.ts server/e2e.test.ts server/api/contentRoutes.test.ts`

Expected: every form works exactly as before (only colors/spacing/hover changed); tests PASS.

- [ ] **Step 4: Commit**

```bash
git add server/admin/index.html
git commit -m "style(admin): focus states, table zebra, button hover — visual polish only"
```

---

## Phase 6 — Final verification

### Task 21: Full pass

- [ ] **Step 1: Automated checks**

```bash
npm test
npm run typecheck
cd client && npm run typecheck
```

Expected: all PASS.

- [ ] **Step 2: Manual player walkthrough** (`npm run dev:server` + `cd client && npm run web`)

1. Auth page = title page; log in.
2. Prologue: select a background, "Take up the pen ✒".
3. Story: prose writes itself (tap skips); notes pinned right (wide) / strip on top (narrow window — resize to check both).
4. Make a skill-check choice → previous step joins the journal, faded, with `(⚄ N — passed/failed)`.
5. Reload the page mid-session → journal intact (this is the spec's headline persistence requirement).
6. Fight: priority page → engage → returns to story; satchel note → ledger; merchant node → ledger + purse.
7. Reach an ending → epilogue page; continue if another route exists.
8. Vietnamese diacritics: `document.fonts.check('16px PatrickHand_400Regular', 'ữệạơ')` → `true`.

- [ ] **Step 3: Admin walkthrough** — all eight views render, one CRUD flow per the Playwright MCP test plan (`docs/superpowers/plans/2026-06-10-admin-content-playwright-mcp-test-plan.md`) still passes.

- [ ] **Step 4: Finish the branch** — invoke the superpowers:finishing-a-development-branch skill (merge/PR decision).

---

## Self-review notes (already applied)

- **Stamp duplication:** spec showed `InkStamp` for rolls/rewards on the Story page; rolls/rewards already render inside the last `JournalEntryView`, so Story omits stamps (Combat/Ending use them). Single source of truth on the page.
- **Cross-route `choiceLog`:** `continueToNextRoute` preserves `choiceLog`, so entries carry `routeId` and `buildJournal` filters to the current route; legacy entries (no `routeId`) fall back to node-existence checks.
- **`Rewards` import cycle:** `shared/types.ts` cannot import from `shared/engine/rewards.ts`; the log stores a `JournalReward` subset (gold/xp/itemIds) instead.
- **Defeat path:** the combat-defeat branch returns the pre-choice view (no log entry was persisted), so the journal correctly shows nothing for the fatal fight.
- **Jest scope:** `testMatch: **/*.test.ts` — components (`.tsx`) are intentionally untested; all testable logic (journal builder, choiceLog, migration, formatStats, revealCount) lives in `.ts` files.
