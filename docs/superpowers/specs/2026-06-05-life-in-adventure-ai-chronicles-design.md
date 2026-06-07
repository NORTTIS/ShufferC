# Life in Adventure: AI Chronicles — Design Doc

> Bản mở rộng của game text-RPG "Life in Adventure", bổ sung cơ chế **AI sinh cốt truyện** từ tiểu thuyết do admin nạp vào.
> Mục tiêu: **đồ án / học tập** — ưu tiên đầy đủ tính năng + kiến trúc rõ ràng hơn là tối ưu chi phí/quy mô.
> Ngày: 2026-06-05.

---

## 0. Quyết định đã chốt (decision log)

| # | Vấn đề | Quyết định |
|---|--------|-----------|
| 1 | Mục tiêu dự án | Đồ án / học tập |
| 2 | Tech stack | RN + Expo + TS (client) · Node + TS (server) · Supabase (Postgres + `pgvector`, auth) · Drizzle ORM. Kế thừa pattern từ `mathup-mobile`. |
| 3 | Thời điểm AI sinh truyện | **Hybrid (C)**: sinh khung trước (có duyệt) + sinh chi tiết event live trong khung |
| 4 | Trình bày | **Text-based + sprite điểm xuyết (B)**, dùng **asset pack có sẵn** (AI chỉ chọn/gán sprite từ registry, không sinh ảnh mới) |
| 5 | Phạm vi người chơi | **Single-player hoàn toàn (A)** → chỉ REST, **bỏ WebSocket** |
| 6 | Item/status | **AI chỉ lắp ghép từ registry effect/item có sẵn** — không tự định nghĩa effect mới |
| 6b | Chiến đấu | Auto-battler theo lượt + **skill-priority** do người chơi xếp trước trận; **d20 = hệ số hiệu lực** (mặt 1 = 10%, mặt 20 = 200%, nội suy tuyến tính), không phải pass/fail |
| 7 | LLM provider | **Gemini** (Pro = build khung, Flash = sinh live), bọc sau interface `AIProvider` mỏng |
| 8 | Kiểm duyệt 13+ | **Tối thiểu (A)**: admin tự lọc + ràng buộc system prompt + bộ lọc từ cấm. Để sẵn "khe" `moderate()` cắm Gemini safety sau |
| 9 | Thứ tự xây dựng | **① Engine-first** → sau đó **vertical slice** cho phần còn lại |

---

## 1. Kiến trúc & cấu trúc thư mục

Kế thừa nguyên tắc của `mathup-mobile`: **1 nguồn sự thật** trong `shared/`, **tách logic thuần khỏi I/O**, **1 lớp REST duy nhất**, **registry cho assets**.

```
ShufferC/
├── shared/                 # ❤️ TRÁI TIM — thuần TS, không phụ thuộc AI/DB/UI, test được
│   ├── types.ts            # 1 nguồn sự thật cho mọi type game
│   ├── constants.ts        # danh sách stat, slot, mapping xúc xắc, hằng số cân bằng
│   ├── effects/
│   │   └── registry.ts     # EFFECT_REGISTRY: freeze, stun, poison, regen, heal, buff/debuff...
│   └── engine/
│       ├── dice.ts         # rollD20 + faceToMultiplier (có seed RNG)
│       ├── effects.ts      # áp/tick/expire status lên target
│       ├── character.ts    # gộp statMods khi trang bị, tính chỉ số dẫn xuất
│       ├── combat.ts       # auto-battler theo lượt + skill-priority
│       └── save.ts         # serialize/deserialize SaveState
├── server/                 # Node + TS
│   ├── index.ts            # HTTP + REST routes
│   ├── ai/
│   │   ├── provider.ts     # interface AIProvider
│   │   ├── gemini.ts       # GeminiProvider (Pro/Flash)
│   │   ├── frameworkGen.ts # sinh khung GameRoute (pre-gen)
│   │   ├── eventGen.ts     # sinh event live trong khung
│   │   └── moderate.ts     # khe an toàn (no-op mặc định)
│   ├── rag/                # chunk + embed + truy vấn pgvector
│   ├── db/                 # Drizzle schema + queries
│   └── api.ts              # định nghĩa REST endpoint
├── client/                 # RN + Expo (player) — screens theo folder-pattern
│   └── src/
│       ├── config.ts       # 1 nơi đọc env
│       ├── services/api.ts # gameApi + ApiError (1 lớp REST)
│       ├── assets.ts       # ASSETS registry (sprite + sfx)
│       ├── screens/        # folder-pattern khi screen lớn (glue + *Phase + sub-components)
│       └── hooks/          # state hooks
├── admin/                  # CMS (web build Expo hoặc app riêng)
└── docs/
```

**Nguyên tắc bất biến (carry-over từ mathup, không được vi phạm):**
1. Env vars → chỉ đọc ở `client/src/config.ts` (client) và `server/config.ts` (server). Không `process.env` rải rác.
2. Type/constant dùng chung → chỉ ở `shared/types.ts` + `shared/constants.ts`. Không định nghĩa lại cục bộ.
3. REST call → chỉ qua `services/api.ts` (`gameApi`), ném `ApiError` có `.status`. Không `fetch`/`axios` thô trong screen/hook.
4. Logic thuần (engine, dice, combat, effects) tách khỏi file I/O/DB — như `ranking.ts`/`questions.ts` của mathup.
5. Screen lớn → folder-pattern: file screen chỉ là "glue" (state/timer/routing), tách `styles.ts`, `utils.ts`, `*Phase.tsx`, sub-components.
6. Sprite/sfx → chỉ qua `ASSETS` registry, key theo màn. Không inline `require()`/emoji literal tại chỗ dùng.

---

## 2. Hợp đồng dữ liệu (data contract) — cốt lõi của "AI chỉ lắp ghép"

Điểm mấu chốt: **schema cố định trước → AI buộc phải tuân theo → output luôn hợp lệ, test được.**

```ts
// shared/types.ts (phác thảo — sẽ chi tiết trong spec Sub-project A)

type StatKey = 'str' | 'dex' | 'int' | 'wis' | 'cha' | 'con';
type Stats = Record<StatKey, number>;

type EffectKind = 'buff' | 'debuff' | 'dot' | 'hot' | 'control';

interface StatusEffect {
  id: string;                 // khóa trong EFFECT_REGISTRY: "freeze" | "stun" | "poison" | "regen"...
  kind: EffectKind;
  duration: number;           // số lượt; 0 = tức thời
  magnitude?: number;         // cường độ (sát thương/hồi mỗi tick...)
}

// Hàm xử lý effect là PURE, sống trong registry (không trong data)
interface EffectBehavior {
  apply(target: CombatActor, e: StatusEffect): void;     // ví dụ freeze: set skipTurn
  tick(target: CombatActor, e: StatusEffect): void;      // poison: trừ máu; regen: hồi
  onExpire(target: CombatActor, e: StatusEffect): void;
}
type EffectRegistry = Record<string, EffectBehavior>;

interface Skill {
  id: string; name: string;
  cost?: number;              // tài nguyên (mana/stamina) nếu có
  targetStat?: StatKey;       // chỉ số dùng để tính hiệu lực
  effects: StatusEffect[];    // skill chỉ THAM CHIẾU effect theo id
  sprite?: string;            // key trong ASSETS
}

interface Item {
  id: string; name: string;
  slot: 'weapon' | 'armor' | 'ring' | 'scroll' | 'quest';
  statMods?: Partial<Stats>;
  onEquip?: StatusEffect[];   // nhẫn: +regen mỗi lượt
  onUse?: StatusEffect[];     // cuộn phép: gây freeze 2 lượt
  grantsSkills?: string[];    // id skill được mở khi trang bị
  sprite?: string;
  storyTags: string[];        // gắn item với loại cốt truyện (AI dùng để chọn)
}

interface Enemy {
  id: string; name: string;
  stats: Stats; hp: number;
  skills: string[];           // id skill (xếp sẵn priority)
  sprite?: string;
}

// --- Narrative ---
interface Choice {
  id: string; text: string;
  skillCheck?: { stat: StatKey; dc: number };   // dùng hệ số d20
  effects?: ChoiceOutcome;                        // thay đổi stat/reputation/inventory/flags
  nextNodeId?: string;
}
interface StoryNode {
  id: string;
  prose: string;              // do AI sinh (pre-gen hoặc live)
  choices: Choice[];
  combat?: { enemies: string[] };
  source: 'pregen' | 'live';
}
interface GameRoute {         // "khung tuyến game" admin đã duyệt
  id: string; title: string; sourceNovelId: string;
  acts: { id: string; title: string; nodeIds: string[] }[];
  itemPool: string[]; enemyPool: string[]; endings: Ending[];
  status: 'draft' | 'published';
}

interface SaveState {
  routeId: string;
  character: { background: string; stats: Stats; inventory: string[]; equipped: Record<string,string>; skillPriority: string[] };
  reputation: { hero: number; villain: number; factions: Record<string, number> };
  choiceLog: { nodeId: string; choiceId: string }[];
  currentNodeId: string;
  seed: number;               // RNG seed → tái lập trận đấu
}
```

> **Effect registry để trong code** (`shared/effects/registry.ts`), không vào DB — vì là logic thuần, cần test & version cùng code.

---

## 3. Engine cốt lõi (thuần, deterministic)

- `dice.ts`
  - `rollD20(rng): number` (1–20), dùng RNG **có seed** (vd `mulberry32`).
  - `faceToMultiplier(face): number = 0.10 + (face - 1) / 19 * 1.90` → mặt 1 = 0.10, mặt 20 = 2.00, mặt 10 ≈ 0.995.
- `effects.ts`: `applyEffect`, `tickEffects`, `expireEffects` — tra cứu hành vi từ `EFFECT_REGISTRY`.
- `character.ts`: gộp `statMods` từ item trang bị → `effectiveStats`; tính chỉ số dẫn xuất (hp tối đa từ con...).
- `combat.ts`: **auto-battler theo lượt**.
  - Input: `player` (có `skillPriority: string[]`), `enemies`, `seed`.
  - Mỗi lượt mỗi actor: nếu bị `control` (freeze/stun) → mất lượt; ngược lại **chọn skill khả dụng đầu tiên theo priority** → `rollD20` → nhân `faceToMultiplier` vào hiệu lực (sát thương / DC status) → áp effect từ registry → `tick` các status đang chạy.
  - Output: `CombatResult` { winner, log: CombatEvent[] } — **log đủ để client phát lại bán tự động**.
- `save.ts`: serialize/deserialize `SaveState` (versioned).

**Tính deterministic:** mọi randomness đi qua RNG có seed → cùng seed + cùng input ⇒ cùng kết quả ⇒ **unit test chắc chắn**, và client phát lại trận đấu khớp server.

---

## 4. Pipeline AI (hybrid) — Sub-project C

- `AIProvider` interface (`generate`, `generateStructured(schema)`); `GeminiProvider` impl (Pro/Flash qua config).
- **Nạp tiểu thuyết:** admin upload → chunk → embed → lưu `pgvector` (Supabase).
- **Sinh khung (pre-gen, có duyệt):** Gemini Pro + RAG context → `GameRoute` skeleton, **ép JSON schema** (structured output), chỉ chọn item/enemy/sprite từ registry → admin duyệt/chỉnh → `status: published`.
- **Sinh event live:** trong khung đã publish, Gemini Flash sinh `prose` + `choices` cho 1 node theo yêu cầu, **chỉ tham chiếu id có sẵn** → validate schema → lỗi/lạc đề thì retry, hết retry thì fallback node an toàn pre-written.
- **Khe an toàn:** `moderate(text): text | blocked` — mặc định no-op (lựa chọn A). Sau có thể cắm Gemini safety settings.

---

## 5. Admin CMS — Sub-project D
Quản lý tiểu thuyết/context (upload/list/delete → trigger embedding) · kích hoạt + duyệt + publish khung tuyến game · xem/quản lý registry effect/item + mapping sprite (asset pack) · phân quyền admin/player (Supabase role).

---

## 6. Client người chơi — Sub-project B (vertical slice) + hoàn thiện E
Auth (Supabase) → Chọn tuyến game đã publish → **Tạo nhân vật** (xuất thân → 6 chỉ số D&D + skill/item khởi đầu) → **Màn truyện** (prose + lựa chọn, skill-check bằng hệ số d20, cập nhật danh tiếng/quan hệ phe phái) → **Màn chiến đấu** (xếp ưu tiên skill trước trận → phát lại combat log bán tự động + sprite + icon status) → **Inventory/trang bị** → **Epilogue** (AI sinh kết từ `choiceLog` + reputation).

---

## 7. DB schema (Supabase + Drizzle)
- `users` — auth + `role` (admin/player) + profile.
- `novels` / `contexts` — nguồn tiểu thuyết admin nạp.
- `embeddings` — `pgvector` chunks (FK → novel).
- `game_routes` — khung đã build (JSON skeleton + metadata + status).
- `story_nodes` — cache node live-gen (optional, để chơi lại nhất quán).
- `save_states` — tiến trình người chơi (route_id, character JSON, choiceLog, inventory, reputation, currentNode, seed).

---

## 8. Phân rã sub-project (mỗi cái 1 chu trình spec → plan → code riêng)

| Sub-project | Nội dung | Phụ thuộc |
|-------------|----------|-----------|
| **A. Engine core** ⭐ | `shared/` types + constants + EFFECT_REGISTRY + engine thuần (dice/effects/character/combat/save) + unit test, chạy với 1 tuyến **hardcode** | — |
| **B. Vertical slice** | DB tối thiểu + REST + client RN để **chơi hết 1 tuyến hardcode** end-to-end | A |
| **C. Pipeline AI** | ingest tiểu thuyết + RAG + sinh khung (có duyệt) + sinh event live | A, B |
| **D. Admin CMS** | quản lý novel/context, duyệt khung, quản lý registry/asset | C |
| **E. Hoàn thiện** | epilogue, hệ thống danh tiếng/ending, thêm nội dung, đánh bóng UI | B–D |

> Brainstorm này chốt **thiết kế tổng thể** + chuyển sang lập kế hoạch chi tiết cho **Sub-project A**. B–E sẽ brainstorm/spec riêng khi tới lượt.

---

# SPEC CHI TIẾT — Sub-project A: Engine Core

## A.1. Mục tiêu
Xây `shared/` hoàn chỉnh: data contract + EFFECT_REGISTRY + engine thuần, **không phụ thuộc AI/DB/UI**, có **unit test deterministic**. Kết thúc A: chạy được 1 trận chiến đấu + duyệt 1 vài node truyện **bằng nội dung hardcode**, chứng minh hợp đồng dữ liệu vững.

## A.2. Phạm vi (in scope)
- `shared/types.ts`: toàn bộ type ở mục 2 (hoàn thiện chi tiết, có JSDoc).
- `shared/constants.ts`: `STAT_KEYS`, `EQUIP_SLOTS`, hằng số cân bằng (hp cơ bản, công thức multiplier), `DICE_MIN_MULT = 0.10`, `DICE_MAX_MULT = 2.00`.
- `shared/effects/registry.ts`: tối thiểu 6 effect — `freeze`, `stun` (control: mất lượt), `poison` (dot), `regen` (hot), `attack_buff` (buff), `defense_down` (debuff). Mỗi cái có `apply/tick/onExpire` thuần.
- `shared/engine/dice.ts`: RNG có seed (`mulberry32`), `rollD20`, `faceToMultiplier`.
- `shared/engine/effects.ts`: vòng đời status trên `CombatActor`.
- `shared/engine/character.ts`: gộp statMods → effectiveStats; chỉ số dẫn xuất.
- `shared/engine/combat.ts`: auto-battler theo lượt + skill-priority + control-skip + tick status; trả `CombatResult` có `log`.
- `shared/engine/save.ts`: serialize/deserialize `SaveState` (có `version`).
- **Fixtures hardcode**: 1 nhân vật mẫu, vài item/skill/enemy mẫu, 1 mini-route 3–4 node để test.
- **Unit test** cho toàn bộ (Jest).

## A.3. Ngoài phạm vi (out of scope, để sub-project sau)
- Mọi thứ liên quan AI/Gemini/RAG.
- DB/Supabase/Drizzle, REST API.
- UI/RN/sprite thật (chỉ tham chiếu `sprite` bằng key string, chưa cần ảnh).
- Auth, admin CMS, epilogue do AI sinh.

## A.4. Tiêu chí chấp nhận (acceptance criteria)
1. `faceToMultiplier(1) === 0.10`, `faceToMultiplier(20) === 2.00`, đơn điệu tăng; có test biên.
2. Cùng `seed` + cùng input ⇒ `runCombat` cho **kết quả & log giống hệt** (test deterministic).
3. `freeze`/`stun` khiến actor **mất lượt** đúng số lượt `duration`, hết hạn thì hành động lại.
4. `poison` trừ máu mỗi tick theo `magnitude`; `regen` hồi máu; dừng khi `onExpire`.
5. Skill-priority: actor luôn dùng **skill khả dụng đầu tiên** theo thứ tự; bỏ qua skill không đủ cost/đang cooldown (nếu có).
6. Trang bị item cộng `statMods` vào `effectiveStats`; gỡ ra thì hoàn lại; `onEquip` effect được áp.
7. `save.ts` round-trip: `deserialize(serialize(s))` ⇒ bằng `s`.
8. Test bao phủ ≥ 1 trận end-to-end (player thắng & thua) + mọi effect trong registry.

## A.5. Chiến lược test
- Jest, theo tinh thần `ranking.ts`/`questions.ts` (pure → dễ test).
- Mọi randomness qua RNG seed → assert giá trị/log cụ thể, không flaky.
- Test bảng (table-driven) cho `faceToMultiplier` các mặt 1..20.
- Snapshot `CombatResult.log` cho 1 trận seed cố định.

## A.6. Rủi ro / lưu ý
- **Cân bằng số** (sát thương/hp) ở A chỉ cần "đủ chạy & test", tinh chỉnh ở E.
- Giữ engine **không import gì** từ `server/`/`client/` → đảm bảo thuần & tái dùng cả 2 phía.
- Thiết kế type **mở** cho `cost`/`cooldown` nhưng A có thể để optional, implement tối thiểu.

---

## 9. Bước tiếp theo
1. (Doc này) Người dùng review.
2. Sang **writing-plans** lập kế hoạch thực thi chi tiết cho **Sub-project A**.
3. Thực thi A → test xanh → brainstorm/spec **B (vertical slice)**.
