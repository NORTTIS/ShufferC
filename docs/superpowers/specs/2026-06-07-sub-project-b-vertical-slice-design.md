# Sub-project B: Vertical Slice — Design Doc

> Phần tiếp theo của "Life in Adventure: AI Chronicles" sau **Sub-project A (Engine Core)**.
> Mục tiêu: chơi hết **1 tuyến hardcode end-to-end** qua client RN ↔ REST ↔ engine `shared/`, chứng minh luồng chạy thông.
> Ngày: 2026-06-07. Phụ thuộc: A (đã hoàn thành, 44 unit test xanh).

---

## 0. Quyết định đã chốt (decision log)

| # | Vấn đề | Quyết định |
|---|--------|-----------|
| 1 | Lưu trữ save | **Defer Supabase.** Lưu sau interface `SaveStore`; impl `memoryStore` (in-memory, optional file dump). Swap Supabase ở sub-project sau, không đổi caller. |
| 2 | Phạm vi luồng | **Lõi + inventory.** Màn: tạo nhân vật, truyện, combat, inventory/trang bị. **Bỏ**: auth, chọn-nhiều-tuyến, epilogue AI. |
| 3 | Nơi chạy engine | **Server authoritative.** Server giữ `SaveState` + chạy engine (`runCombat`/`resolveChoice`), trả kết quả/log. Client thin: render + replay log. |
| 4 | Tạo nhân vật | **Preset backgrounds.** Hardcode vài xuất thân trong `shared/backgrounds.ts`; client chọn 1. Point-buy để E. |
| 5 | Combat trigger | Suy ra từ data có sẵn (không sửa engine types): choice **có** `skillCheck` = path không-combat; node **có** `combat` + choice **không** `skillCheck` = path "fight". |

---

## 1. Mục tiêu & phạm vi

### 1.1 In scope
- `shared/backgrounds.ts`: preset xuất thân (rogue/fighter/mage) → `baseStats` + inventory + equipped + skillPriority.
- `server/`: HTTP bootstrap + 1 lớp REST (5 endpoint) + `GameSession` orchestration + `SaveStore` abstraction (`memoryStore`).
- `client/`: RN + Expo — `gameApi` (1 lớp REST), `useGameSession` hook, 4 màn (CharCreate / Story / Combat / Inventory), `ASSETS` registry (placeholder sprite).
- Unit test: `backgrounds`, `session` (core), `api` (shape/status), `client/services/api`; E2E ở tầng session.

### 1.2 Out of scope (sub-project sau)
- AI/Gemini/RAG, ingest tiểu thuyết (C).
- Supabase/Postgres/Drizzle/pgvector, auth thật (C+).
- Admin CMS (D).
- Epilogue AI, hệ thống reputation/ending đầy đủ, chọn nhiều tuyến, point-buy, ảnh sprite thật, đánh bóng UI (E).

### 1.3 Tiêu chí chấp nhận
1. `POST /sessions` với `backgroundId` hợp lệ → tạo `SaveState` đúng từ preset, trả node bắt đầu.
2. Chơi hết tuyến demo qua client: CharCreate → Story → (fight → Combat replay | sneak → skill-check) → node kết.
3. Path "fight": thắng → advance `nextNodeId`; thua → `ending: 'defeat'`.
4. Path "sneak" (skillCheck): trả `roll` + `checkPassed`, áp outcome, advance.
5. `POST /equip` đổi `equipped` → `effectiveStats` đổi đúng (cộng/gỡ statMods).
6. Cùng `seed` + cùng input ⇒ combat log server giống hệt ⇒ client replay khớp.
7. Session không tồn tại → REST trả `404`; fight thiếu `skillPriority` → `400`.
8. E2E test (tầng session) đi hết tuyến demo (cả nhánh sneak và fight).

---

## 2. Kiến trúc & cấu trúc thư mục

Kế thừa nguyên tắc bất biến §1 của design tổng (mathup carry-over).

```
ShufferC/
├── shared/                    # ✓ engine A (dùng lại nguyên, không sửa)
│   └── backgrounds.ts         # MỚI: preset xuất thân
├── server/                    # Node + TS
│   ├── config.ts              # 1 nơi đọc env (PORT...)
│   ├── index.ts               # HTTP bootstrap (Express)
│   ├── api.ts                 # định nghĩa REST routes (5 endpoint)
│   ├── session.ts             # GameSession: glue engine (choice→combat→advance)
│   └── store/
│       ├── SaveStore.ts       # interface (create/get/put)
│       └── memoryStore.ts     # impl in-memory (Map; optional file dump)
├── client/                    # RN + Expo
│   └── src/
│       ├── config.ts          # đọc env (API base URL)
│       ├── services/api.ts    # gameApi + ApiError (1 lớp REST)
│       ├── assets.ts          # ASSETS registry (sprite key → placeholder)
│       ├── hooks/
│       │   └── useGameSession.ts
│       └── screens/
│           ├── CharCreate/
│           ├── Story/
│           ├── Combat/
│           └── Inventory/
└── docs/
```

**Nguyên tắc bất biến (không vi phạm):**
1. Env vars → chỉ ở `server/config.ts` (server) và `client/src/config.ts` (client). Không `process.env` rải rác.
2. Type/constant dùng chung → chỉ ở `shared/`. Không định nghĩa lại cục bộ.
3. REST call → chỉ qua `client/src/services/api.ts` (`gameApi`), ném `ApiError` có `.status`. Không `fetch`/`axios` thô trong screen/hook.
4. Logic thuần (engine, session orchestration) tách khỏi HTTP/IO → test được không cần server chạy.
5. Screen lớn → folder-pattern: file screen là "glue" (state/routing), tách `styles.ts` + sub-components.
6. Sprite → chỉ qua `ASSETS` registry, key string từ engine. Không inline `require()`/emoji tại chỗ.

**Khác biệt vs §1 design tổng:** `server/` bỏ `ai/`, `rag/`, `db/` (sub-project sau). Thêm `server/session.ts` + `server/store/`. `shared/backgrounds.ts` mới.

---

## 3. Hợp đồng REST

Server-authoritative, save keyed theo `sessionId` trong `SaveStore`. Mọi randomness qua `save.seed` → deterministic.

| Method + path | Body | Trả | Việc |
|---|---|---|---|
| `GET /backgrounds` | — | `Background[]` | preset cho màn tạo nhân vật |
| `POST /sessions` | `{ backgroundId }` | `{ sessionId, save, node, effectiveStats }` | init `SaveState` từ preset, currentNode = start tuyến |
| `GET /sessions/:id` | — | `{ save, node, effectiveStats, ending? }` | resume/refresh |
| `POST /sessions/:id/choice` | `{ choiceId, skillPriority? }` | `{ save, node?, effectiveStats, checkPassed?, roll?, combat?, ending? }` | giải 1 lựa chọn (skill-check **hoặc** combat) |
| `POST /sessions/:id/equip` | `{ slot, itemId\|null }` | `{ save, effectiveStats }` | đổi/gỡ trang bị → tính lại stat |

**Lỗi:** mọi lỗi trả JSON `{ error: string }` + HTTP status. Client `gameApi` ném `ApiError` mang `.status`.
- Session không tồn tại → `404`.
- `backgroundId`/`choiceId`/`slot` không hợp lệ → `400`.
- Fight path nhưng thiếu `skillPriority` → `400`.

**`combat` trong response** = `CombatResult` (winner, rounds, log) khi path là fight; vắng khi không có combat.

---

## 4. Orchestration — `server/session.ts`

Pure-ish service: nhận `SaveStore` + registries (`SKILL_DB`/`ITEM_DB`/`ENEMY_DB`/`SAMPLE_NODES`/`BACKGROUNDS`) **inject** vào constructor/factory → test không cần HTTP.

### 4.1 Method
- `newGame(backgroundId)` → copy preset → build `SaveState` (seed cố định/khởi tạo) → `store.create` → trả view.
- `applyChoice(id, choiceId, skillPriority?)` → load save → tìm node hiện tại + choice → áp luật §4.2 → `store.put` → trả view.
- `equip(id, slot, itemId|null)` → cập nhật `save.character.equipped` → recompute `effectiveStats` → `store.put`.
- `view(save)` → gói `{ save, node, effectiveStats, ending? }`.

### 4.2 Luật giải choice (dùng data có sẵn, không sửa engine types)
Cho `node` = node hiện tại, `choice` = choice được chọn:
- **choice có `skillCheck`** → gọi `resolveChoice` (skill-check d20 + outcome) → advance `nextNodeId`. *(path "sneak")*
- **node có `combat` và choice KHÔNG có `skillCheck`** → path "fight":
  - yêu cầu `skillPriority` (thiếu → `400`).
  - build player actor (`buildPlayerActor`) với `skillPriority` truyền vào; build enemy actor từ `node.combat.enemyIds`.
  - `runCombat({ player, enemies, seed: save.seed })`.
  - **thắng** (`winner === 'player'`) → áp `choice.outcome` (qua cùng đường outcome của `resolveChoice`), advance `choice.nextNodeId`, kèm `combat` log.
  - **thua** → trả `ending: 'defeat'` + `combat` log, không advance.
- **không skillCheck, không combat** → áp `outcome` (nếu có) + advance thẳng.

→ Fixture `n1` khớp: "fight" (no check, node có goblin) → combat vs goblin; "sneak" (check dex) → skill-check, skip combat.

### 4.3 Node kết
Node có `choices: []` (vd `n3`) → màn kết tĩnh; `view` có thể gắn `ending` từ `GameRoute.endings` nếu điều kiện khớp (slice: kiểm tra đơn giản theo `currentNodeId`).

---

## 5. SaveStore — `server/store/`

```ts
// SaveStore.ts
export interface SaveStore {
  create(save: SaveState): Promise<string>;   // → sessionId
  get(id: string): Promise<SaveState | null>;
  put(id: string, save: SaveState): Promise<void>;
}
```
- `memoryStore.ts`: `Map<string, SaveState>`; `sessionId` = uuid. Optional: dump JSON ra file để debug/reload.
- Async ngay từ đầu → impl Supabase sau giữ nguyên chữ ký, không đổi `session.ts`/`api.ts`.

---

## 6. `shared/backgrounds.ts`

```ts
import { Stats, EquipSlot } from './types';

export interface Background {
  id: string;
  name: string;
  blurb: string;
  baseStats: Stats;
  inventory: string[];
  equipped: Partial<Record<EquipSlot, string>>;
  skillPriority: string[];
}

export const BACKGROUNDS: Record<string, Background> = { /* rogue, fighter, mage */ };
```
- 3 xuất thân, ref item/skill id có sẵn trong `ITEM_DB`/`SKILL_DB` (fixtures A).
- `newGame` copy preset → `SaveState.character` (deep copy `baseStats`).
- Test: mọi id ref tồn tại; `baseStats` đủ 6 key.

---

## 7. Client RN + Expo

### 7.1 Lớp dịch vụ + state
- `services/api.ts`: `gameApi` bọc 5 endpoint §3; ném `ApiError{status}`; base URL từ `config.ts`.
- `hooks/useGameSession.ts`: giữ `sessionId`, `save`, `node`, `effectiveStats`, `lastCombat`. Method `start/choose/equip` gọi `gameApi` → cập nhật state. Screen chỉ đọc hook.

### 7.2 Màn
| Screen | Nội dung | Engine chạm |
|---|---|---|
| **CharCreate** | list `BACKGROUNDS` → chọn → `POST /sessions` | preset → SaveState |
| **Story** | `node.prose` + `node.choices`; choice có `skillCheck` → gọi `/choice`, hiện `roll` + pass/fail | resolveChoice |
| **Combat** | trước trận: kéo-xếp `skillPriority`; engage → `/choice {choiceId, skillPriority}` → **replay** `combat.log` bán tự động (từng event + sprite + HP bar + status icon) | runCombat log |
| **Inventory** | list `inventory`, đổi `equipped` qua `/equip` → hiện `effectiveStats` đổi | effectiveStats |

### 7.3 Routing
CharCreate → Story. Story ↔ Inventory (mở/đóng). Story → Combat khi chọn path fight → về Story (thắng) / màn Defeat (thua). Node `choices: []` → màn kết tĩnh.

### 7.4 Assets
`assets.ts`: `ASSETS` registry map sprite key (`enemy.goblin`, `skill.slash`...) → placeholder (màu/box/emoji). Slice B chưa cần ảnh thật.

### 7.5 Replay
Client KHÔNG tự tính combat — chỉ tua `combat.log[]` server trả. Khớp 100% nhờ cùng seed.

---

## 8. Chiến lược test

Logic thuần test kỹ; IO test mỏng.

| Tầng | Test | Cách |
|---|---|---|
| `shared/backgrounds.ts` | preset hợp lệ | mọi item/skill id ref tồn tại; `baseStats` đủ 6 stat |
| `server/session.ts` ⭐ | core orchestration | inject `memoryStore` + fixtures: `newGame` đúng từ preset · sneak path · fight thắng → advance · fight thua → `ending:'defeat'` · `equip` đổi `effectiveStats` · deterministic (cùng seed → cùng log) |
| `server/api.ts` | REST shape | supertest: 5 endpoint shape/status · session ko tồn tại → `404` · fight thiếu `skillPriority` → `400` |
| `client/services/api.ts` | 1 lớp REST | mock fetch: parse OK, ném `ApiError` đúng `.status` |
| **E2E (session layer)** | chơi hết tuyến | rogue → sneak → `n3`; rogue → fight → combat → `n2`; save round-trip giữa chừng |
| Client screens | — | slice học tập: render test mỏng/thủ công, không ép coverage |

Jest cho `shared` + `server` (config A dùng lại, mở rộng `roots`). Client RN test sau nếu cần.

---

## 9. Rủi ro / lưu ý
- **Cân bằng số**: giữ "đủ chơi & test"; tinh chỉnh ở E.
- **Engine không đổi**: B chỉ thêm `shared/backgrounds.ts`; không sửa types/engine A → A test giữ xanh.
- **SaveStore async**: viết async ngay để Supabase cắm sau không phải refactor.
- **RN+Expo setup**: nặng nhất của B; nếu chặn tiến độ, có thể chạy Expo web trước để chứng minh luồng, native sau.

---

## 10. Bước tiếp theo
1. (Doc này) Người dùng review.
2. Sang **writing-plans** lập kế hoạch thực thi chi tiết cho Sub-project B.
3. Thực thi B → test xanh → brainstorm/spec **C (AI pipeline)**.
