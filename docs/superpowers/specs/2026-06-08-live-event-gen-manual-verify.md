# Live event-gen (C3) — manual verification

Goal: prove a node marked **live** gets its prose + choice text rewritten by Gemini Flash on
arrival, gets cached per-save, and degrades silently to stub text when the provider is off.

Default (no `DATABASE_URL`) the server runs in-memory and seeds `SAMPLE_BUNDLE`
(route id `demo-route` — "The Guarded Keep", nodes `n1`/`n2`/`n3`).

---

## 0. Setup

1. Put a real key in the root `.env` (gitignored — never commit it):

   ```
   GEMINI_API_KEY=<your key>
   ```

2. Start the server:

   ```powershell
   npm run dev:server
   ```

3. Confirm the boot line says the provider is on:

   ```
   AI provider available: true · embedder available: true · db: memory
   ```

   If it says `false`, the key isn't loaded — fix `.env` before continuing.

---

## 1. Mark a node live (browser — admin console)

1. Open `http://localhost:3000/admin`, log in
   (`ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`, defaults `adminshufferc@gmail.com` / `admin12345678`).
2. Routes card → open **demo-route** ("The Guarded Keep").
3. In the node list, find **n1** (`You reach a guarded gate.`, 2 choices) → click **Mark live**.
4. Expect a green success message; the node now shows source `live`.

---

## 2. (Optional) Ground the prose with RAG

Without a novel the prompt still runs but the prose is generic. To see grounded prose:

1. Admin console → Novels card → paste a title + a few paragraphs → **Ingest**.
2. (Live enrichment reads RAG context automatically on arrival; nothing else to wire.)

---

## 3. Play and observe the rewrite (PowerShell — player REST)

```powershell
$base = 'http://localhost:3000'

# pick any background id
$bg = (Invoke-RestMethod "$base/backgrounds")[0].id

# new game on the demo route — n1 is the start node, so it enriches immediately
$r = Invoke-RestMethod -Method Post "$base/sessions" `
     -ContentType 'application/json' `
     -Body (@{ backgroundId = $bg; routeId = 'demo-route' } | ConvertTo-Json)

$r.node.prose            # EXPECT: rewritten, NOT "You reach a guarded gate."
$r.node.choices.text     # EXPECT: rewritten labels (still 2 choices, ids fight/sneak)
```

Pass = prose differs from the stub and there are still exactly 2 choices with the
same ids (`fight`, `sneak`) and same targets — only the wording changed.

### Cache check (same save → no re-gen)

```powershell
$r.save.liveNodes.n1     # EXPECT: { prose = ...; choiceTexts = (...) } cached
Invoke-RestMethod "$base/sessions/$($r.save.routeId)"  # not needed; cache lives in the save
```

The overlay is stored in `save.liveNodes.n1`; subsequent views of n1 reuse it (no second LLM call).

---

## 4. Mechanics are untouched (the core invariant)

Play the `sneak` choice and confirm the graph still routes n1 → n3:

```powershell
$after = Invoke-RestMethod -Method Post "$base/sessions/$($r.save.routeId)/choice" `
         -ContentType 'application/json' `
         -Body (@{ choiceId = 'sneak'; skillPriority = @() } | ConvertTo-Json)
$after.save.currentNodeId   # EXPECT: n3
```

Live-gen must never change edges, skill checks, combat, or outcomes — only prose + choice wording.

---

## 5. Graceful degradation

Either path must show the **stub** text with no error and no 503:

- **Toggle off:** admin console → n1 → **Mark pregen** → start a fresh game →
  `$r.node.prose` is back to `You reach a guarded gate.`
- **No key:** stop server, remove `GEMINI_API_KEY` from `.env`, restart
  (boot line now `provider available: false`) → start a fresh game with n1 marked live →
  prose falls back to the stub, game still playable.

---

## Pass criteria

- [ ] Boot line shows `provider available: true` with a key.
- [ ] Marking n1 live + new game → prose and choice labels rewritten.
- [ ] Still exactly 2 choices, ids `fight`/`sneak`, same targets.
- [ ] `save.liveNodes.n1` holds the cached overlay.
- [ ] `sneak` still routes to `n3` (mechanics intact).
- [ ] Mark pregen → stub prose returns.
- [ ] No key → stub prose, no crash, no 503.
