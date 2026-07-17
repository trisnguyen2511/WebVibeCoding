# Werewolf Game Manager — Spec

Status: draft, pending review
Tool slug: `werewolf-gm`
Route: `app/tools/werewolf-gm/page.tsx`
Registry entry: `lib/tools-registry.ts` → category `game`

## 1. Mục tiêu

Công cụ hỗ trợ người quản trò (MC) điều hành ván Ma Sói: quản lý người chơi,
vai trò (kể cả 1 người nhiều vai), điều khiển thứ tự hành động từng đêm bằng
cách kéo-thả để chọn mục tiêu, undo/redo từng thao tác, xem lại lịch sử toàn
ván, và cảnh báo điều kiện thắng. Chạy hoàn toàn **local** trên một thiết bị
(không dùng Supabase) — state sống trong React + `localStorage` để autosave và
resume nếu người dùng thoát app giữa ván.

## 2. Phạm vi (MVP) vs không làm

**Trong phạm vi:**
- Setup người chơi + vai trò, gán nhiều vai/người.
- Custom role editor (tên, phe, hiệu ứng, có target hay không).
- Điều hành theo từng đêm, thứ tự vai trò tự động theo priority.
- Graph kéo-thả để chọn target trực tiếp (không phải chỉ xem lại).
- Undo/redo từng action riêng lẻ.
- Timeline lịch sử toàn ván (theo đêm/ngày).
- Ban ngày: bỏ phiếu, loại người, xử lý hiệu ứng khi chết.
- Cảnh báo điều kiện thắng theo phe.
- Autosave vào `localStorage`, resume ván dở.

**Ngoài phạm vi (không làm ở bản này):**
- Đồng bộ nhiều thiết bị / Supabase Realtime.
- Tài khoản người dùng, lưu nhiều ván trên cloud.
- Chat/voice cho người chơi.
- Random chia vai có ràng buộc phức tạp (VD: cân bằng phe theo tỉ lệ) — chỉ
  random đều, có thể chỉnh tay sau.

## 3. Data model

Tất cả kiểu dữ liệu ở TypeScript strict, không dùng `any` (theo hard rule của
repo). Thiết kế để engine role tổng quát, không hardcode logic riêng cho từng
vai chuẩn.

```ts
type Faction = 'wolf' | 'village' | 'neutral'

type EffectType =
  | 'kill'        // giết target khi resolve
  | 'protect'     // target không thể bị kill đêm đó
  | 'inspect'     // MC được xem phe/vai của target (chỉ hiển thị cho MC)
  | 'poison'      // giết target, không thể được protect chặn
  | 'revive'      // hồi sinh target đã chết đêm đó
  | 'link'        // 2 người chơi được liên kết (VD Cupid) — cùng sống/chết
  | 'swap'        // hoán đổi vai trò/phiếu giữa 2 target
  | 'silence'     // target không được nói/vote ban ngày tiếp theo
  | 'custom'      // hiệu ứng tự do, MC tự diễn giải, không tự động resolve

interface RoleDef {
  id: string                // uuid, ổn định để tham chiếu trong action log
  name: string
  faction: Faction
  icon: string              // emoji, đồng bộ icon convention của tools-registry
  isBuiltIn: boolean        // true = từ bộ vai trò mặc định, false = custom
  actsAtNight: boolean      // false = vai không có hành động đêm (VD Dân thường)
  priority: number          // thứ tự thức dậy trong đêm, số nhỏ hơn đi trước
  targetCount: 0 | 1 | 2    // số người mà vai này chọn mỗi lượt (0 = không target)
  canTargetSelf: boolean
  canTargetDead: boolean    // VD Thợ săn bắn sau khi chết
  effect: EffectType
  firstNightOnly: boolean   // VD Cupid chỉ hành động đêm 1
  description: string
}

interface Player {
  id: string
  name: string
  roleIds: string[]         // 1+ role, hỗ trợ nhiều vai/người
  isAlive: boolean
  linkedWith: string[]      // playerId khác, dùng cho effect 'link'
  deathNight: number | null
  deathCause: string | null // roleId hoặc 'vote' gây ra cái chết
}

interface NightAction {
  id: string
  night: number
  roleId: string
  actorPlayerId: string
  targetPlayerIds: string[] // 0–2 phần tử tùy targetCount
  createdAt: number         // Date.now(), dùng để sort/undo
}

interface DayVote {
  id: string
  day: number
  voterPlayerId: string
  targetPlayerId: string
}

interface DayResolution {
  day: number
  eliminatedPlayerId: string | null // null nếu hòa phiếu / không loại ai
}

interface NightResolution {
  night: number
  deaths: string[]          // playerId chết sau khi resolve toàn bộ effect
  saved: string[]           // playerId được protect/revive kịp thời
  notes: string[]           // log diễn giải cho MC (VD "Phù thủy đã cứu X")
}

// Action log = nguồn sự thật duy nhất cho undo, graph, timeline
type GameEvent =
  | { type: 'night_action'; payload: NightAction }
  | { type: 'night_action_undo'; payload: { actionId: string } }
  | { type: 'night_resolved'; payload: NightResolution }
  | { type: 'day_vote'; payload: DayVote }
  | { type: 'day_resolved'; payload: DayResolution }

interface GameState {
  players: Player[]
  roles: RoleDef[]          // built-in + custom đã chọn cho ván này
  currentNight: number
  currentPhase: 'setup' | 'night' | 'day' | 'ended'
  events: GameEvent[]       // append-only log, undo = xoá event cuối cùng loại đó
  winner: Faction | null
}
```

**Nguyên tắc undo:** không có state riêng để undo — mọi state hiển thị
(`players[].isAlive`, `deathNight`...) được **derive** từ việc replay
`events` theo thứ tự. Undo = xoá event khỏi mảng `events` rồi tái tính toán
(`deriveGameState(events)`). Cách này tránh 2 nguồn sự thật lệch nhau và làm
redo trở thành chuyện tự nhiên (giữ event đã xoá trong một `redoStack` tạm).

## 4. Bộ vai trò mặc định (built-in)

Priority thấp → cao (thứ tự thức dậy):

| Priority | Vai trò | Phe | Effect | Ghi chú |
|---|---|---|---|---|
| 1 | Cupid | village | link | chỉ đêm 1 (`firstNightOnly`) |
| 2 | Sói | wolf | kill | `targetCount: 1`, cả bầy chọn chung 1 target (xem §5.3) |
| 3 | Bảo vệ | village | protect | không được bảo vệ trùng người 2 đêm liên tiếp (rule mềm, MC tự nhắc) |
| 4 | Tiên tri | village | inspect | kết quả chỉ hiện cho MC, MC tự thông báo ngoài đời |
| 5 | Phù thủy | village | kill hoặc revive | 2 vật phẩm dùng 1 lần/ván (thuốc độc = kill, thuốc giải = revive) |
| 6 | Thợ săn | village | kill | `canTargetDead: true`, kích hoạt khi chính vai này chết |
| — | Dân thường | village | — | `actsAtNight: false` |
| — | Già làng | village | — | 2 mạng khi bị vote loại (xử lý ở day resolution, không phải night effect) |

Đây là seed data, được load vào `roles` khi tạo ván mới; MC có thể bật/tắt
từng vai và chỉnh số lượng.

## 5. Luồng màn hình

### 5.1 Setup

1. **Người chơi**: input tên nhanh (thêm bằng Enter), swipe-to-delete, tối
   thiểu 4 người mới cho sang bước tiếp.
2. **Vai trò**: danh sách built-in dạng checkbox + số lượng; nút "+ Vai trò
   tùy chỉnh" mở form tạo `RoleDef` mới (name, faction, effect, target count,
   priority — priority mặc định gợi ý theo effect: kill/inspect ở giữa,
   protect trước kill).
3. Validate tổng số vai trò đã chọn == tổng người chơi, nếu lệch hiển thị
   cảnh báo đỏ, chặn nút "Bắt đầu ván".
4. **Gán vai**: nút "Random" (Fisher-Yates shuffle, hỗ trợ gán *nhiều lượt*
   role instance cho cùng 1 player nếu MC kéo thêm — VD kéo cả "Sói" và "Tiên
   tri" vào cùng 1 player card) + chỉnh tay bằng cách tap vào player card →
   multi-select role.
5. Nút "Bắt đầu" → tạo `GameState` ban đầu, chuyển `currentPhase: 'night'`,
   `currentNight: 1`.

### 5.2 Điều hành đêm (màn hình chính, trọng tâm UX)

- Header phụ hiển thị "Đêm {n}" + progress "{k}/{m} vai đã xong".
- Danh sách vai trò của đêm hiện tại, sort theo `priority`, lọc:
  - `actsAtNight === false` → ẩn.
  - `firstNightOnly === true` và `night > 1` → ẩn.
  - vai mà player giữ nó đã chết và `canTargetDead === false` → ẩn.
- Với vai đang active: hiện **canvas graph** (xem §6) để MC kéo dây từ
  actor → target(s). Nếu `targetCount === 0` (không có, hiếm khi actsAtNight
  true nhưng không target — VD hiệu ứng tự thân) thì chỉ có nút "Xác nhận".
- Sau khi kéo đủ target, nút "Xác nhận vai này" ghi 1 `night_action` event,
  tự chuyển sang vai kế tiếp.
- Nút "Hoàn tác" luôn hiện ở footer: undo action gần nhất (bất kể đêm/ngày),
  hoạt động xuyên suốt toàn ván chứ không giới hạn trong đêm hiện tại.
- Khi hết danh sách vai của đêm: nút "Kết thúc đêm" → chạy
  `resolveNight(events, night)` (thuật toán ở §7), ghi `night_resolved`
  event, hiện **màn hình recap** (ai chết, ai được cứu, notes), rồi chuyển
  `currentPhase: 'day'`.

### 5.3 Trường hợp Sói (nhiều actor, 1 target chung)

Sói là vai trò đặc biệt: nhiều player cùng giữ role "Sói" nhưng cả bầy chỉ
ra 1 quyết định chung mỗi đêm. Model hoá bằng cách: vai Sói chỉ tạo **1**
`NightAction` với `actorPlayerId` = id của con sói đầu đàn được chọn ngẫu
nhiên/đầu tiên lúc setup (`packLeaderId` lưu trong `RoleDef` mở rộng cho
riêng role Sói built-in), MC vẫn kéo dây target như bình thường. Vai trò
custom kiểu "hội đồng" khác có thể tái dùng cùng cơ chế bằng field
`isCouncil: boolean` (mở rộng `RoleDef`, mặc định false, true cho Sói).

### 5.4 Ban ngày

1. Hiện danh sách người sống, MC tap để ghi `day_vote` cho từng người
   (voter → target), có thể tap lại để đổi phiếu (event mới đè, không xoá
   event cũ — đếm phiếu chỉ tính vote **cuối cùng** của mỗi voter trong ngày
   đó).
2. Nút "Chốt phiếu": tính người bị loại nhiều phiếu nhất (hòa → null, MC tự
   xử lý ngoài đời, ví dụ bốc thăm), ghi `day_resolved`.
3. Nếu người bị loại giữ vai có hiệu ứng chết-kích-hoạt (Thợ săn, Già làng),
   hiện lại giao diện chọn target kiểu đêm để MC xử lý ngay.
4. Reveal vai trò khi chết: toggle bật/tắt lúc setup (mặc định bật).

### 5.5 Kiểm tra thắng

Sau mỗi `night_resolved` và `day_resolved`, chạy `checkWinCondition(players)`:
- `wolfCount >= aliveCount - wolfCount` (sói ≥ dân) → phe Sói thắng.
- `wolfCount === 0` → phe Dân thắng.
- Vai `neutral` có điều kiện thắng riêng do MC tự định nghĩa trong
  `description` (không tự động hoá được ở MVP, chỉ hiển thị nhắc nhở).

Khi có `winner`, chuyển `currentPhase: 'ended'`, hiện màn hình tổng kết +
toàn bộ timeline.

### 5.6 Timeline / lịch sử

Màn hình riêng, lọc theo đêm/ngày, hiển thị mọi `GameEvent` dạng list:
"Đêm 2 — Sói (Nam) cắn Lan", "Đêm 2 — Bảo vệ (Hoa) bảo vệ Lan", "Đêm 2 kết
thúc — Lan sống sót (được bảo vệ)". Dữ liệu số/id hiển thị bằng
`font-mono` theo design system. Có nút "Undo tới đây" trên mỗi dòng — xoá
mọi event sau mốc đó (dùng khi MC phát hiện sai sót từ trước).

## 6. Graph kéo-thả chọn target

- Component riêng: `components/werewolf/target-graph.tsx`.
- Canvas SVG (không dùng lib đồ thị nặng — repo ưu tiên tối giản), node =
  vòng tròn tên người chơi, layout mặc định dạng vòng tròn (circle layout)
  để luôn gọn trong 390px mà không cần physics simulation phức tạp.
- Tương tác:
  - Người chơi đang là "actor" của vai hiện tại được highlight viền
    `accent`.
  - Kéo từ actor node → target node(s) tạo 1 edge tạm (chưa commit); nhả tay
    ngoài node nào thì huỷ.
  - Với `targetCount: 2`, cho kéo 2 edge trước khi bấm "Xác nhận".
  - Edge màu theo `EffectType` (kill = đỏ `#DC2626`, protect = `accent-soft`,
    inspect = xanh dương, link = hồng...) — không thêm màu ngoài palette cố
    định, dùng các màu semantic riêng cho graph (không phải accent hệ
    thống) vì đây là encoding thông tin, tương tự cách Lucky Wheel dùng
    `SEG_COLORS` riêng.
  - Ở màn hình < 400px: node co nhỏ (28px), cho phép pinch-zoom bằng CSS
    `touch-action` + scale state; nếu quá 10 người chơi, hiện nút "Chuyển
    sang danh sách" làm phương án dự phòng (dropdown chọn target) — **bắt
    buộc có** để không khoá MC vào 1 cách thao tác duy nhất khi graph quá
    rối.
- Chế độ xem lại (timeline) tái dùng cùng component nhưng `readOnly: true`,
  vẽ toàn bộ edge đã có sẵn của 1 đêm, không cho kéo mới.

## 7. Thuật toán resolve đêm

```
resolveNight(events, night):
  actions = filter events where type=night_action AND payload.night=night
            AND chưa có event night_action_undo tương ứng
  sort actions theo priority của role (tra RoleDef)
  effects = []
  for action in actions:
    role = lookupRole(action.roleId)
    switch role.effect:
      protect  → mark target(s) as protected_this_night
      inspect  → ghi note riêng cho MC, không đổi state sống/chết
      link     → set player.linkedWith qua lại giữa 2 target
      kill     → nếu target không protected_this_night → mark pending_death
      poison   → mark pending_death (bỏ qua protected)
      revive   → xoá pending_death nếu có, hoặc hồi sinh nếu đã chết đêm đó
      swap     → hoán đổi 2 target theo field cụ thể (role tự định nghĩa qua description, MC diễn giải tay ở MVP)
      custom   → không tự resolve, chỉ ghi note "MC tự xử lý: {description}"
  deaths = pending_death sau khi trừ những người có revive
  áp dụng linkedWith: nếu 1 trong 2 người linked chết → người còn lại cũng chết (chain, lặp tới khi ổn định)
  return NightResolution { night, deaths, saved: protected_this_night ∩ pending_death, notes }
```

Đặt trong `lib/werewolf/resolve-night.ts`, thuần hàm (không side effect),
dễ unit test độc lập.

## 8. Cấu trúc file (tuân theo pattern "1 tool = 1 file + registry")

```
app/tools/werewolf-gm/page.tsx        — entry, dùng <ToolShell>
components/werewolf/
  setup-players.tsx
  setup-roles.tsx
  role-editor-dialog.tsx              — tạo custom role
  night-panel.tsx
  target-graph.tsx
  day-panel.tsx
  timeline-view.tsx
  win-banner.tsx
lib/werewolf/
  types.ts                            — toàn bộ interface ở §3
  built-in-roles.ts                   — seed data §4
  derive-game-state.ts                — replay events → GameState hiện tại
  resolve-night.ts                    — thuật toán §7
  resolve-day.ts
  check-win-condition.ts
  storage.ts                          — save/load localStorage, key `wv-werewolf-gm-state`
```

Không cần `app/api/werewolf-gm/route.ts` — toàn bộ logic chạy client-side,
không có server logic theo đúng rule "nothing else changes" khi không cần
API.

Registry entry (`lib/tools-registry.ts`):

```ts
{
  name: 'Werewolf GM',
  slug: 'werewolf-gm',
  icon: '🐺',
  description: 'Công cụ quản trò Ma Sói — chia vai, điều hành đêm, kéo thả chọn mục tiêu, undo, lịch sử ván',
  category: 'game',
}
```

## 9. Ràng buộc UI/UX bắt buộc (từ CLAUDE.md)

- Toàn bộ page bọc `<ToolShell name="Werewolf GM" icon="🐺">`.
- Không dùng `any` — mọi event/state đã model hoá ở §3.
- Không thêm accent color mới; graph dùng màu semantic riêng cho edge
  (giống cách Lucky Wheel định nghĩa `SEG_COLORS` riêng ngoài palette
  chính) nhưng nút bấm/border/text vẫn theo palette cố định
  (`accent #7C3AED`, `border #1A1A2E`...).
- Mọi hiển thị id/số đêm/timestamp dùng `font-mono`.
- Layout hoạt động tốt ở 390px — graph có breakpoint co nhỏ + fallback
  dropdown, panel đêm/ngày dùng list cuộn dọc thay vì grid ngang.
- Không import gì từ folder tool khác.

## 10. Rủi ro / câu hỏi mở còn lại

1. **Swap effect** (hoán đổi) khó tổng quát hoá tự động — MVP để MC tự diễn
   giải qua `notes`, không tự động thay đổi state. Có cần tự động hoá ở bản
   sau không?
2. **Già làng 2 mạng** là hiệu ứng riêng ở day resolution, không nằm trong
   `EffectType` hiện tại — cần thêm field `extraLives?: number` trên
   `RoleDef` hoặc xử lý như custom role MC tự trừ mạng tay. Đề xuất: thêm
   `extraLives` vì đây là case phổ biến, không phải edge case hiếm.
3. Giới hạn số người chơi tối đa cho graph mượt trên 390px — đề xuất ngưỡng
   10 người thì auto-chuyển gợi ý dùng list, có đồng ý ngưỡng này không?

---

Sau khi bạn duyệt spec này (đặc biệt mục 10), sẽ triển khai code theo thứ
tự: `lib/werewolf/types.ts` → `built-in-roles.ts` → `derive-game-state.ts` +
`resolve-night.ts`/`resolve-day.ts` (có thể viết test thuần) → UI components
→ trang `page.tsx` + registry entry.
