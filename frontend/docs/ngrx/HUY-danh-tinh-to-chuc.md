# Huy — Danh tính & Tổ chức

> Chuyển miền **danh tính, tổ chức, workspace, thông báo** từ signal service sang
> NgRx SignalStore.
>
> Khối lượng: ~1 089 dòng, 6 service. Phần lớn là CRUD thẳng — không khó, nhưng
> **đụng nhiều nơi nhất** trong cả app.

---

## 1. Phần của bạn

| Service hiện tại | Dòng | Store mới | Thứ tự làm |
|---|---:|---|---|
| `organization.service.ts` | 438 | `OrganizationStore` | **1** |
| `workspace.service.ts` | 131 | `WorkspaceStore` | 2 |
| `workspace-ui.service.ts` | 52 | gộp vào `WorkspaceStore` | 2 |
| `notification.service.ts` | 116 | `NotificationStore` | 3 |
| `user-search.service.ts` | 78 | `UserSearchStore` | 4 |
| `auth.service.ts` | 274 | `AuthStore` | **5 — làm cuối** |

**Vì sao `auth` làm cuối:** `AuthService` đang bị `inject()` ở **18 file** — nhiều
nhất toàn app. Đụng vào nó là ảnh hưởng khắp nơi, nên để dành tới lúc bạn đã quen
tay với 5 store trước.

**Vì sao `organization` làm đầu:** nó lớn nhất (14 signal công khai) và chứa đoạn
khó nhất của bạn (mục 4). Làm sớm khi còn nhiều thời gian sửa.

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
5. **Không đưa ID token vào state.** Hiện token lấy theo yêu cầu qua
   `getIdToken()`. Giữ nguyên như vậy — state bị DevTools ghi lại.
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

Đây là bug **đã từng xảy ra** trong dự án này: tạo một cột thì thấy nó hiện **hai
lần**.

Nguyên nhân: server phát sự kiện WebSocket **ngay lúc ghi xong database**, còn
phản hồi HTTP thì còn phải đi hết chặng về. Nên sự kiện thường tới **trước** khi
`await api.post(...)` trả lời. Nếu chỗ nào cũng "thêm mới" thì phần tử vào state
hai lần.

`upsertEntity` xử lý đúng cả hai chiều: có id rồi thì ghi đè, chưa có thì thêm.

**Kể cả trong hàm `create()` của chính bạn cũng phải upsert**, không phải chỉ
trong handler WebSocket:

```ts
async createWorkspace(orgId: string, name: string): Promise<void> {
  const row = await api.post<ApiWorkspace>('/workspaces', { orgId, name });
  patchState(store, upsertEntity(toWorkspace(row)));  // KHÔNG phải addEntity
}
```

---

## 4. Bẫy riêng của bạn — cuộc đua lúc khởi động

Đây là lỗi vừa được sửa hồi tháng 8, **rất dễ làm hỏng lại** khi viết lại.

### Chuyện gì đã xảy ra

`AuthService.currentUser` khởi tạo từ **localStorage** nên có giá trị ngay lập
tức. Firebase thì khôi phục phiên từ IndexedDB, chậm hơn vài trăm mili-giây.

1. Store thấy đã có uid → gọi nạp danh sách tổ chức ngay
2. `getIdToken()` trả `null` vì Firebase chưa xong → request đi **không có header
   Authorization** → backend trả **401**
3. Danh sách tổ chức rỗng

Nửa sau mới là chỗ độc: cờ "đã nạp" **đã bị đặt rồi**, nên mọi lần gọi về sau đều
trả lại đúng kết quả hỏng đó. Không có đường nào thử lại ngoài F5. Người dùng đã
có 3 tổ chức nhưng bị đá sang `/onboarding` và tưởng mất sạch.

### Ba luật phải giữ nguyên trong `OrganizationStore`

**Luật 1 — chưa có token thì đừng đánh dấu là đã nạp.**

```ts
async ensureLoaded(): Promise<void> {
  const uid = auth.currentUser()?.id ?? null;
  if (!uid) return;
  if (store.loadedForUid() === uid && store.status() === 'loaded') return;

  const token = await firebase.getIdToken();
  if (!token) return;               // ⚠️ KHÔNG đặt loadedForUid ở đây
  patchState(store, { loadedForUid: uid, status: 'loading' });
  ...
}
```

**Luật 2 — nạp hỏng thì xoá cờ, để lần sau thử lại được.**

```ts
catch (e) {
  patchState(store, { loadedForUid: null, status: 'error', error: describeError(e) });
}
```

**Luật 3 — guard không được coi "nạp hỏng" là "không có tổ chức nào".**

Ba file sau đang dựa vào `loadError()`, đổi tên hay đổi kiểu là chúng hỏng:

- `frontend/src/app/guards/org-slug.guard.ts`
- `frontend/src/app/guards/onboarding.guard.ts`

Mảng rỗng vì *lỗi mạng* khác hẳn mảng rỗng vì *không có quyền*. Trả 404 hay đá
sang `/onboarding` trong trường hợp đầu là nói dối người dùng.

### Test bắt buộc cho store này

```
Cho getIdToken() trả null ở lần gọi đầu
  → ensureLoaded() KHÔNG được đánh dấu đã nạp
  → gọi lại lần hai (token đã có) PHẢI nạp thật và ra đủ tổ chức
```

Đây là test quan trọng nhất trong toàn bộ phần của bạn.

---

## 5. Ghi chú cho từng store còn lại

**`WorkspaceStore`** — gộp luôn `workspace-ui.service.ts` (52 dòng, chỉ là trạng
thái đóng/mở của giao diện). Trạng thái UI để trong `withState`, đừng làm entity.

**`NotificationStore`** — nhận sự kiện `invite.created`, `invite.responded`,
`member.removed`, `card.assigned` qua phòng riêng `user:<uid>`, **không phụ thuộc
người dùng đang mở board nào**. Nghĩa là store này phải đăng ký handler ngay lúc
`onInit`, không chờ vào board.

**`UserSearchStore`** — có debounce theo từ khoá. Dùng `signalMethod` hoặc
`rxMethod` từ `@ngrx/signals/rxjs-interop`; đây là chỗ **duy nhất** trong phần của
bạn mà RxJS đáng dùng.

**`AuthStore`** — phần lớn 274 dòng là gọi Firebase, không phải state. Chỉ 3
signal thật. Đừng cố biến mọi hàm thành method của store: giữ `FirebaseService`
nguyên vẹn, `AuthStore` chỉ giữ *trạng thái* người dùng hiện tại.

---

## 6. Ranh giới — không đụng vào

| File | Của ai |
|---|---|
| `realtime.service.ts` | Đóng sau Giai đoạn 0, không ai sửa |
| `ngrx/route-context/` | Giai đoạn 0 |
| `store/board*.store.ts`, `ngrx/list*/`, `ngrx/chat*/` | Hoà |
| `ngrx/card*/`, `ngrx/label*/`, `ngrx/checklist*/`, `ngrx/comment*/`, `ngrx/attachment*/` | Hoàng |
| `pages/board/board.ts` | Hoà |

Cần một thay đổi ngoài ranh giới → nhắn trong nhóm, đừng tự sửa.

---

## 7. Xong là thế nào

Mỗi PR phải đủ:

- [ ] Service cũ **đã xoá** trong cùng PR
- [ ] Danh sách dùng `withEntities` + `upsertEntity`, không có `addEntity`
- [ ] Handler WebSocket đăng ký trong store, `realtime.service.ts` không đổi
- [ ] Có test cuộc đua token (mục 4) cho `OrganizationStore`
- [ ] Mỗi store có ≥ 2 test: một đường thành công, một đường API hỏng
- [ ] Không có `any`, `npm run build` sạch
- [ ] Thử tay: đăng nhập tài khoản đã có tổ chức → **không** bị đá sang
      `/onboarding`; tắt backend rồi bật lại → tự phục hồi không cần F5
