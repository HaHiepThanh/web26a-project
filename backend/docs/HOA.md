# HOÀ — Board, List, Label

> **Dùng với AI Agent:** mở [`PROMPT.md`](PROMPT.md), copy prompt mở đầu,
> thay `<TÊN>` bằng **Hoà** rồi dán vào AI Agent.

**Bạn phụ trách:** 14 endpoint.

**Thư mục của bạn:**
```
backend/src/modules/boards/
backend/src/modules/lists/
backend/src/modules/labels/
```

**Đừng đụng vào** `modules/auth/`, `modules/organizations|workspaces/` (Huy),
`modules/cards|comments|chat/` (Hoàng).

---

## Phần của bạn nhiều endpoint nhất — nhưng phần lớn giống nhau

14 endpoint nghe nhiều, nhưng **10 cái là CRUD lặp lại cùng một khuôn**. Làm xong
board là list và label chỉ là chép lại đổi tên bảng.

Ba cái thật sự cần nghĩ:
- `PATCH /lists/:id/position` — sắp xếp lại thứ tự cột (**khó nhất**)
- `POST /labels/cards/:cardId/:labelId` — gắn nhãn, dính chuyện trùng khoá chính
- `GET /boards?workspaceId=` — chỗ đầu tiên bạn phải tự kiểm tra quyền

---

## Trước khi bắt đầu — 3 việc

**1. Đọc 2 file này** (tiết kiệm cả buổi debug):
- [`CACH-LAM-1-ENDPOINT.md`](CACH-LAM-1-ENDPOINT.md) — công thức 6 bước
- [`TEST-BANG-POSTMAN.md`](TEST-BANG-POSTMAN.md) — cách lấy token

**2. Có `workspaceId` để test.** Bạn cần một workspace mới tạo được board.
Không phải chờ Huy — chạy `backend/postman/seed-du-lieu-test.sql` trong
Supabase → SQL Editor, nó tạo sẵn tổ chức + workspace + board + 3 cột + 3 thẻ.

Sau khi chạy, cuối kết quả có bảng id — dán `orgId` và `workspaceId` vào
environment Postman.

**3. Mở sẵn `src/modules/auth/auth.service.ts`** — code mẫu chuẩn nhất dự án.

---

## Thứ tự làm

| # | Endpoint | Ghi chú |
|---|---|---|
| 1 | `POST /boards` | có board trước đã |
| 2 | `GET /boards?workspaceId=` | để nhìn thấy #1 chạy chưa |
| 3 | `GET /boards/:id` | |
| 4 | `PATCH /boards/:id` | |
| 5 | `DELETE /boards/:id` | |
| 6 | `POST /lists` | 🔓 **xong cái này Hoàng bắt đầu được** |
| 7 | `GET /lists?boardId=` | |
| 8 | `PATCH /lists/:id` | đổi tên, dễ |
| 9 | `DELETE /lists/:id` | |
| 10 | `PATCH /lists/:id/position` | ⚠️ **khó nhất — để dành làm sau cùng của nhóm list** |
| 11 | `POST /labels` | |
| 12 | `GET /labels?boardId=` | |
| 13 | `POST /labels/cards/:cardId/:labelId` | |
| 14 | `DELETE /labels/cards/:cardId/:labelId` | |

---

## 1. `POST /boards` — tạo board

**Vào:** body `{ workspaceId, name }`
**Ra:** `201` + `{ id, orgId, workspaceId, name, visibility, background, createdBy, createdAt }`

### Điều dễ vấp nhất: `boards.org_id` là NOT NULL

Body chỉ gửi lên `workspaceId`, **không** có `orgId`. Nhưng bảng `boards` bắt buộc
có `org_id`. Bạn phải **tự đi tìm**: đọc workspace ra rồi lấy `org_id` của nó.

```ts
// Bước 1: tìm workspace, đồng thời lấy org_id
const { data: ws } = await this.supabase.client
  .from('workspaces')
  .select('id, org_id')
  .eq('id', workspaceId)
  .maybeSingle();

if (!ws) throw new NotFoundException('Không tìm thấy workspace.');

// Bước 2: người gọi có thuộc tổ chức đó không?
const { data: member } = await this.supabase.client
  .from('organization_members')
  .select('role')
  .eq('org_id', ws.org_id)
  .eq('user_id', uid)
  .maybeSingle();

if (!member) throw new ForbiddenException('Bạn không thuộc tổ chức này.');

// Bước 3: giờ mới insert, đã có org_id
await this.supabase.client
  .from('boards')
  .insert({ org_id: ws.org_id, workspace_id: workspaceId, name, created_by: uid })
  .select()
  .single();
```

Ba bước này bạn sẽ lặp lại ở gần như mọi endpoint còn lại — **tách thành hàm
private** dùng chung, vd `assertWorkspaceAccess(uid, workspaceId)` trả về `org_id`.

> Cùng lý do đó, `lists.org_id` và `labels.org_id` cũng NOT NULL. Với list/label
> thì đi vòng qua `boards` để lấy `org_id`.

### Giá trị hợp lệ

- `visibility`: `'workspace'` (mặc định) | `'private'` | `'public'`
- `background`: 1 trong 6 — `bg-board-blue`, `bg-board-purple`, `bg-board-green`,
  `bg-board-teal`, `bg-board-orange`, `bg-board-red`

Cả hai đều có CHECK ở database. Gửi giá trị lạ → 500 khó hiểu. **Chặn bằng DTO**
để ra 400 rõ ràng:

```ts
@IsOptional()
@IsIn(['workspace', 'private', 'public'])
visibility?: string;
```

**Test:** tạo xong mở Supabase → bảng `boards`, kiểm tra `org_id` đã được điền
(không phải null). Rồi thử `workspaceId` không tồn tại → **404**.

---

## 2–5. CRUD board còn lại

| # | Endpoint | Điểm cần nhớ |
|---|---|---|
| 2 | `GET /boards?workspaceId=` | Thiếu query param → trả `[]` chứ không lỗi. Vẫn phải kiểm tra quyền. |
| 3 | `GET /boards/:id` | Không tồn tại **hoặc** khác tổ chức → đều **404** |
| 4 | `PATCH /boards/:id` | Chỉ sửa field được gửi lên, đừng ghi đè field không gửi thành null |
| 5 | `DELETE /boards/:id` | Gắn `@Roles('owner')` — chờ Huy làm xong `RolesGuard` mới test được quyền |

### Chi tiết #4 — PATCH đúng cách

```ts
async update(uid: string, id: string, changes: { name?: string; visibility?: string }) {
  // ...kiểm tra quyền trước...

  const patch: Record<string, unknown> = {};
  if (changes.name !== undefined) patch.name = changes.name;
  if (changes.visibility !== undefined) patch.visibility = changes.visibility;

  if (Object.keys(patch).length === 0) {
    throw new BadRequestException('Không có gì để cập nhật.');
  }

  // ...update...
}
```

Viết thẳng `.update({ name: changes.name, visibility: changes.visibility })` thì
gửi mỗi `{name}` sẽ **xoá luôn** `visibility` thành null. Kiểu bug này rất khó
nhận ra vì endpoint vẫn trả 200.

### Chi tiết #5 — DELETE board

Đã có `@Roles('owner')` trong controller. Nhưng `RolesGuard` **hiện đang
`return true` vô điều kiện** (việc của Huy) — nên giờ ai gọi cũng xoá được.

Bạn **cứ làm phần xoá của mình**, đừng chờ. Khi Huy xong guard, chạy lại test này
bằng tài khoản member để xác nhận ra 403.

`DELETE` sẽ tự xoá list/card/label bên trong nhờ `ON DELETE CASCADE` — không cần
tự xoá tay từng bảng.

---

## 6–9. List — CRUD

Y hệt khuôn của board, đổi bảng thành `lists`, lấy `org_id` qua `boards`.

### `POST /lists` — `position` tính thế nào

`lists.position` là **NOT NULL**, không có mặc định. Cột mới luôn thêm vào **cuối**:

```ts
// Lấy position lớn nhất hiện có trong board
const { data: last } = await this.supabase.client
  .from('lists')
  .select('position')
  .eq('board_id', boardId)
  .order('position', { ascending: false })
  .limit(1)
  .maybeSingle();

const position = last ? last.position + 1 : 1;
```

Board chưa có cột nào thì `last` là `null` → dùng `1`. Quên trường hợp này là
`null + 1 = NaN` → INSERT vỡ.

### `GET /lists?boardId=`

**Bắt buộc** `.order('position', { ascending: true })`. Không có `ORDER BY` thì
Postgres trả theo thứ tự tuỳ ý — hôm nay đúng, mai đổi, frontend hiển thị lộn xộn.

---

## 10. ⚠️ `PATCH /lists/:id/position` — phần khó nhất

**Vào:** body `{ position: number }`

### Hiểu đúng vấn đề trước khi viết code

`position` là **`double precision`** — số thực, không phải số nguyên. Đây là món
quà: kéo 1 cột vào **giữa** 2 cột khác thì chỉ cần lấy trung bình, **không phải
đánh số lại toàn bộ**.

```
Trước:   [Todo 1.0]  [Doing 2.0]  [Done 3.0]

Kéo Done vào giữa Todo và Doing:
         position mới = (1.0 + 2.0) / 2 = 1.5

Sau:     [Todo 1.0]  [Done 1.5]  [Doing 2.0]
```

Chỉ **1 câu UPDATE, 1 dòng thay đổi**. Todo và Doing không đụng gì tới.

### Có 2 cách làm — chọn 1

**Cách A — frontend tự tính (đơn giản hơn, khuyên dùng).**
Frontend biết cột được thả vào giữa cái nào với cái nào, nên nó tự tính `1.5` rồi
gửi thẳng lên. Backend chỉ cần:

```ts
async reorder(uid: string, id: string, position: number) {
  // ...kiểm tra quyền...
  await this.supabase.client
    .from('lists')
    .update({ position })
    .eq('id', id);
}
```

Body Postman: `{ "position": 1.5 }`. Nhớ validate `@IsNumber()` trong DTO.

**Cách B — backend tự tính.** Frontend gửi **vị trí thứ mấy** (0, 1, 2...),
backend đọc cả danh sách rồi tính số thực ở giữa:

```ts
// 1. Đọc tất cả list của board, sắp theo position
// 2. Bỏ list đang kéo ra khỏi danh sách
// 3. Nhìn 2 hàng xóm ở vị trí đích:
//    - Chèn đầu:  position = phần_tử_đầu.position - 1
//    - Chèn cuối: position = phần_tử_cuối.position + 1
//    - Chèn giữa: position = (trái.position + phải.position) / 2
// 4. UPDATE 1 dòng
```

Cách B đúng đắn hơn về mặt thiết kế (backend không tin dữ liệu client), nhưng
nhiều code hơn. **Làm cách A trước cho chạy được, có thời gian thì nâng lên B.**

### Test — 4 trường hợp, phải thử đủ

Chạy `GET /lists?boardId=` sau mỗi lần để xem thứ tự thật:

| Thử | Kỳ vọng |
|---|---|
| Kéo cột đầu → cuối | nó nằm cuối danh sách |
| Kéo cột cuối → đầu | nó nằm đầu |
| Kéo vào giữa | đúng vị trí, 2 cột kia không đổi |
| Kéo về đúng chỗ cũ | không có gì đổi, không lỗi |

> ⚠️ Bẫy hay gặp: kéo đi kéo lại nhiều lần thì các position sát nhau dần
> (1.5 → 1.25 → 1.125...). Về lý thuyết sau ~50 lần là chạm giới hạn độ chính xác
> của số thực. Với bài này **không cần xử lý** — chỉ cần biết là có, nhắc trong
> phần báo cáo là được.

---

## 11–12. Label — tạo và liệt kê

Khuôn CRUD quen thuộc. Lưu ý:

- `labels.color` là **mã hex** dạng `'#61bd4f'`. Validate bằng
  `@Matches(/^#[0-9a-fA-F]{6}$/)` để ra 400 thay vì lưu rác vào database.
- `labels.org_id` NOT NULL → lấy qua `boards` như phần list.
- Nhãn thuộc **board**, không thuộc card. Card chỉ *gắn* nhãn có sẵn.

---

## 13–14. Gắn / gỡ nhãn khỏi thẻ

```
POST   /labels/cards/:cardId/:labelId    gắn
DELETE /labels/cards/:cardId/:labelId    gỡ
```

Không có body — mọi thứ nằm trên đường dẫn.

### Điều dễ vấp: gắn 2 lần

Bảng `card_labels` có **khoá chính gộp `(card_id, label_id)`**. Gắn cùng một nhãn
lần thứ hai sẽ vỡ với lỗi `23505`.

Hai cách xử lý, chọn 1:

```ts
// Cách 1 — upsert: gắn lại lần nữa cũng không sao, vẫn 201
await this.supabase.client
  .from('card_labels')
  .upsert({ card_id: cardId, label_id: labelId }, { ignoreDuplicates: true });

// Cách 2 — bắt lỗi rồi báo rõ
if (error?.code === '23505') {
  throw new ConflictException('Thẻ này đã có nhãn đó rồi.');
}
```

Cách 1 hợp lý hơn ở đây: người dùng bấm 2 lần thì kết quả vẫn là "thẻ có nhãn",
báo lỗi làm gì.

### Kiểm tra bắt buộc trước khi gắn

**Card và label phải cùng một board.** Không kiểm tra thì gắn được nhãn của board
A vào thẻ của board B — dữ liệu hỏng mà không ai phát hiện ngay.

```
labels.board_id  ==  (lists.board_id của cái list chứa card đó)
```

Nhớ: `cards` **không có** `board_id`, phải đi vòng qua `lists`.

Khác board → **400** hoặc **404**, không được cho qua.

**Test:** gắn nhãn 2 lần liên tiếp → không được tạo 2 dòng (kiểm tra bảng
`card_labels` trong Supabase). Gỡ nhãn chưa từng gắn → **404**, không phải 500.

---

## Xong khi nào

- [ ] 14 endpoint chạy đúng, mỗi cái có DTO riêng
- [ ] `boards.org_id`, `lists.org_id`, `labels.org_id` **đều được điền** — kiểm tra
      trong Supabase, không cái nào null
- [ ] `GET /lists` luôn sắp theo `position` tăng dần
- [ ] Đã test đủ **4 trường hợp** kéo thả cột ở mục 10
- [ ] Gắn nhãn 2 lần không tạo 2 dòng
- [ ] Card và label khác board → chặn được
- [ ] `visibility` / `background` / `color` sai giá trị → **400**, không phải 500
- [ ] Mọi query đều lọc theo tổ chức của user
- [ ] Thư mục `5. Kiem tra bao mat` trong Postman chạy sạch
