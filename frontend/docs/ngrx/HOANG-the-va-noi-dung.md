# Hoàng — Thẻ & nội dung thẻ

> Chuyển miền **thẻ, nhãn, checklist, bình luận, đính kèm** sang NgRx SignalStore.
>
> Khối lượng: ~959 dòng, 5 service. **Ít dòng nhất nhưng khó nhất.** Đọc hết mục
> 4 và mục 5 trước khi gõ dòng code đầu tiên.

---

## 1. Phần của bạn

| Service hiện tại | Dòng | Store mới | Thứ tự làm |
|---|---:|---|---|
| `card.service.ts` | 308 | `CardStore` | **1 — khó nhất** |
| `checklist.service.ts` | 167 | `ChecklistStore` | 2 |
| `comment.service.ts` | 144 | `CommentStore` | 3 |
| `attachment.service.ts` | 201 | `AttachmentStore` | 4 |
| `label.service.ts` | 139 | `LabelStore` | 5 |

**Tin tốt:** bốn store 2–5 có **cùng một hình dạng** (`Record<cardId, X[]>`). Làm
xong `CardStore` là bốn cái sau gần như chép lại. Nên đừng nản ở cái đầu tiên.

**`LabelStore` để cuối** vì nó là cái duy nhất khác kiểu — quan hệ nhiều-nhiều.

---

## 2. Quy ước chung — bắt buộc

Áp dụng cho cả ba bạn. Vi phạm là bị trả PR.

1. **Mỗi miền một thư mục** trong `frontend/src/app/ngrx/`, tách nhỏ theo vai
   trò — xem "Bố cục thư mục" ngay bên dưới. Không gom cả store vào một file.
2. **Xoá service cũ trong CÙNG PR** với store mới. Không có giai đoạn "cả hai
   cùng tồn tại".
3. **Mọi danh sách dùng `withEntities`, cập nhật bằng `upsertEntity`.**
   `addEntity` bị **cấm** — server phát sự kiện WebSocket trước khi HTTP trả lời,
   nên "thêm mới" làm phần tử vào state hai lần. Kể cả trong `create()` của chính
   bạn cũng phải upsert.
4. **Không sửa `realtime.service.ts`.** Store tự đăng ký handler.
5. **Không đưa ID token vào state.**
6. **Sắp xếp bằng `withComputed`.** `entities()` trả theo thứ tự chèn, không theo
   `position`.
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

## 3. Đổi cấu trúc: từ lồng nhau sang phẳng

Cả 5 service của bạn đang giữ state **lồng theo cha**:

```ts
readonly cardsByList     = signal<Record<string, Card[]>>({});           // card
readonly itemsByCard     = signal<Record<string, ChecklistItem[]>>({});  // checklist
readonly commentsByCard  = signal<Record<string, Comment[]>>({});        // comment
readonly byCard          = signal<Record<string, Attachment[]>>({});     // attachment
```

Với `withEntities` thì state thành **phẳng**, gom nhóm ở tầng `computed`:

```ts
export const CardStore = signalStore(
  { providedIn: 'root' },

  withEntities<Card>(),                        // phẳng: entityMap + ids
  withState({
    savingIds: new Set<string>() as ReadonlySet<string>,
    errorIds:  new Set<string>() as ReadonlySet<string>,
  }),

  withComputed(({ entities }) => ({
    // Gom nhóm + sắp xếp ở đây, KHÔNG lưu trong state.
    cardsByList: computed(() => {
      const map: Record<string, Card[]> = {};
      for (const c of entities()) (map[c.listId] ??= []).push(c);
      for (const arr of Object.values(map)) arr.sort((a, b) => a.position - b.position);
      return map;
    }),
  })),
  ...
);
```

**Vì sao đáng đổi:** cấu trúc lồng nhau là nguyên nhân gốc của lỗi ở mục 4. Khi
state phẳng, sửa một thẻ chỉ đụng đúng một entity — không phải ghi đè cả cụm.

`cardsByList` giữ nguyên tên và nguyên hình dạng, nên **component không phải
sửa**.

---

## 4. Bẫy riêng #1 — hoàn tác đè lên thay đổi của người khác

**Đây là lỗi đang có sẵn trong mã hiện tại.** Bạn là người sửa nó.

`card.service.ts`, `checklist.service.ts`, `attachment.service.ts` đều làm kiểu
này:

```ts
const previous = this.cardsByList();   // chụp TOÀN BỘ collection
...cập nhật lạc quan...
try   { await api.patch(...); }
catch { this.cardsByList.set(previous); }   // ⚠️ khôi phục TOÀN BỘ
```

Vấn đề: giữa lúc chụp và lúc thất bại, một sự kiện WebSocket của **người khác**
có thể về. Khi rollback, `set(previous)` **xoá luôn thay đổi của họ** — và không
ai biết, vì màn hình chỉ đơn giản là quay về trạng thái cũ.

### Cách làm đúng

Hoàn tác **đúng một entity** vừa đụng, không đụng phần còn lại:

```ts
async moveCard(cardId: string, toListId: string, position: number): Promise<void> {
  const before = store.entityMap()[cardId];
  if (!before) return;

  patchState(store, upsertEntity({ ...before, listId: toListId, position }));
  patchState(store, { savingIds: withId(store.savingIds(), cardId) });

  try {
    const row = await api.patch<ApiCard>(`/cards/${cardId}/move`, { toListId, position });
    patchState(store, upsertEntity(toCard(row)));
  } catch (e) {
    patchState(store, upsertEntity(before));   // ✅ chỉ trả lại đúng thẻ này
    patchState(store, { errorIds: withId(store.errorIds(), cardId) });
  } finally {
    patchState(store, { savingIds: withoutId(store.savingIds(), cardId) });
  }
}
```

`withId` / `withoutId` là hai hàm tiện ích nhỏ bạn tự viết ở đầu file — thêm và
bớt một id khỏi `ReadonlySet`, vì `Set` phải tạo bản sao mới thì signal mới coi là
đã đổi:

```ts
const withId    = (s: ReadonlySet<string>, id: string) => new Set(s).add(id);
const withoutId = (s: ReadonlySet<string>, id: string) => { const c = new Set(s); c.delete(id); return c; };
```

Đây là lý do mục 3 bắt đổi sang state phẳng — với `Record<listId, Card[]>` thì
không làm được kiểu này cho gọn.

---

## 5. Bẫy riêng #2 — `position` sau khi kéo thẻ

Đọc `moveCardOptimistic()` trong `card.service.ts` (dòng 238). Nó đang làm **hai
việc mâu thuẫn nhau**:

```ts
// (1) Cục bộ: đánh số lại TẤT CẢ thẻ trong hai cột thành 0, 1, 2, 3...
[fromListId]: fromArr.map((c, i) => ({ ...c, position: i })),
[toListId]:   toArr.map((c, i) => ({ ...c, position: i })),

// (2) Gửi lên server: CHỈ một thẻ, với position là trung điểm hai hàng xóm
position = (before.position + after.position) / 2;
```

Server chỉ biết về thay đổi của **một** thẻ, còn máy bạn đã đánh số lại **cả hai
cột**. Từ lúc đó state cục bộ và database **lệch nhau** cho tới lần F5 kế tiếp.
Nếu lúc này có sự kiện `card.moved` của người khác về, với `position` là số thực
thật, thứ tự trên màn hình sẽ sai.

### Cách làm đúng

`position` là `double precision` chính vì để chèn được vào giữa mà **không phải
đánh số lại cột**. Nên chỉ đổi `position` của **đúng thẻ được kéo**, cả cục bộ
lẫn trên server, bằng cùng một con số trung điểm:

```ts
const neighbours = cardsInTarget.filter((c) => c.id !== cardId);
const before = neighbours[index - 1];
const after  = neighbours[index];

const position =
  !before ? (after?.position ?? 1) - 1
  : !after ? before.position + 1
  : (before.position + after.position) / 2;

// Dùng CHÍNH con số này cho cả cập nhật lạc quan lẫn lời gọi API.
```

Các thẻ khác giữ nguyên `position` — không đụng tới. `cardsByList` ở `withComputed`
tự sắp lại đúng thứ tự.

> Phần tính trung điểm trong mã cũ **đã đúng rồi** — chỉ có đoạn đánh số lại cục
> bộ là thừa và gây lệch. Giữ phần tính, bỏ phần đánh số lại.

---

## 6. Bốn store còn lại

**`ChecklistStore`, `CommentStore`, `AttachmentStore`** — cùng khuôn:
`withEntities<X>()` phẳng + `withComputed` gom theo `cardId`. Làm xong `CardStore`
thì mỗi cái chỉ mất vài giờ.

`AttachmentStore` có thêm cờ `uploading` và URL ký sẵn hết hạn sau 1 giờ — **đừng
cache URL đó vào state lâu dài**, hết hạn là ảnh vỡ.

**`LabelStore`** — khác kiểu, làm cuối. Nhãn có quan hệ **nhiều-nhiều** với thẻ:

```ts
withEntities<Label>(),                                   // nhãn của board
withState({ cardLabelIds: {} as Record<string, string[]> }),  // bảng nối
```

**Đừng nhét mảng nhãn vào bên trong entity thẻ.** Một nhãn dùng ở 20 thẻ; nhân
bản nó ra 20 chỗ thì đổi tên nhãn phải sửa 20 nơi, và chắc chắn sẽ sót.

Ba sự kiện phải xử lý: `label.created`, `label.attached`, `label.detached`. Hai
cái sau chỉ đụng bảng nối, không đụng entity nhãn.

---

## 7. Ranh giới — không đụng vào

| File | Của ai |
|---|---|
| `realtime.service.ts` | Đóng sau Giai đoạn 0, không ai sửa |
| `ngrx/route-context/` | Giai đoạn 0 |
| `ngrx/organization*/`, `ngrx/workspace*/`, `ngrx/auth*/`, `ngrx/notification*/` | Huy |
| `ngrx/board*/`, `ngrx/list*/`, `ngrx/chat*/`, `ngrx/activity*/` | Hoà |
| `pages/board/board.ts` | Hoà — gửi thay đổi cho Hoà gộp, đừng tự sửa |

---

## 8. Xong là thế nào

Mỗi PR phải đủ:

- [ ] Service cũ **đã xoá** trong cùng PR
- [ ] State **phẳng** (`withEntities`), gom nhóm ở `withComputed`
- [ ] `upsertEntity` ở mọi nơi, không có `addEntity`
- [ ] Hoàn tác **theo từng entity**, không `set()` cả collection — mục 4
- [ ] Kéo thẻ chỉ đổi `position` của đúng thẻ được kéo — mục 5
- [ ] Handler WebSocket đăng ký trong store, `realtime.service.ts` không đổi
- [ ] Mỗi store có ≥ 2 test: một đường thành công, một đường API hỏng phải hoàn
      tác **đúng một** entity
- [ ] Không có `any`, `npm run build` sạch
- [ ] Thử tay **hai tài khoản mở cùng một board**:
      - A kéo thẻ → B thấy đúng vị trí
      - Tắt mạng máy A rồi kéo → thẻ bật về chỗ cũ, **và thẻ khác không nhúc nhích**
      - A kéo thẻ 1 trong lúc B kéo thẻ 2 → cả hai thay đổi đều còn
