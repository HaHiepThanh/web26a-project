# HOÀNG — Card, Comment, Chat, Activity

> **Dùng với AI Agent:** mở [`PROMPT.md`](PROMPT.md), copy prompt mở đầu,
> thay `<TÊN>` bằng **Hoàng** rồi dán vào AI Agent.

**Bạn phụ trách:** 10 endpoint chính + 1 bonus.

**Thư mục của bạn:**
```
backend/src/modules/cards/
backend/src/modules/comments/
backend/src/modules/chat/
backend/src/modules/activity/     ← bonus
```

> `modules/ai/` (AI gợi ý tạo thẻ) **đã tạm tắt**, không nằm trong bài của bạn.
> Thầy sẽ giao sau khi 10 endpoint chính xong xuôi.

**Đừng đụng vào** `modules/auth/`, `modules/organizations|workspaces/` (Huy),
`modules/boards|lists|labels/` (Hoà).

---

## Đọc phần này trước — 5 phút, đỡ được cả buổi

### Một request đi qua những đâu

```
Postman gửi:  POST /comments  +  header Authorization  +  body JSON
    │
    ▼
FirebaseAuthGuard    kiểm tra token, gắn req.user = { uid, email, ... }
    │                sai token → 401, dừng luôn ở đây
    ▼
ValidationPipe       kiểm tra body theo DTO → sai thì 400
    │
    ▼
Controller           chỉ nhận tham số rồi gọi service (đã viết sẵn cho bạn)
    │
    ▼
Service              ← BẠN VIẾT Ở ĐÂY
    │
    ▼
Supabase             lưu vào database
```

**Việc của bạn gần như chỉ nằm ở service.** Controller đã viết sẵn, bạn chỉ điền
ruột vào những hàm đang là `// TODO`.

### 5 câu Supabase — chép ra giấy dán màn hình

```ts
const sb = this.supabase.client;

// ĐỌC nhiều dòng
await sb.from('cards').select('*').eq('list_id', listId).order('position');

// ĐỌC 1 dòng — maybeSingle() trả null nếu không có
await sb.from('cards').select('*').eq('id', id).maybeSingle();

// GHI mới — .select() bắt buộc nếu muốn nhận lại dòng vừa tạo
await sb.from('cards').insert({ ... }).select().single();

// SỬA
await sb.from('cards').update({ title }).eq('id', id).select().single();

// XOÁ
await sb.from('cards').delete().eq('id', id);
```

**Supabase không ném lỗi.** Nó luôn trả về `{ data, error }`. Không kiểm tra
`error` thì lỗi trôi qua âm thầm, `data` thành `null` mà bạn không biết vì sao:

```ts
const { data, error } = await sb.from('cards').insert({ ... }).select().single();
if (error) {
  this.logger.error(`Tạo card thất bại: ${error.message}`);
  throw new InternalServerErrorException('Không tạo được thẻ');
}
return data;
```

### Tên cột là snake_case

Database: `list_id`, `org_id`, `created_by`, `due_date`, `assignee_id`.
Viết `listId` trong câu query → *column does not exist*.

### 3 điều nguy hiểm

**1. `cards` KHÔNG có cột `board_id`.** Thẻ thuộc **cột (list)**, cột mới thuộc board:

```
board  →  lists  →  cards
```

Muốn lấy thẻ của 1 board phải đi 2 bước — xem endpoint #2.

**2. `cards.org_id` là NOT NULL** nhưng body không gửi lên. Phải tự lấy qua `lists`.

**3. `user_id` LẤY TỪ TOKEN, không lấy từ body.**

```ts
// ✅ ĐÚNG — controller đã viết sẵn thế này
create(@CurrentUser() user, @Body() body) {
  return this.comments.create(body.cardId, user.uid, body.content);
}                                          //  ↑ từ token

// ❌ SAI — ai cũng bình luận giả danh người khác được
create(@Body() body) {
  return this.comments.create(body.cardId, body.userId, body.content);
}
```

Controller đã đúng sẵn — **đừng sửa thành cách sai**.

---

## Trước khi bắt đầu — 3 việc

**1. Đọc 2 file này:**
- [`CACH-LAM-1-ENDPOINT.md`](CACH-LAM-1-ENDPOINT.md) — công thức 6 bước
- [`TEST-BANG-POSTMAN.md`](TEST-BANG-POSTMAN.md) — cách lấy token, test

**2. Có `listId` + `boardId` để test.** Bạn cần cột mới tạo được thẻ. Không phải
chờ Huy và Hoà — chạy `backend/postman/seed-du-lieu-test.sql` trong
Supabase → SQL Editor. Nó tạo sẵn tổ chức + workspace + board + 3 cột + 3 thẻ,
và in ra bảng id ở cuối để dán vào environment Postman.

**3. Mở `src/modules/auth/auth.service.ts` để cạnh màn hình.** Đó là code mẫu
chuẩn nhất trong dự án — mọi thứ bạn cần đều có ở đó.

---

## Thứ tự làm

| # | Endpoint | Độ khó |
|---|---|---|
| 1 | `POST /cards` | ⭐ bắt đầu ở đây |
| 2 | `GET /cards?boardId=` | ⭐⭐ đi 2 bước qua `lists` |
| 3 | `PATCH /cards/:id` | ⭐ |
| 4 | `DELETE /cards/:id` | ⭐ dễ nhất |
| 5 | `POST /comments` | ⭐ |
| 6 | `GET /comments?cardId=` | ⭐⭐ có join |
| 7 | `DELETE /comments/:id` | ⭐⭐ kiểm tra đúng chủ |
| 8 | `POST /chat` | ⭐ y hệt #5 |
| 9 | `GET /chat?boardId=` | ⭐ y hệt #6 |
| 10 | `PATCH /cards/:id/move` | ⭐⭐⭐ **khó nhất, để cuối** |
| 11 | `GET /activity?boardId=` | *bonus — chỉ làm khi 10 cái trên đã xong* |

Làm **đúng thứ tự này**. Mỗi cái xong phải test được rồi mới sang cái tiếp theo.
Đừng viết cả 5 hàm rồi mới chạy thử — hỏng thì không biết hỏng ở đâu.

---

## 1. `POST /cards` — tạo thẻ ⭐

**Vào:** body `{ listId, title }`
**Ra:** `201` + `{ id, listId, title, position, priority: 'medium', ... }`

### Cần làm 3 việc

```
1. Tìm list → lấy org_id (vì cards.org_id NOT NULL mà body không gửi lên)
2. Tính position (thẻ mới nằm cuối cột)
3. INSERT
```

### Code đầy đủ — đọc kỹ từng dòng rồi tự gõ lại

```ts
import {
  Injectable, Logger, NotFoundException, InternalServerErrorException,
} from '@nestjs/common';

@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async create(listId: string, title: string, uid: string) {
    const sb = this.supabase.client;

    // --- Bước 1: tìm list để lấy org_id ---
    const { data: list } = await sb
      .from('lists')
      .select('id, org_id, board_id')
      .eq('id', listId)
      .maybeSingle();

    if (!list) throw new NotFoundException('Không tìm thấy cột.');

    // --- Bước 2: position = lớn nhất trong cột + 1 ---
    const { data: last } = await sb
      .from('cards')
      .select('position')
      .eq('list_id', listId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();

    const position = last ? last.position + 1 : 1;
    //                ↑ cột đang rỗng thì last = null. Quên chỗ này là NaN.

    // --- Bước 3: insert ---
    const { data, error } = await sb
      .from('cards')
      .insert({
        org_id: list.org_id,     // lấy được từ bước 1
        list_id: listId,
        title,
        position,
        created_by: uid,
      })
      .select()                  // ⚠️ thiếu dòng này thì data = null
      .single();

    if (error) {
      this.logger.error(`Tạo thẻ thất bại: ${error.message}`);
      throw new InternalServerErrorException('Không tạo được thẻ');
    }

    return data;
  }
}
```

> **`uid` từ đâu ra?** Controller hiện gọi `this.cards.create(body.listId, body.title)`
> — chưa truyền `uid`. Bạn sửa controller thêm `@CurrentUser() user: CurrentUserInfo`
> rồi truyền `user.uid` vào. Xem `comments.controller.ts` để biết cách viết,
> ở đó đã làm sẵn.

### Test

```json
POST /cards
{ "listId": "5eed0000-0000-4000-8000-000000000010", "title": "Thẻ đầu tiên của Hoàng" }
```

Kiểm tra **3 thứ**:
1. Status **201**
2. Kết quả có `id`, `position`, `priority: "medium"`
3. **Mở Supabase → Table Editor → bảng `cards`** — dòng mới phải có ở đó, `org_id`
   đã được điền (không null)

Rồi thử `listId` bịa ra → phải **404**, không phải 500.

---

## 2. `GET /cards?boardId=` — thẻ của cả board ⭐⭐

**Vào:** query `?boardId=`
**Ra:** `200` + mảng thẻ

`cards` không có `board_id` → phải đi **2 bước**:

```ts
async findAll(boardId: string) {
  const sb = this.supabase.client;

  // Bước 1: lấy id của mọi cột trong board
  const { data: lists } = await sb
    .from('lists')
    .select('id')
    .eq('board_id', boardId);

  if (!lists?.length) return [];   // board chưa có cột nào → không có thẻ nào

  const listIds = lists.map((l) => l.id);

  // Bước 2: lấy thẻ thuộc những cột đó — dùng .in() thay vì .eq()
  const { data, error } = await sb
    .from('cards')
    .select('*')
    .in('list_id', listIds)        // ← .in() nhận MẢNG id
    .order('position', { ascending: true });

  if (error) throw new InternalServerErrorException('Không đọc được danh sách thẻ');
  return data;
}
```

**Nhớ `.order('position')`.** Không có thì Postgres trả thứ tự tuỳ ý — hôm nay
đúng, mai lộn xộn, rất khó tìm ra nguyên nhân.

**Test:** gọi với `boardId` từ file seed → phải thấy 3 thẻ. Gọi thiếu
`?boardId=` → trả `[]` (không lỗi), đó là bình thường.

---

## 3. `PATCH /cards/:id` — sửa thẻ ⭐

**Vào:** body có thể có `{ title?, description?, priority?, dueDate?, assigneeId? }`

### Quy tắc: chỉ ghi field được gửi lên

```ts
const patch: Record<string, unknown> = {};
if (changes.title !== undefined) patch.title = changes.title;
if (changes.description !== undefined) patch.description = changes.description;
if (changes.priority !== undefined) patch.priority = changes.priority;
if (changes.dueDate !== undefined) patch.due_date = changes.dueDate;      // đổi tên!
if (changes.assigneeId !== undefined) patch.assignee_id = changes.assigneeId;

if (Object.keys(patch).length === 0) {
  throw new BadRequestException('Không có gì để cập nhật.');
}
```

Viết thẳng `.update({ title: changes.title, description: changes.description })`
thì gửi mỗi `{title}` sẽ **xoá luôn** description thành null. Bug này khó phát
hiện vì endpoint vẫn trả 200 bình thường.

Chú ý đổi tên: `dueDate` → `due_date`, `assigneeId` → `assignee_id`.

### ⚠️ `priority` chỉ nhận 3 giá trị

`'low'` | `'medium'` | `'high'`. Database có CHECK — gửi `'cao'` hay `'urgent'`
sẽ ra **500 khó hiểu**. Chặn bằng DTO để ra 400 rõ ràng:

```ts
// src/modules/cards/dto/update-card.dto.ts
import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCardDto {
  @IsOptional() @IsString() @MaxLength(200)
  title?: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsIn(['low', 'medium', 'high'], {
    message: 'priority chỉ nhận low, medium hoặc high.',
  })
  priority?: string;

  @IsOptional() @IsDateString()
  dueDate?: string;

  @IsOptional() @IsString()
  assigneeId?: string;
}
```

Rồi trong controller đổi `@Body() body: Record<string, unknown>` thành
`@Body() body: UpdateCardDto`. Xong — `ValidationPipe` ở `main.ts` tự chạy,
không phải làm gì thêm.

**Test:** gửi `{"priority": "urgent"}` → phải ra **400** kèm câu tiếng Việt bạn
vừa viết. Ra 500 là DTO chưa gắn vào controller.

---

## 4. `DELETE /cards/:id` — xoá thẻ ⭐

Dễ nhất. Nhưng nhớ 2 điều:

```ts
// 1. Kiểm tra tồn tại trước, để trả 404 thay vì "xoá thành công" cái không có
const { data: card } = await sb.from('cards').select('id').eq('id', id).maybeSingle();
if (!card) throw new NotFoundException('Không tìm thấy thẻ.');

// 2. Xoá
const { error } = await sb.from('cards').delete().eq('id', id);
```

Comment và card_labels của thẻ tự biến mất nhờ `ON DELETE CASCADE` — không cần
xoá tay.

---

## 5. `POST /comments` — thêm bình luận ⭐

**Vào:** body `{ cardId, content }` — **`userId` lấy từ token**
**Ra:** `201`

```ts
async create(cardId: string, userUid: string, content: string) {
  const sb = this.supabase.client;

  const { data: card } = await sb.from('cards').select('id').eq('id', cardId).maybeSingle();
  if (!card) throw new NotFoundException('Không tìm thấy thẻ.');

  const { data, error } = await sb
    .from('comments')
    .insert({ card_id: cardId, user_id: userUid, content })
    .select()
    .single();

  if (error) throw new InternalServerErrorException('Không lưu được bình luận');
  return data;
}
```

Controller đã truyền `user.uid` sẵn — **đừng đổi thành `body.userId`**.

Validate `content` không rỗng bằng DTO (`@IsString() @MinLength(1)`), nếu không
người ta gửi bình luận trắng vào database.

---

## 6. `GET /comments?cardId=` — bình luận của thẻ ⭐⭐

Phải **join sang `users`** để có tên người bình luận — trả về mỗi `user_id` thì
frontend chỉ hiển thị được chuỗi uuid.

```ts
const { data, error } = await sb
  .from('comments')
  .select('id, content, created_at, users(display_name, avatar_url)')
  //                                 ↑ tên BẢNG, không phải tên cột
  .eq('card_id', cardId)
  .order('created_at', { ascending: true });   // cũ → mới
```

Kết quả về dạng lồng:

```json
[{ "id": "...", "content": "...", "users": { "display_name": "Hoàng", "avatar_url": null } }]
```

Muốn phẳng thì map lại:

```ts
return data.map((c) => ({
  id: c.id,
  content: c.content,
  createdAt: c.created_at,
  user: c.users,
}));
```

> Cú pháp join của Supabase chỉ chạy khi có **khoá ngoại** giữa 2 bảng.
> `comments.user_id → users.id` đã có sẵn nên viết được. Báo lỗi
> *"Could not find a relationship"* → gõ sai tên bảng.

---

## 7. `DELETE /comments/:id` — chỉ tác giả được xoá ⭐⭐

Đây là endpoint **bảo mật** đầu tiên của bạn.

```ts
async remove(id: string, userUid: string) {
  const sb = this.supabase.client;

  const { data: comment } = await sb
    .from('comments')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();

  if (!comment) throw new NotFoundException('Không tìm thấy bình luận.');

  // ⚠️ DÒNG QUAN TRỌNG NHẤT
  if (comment.user_id !== userUid) {
    throw new ForbiddenException('Bạn chỉ xoá được bình luận của mình.');
  }

  await sb.from('comments').delete().eq('id', id);
}
```

Thiếu đoạn kiểm tra đó là **ai cũng xoá được bình luận của người khác**.

### Test — cần 2 tài khoản

Test bằng chính tài khoản của mình thì **luôn pass**, chẳng chứng minh được gì.

1. Postman → thư mục `0. BAT DAU O DAY` → sửa `testEmail` thành
   `hocvien-c2@test.dev` → chạy `Dang ky` + `Dang nhap`
2. Copy `idToken` mới, dán vào biến `{{otherIdToken}}` (đã có sẵn trong collection)
3. Tạo bình luận bằng tài khoản 1
4. Đổi header request `DELETE /comments/:id` thành `Bearer {{otherIdToken}}` → gửi

**Phải ra 403.** Ra 200 nghĩa là code chưa chặn được.

---

## 8–9. Chat — y hệt comment

| | Comment | Chat |
|---|---|---|
| Bảng | `comments` | `messages` |
| Gắn với | `card_id` | `board_id` |
| Cột phụ | — | **`org_id` NOT NULL** |

Chép code từ #5 và #6, đổi tên bảng và cột. Khác duy nhất:
**`messages.org_id` là NOT NULL** → phải lấy qua `boards` trước khi insert
(giống cách lấy `org_id` qua `lists` ở endpoint #1).

Sắp xếp `created_at` **tăng dần** (cũ → mới) — khung chat đọc từ trên xuống.

---

## 10. ⚠️ `PATCH /cards/:id/move` — khó nhất, để cuối cùng

**Vào:** body `{ toListId, position }`

### Nghe khó nhưng thật ra dễ — nhờ `position` là số thực

`position` kiểu `double precision`, **không phải số nguyên**. Đây là điểm mấu chốt:
kéo 1 thẻ vào **giữa** 2 thẻ khác chỉ cần lấy **trung bình**, không phải đánh số
lại cả cột.

```
Cột "Đang làm":   [Thẻ X: 1.0]   [Thẻ Y: 2.0]

Kéo thẻ Z vào giữa X và Y:
    position = (1.0 + 2.0) / 2 = 1.5

Kết quả:          [X: 1.0]  [Z: 1.5]  [Y: 2.0]
```

Sắp theo `position` tăng dần là ra đúng thứ tự. **Chỉ 1 câu UPDATE, 1 dòng đổi.**
X và Y không đụng gì tới.

### Cách làm — 3 bước

```ts
async move(id: string, toListId: string, position: number, uid: string) {
  const sb = this.supabase.client;

  // 1. Thẻ có tồn tại không?
  const { data: card } = await sb
    .from('cards').select('id, org_id, list_id').eq('id', id).maybeSingle();
  if (!card) throw new NotFoundException('Không tìm thấy thẻ.');

  // 2. Cột đích có tồn tại không? Và có CÙNG tổ chức không?
  const { data: toList } = await sb
    .from('lists').select('id, org_id').eq('id', toListId).maybeSingle();
  if (!toList) throw new NotFoundException('Không tìm thấy cột đích.');

  //    ⚠️ Không có dòng này thì kéo được thẻ sang board của công ty khác
  if (toList.org_id !== card.org_id) {
    throw new ForbiddenException('Không thể chuyển thẻ sang tổ chức khác.');
  }

  // 3. Cập nhật — 1 câu duy nhất, đổi cả list_id lẫn position
  const { data, error } = await sb
    .from('cards')
    .update({ list_id: toListId, position })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new InternalServerErrorException('Không chuyển được thẻ');
  return data;
}
```

Frontend biết thẻ được thả vào giữa 2 thẻ nào nên nó **tự tính `1.5` rồi gửi lên**.
Backend chỉ lưu. Đó là lý do endpoint này ngắn hơn bạn tưởng.

### Test — 4 trường hợp, phải thử đủ

Sau mỗi lần gọi `GET /cards?boardId=` để nhìn thứ tự thật:

| Thử | Body | Kỳ vọng |
|---|---|---|
| Trong cùng cột, xuống cuối | `{"toListId": "<cột hiện tại>", "position": 99}` | thẻ xuống cuối cột |
| Sang cột khác | `{"toListId": "<cột 2>", "position": 1}` | thẻ đổi cột |
| Vào cột đang rỗng | `{"toListId": "<cột 3>", "position": 1}` | không lỗi |
| Chèn vào giữa 2 thẻ | `{"toListId": "<cột>", "position": 1.5}` | đúng vị trí giữa |

Rồi thử `toListId` bịa ra → **404**.

---

## 11. `GET /activity?boardId=` — *bonus*

Hiện đang trả **dữ liệu giả trong bộ nhớ** (`activity.mock.ts`) để frontend có cái
mà hiển thị. Nhiệm vụ: nối vào bảng thật `activity_logs`.

```ts
async findAll(boardId: string) {
  const { data, error } = await this.supabase.client
    .from('activity_logs')
    .select('*, users(display_name, avatar_url)')
    .eq('board_id', boardId)
    .order('created_at', { ascending: false })   // mới nhất trước
    .limit(50);

  if (error) throw new InternalServerErrorException('Không đọc được nhật ký');
  return data;
}
```

`action_type` **chỉ nhận 6 giá trị**: `card_created`, `card_moved`, `card_updated`,
`card_deleted`, `card_assigned`, `comment_added`. Sai là vỡ CHECK constraint.

**Giữ nguyên chữ ký hàm `record()`** — chỗ khác đang gọi nó.

Làm được rồi thì gọi `record()` từ trong các hàm ở trên (tạo thẻ, chuyển thẻ,
thêm bình luận). Nhưng **chỉ làm sau khi 10 endpoint chính đã xong**.

---


---

## Xong khi nào

- [ ] 10 endpoint chính chạy đúng, mỗi cái có DTO riêng
- [ ] `cards.org_id` và `messages.org_id` **đều được điền** — kiểm tra trong
      Supabase, không cái nào null
- [ ] `GET /cards` và `GET /comments` luôn có `.order(...)`
- [ ] `priority` sai giá trị → **400**, không phải 500
- [ ] `user_id` **luôn** lấy từ `@CurrentUser()`, không có chỗ nào lấy từ body
- [ ] Xoá bình luận của người khác → **403** (đã test bằng **tài khoản thứ hai**)
- [ ] Đã test đủ **4 trường hợp** kéo thẻ ở mục 10
- [ ] `listId` / `cardId` không tồn tại → **404**, không phải 500
- [ ] Thư mục `5. Kiem tra bao mat` trong Postman chạy sạch

---

## Kẹt thì làm gì

1. **Xem terminal đang chạy `npm run start:dev`** — lỗi 500 in stack trace đầy đủ
   ở đó, chỉ rõ file nào dòng nào. Response trong Postman chỉ có 1 dòng chung chung.
2. **Mở `src/modules/auth/auth.service.ts`** — gần như mọi tình huống bạn gặp đều
   đã có mẫu ở đó.
3. **Hỏi AI Agent**, kèm 3 thứ: đoạn code bạn viết, kết quả Postman trả về, và
   dòng lỗi trong terminal. Thiếu cái thứ ba thì ai cũng chỉ đoán mò được thôi.
