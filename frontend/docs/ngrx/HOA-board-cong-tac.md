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

1. **Một store một file:** `frontend/src/app/store/<ten>.store.ts`
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
| `store/route-context.store.ts` | Giai đoạn 0 |
| `store/organization*`, `store/workspace*`, `store/auth*`, `store/notification*` | Huy |
| `store/card*`, `store/label*`, `store/checklist*`, `store/comment*`, `store/attachment*` | Hoàng |
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
