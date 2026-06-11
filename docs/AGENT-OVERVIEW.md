# ShufferC: AI Chronicles — Tổng quan cho AI Agent

> File này tóm tắt toàn bộ spec trong `docs/superpowers/specs/` để AI agent nắm nhanh dự án.
> Nguồn chi tiết: xem mục **§10. Chỉ mục spec** ở cuối file.
> Cập nhật lần cuối: 2026-06-11.

---

## 1. Dự án là gì

**ShufferC: AI Chronicles** — game **text-RPG single-player** kiểu "Life in Adventure":
người chơi tạo nhân vật, đọc truyện, chọn lựa chọn (có skill-check d20), đánh quái
(auto-battler), nhặt đồ, mua đồ, đi hết tuyến truyện → kết. Điểm đặc biệt: **AI (Gemini)
sinh cốt truyện** từ tiểu thuyết do admin nạp vào (RAG + pgvector).

- Mục tiêu: **đồ án / học tập** — ưu tiên đầy đủ tính năng + kiến trúc rõ ràng, không tối ưu chi phí/scale.
- Single-player hoàn toàn → **chỉ REST, không WebSocket**.
- Nội dung 13+, kiểm duyệt tối thiểu (`moderate()` no-op + banned-word list, có khe cắm Gemini safety sau).

**Tech stack:** React Native + Expo + TypeScript (client) · Node + Express + TS (server) ·
Supabase (Postgres + `pgvector` + Auth) · Drizzle ORM · Gemini (Pro = sinh khung, Flash = sinh live,
`gemini-embedding-001` 1536-dim = embedding) · Zod · jose (JWT) · Jest.

---

## 2. Kiến trúc & nguyên tắc bất biến

```
shared/    ❤️ trái tim — TS thuần, KHÔNG phụ thuộc AI/DB/UI, test deterministic
  types.ts constants.ts fixtures.ts backgrounds.ts validation.ts
  effects/registry.ts   engine/{dice,effects,character,combat,save,rewards,story}.ts
server/    Node + Express
  config.ts (NƠI DUY NHẤT đọc env)  index.ts (bootstrap, chọn adapter)  api.ts (1 lớp REST)
  session.ts (GameSession orchestration)  auth.ts (admin token)
  ai/{provider,gemini,schema,prompt,moderate,frameworkGen,eventGen}.ts
  rag/{chunk,embeddingProvider,novelStore,ingest,retrieve}.ts
  db/{client,schema,migrations}  store/{RouteStore,SaveStore,memory*,pg*}.ts
  admin/index.html (admin console — 1 file HTML tĩnh, vanilla JS)
client/    RN + Expo
  src/config.ts  services/api.ts (gameApi + ApiError)  assets.ts (ASSETS registry)
  theme/tokens.ts  components/  hooks/{useGameSession,useAuth,useResponsive}
  screens/{Auth,CharCreate,Story,Combat,Inventory,Shop,Ending}
```

**Nguyên tắc bất biến (KHÔNG ĐƯỢC VI PHẠM):**
1. Env vars chỉ đọc ở `server/config.ts` / `client/src/config.ts`. Không `process.env` rải rác.
2. Type/constant dùng chung chỉ ở `shared/`. Không định nghĩa lại cục bộ.
3. REST call chỉ qua `client/src/services/api.ts` (`gameApi`, ném `ApiError` có `.status`).
4. Logic thuần (engine/dice/combat/effects/validation/rag chunk+retrieve) tách khỏi I/O.
5. Store nằm sau **port + adapter**: interface (`RouteStore`/`SaveStore`/`NovelStore`/
   `EmbeddingStore`/`PlayerAuthStore`) với adapter memory (test/dev) + pg (Supabase).
   `index.ts` chọn theo `DATABASE_URL` / env Supabase.
6. Sprite/sfx chỉ qua `ASSETS` registry. Không inline `require()`/emoji literal.
7. Screen lớn → folder-pattern: file screen là "glue", tách `styles.ts` + sub-components.
8. Không raw hex / magic spacing trong screen — mọi giá trị visual từ `theme/tokens.ts`.
9. **Mỗi endpoint `/admin/*` mới/sửa PHẢI có form tương ứng trong `server/admin/index.html`**
   (admin test qua browser tại `http://localhost:3000/admin`, không curl).
10. Secrets (`DATABASE_URL`, API keys) chỉ ở `.env` (gitignored), không commit.

**Server authoritative:** server giữ `SaveState` + chạy engine; client thin — chỉ render + replay log.

---

## 3. Cơ chế game (engine `shared/`)

### 3.1 Nhân vật & chỉ số
- 6 chỉ số kiểu D&D: `str dex int wis cha con` (`Stats = Record<string, number>` —
  sau spec content-authoring, attribute là data-driven với **role**: `core` / `defense` / `maxHp`;
  con mặc định giữ cả 3 role → giữ behavior cũ).
- Tạo nhân vật: chọn **preset background** (rogue / fighter / mage trong `shared/backgrounds.ts`)
  → baseStats + inventory + equipped + skillPriority khởi đầu.
- `effectiveStats` = baseStats + `statMods` từ item đang trang bị.
- Max HP = `BASE_HP + Σ(stats có role maxHp) * HP_PER_CON`. `vitals.currentHp` **giữ nguyên
  giữa các trận trong 1 route**, reset full khi sang route mới.

### 3.2 Xúc xắc d20 — hệ số hiệu lực, KHÔNG phải pass/fail
- `faceToMultiplier(face) = 0.10 + (face-1)/19 * 1.90` → mặt 1 = ×0.10, mặt 20 = ×2.00, tuyến tính.
- Mọi randomness qua RNG **có seed** (`mulberry32`, `save.seed`, `START_SEED = 7`) →
  **deterministic**: cùng seed + cùng input ⇒ cùng kết quả ⇒ test chắc, client replay khớp server 100%.

### 3.3 Chiến đấu — auto-battler theo lượt + skill-priority
- Người chơi **xếp thứ tự ưu tiên skill TRƯỚC trận**; trong trận không can thiệp.
- Mỗi lượt: actor bị `control` (freeze/stun) → mất lượt; ngược lại dùng **skill khả dụng đầu
  tiên theo priority** → roll d20 → nhân multiplier vào sát thương/hiệu lực → áp effect → tick status.
- Defense = `floor(Σ stats role 'defense' / 2)`.
- Output `CombatResult { winner, log }` — client **replay log bán tự động** (không tự tính).
- Thắng → advance node + nhận thưởng; thua → `ending: 'defeat'` (terminal).

### 3.4 Effect — registry archetype, AI/admin chỉ lắp ghép
- 4 **archetype interpreter** trong code: `dot` (poison), `hot` (regen/heal, có `instant`),
  `statMod` (buff/debuff, đảo ngược khi hết hạn), `control` (freeze/stun → mất lượt).
- Admin tạo **EffectTemplate** (data: archetype + stat + magnitude + duration) — không code mới,
  không DSL. Skill/Item chỉ **tham chiếu effect theo id**.

### 3.5 Item, thưởng, shop
- Item: `kind: 'gear' | 'consumable'`; slot `weapon|armor|ring|scroll|quest`;
  `statMods`, `onEquip` (status khi trang bị), `onUse` (dùng tiêu hao), `grantsSkills`, `cost`, `storyTags`.
- Gear → `inventory: string[]`; consumable → `consumables: Record<itemId, qty>` (hết 0 thì xóa key).
- **Kill rewards** (`shared/engine/rewards.ts`, thuần + seeded RNG): gold (khoảng min..max),
  XP (track `xp`/`level`, chưa wire tăng stat), drops (chance 0..1), reputation delta per-enemy.
- **Shop**: merchant gắn vào node (`node.merchant.stock`), admin set stock; player **buy-only**
  qua `GET /sessions/:id/shop` + `POST /sessions/:id/buy` (check gold, 400 nếu thiếu).
- **Dùng consumable**: `POST /sessions/:id/use` — heal chỉnh `currentHp` (clamp), buff vào
  `pendingBuffs` áp 1 lần ở đầu trận kế tiếp. Không dùng item giữa trận.

### 3.6 Truyện, route, chuỗi route
- `StoryNode { prose, choices[], combat?, merchant?, source: 'pregen'|'live' }`.
- `Choice { text, skillCheck?{stat,dc}, outcome? (đổi stat/rep/item/flag), nextNodeId? }`.
- Luật giải choice: có `skillCheck` → roll d20 check; node có `combat` + choice không check → đánh;
  còn lại → áp outcome + advance. Node `choices: []` = node kết.
- `GameRoute { acts[], itemPool, enemyPool, endings, status: 'draft'|'published' }`.
  Điều kiện ending bị ràng buộc dạng `currentNodeId === <id>`.
- **Chuỗi route ngẫu nhiên**: bắt đầu game → random 1 route published; đến ending → nút
  **Continue** sang route published chưa chơi (giữ nguyên nhân vật/đồ/rep/seed,
  `playedRouteIds` chống lặp); hết route → **màn finale** tổng kết run.
- `SaveState` chứa: routeId, character, reputation (hero/villain/factions), choiceLog
  (kèm roll/checkPassed/reward — nguồn dựng journal), currentNodeId, seed, gold/xp/level,
  consumables, vitals, playedRouteIds, liveNodes. Versioned (`SAVE_VERSION`) + migration.

---

## 4. Pipeline AI (hybrid: khung pre-gen có duyệt + chi tiết live)

1. **RAG ingest (C2):** admin upload tiểu thuyết → `chunkText` (size ≈1200, overlap ≈200) →
   embed Gemini 1536-dim → lưu `novel_chunks` pgvector (HNSW, cosine). `retrieveContext`
   trả top-k chunk làm context.
2. **Sinh khung (C1, Gemini Pro):** `generateFramework` — prompt + JSON schema (Zod là nguồn
   shape duy nhất) → Zod parse → `validateRouteBundle` (thuần: ref enemy/item phải có trong
   registry, graph không dangling, BFS reachability, ≥1 ending reachable + terminal) →
   `moderate` prose → fail thì retry kèm lỗi (max 3) → thành draft → **admin duyệt → publish**.
3. **Sinh live (C3, Gemini Flash):** node admin đánh dấu `source:'live'` được enrich khi
   player đến lần đầu: Flash viết lại **CHỈ prose + text lựa chọn** (cấu trúc edges/skillCheck/
   combat/outcome KHÔNG ĐỔI), grounded bằng RAG + choiceLog gần đây. Cache per-save vào
   `save.liveNodes`. Lỗi/không có key → **fallback im lặng về text stub**, không bao giờ 503 với player.
- `AIProvider` interface + `FakeProvider` (test, script response queue) — **test không bao giờ
  chạm network**; Gemini thật chỉ smoke-test thủ công. Không có key server vẫn boot
  (`available:false`, endpoint gen của admin trả 503).

---

## 5. Thiết kế giao diện — Player: "Living Journal" (sách đang được viết)

Hai đợt thiết kế: v1 "dark fantasy tome" (2026-06-08) → **v2 "book UI / living journal"
(2026-06-10, hiện hành)**. Cảm giác: cuốn sách tự viết khi bạn chơi, panel trạng thái là
giấy note ghim bên lề.

### 5.1 Màu sắc (theme tokens v2 — `client/src/theme/tokens.ts`)
| Token | Giá trị / mô tả | Dùng |
|---|---|---|
| `deskWood` | gỗ bàn tối | nền app (mặt bàn) |
| `pageParchment` | ≈ `#f4ead6` | trang giấy da |
| `inkPrimary` / `inkFaded` | mực nâu đậm / nhạt | chữ hiện tại / nhật ký cũ |
| `inkRed` | mực đỏ | check FAIL, con dấu (InkStamp) |
| `noteYellow` / `noteBlue` / `notePink` | giấy note | HP-stats / inventory / reputation |
| + shadow giấy, xoay note ±1–4° | | |

Tham khảo palette v1 (vẫn dùng cho phần dark): nền `#16110d`, panel `#211a13`, chữ `#ece3d0`,
gold accent `#c8a24a` (dim `#7a6531`), danger `#b0432f`, mana `#4a6fa5`, success `#5b8a4a`.

### 5.2 Typography & layout
- Prose: serif **Crimson Pro**; note + lựa chọn: chữ viết tay **Patrick Hand**
  (cả hai có subset tiếng Việt — PHẢI kiểm tra dấu tiếng Việt; fallback Georgia/cursive).
- Số liệu: `tabular-nums`. Scale chữ v1: display 28 / title 22 / heading 18 / body 16 (lh 24) / label 13 / caption 12.
- Spacing 4-base: xs4 sm8 md12 lg16 xl24 xxl32. Radii: sm6 md10 lg16.
- Responsive (`useResponsive`): <700px = 1 cột; ≥700px = cột đọc giữa `maxWidth 680`;
  ≥1000px = thêm **NoteRail** bên phải (mobile thu thành dải trên cùng, tap mở rộng).

### 5.3 Component chính (`client/src/components/`)
`Desk` (nền gỗ, page giữa) · `BookPage` (giấy da, viền sờn, bóng) · `InkProse` (typewriter +
con trỏ mực `▍`, tap hiện hết) · `ChoiceLine` (dòng viết tay nghiêng `❧ …`, fight có `⚔`) ·
`JournalEntryView` (prose cũ mờ + `→ You chose: …`) · `PaperNote` + `NoteRail` ·
`InkStamp` (kết quả roll/thưởng dạng con dấu, vd `⚄ 17 — PASS`).
Animation: chỉ RN `Animated` thuần (typewriter, fade, slide nhẹ) — không thêm lib.

### 5.4 Các màn
| Màn | Cách thể hiện |
|---|---|
| Auth | form trên giấy (light); đăng nhập/đăng ký thật qua Supabase (xem §7) |
| CharCreate | "Prologue" — trang đầu sách, chọn background như chọn đề từ, nút "Take up the pen ✒" |
| Story | nhật ký mờ phía trên → prose mới "tự viết" → ChoiceLine; NoteRail: note vàng (HP/stats), xanh (inventory → mở Inventory), hồng (reputation), note "merchant is here" khi node có shop |
| Combat | trang "biên bản trận đánh": xếp priority bằng ▲▼, log viết từng dòng, kết quả đóng dấu InkStamp |
| Inventory | sổ cái: slot trang bị + danh sách viết tay; equip/use gạch dòng |
| Shop | sổ giá của thương nhân; mua xong gạch dòng + note vàng cập nhật |
| Ending | "Epilogue" + InkProse; nút "Write a new story"; 3 nhánh: Continue (còn route) / Defeat / Finale (tổng kết run) |

**Journal bền vững:** dựng lại server-side từ `choiceLog` (pure function trong `shared/engine/`,
áp overlay liveNodes) → trả trong `SessionView.journal` — reload không mất sách. Typewriter
chỉ chạy cho node hiện tại; node bị admin xóa → skip entry, không crash.

### 5.5 Admin console — dark dashboard, KHÔNG đổi cấu trúc
- 1 file `server/admin/index.html` (vanilla HTML+CSS+JS, không build step), tại `GET /admin`.
- Pattern bắt buộc: card + table + `loadX()/doX()` + helper `api()`/`authHeaders()` +
  message ok/error rõ ràng + refresh table sau mutation + 401→logout + messaging 503/400.
- Chỉ polish (typography, zebra/hover, focus, button hierarchy, status pill) — không đổi id/form.
- Chức năng: login · trạng thái provider Gemini · generate route (title/nodeCount/context hoặc
  novelId) · bảng routes (publish/view JSON) · toggle node live/pregen · merchant stock per node ·
  quản lý novels (ingest/list/delete) · CRUD Attributes/Effects/Items/Skills/Enemies (form có
  picker sinh từ registry, chặn xóa khi còn tham chiếu / builtin).

---

## 6. REST surface (tóm tắt)

**Player** (yêu cầu `Authorization: Bearer <JWT>` trừ `/backgrounds`, `/auth/*`):
`GET /backgrounds` · `POST /sessions {backgroundId, routeId?}` · `GET /sessions/:id` ·
`POST /sessions/:id/choice {choiceId, skillPriority?}` · `POST /sessions/:id/equip` ·
`POST /sessions/:id/continue` · `GET /sessions/:id/shop` · `POST /sessions/:id/buy` ·
`POST /sessions/:id/use` · `GET /saves` (save của user) ·
`POST /auth/register|login|refresh`.

**Admin** (Bearer token riêng từ `POST /admin/login`, credentials trong env, in-memory Set):
`GET /admin` (trang HTML) · `GET /admin/status` · `POST /admin/routes/generate`
(200 / 422 lỗi validate / 503 không có key) · `GET /admin/routes[/:id]` ·
`POST /admin/routes/:id/publish` · `POST /admin/routes/:id/nodes/:nodeId/source` ·
`POST /admin/routes/:id/nodes/:nodeId/merchant` · CRUD `/admin/novels` ·
CRUD `/admin/{attributes,effects,items,skills,enemies}`.

Lỗi: JSON `{error}` + status; `GameError(message, status)` server-side; client ném `ApiError{.status}`.
Quy ước: 400 input sai, 401 chưa auth, 404 không tồn tại/không sở hữu (không lộ tồn tại),
409 conflict (route draft, hết route, email trùng), 422 AI gen fail, 503 thiếu provider/DB.

---

## 7. Auth & DB

- **Player auth (mới nhất, branch `feature/player-auth-supabase`):** Supabase Auth qua
  **server proxy** — client chỉ gọi REST của mình; server gọi GoTrue REST (signup / password /
  refresh_token grant). Verify JWT **local** bằng `jose` (JWKS cached, fallback HS256
  `SUPABASE_JWT_SECRET`). Port `PlayerAuthStore` + adapter `supabasePlayerAuth` / `memoryPlayerAuth`
  (fallback khi thiếu env — không bao giờ 503). Email confirm OFF, không guest, không reset password.
  Client chỉ lưu session `shufferc_session` {token, refreshToken, user} — không lưu password.
  Save gắn `user_id`; mọi `/sessions/:id*` check ownership (sai → 404).
- **Admin auth:** đơn giản có chủ đích — `ADMIN_EMAIL`/`ADMIN_PASSWORD` từ env, token UUID
  in-memory không hết hạn. CHỈ chấp nhận cho local/học tập, không phải production.
- **DB (Supabase Postgres, Drizzle, route/save lưu nguyên JSONB):** `game_routes(bundle jsonb)` ·
  `save_states(save jsonb, user_id uuid)` · `novels` · `novel_chunks(embedding vector(1536), HNSW)`
  · bảng content `attributes/effects/items/skills/enemies` (seed từ fixtures lần đầu).
  Không `DATABASE_URL` → chạy memory mode, seed `SAMPLE_BUNDLE` (route `demo-route`
  "The Guarded Keep", nodes n1/n2/n3, choices `fight`/`sneak`).

---

## 8. Triết lý test

- Logic thuần test kỹ (Jest, deterministic nhờ seeded RNG — assert giá trị cụ thể, không flaky);
  I/O test mỏng (supertest cho REST shape/status).
- **Zero network trong Jest**: `FakeProvider` (queue response script được retry path),
  `createFakeEmbedder`; Gemini thật chỉ smoke-test thủ công (có file manual-verify cho live-gen).
- pg adapter: 1 integration test guard theo `DATABASE_URL`.
- Mọi thay đổi phải giữ suite cũ xanh (fixtures = seed, back-compat có chủ đích).
- Quy trình: brainstorm → spec (`docs/superpowers/specs/`) → plan → TDD → verify trước khi claim done.

---

## 9. Trạng thái hiện tại (2026-06-11)

Đã xong: A engine · B vertical slice · C1 framework-gen · C2 RAG+DB · C3 live-gen ·
admin auth+console · chain routes · rewards/shop/items · player UI v1+v2 (book) ·
admin content authoring. Đang làm: **player auth Supabase** (branch `feature/player-auth-supabase`).
Chưa làm/deferred: stat growth từ XP, sell-back, journal xuyên route, password reset,
social login, sprite/audio thật, cân bằng số (Sub-project E).

## 10. Chỉ mục spec (`docs/superpowers/specs/`)

| File | Nội dung |
|---|---|
| `2026-06-05-life-in-adventure-ai-chronicles-design.md` | Thiết kế tổng + Sub-project A (engine) |
| `2026-06-07-sub-project-b-vertical-slice-design.md` | Vertical slice: REST + session + 4 màn |
| `2026-06-07-sub-project-c-framework-gen-design.md` | C1: AI sinh khung route + validator |
| `2026-06-07-admin-auth-ui-design.md` | Admin login + console HTML |
| `2026-06-08-rag-db-design.md` | C2: Supabase/Drizzle/pgvector + RAG ingest/retrieve |
| `2026-06-08-live-event-gen-design.md` (+ `-manual-verify.md`) | C3: Flash enrich node live |
| `2026-06-08-chain-random-routes-design.md` | Chuỗi route ngẫu nhiên + finale |
| `2026-06-08-player-ui-design.md` | UI v1: dark fantasy tome, tokens, primitives |
| `2026-06-09-rewards-shop-items-design.md` | Kill rewards + shop + item function |
| `2026-06-09-admin-content-authoring-design.md` | CRUD attribute/effect/item/skill/enemy |
| `2026-06-10-book-ui-redesign-design.md` | UI v2: living journal + paper notes |
| `2026-06-11-player-auth-supabase-design.md` | Player auth Supabase + saves theo user |
