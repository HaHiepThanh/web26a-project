# Hoà — Board & Cộng tác

> Chuyển miền **board, cột, tuỳ chọn board, hoạt động, chat, gợi ý AI** sang NgRx
> SignalStore.
>
> Khối lượng: ~1 028 dòng, 6 service. Đây là phần **nhận sự kiện WebSocket dày
> nhất**, và bạn cũng là người gỡ nút thắt `board.ts`.

---

## 1. Phần của bạn

| Service hiện tại | Dòng | Store mới | Thứ tự làm |
|---|---:|---|---|
| `list.service.ts` | 178 | `ListStore` | **0 — đã có sẵn** |
| `board.service.ts` | 331 | `BoardStore` | 1 |
| `board-prefs.service.ts` | 141 | `BoardPrefsStore` | 2 |
| `activity.service.ts` | 51 | `ActivityStore` | 3 |
| `chat.service.ts` | 199 | `ChatStore` | 4 |
| `task-suggestion.service.ts` | 128 | `TaskSuggestionStore` | 5 |

**`ListStore` đã được viết sẵn ở Giai đoạn 0** làm store mẫu cho cả ba bạn. Việc
đầu tiên của bạn là **đọc kỹ nó** — nó chứa đủ cả 5 kiểu thao tác: nạp, thêm,
sửa, xoá, kéo-thả có hoàn tác, và nhận sự kiện WebSocket. Bạn là người bảo trì nó
từ đây.

---

## 2. Quy ước chung — bắt buộc

Áp dụng cho cả ba bạn. Vi phạm là bị trả PR.

1. **Mỗi miền một thư mục** trong `frontend/src/app/ngrx/`, tách nhỏ theo vai
   trò — xem "Bố cục thư mục" ngay bên dưới. Không gom cả store vào một file.
2. **Xoá service cũ trong CÙNG PR** với store mới. Không có giai đoạn "cả hai
   cùng tồn tại" — hai nguồn sự thật là cách chắc chắn nhất để component đọc phải
   state cũ mà không ai phát hiện.
3. **Mọi danh sách dùng `withEntities`, cập nhật bằng `upsertEntity`.**
   `addEntity` bị **cấm** — lý do ở mục 3.
4. **Không sửa `realtime.service.ts`.** Sau Giai đoạn 0 nó là bộ điều phối thuần,
   store tự đăng ký handler của mình.
5. **Không đưa ID token vào state.** State bị DevTools ghi lại.
6. **Sắp xếp bằng `withComputed`.** `entities()` trả về theo thứ tự chèn, không
   theo `position` hay `createdAt`.
7. **`patchState` là cách duy nhất ghi state.**

### Bố cục thư mục

Toàn bộ phần quản lý trạng thái nằm trong `frontend/src/app/ngrx/`, **mỗi miền
một thư mục con**. Không gom cả store vào một file `.ts`: một store đầy đủ dễ lên
300–400 dòng, đọc không nổi, và ba người sửa chung một file thì xung đột liên tục.

```
frontend/src/app/ngrx/
├── shared/                     ← Giai đoạn 0, dùng chung, không ai sửa
│   ├── error.feature.ts        ← withErrorState() — lastError lặp ở mọi store
│   ├── realtime.feature.ts     ← helper đăng ký handler WebSocket
│   └── entity.util.ts          ← withId / withoutId / groupBy / midpoint
├── route-context/              ← Giai đoạn 0
│   └── route-context.store.ts  ← activeOrgId, activeBoardId
└── <mien>/                     ← thư mục của bạn
    ├── <mien>.store.ts         ← ghép các mảnh lại, ngắn (~20 dòng)
    ├── <mien>.state.ts         ← kiểu state + giá trị khởi tạo
    ├── <mien>.mapper.ts        ← toX(ApiX): X — hàm thuần, dễ test nhất
    ├── <mien>.computed.ts      ← withXComputed()
    ├── <mien>.methods.ts       ← withXMethods() — gọi API, cập nhật lạc quan
    └── <mien>.realtime.ts      ← withXRealtime() — đăng ký handler WS
```

**Chia theo kích thước, đừng máy móc.** Store nhỏ dưới ~150 dòng thì `store.ts` +
`mapper.ts` là đủ — đừng đẻ ra 6 file cho một store 50 dòng. Khi nào một mảnh
phình lên thì mới tách mảnh đó ra. Tách sẵn cả 6 file cho `ActivityStore` (51
dòng) là làm khổ người đọc chứ không giúp ai.

### Cách tách: `signalStoreFeature`

Mỗi mảnh là một *feature* trả về từ `signalStoreFeature(...)`. Feature nào cần
đọc state hoặc method đã có sẵn thì phải **khai báo đầu vào** bằng `type<...>()`,
nếu không TypeScript không biết trong store có gì.

`ngrx/list/list.methods.ts`

```ts
import { inject } from '@angular/core';
import { signalStoreFeature, withMethods, patchState, type } from '@ngrx/signals';
import { upsertEntity, setAllEntities, type EntityState } from '@ngrx/signals/entities';
import { toList } from './list.mapper';

export function withListMethods() {
  return signalStoreFeature(
    // Khai báo store phải có sẵn những gì thì feature này mới cắm vào được.
    { state: type<EntityState<List> & { loading: boolean; error: string | null }>() },

    withMethods((store, api = inject(ApiService)) => ({
      // Nhận từ WebSocket — LUÔN upsert, không bao giờ add.
      applyRemote(row: ApiList): void {
        patchState(store, upsertEntity(toList(row)));
      },

      async load(boardId: string): Promise<void> {
        patchState(store, { loading: true, error: null });
        try {
          const rows = await api.get<ApiList[]>(`/lists?boardId=${boardId}`);
          patchState(store, setAllEntities(rows.map(toList)), { loading: false });
        } catch (e) {
          patchState(store, { loading: false, error: describeError(e, 'Không tải được cột.') });
        }
      },
    })),
  );
}
```

`ngrx/list/list.store.ts` — chỉ còn việc ghép lại:

```ts
import { signalStore, withState } from '@ngrx/signals';
import { withEntities } from '@ngrx/signals/entities';
import { initialListState } from './list.state';
import { withListComputed } from './list.computed';
import { withListMethods } from './list.methods';
import { withListRealtime } from './list.realtime';

export const ListStore = signalStore(
  { providedIn: 'root' },
  withEntities<List>(),
  withState(initialListState),
  withListComputed(),
  withListMethods(),
  withListRealtime(),
);
```

Thứ tự quan trọng: feature nào dùng gì thì thứ đó phải được khai báo **trước** nó
trong danh sách.

---

## 3. Vì sao cấm `addEntity`

Đây là bug **đã từng xảy ra đúng trong phần của bạn**: tạo một cột thì thấy nó
hiện **hai lần**.

Server phát sự kiện WebSocket **ngay lúc ghi xong database**, còn phản hồi HTTP
còn phải đi hết chặng về — nên sự kiện thường tới **trước** khi `await
api.post(...)` trả lời. Chỗ nào cũng "thêm mới" thì phần tử vào state hai lần.

Đọc lại chú thích trong `list.service.ts` cũ, đoạn `createList()` — nó ghi rõ cái
bẫy này. `upsertEntity` xử lý đúng cả hai chiều.

**Kể cả trong `create()` của chính bạn cũng phải upsert**, không phải chỉ trong
handler WebSocket.

---

## 4. Bẫy riêng của bạn #1 — gỡ nút thắt `board.ts`

`pages/board/board.ts` hiện **852 dòng** và `inject()` **12 service**. Nó tự tay
điều phối việc nạp dữ liệu cho toàn bộ trang.

Chuyển sang NgRx mà giữ nguyên cách này thì nó thành 12 lần inject store — y hệt
vấn đề cũ, chỉ đổi tên. **Cả ba bạn đều phải sửa file này**, nên nó là nguồn xung
đột merge lớn nhất của cả nhóm.

### Cách gỡ

Giai đoạn 0 đã tạo `RouteContextStore` giữ `activeBoardId` và `activeOrgId`. Mỗi
store **tự phản ứng** khi id đổi, thay vì chờ trang gọi:

```ts
withHooks({
  onInit(store, ctx = inject(RouteContextStore)) {
    // Tự nạp lại mỗi khi người dùng mở board khác.
    effect(() => {
      const boardId = ctx.activeBoardId();
      if (boardId) untracked(() => store.load(boardId));
    });
  },
}),
```

Sau khi cả 3 bạn làm xong, `board.ts` **hết nhiệm vụ điều phối** — chỉ còn dựng
giao diện. Đó là việc dọn cuối cùng của bạn ở tuần 3.

> **Quan trọng:** đừng chờ tới tuần 3 mới nói chuyện này. Ngay từ store đầu tiên
> của mỗi bạn đã phải theo kiểu tự-phản-ứng, nếu không thì `board.ts` không bao
> giờ nhỏ lại được.

---

## 5. Bẫy riêng của bạn #2 — chat và gợi ý AI

Hai store này liên kết với nhau qua `messageId`, và **đều nhận sự kiện realtime**.

### `ChatStore`

Tin nhắn gần như chỉ có thêm, ít sửa. Nhưng vẫn `upsertEntity` — người gửi cũng
nhận lại sự kiện `chat.message` của chính mình.

Sắp xếp theo `createdAt` trong `withComputed`, **không** dựa vào thứ tự chèn:
tin nhắn nạp theo trang có thể về không đúng thứ tự.

### `TaskSuggestionStore`

Gợi ý gắn vào tin nhắn sinh ra nó. Giữ nguyên `computed` tra theo `messageId`:

```ts
withComputed(({ entities }) => ({
  byMessageId: computed(() => {
    const map: Record<string, ChatTaskSuggestion> = {};
    for (const s of entities()) if (s.status === 'pending') map[s.messageId] = s;
    return map;
  }),
})),
```

`message-list.html` đang dùng đúng cấu trúc này để render chip ngay dưới tin nhắn
tương ứng — giữ nguyên hình dạng thì template không phải sửa.

**Hai sự kiện phải xử lý:** `suggestion.created` và `suggestion.resolved`. Cái
thứ hai nghĩa là *ai đó vừa chấp nhận hoặc bỏ qua* — chip phải tắt trên máy mọi
người, không riêng máy người bấm.

---

## 6. Ghi chú cho từng store còn lại

**`BoardStore`** — 331 dòng, có phần khôi phục từ `localStorage`. Đọc kỹ trước
khi bê nguyên: đây là tàn dư từ giai đoạn chạy dữ liệu giả.

> ⚠️ **Ảnh nền board vẫn nằm trong `localStorage` dưới dạng base64.** Cột
> `boards.background_image_path` ở database đang chờ một đường dẫn Storage, chưa
> có endpoint upload. **Đừng migrate chỗ này vào store** — để nguyên như cũ và
> ghi `TODO`, việc nối API là một task riêng.

**`BoardPrefsStore`** — tuỳ chọn hiển thị theo từng người (sao, bộ lọc, thu gọn).
Là state của *người dùng* chứ không phải của *board*, nên đừng gộp vào
`BoardStore`.

**`ActivityStore`** — chỉ đọc, chỉ thêm. Store đơn giản nhất phần bạn, làm sau
`BoardStore` để lấy đà.

---

## 7. Ranh giới — không đụng vào

| File | Của ai |
|---|---|
| `realtime.service.ts` | Đóng sau Giai đoạn 0, không ai sửa |
| `ngrx/route-context/` | Giai đoạn 0 |
| `ngrx/organization*/`, `ngrx/workspace*/`, `ngrx/auth*/`, `ngrx/notification*/` | Huy |
| `ngrx/card*/`, `ngrx/label*/`, `ngrx/checklist*/`, `ngrx/comment*/`, `ngrx/attachment*/` | Hoàng |
| `guards/*.ts` | Huy |

`pages/board/board.ts` **là của bạn** — nhưng vì cả ba bạn đều cần đụng vào lúc
nối store, hãy gộp mọi thay đổi ở file này vào cuối ngày, một lần, do bạn merge.

---

## 8. Xong là thế nào

Mỗi PR phải đủ:

- [ ] Service cũ **đã xoá** trong cùng PR
- [ ] Danh sách dùng `withEntities` + `upsertEntity`, không có `addEntity`
- [ ] Store **tự phản ứng** theo `RouteContextStore`, không chờ `board.ts` gọi
- [ ] Handler WebSocket đăng ký trong store, `realtime.service.ts` không đổi
- [ ] Mỗi store có ≥ 2 test: một đường thành công, một đường API hỏng
- [ ] Không có `any`, `npm run build` sạch
- [ ] Thử tay **hai tài khoản mở cùng một board**: A tạo cột → B thấy ngay, và
      **A chỉ thấy một cột**, không phải hai
- [ ] Thử tay chat: A nhắn câu giao việc → chip gợi ý hiện ở **B** mà không F5
