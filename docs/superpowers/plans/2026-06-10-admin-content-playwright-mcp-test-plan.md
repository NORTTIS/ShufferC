# Admin Content Authoring — Playwright MCP Test Plan

> **Purpose:** Drive the real admin console (`/admin`) through the **Playwright MCP** tools
> (`browser_navigate`, `browser_fill_form`, `browser_click`, `browser_select_option`,
> `browser_snapshot`, `browser_console_messages`, `browser_close`) to verify the
> content-authoring UI end-to-end: every `/admin/*` form, the reuse pickers, validation
> errors, builtin protection, and referential-integrity delete-blocks.
>
> This is an **agent-executed** plan (no jest/`@playwright/test` runner). Each step is a tool
> call + an assertion on the returned **accessibility snapshot text** (snapshots are more
> reliable than screenshots for assertions). Mark each `- [ ]` as you go.

## Why MCP (not a test-runner script)

The UI logic lives in inline `<script>` inside `server/admin/index.html` with no build step, so
it has no unit coverage. The backend is covered by jest (`server/api/contentRoutes.test.ts`,
`server/e2e.test.ts`). This plan covers the **browser glue**: form build/read round-trips,
pickers populated from the live registries, success/error message surfacing, and table refresh —
the things only a real browser exercises.

## Conventions

- **Assertion = snapshot text contains / does not contain** the expected string. After an action,
  call `browser_snapshot` (optionally `target` a container ref like `#attributes-msg`) and check
  the YAML text. For error/success messages, target the `#<resource>-msg` div.
- **Selectors that exist in the current UI** (verified):
  - nav: `.navbtn[data-view="attributes|effects|items|skills|enemies"]`
  - form field: `#<resource>-form .fld[data-key="<key>"]` (text/number/select)
  - role/skill checkbox: `#<resource>-form input[value="<value>"]`
  - statgrid cell: `#<resource>-form input[data-stat="<attrId>"]`
  - save / clear: `#<resource>-form button:has-text("Save")` / `:has-text("Clear")`
  - message div: `#<resource>-msg`
  - table row + actions: `#<resource>-body tr:has-text("<id>") button:has-text("Edit"|"Delete")`
  - effect-ref add button: `#<resource>-form button:has-text("+ effect")`; within a `.effectref`
    row: a `select`, `input.dur`, `input.mag`
  - drop add button (enemy reward): `button:has-text("+ drop")`; within a `.drop` row: a `select`
    + `input.chance`; gold/xp inputs: `.r-goldMin`/`.r-goldMax`/`.r-xp`
- **Credentials** (config defaults): `adminshufferc@gmail.com` / `admin12345678`.
- Treat a `favicon.ico` 404 console error as **benign**. A console error immediately following an
  intentional 400/409 fetch (e.g. a blocked delete) is the **expected** failed request, not a UI bug.

---

## Phase 0 — Environment setup

- [ ] **0.1 Start the server with memory stores (no real DB).**
  Run in background:
  `DATABASE_URL='' GEMINI_API_KEY='' npm run dev:server`
  Setting `DATABASE_URL=''` makes `config.databaseUrl` falsy → in-memory stores seeded from
  fixtures, so the run never touches the developer's real Postgres. (`dotenv` will not override an
  already-set env var.)
  Wait until the output file contains `listening` (poll the background task's output).
  Expected line: `... listening on http://localhost:3000` and `db: memory`.

- [ ] **0.2 Sanity navigate.**
  `browser_navigate("http://localhost:3000/admin")`
  Assert: page title `ShufferC Admin`; snapshot shows the login `#email`/`#password`/`#loginBtn`.
  (If the page closed, just re-navigate — the MCP browser sometimes drops the first tab.)

## Phase 1 — Auth & boot

- [ ] **1.1 Wrong credentials rejected.**
  `browser_fill_form` `#email`=`adminshufferc@gmail.com`, `#password`=`wrong`; `browser_click #loginBtn`.
  `browser_snapshot target="#loginMsg"` → contains `Invalid credentials`.

- [ ] **1.2 Correct login shows console + five content tabs.**
  Fill correct creds; click `#loginBtn`.
  `browser_snapshot` → sidebar contains nav buttons `Attributes`, `Effects`, `Items`, `Skills`,
  `Enemies` (and existing Routes/Novels/Status).

- [ ] **1.3 Token-boot repopulates pickers (regression for the boot `loadReg()` fix).**
  `browser_navigate("http://localhost:3000/admin")` again (token is in localStorage → console shows
  directly, no login). Click `.navbtn[data-view="items"]`.
  `browser_snapshot target="#items-form"` → the **Stat mods** grid shows `STR`…`CON` columns
  (proves `loadReg()` ran on boot, not only after a fresh login). If the grid is empty, the boot
  fix regressed.

## Phase 2 — Attributes (`/admin/attributes`)

- [ ] **2.1 List shows 6 builtins; builtins are delete-protected in the UI.**
  Click `.navbtn[data-view="attributes"]`. `browser_snapshot target="#view-attributes"`.
  Assert rows for `str/dex/int/wis/cha/con`; `con` roles cell = `core,defense,maxHp`; every builtin
  row has an `Edit` button and **no** `Delete` button.

- [ ] **2.2 Create a new attribute `armor` (role `defense`).**
  `browser_fill_form`: `#attributes-form .fld[data-key="id"]`=`armor`, `…[data-key="name"]`=`Armor`,
  `…[data-key="abbrev"]`=`ARM`, checkbox `#attributes-form input[value="defense"]`=true.
  Click Save. `browser_snapshot target="#attributes-msg"` → `Saved armor`.
  `browser_snapshot target="#attributes-body"` → row `armor … defense false` WITH a `Delete` button.

- [ ] **2.3 Validation: missing roles → 400 surfaced (not a crash).**
  Click Clear. Fill id=`bad`, name=`Bad`, abbrev=`BAD`, leave all role checkboxes unchecked. Save.
  `#attributes-msg` → contains `roles` (e.g. "roles must be a non-empty subset …"); no new `bad` row.

- [ ] **2.4 Builtin cannot be unlocked via edit (regression for the PUT builtin guard).**
  Click `Edit` on the `str` row, change Name to `Strength!`, Save.
  `#attributes-msg` → `Saved str`. `#attributes-body` row `str` → still shows `true` in the builtin
  column and still has **no** `Delete` button. (The PUT handler preserves `builtin:true`.)

## Phase 3 — Effects (`/admin/effects`)

- [ ] **3.1 List builtins.** Click `.navbtn[data-view="effects"]`; snapshot → rows
  `poison/regen/heal/attack_buff/defense_down/freeze/stun`, builtins have no Delete.

- [ ] **3.2 Archetype `statMod` reveals the Stat dropdown; create a statMod effect.**
  In `#effects-form`, set `.fld[data-key="archetype"]` = `statMod` (use `browser_select_option`).
  `browser_snapshot target="#effects-form"` → a Stat `<select>` (`.fld[data-key="stat"]`) is present
  with attribute options including `armor`. Fill id=`armor_up`, name=`Armor Up`, kind=`buff`,
  stat=`armor`, magnitude=`2`, duration=`3`. Save → `#effects-msg` `Saved armor_up`; row appears.

- [ ] **3.3 Create a `dot` effect (no stat needed).**
  Clear. archetype=`dot`, id=`bleed`, name=`Bleed`, kind=`dot`, magnitude=`2`, duration=`2`. Save →
  `Saved bleed`.

- [ ] **3.4 Builtin effect delete blocked.**
  (Builtins show no Delete button in the table — confirm `heal` row has Edit only.) The API-level
  builtin/refs block is covered separately in Phase 7.

## Phase 4 — Items (`/admin/items`) — the core reuse surface

- [ ] **4.1 Stat-mod grid reflects the live attribute registry incl. `armor`.**
  Click `.navbtn[data-view="items"]`. `browser_snapshot target="#items-form"` → Stat mods grid has
  `STR DEX INT WIS CHA CON ARM` (ARM proves the picker reads the registry that now includes `armor`).
  Also confirm On equip / On use each show a `+ effect` button, and Grants skills shows checkboxes
  `slash/freezeBolt/meditate`.

- [ ] **4.2 Create item `aegis` with an `armor` stat-mod.**
  Fill id=`aegis`, name=`Aegis`, slot=`armor` (`browser_select_option` on `.fld[data-key="slot"]`),
  kind=`gear`, `#items-form input[data-stat="armor"]`=`4`. Save → `#items-msg` `Saved aegis`; row
  `aegis … armor gear` appears.

- [ ] **4.3 effectrefs picker round-trips.**
  Clear. Fill id=`venomblade`, name=`Venom Blade`, slot=`weapon`, kind=`gear`. Click
  `#items-form button:has-text("+ effect")` under On equip. In the new `.effectref` row: select
  `poison` in the `select`, set `input.dur`=`3`, `input.mag`=`2`. Save → `Saved venomblade`.
  Re-open via the row's `Edit` and snapshot `#items-form` → the On-equip effect row is repopulated
  with `poison`, dur `3`, mag `2` (proves `fieldInput`↔`readField` round-trip for effectrefs).

- [ ] **4.4 Consumable with onUse.**
  Clear. id=`elixir`, name=`Elixir`, slot=`scroll`, kind=`consumable`, add an On use effect `heal`.
  Save → `Saved elixir`.

## Phase 5 — Skills (`/admin/skills`)

- [ ] **5.1 Create a skill with targetStat + effect.**
  Click `.navbtn[data-view="skills"]`. Fill id=`jab`, name=`Jab`, `targetStat`=`str` (select),
  `effectTarget`=`enemy`, power=`1`. Add an `effects` row referencing `bleed` (created in 3.3) with a
  duration. Save → `#skills-msg` `Saved jab`; row appears.

- [ ] **5.2 targetStat dropdown lists attributes (incl. armor).**
  Snapshot `#skills-form` → `.fld[data-key="targetStat"]` options include `armor`.

## Phase 6 — Enemies (`/admin/enemies`)

- [ ] **6.1 Create an enemy with a stat grid, skill priority, and a reward drop.**
  Click `.navbtn[data-view="enemies"]`. Fill id=`troll`, name=`Troll`, hp=`40`. In the stat grid set
  `str`=`8`, `con`=`6`, `armor`=`3` (uses the new attribute via `input[data-stat="armor"]`). Check
  skill `jab` in skill priority. In reward: `.r-goldMin`=`10`, `.r-goldMax`=`20`, `.r-xp`=`50`; click
  `+ drop`, select `aegis`, set `input.chance`=`0.5`. Save → `#enemies-msg` `Saved troll`; row appears.

- [ ] **6.2 Reward round-trip.** `Edit` the `troll` row; snapshot `#enemies-form` → gold `10`/`20`,
  xp `50`, drop `aegis` chance `0.5` repopulated.

## Phase 7 — Referential integrity & builtin blocks (cross-cutting)

These verify the DELETE guards surface the server's 400 message in the UI.

- [ ] **7.1 Attribute referenced by an item → blocked.**
  Attributes tab → `Delete` on `armor` (referenced by `aegis.statMods`, `troll.stats`).
  `#attributes-msg` → contains `referenced by` and `item:aegis.statMods` (and/or `enemy:troll.stats`).
  Row `armor` still present.

- [ ] **7.2 Effect referenced by an item/skill → blocked.**
  Effects tab → `Delete` on `bleed` (referenced by `jab.effects` and `venomblade`/item). `#effects-msg`
  → `referenced by` … `skill:jab.effects`. (If `bleed` ended up only on the item, expect the item ref.)

- [ ] **7.3 Skill referenced by an enemy → blocked.**
  Skills tab → `Delete` on `jab` (referenced by `troll.skillPriority`). `#skills-msg` → `referenced by`
  … `enemy:troll.skillPriority`.

- [ ] **7.4 Item referenced by an enemy drop → blocked.**
  Items tab → `Delete` on `aegis` (referenced by `troll.reward.drops`). `#items-msg` → `referenced by`
  … `enemy:troll.reward.drops`.

- [ ] **7.5 Unreferenced delete succeeds.**
  Delete `elixir` (created in 4.4, referenced by nothing). `#items-msg` empty/no error; row removed.

- [ ] **7.6 Teardown-order cleanup (optional, proves blocks clear once refs are gone).**
  Delete in dependency order: `troll` (enemy) → then `jab` (skill) → then `aegis`/`venomblade` (items)
  → then `armor`/`bleed`/`armor_up`. Each should now return 204 and the row disappears. This leaves
  the seed back at its 6 builtin attributes / 7 builtin effects.

## Phase 8 — Teardown

- [ ] **8.1** `browser_close`.
- [ ] **8.2** Stop the background dev-server task (`TaskStop`).
- [ ] **8.3** Confirm no stray `.playwright-mcp/` artifacts are staged (it is gitignored).

---

## Coverage map (scenario → what it proves)

| Area | Scenarios | Proves |
|---|---|---|
| Auth/boot | 1.1–1.3 | login gate, 401 message, token-boot `loadReg()` fix |
| Form build/read round-trip | 2.2, 3.2, 4.3, 6.2 | `fieldInput`↔`readField` for text/select/checkbox/statgrid/effectrefs/reward |
| Reuse pickers from live registry | 4.1, 5.2, 3.2 | statgrid + dropdowns reflect authored attributes/effects/skills |
| Validation surfacing | 2.3 | server 400 shown in `-msg`, no crash |
| Builtin protection | 2.1, 2.4, 3.1, 3.4 | no Delete on builtins; PUT cannot unlock builtin |
| Create/list/refresh | every Phase 2–6 create | table refresh + success message |
| Referential integrity | 7.1–7.5 | cross-store delete blocks with descriptors; unreferenced delete works |

## Notes / known limits

- This exercises the **memory-store** path. The pg adapters are not driven here (they need a migrated
  DB); they remain a separate coverage gap noted in the feature review.
- Selectors assume the current `index.html` structure (generic CRUD renderer). If the renderer markup
  changes, update the **Conventions** selector list once and the scenarios still hold.
- If a `browser_fill_form` can't target a `select` by `data-key`, use `browser_select_option` with the
  same selector; comboboxes are `<select>` elements here.
