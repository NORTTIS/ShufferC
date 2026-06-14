# Gemini Tool-Calling Loop — Tại sao tạo route gọi 3 lần API?

## Tổng quan

Khi gọi `POST /admin/routes/generate`, server không gọi Gemini một lần duy nhất. Thay vào đó, nó chạy một **tool-calling loop** — một vòng hội thoại nhiều lượt giữa server và model, mỗi lượt là một HTTP request tới Gemini API.

Minimum luôn là **3 lần** cho bất kỳ route nào.

---

## Luồng chi tiết

### Lần 1 — Initial prompt

```
server → Gemini: buildToolPrompt(params, content)
```

Server gửi toàn bộ system prompt: mô tả route cần tạo, danh sách tool có sẵn (`create_attribute`, `create_effect`, `create_skill`, `create_item`, `create_enemy`, `submit_route`), và danh sách content đã có để model tái sử dụng.

Model phân tích yêu cầu và quyết định cần tạo những entity nào. Nó trả về một batch tool calls:

```
Gemini → server: [create_enemy("dragon"), create_item("sword"), ...]
```

Code tương ứng (`gemini.ts:97`):
```typescript
let result = await chat.sendMessage(prompt); // ← CALL #1
```

---

### Lần 2 — Tool results: content creation

```
server → Gemini: [{ functionResponse: { name: "create_enemy", result: {ok:true, id:"dragon"} } }, ...]
```

Server chạy `handler()` cho từng tool call trong batch. Handler validate entity, kiểm tra collision với global/staged content, rồi stage entity lại. Kết quả `{ok, id}` hoặc `{ok:false, errors}` được gửi lại cho model.

Model nhận kết quả, xác nhận các entity đã được tạo thành công, rồi gọi tool cuối cùng:

```
Gemini → server: [submit_route({ route: {...}, nodes: [...] })]
```

Code tương ứng (`gemini.ts:110`):
```typescript
result = await chat.sendMessage(responses); // ← CALL #2
```

---

### Lần 3 — submit_route result

```
server → Gemini: [{ functionResponse: { name: "submit_route", result: {ok:true} } }]
```

Server chạy `submit_route` handler: validate toàn bộ `RouteBundle` qua `validateRouteBundle`, chạy content moderation, và nếu pass thì snapshot bundle vào `finalBundle`.

Model nhận `{ok:true}` — không còn tool call nào nữa → loop exit.

```
Gemini → server: (no function calls)
```

Code tương ứng:
```typescript
result = await chat.sendMessage(responses); // ← CALL #3
const calls = result.response.functionCalls() ?? [];
if (!calls.length) return; // ← exit here
```

---

## Sơ đồ

```
server                          Gemini API
  │                                │
  │── sendMessage(prompt) ────────►│  CALL #1
  │◄─ [create_enemy, create_item] ─│
  │                                │
  │  (run handlers, validate,      │
  │   stage entities locally)      │
  │                                │
  │── sendMessage([results]) ─────►│  CALL #2
  │◄─ [submit_route]  ─────────────│
  │                                │
  │  (validate bundle,             │
  │   moderation check,            │
  │   snapshot finalBundle)        │
  │                                │
  │── sendMessage([{ok:true}]) ───►│  CALL #3
  │◄─ (no function calls)  ────────│
  │                                │
  │  return finalBundle            │
```

---

## Tại sao không thể ít hơn 3?

Cấu trúc tool loop yêu cầu ít nhất 2 "turn" có tool calls:

| Turn | Model gọi gì | Cần thiết vì |
|------|-------------|-------------|
| 1    | create_* entities | Model phải tạo content trước khi submit |
| 2    | submit_route | Route phải được submit sau khi content tồn tại |
| 3    | (none)       | Server cần gửi kết quả submit để model biết thành công |

Lần 3 không thể bỏ vì Gemini chat API là **request-response**: server phải gửi tool result để model confirm và kết thúc. Không có cách "close" conversation sớm hơn.

---

## Khi nào nhiều hơn 3?

Model có thể tạo thêm turns nếu:

- **Validation fail**: `create_enemy` trả về `{ok:false, errors}` → model retry với args khác → +1 call per retry
- **Content phức tạp**: Model tách create calls thành nhiều batch (2 lượt create thay vì 1) → +1 call
- **submit_route fail**: Bundle không hợp lệ (dangling node ref, missing ending, ...) → model điều chỉnh và submit lại → +2 calls

`maxToolCalls` mặc định là **30** (frameworkGen.ts:26) — là giới hạn tổng số tool invocations, không phải số API calls. Số API calls = số turns model có tool calls + 1 (lần cuối không có tool).

---

## Tại sao không dùng `generateStructured` thay vì tool loop?

`generateStructured` gọi 1 lần duy nhất, model trả thẳng JSON. Nhưng:

| | Tool loop | generateStructured |
|---|---|---|
| Validation | Per-entity, real-time, model tự sửa | Post-hoc, phải retry toàn bộ |
| Content collision check | Mỗi entity check ngay khi tạo | Không thể — chưa có entity |
| Khả năng tự sửa | Model thấy từng error và retry từng tool | Không thấy intermediate state |
| API calls | 3+ | 1 |

Tool loop đắt hơn về latency và cost nhưng tạo ra route đúng hơn, vì model có feedback loop để sửa lỗi từng bước.

---

## Files liên quan

| File | Vai trò |
|------|---------|
| `server/ai/gemini.ts` | `generateWithTools` — vòng lặp chat + tool dispatch |
| `server/ai/frameworkGen.ts` | `generateFramework` — handler cho từng tool, validate, stage |
| `server/ai/prompt.ts` | `buildToolPrompt` — system prompt gửi lần đầu |
| `server/api.ts:271` | `POST /admin/routes/generate` — entry point |

---

## Thay đổi gần đây (feature/ai-content-authoring-tools)

### `submit_route` thành công dừng loop ngay lập tức

Handler `submit_route` trong `frameworkGen.ts` ném `StopToolLoop` sau khi bundle hợp lệ được snapshot. `generateWithTools` bắt exception này và return ngay, bỏ qua các tool call còn lại trong batch lẫn các turn tiếp theo. Điều này đảm bảo model không tiếp tục tạo content sau khi route đã submit thành công.

### `maxToolCalls` được kiểm tra per-call (không còn overshoot)

Trước đây, kiểm tra `count >= max` chỉ xảy ra **trước batch** — nếu một turn emit nhiều function call, toàn bộ batch chạy hết, `count` có thể vượt `max` tùy ý. Bây giờ, kiểm tra được thực hiện **trước mỗi call** trong batch (`if (count >= max) break`), cộng thêm một guard sau vòng lặp (`if (count >= max) return`) để không gửi thêm message tới Gemini. Một batch lớn sẽ bị cắt đúng tại giới hạn, không bao giờ overshoot.

### Cách verify

Cả hai hành vi trên được kiểm tra bằng **fake provider** trong `server/ai/frameworkGen.test.ts`:

- `'stops the tool loop after a successful submit_route'` — xác nhận `toolCalls === 1` dù batch còn call tiếp theo.
- `'honors maxToolCalls mid-batch (hard limit)'` — một turn với 3 call, `maxToolCalls: 2`, kết quả `toolCalls === 2`.

Real Gemini path không có Jest coverage — smoke-test thủ công qua `POST /admin/routes/generate`.
