# Book UI Redesign — Player "Living Journal" + Admin Polish

**Date:** 2026-06-10
**Status:** Approved design, pending implementation plan

## Goal

Redesign the player client so gameplay feels like a book being written as you play, with status/inventory panels rendered as pinned paper notes. Polish the admin console without changing its dashboard character.

Decisions made during brainstorming:

- Story screen style: **C — living journal** (continuous scroll; past entries fade above, new prose "writes itself" with an ink-cursor typewriter effect, chosen options become lines in the book).
- Notes style: **A — pinned margin notes** (always-visible note column beside the page; no drag-and-drop).
- Scope: **all 6 player screens** get the book treatment; Auth gets a light theme pass.
- Admin: **keep the dark dashboard, polish only** — no structural/form changes.
- Persistence: **journal survives reload** — rebuilt server-side from the save (option 3, minus draggable notes which conflict with notes style A).

## Part 1 — Client visual layer

### Theme tokens v2 (`client/src/theme/tokens.ts`)

- New palette: `deskWood` (dark wooden desk background), `pageParchment` (≈ `#f4ead6`), `inkPrimary` / `inkFaded` (dark/faded brown ink), `inkRed` (failed checks, stamps), note tones `noteYellow`, `noteBlue`, `notePink`.
- New tokens for paper shadows and small note rotations (±1–4°).

### Fonts (via `expo-font` + `@expo-google-fonts`)

- Serif for prose: **Crimson Pro** (has a Vietnamese subset).
- Handwriting for notes and choices: **Patrick Hand** (has a Vietnamese subset).
- Fallbacks: Georgia / cursive. Verify Vietnamese diacritics render correctly as the first implementation step; keep fallbacks if a font fails.

### Components (`client/src/components/`)

| Component | Role |
|---|---|
| `Desk` | replaces `Screen` — wooden desk background, page centered |
| `BookPage` | parchment sheet, worn edges, shadow |
| `InkProse` | typewriter text with ink cursor `▍`; tap reveals the rest instantly |
| `ChoiceLine` | choice as an italic handwritten line `❧ …`; press darkens ink; fight choices get `⚔` |
| `JournalEntryView` | faded past prose + italic `→ You chose: …` line (named to avoid clashing with the shared `JournalEntry` type) |
| `PaperNote` | pinned note, slight rotation, 3 color tones |
| `NoteRail` | right-hand note column on desktop; on mobile collapses to a small strip at the top, tap to expand |
| `InkStamp` | roll/reward results as a red/brown ink stamp on the page (e.g. `⚄ 17 — PASS`) |

Old components (`Button`, `Card`, `Tag`, `StatRow`, …) are replaced incrementally; delete the ones no flow uses anymore.

### Animation

Plain React Native `Animated` only (typewriter = timer slicing the string; note fade-in; new page section slides up slightly). No additional animation libraries.

## Part 2 — Journal persistence (server + shared)

### Extend `choiceLog` (`shared/types.ts`)

```ts
choiceLog: {
  nodeId: string;
  choiceId: string;
  roll?: number;          // new
  checkPassed?: boolean;  // new
  reward?: Rewards;       // new (gold/xp/itemIds)
}[]
```

- `resolveChoice` in `shared/engine/story.ts` already appends to `choiceLog`; it now also records the three result fields. Pure logic, no I/O.
- Bump `SAVE_VERSION` and extend the migration in `shared/engine/save.ts`. Old entries simply lack the optional fields — no DB schema change (saves are JSON blobs).

### Build the journal at view time (`server/session.ts`)

`SessionView` gains:

```ts
interface JournalEntry {
  prose: string;        // node prose at that step (with liveNodes overlay applied)
  chosenText: string;   // text of the chosen option (overlay applied)
  roll?: number; checkPassed?: boolean; reward?: Rewards;
}
journal: JournalEntry[];
```

- The journal builder is a pure function in `shared/engine/` (takes route + save, returns the journal) so it is testable without I/O. The server walks `choiceLog`, looks up each node in the route, applies the `liveNodes` overlay when present, and extracts prose + chosen-choice text.
- **No new endpoints** — `SessionView` just grows, so every screen receives the journal through `GET /sessions/:id` and choice responses.
- Edge case: a node edited/deleted by an admin after the player passed it → lookup miss → skip that entry (journal shortens; never crashes).
- Starting a new route opens a "new chapter": `choiceLog` resets per route, so the previous route's journal is not carried over (accepted).

### Client (`client/src/services/api.ts` + `useGameSession`)

- `SessionView` type gains `journal`. `useGameSession` does not accumulate anything itself — screens render `view.journal` plus the current node.
- The typewriter effect runs only for the current node's prose; journal entries render static and faded.
- Reload / `continueRoute` → journal is rebuilt from the save → the book stays intact.

## Part 3 — Screens, admin polish, testing

### Player screens (logic unchanged, visuals replaced)

| Screen | Treatment |
|---|---|
| `Story` | faded journal above → new prose writes itself → `ChoiceLine`s. `NoteRail` on the right: yellow note (HP/stats), blue note (inventory — tap opens Inventory), pink note (reputation), plus a "merchant is here" note when the node has a merchant |
| `Combat` | "battle account" page: skill priority as a list of handwritten lines with tap ▲▼ reordering; combat log writes line by line; result stamped with `InkStamp` |
| `Inventory` | the yellow note expands into a ledger page: equipment slots + handwritten item list; equip/use marks/strikes the line |
| `Shop` | merchant's ledger: handwritten price table; a purchase strikes the line through and the gold note updates |
| `CharCreate` | the book's first page: "Prologue", background selection as choosing an epigraph, start button = "Take up the pen ✒" |
| `Ending` | final page: "Epilogue" + `InkProse`, button "Write a new story" |
| `Auth` | light theme pass only (form on paper); no logic changes |

### Admin polish (`server/admin/index.html`, stays a dark dashboard)

- Upgrade typography and the spacing scale, table zebra/hover, input focus states, clear button hierarchy (primary/secondary/danger), consistent status-pill colors, more visible ok/error messages.
- **No structural form changes, no id/element changes** — existing e2e tests and the CLAUDE.md endpoint↔form rule remain satisfied.

### Testing

- `shared/engine`: tests for the journal builder (route + save → journal; live-node overlay; deleted node → skipped), for `resolveChoice` writing roll/reward into `choiceLog`, and for migrating old saves.
- Client: tokens v2 tests; extract the typewriter chunking logic into a pure function and test it; `tsc --noEmit` on both client and server.
- Existing admin e2e tests must pass unchanged. Player UI verified by running expo web.

### Risks / mitigations

- Handwriting font must render Vietnamese diacritics — verify first, keep fallback fonts.
- Long prose vs. typewriter — tap-to-skip plus a fast reveal speed.
- Old saves — all new `choiceLog` fields optional; migration adds nothing destructive.

## Out of scope

- Carrying the journal across routes (previous chapters).
- Draggable/free-positioned notes, sound effects, page-turn 3D animations.
- Any admin endpoint or form behavior changes.
