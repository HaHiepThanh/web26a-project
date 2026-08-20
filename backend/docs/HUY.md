# HUY — Tổ chức & Workspace

> **Dùng với AI Agent:** mở [`PROMPT.md`](PROMPT.md), copy prompt mở đầu,
> thay `<TÊN>` bằng **Huy** rồi dán vào AI Agent.

**Bạn phụ trách:** 12 endpoint + `RolesGuard`.

**Thư mục của bạn:**
```
backend/src/modules/organizations/     ← chính
backend/src/modules/workspaces/        ← chính
backend/src/common/firebase/roles.guard.ts   ← việc riêng của bạn
```

**Đừng đụng vào** `modules/auth/`, `modules/boards|lists|labels/` (Hoà),
`modules/cards|comments|chat/` (Hoàng).

---

## Tại sao phần của bạn nặng nhất

Ba lý do, nói thẳng để bạn biết mà xếp thời gian:

1. **Cả nhóm chờ bạn.** Hoà cần `workspaceId` mới tạo được board; Hoàng cần board
   mới có list và card. Bạn xong sớm là cả nhóm chạy được sớm.
   *(Trong lúc chờ, hai bạn kia dùng `postman/seed-du-lieu-test.sql` — nhưng dữ
   liệu thật vẫn phải do endpoint của bạn tạo ra.)*
2. **Phân quyền là phần bảo mật cốt lõi.** `RolesGuard` hiện `return true` vô điều
   kiện — mọi route gắn `@Roles` **đang không được bảo vệ gì cả**. Bạn viết sai là
   cả hệ thống thủng, không chỉ phần của bạn.
3. **Luồng lời mời có trạng thái.** Không phải CRUD đơn thuần: một lời mời đi qua
   `pending → accepted/declined`, và lúc `accepted` phải ghi thêm 1 dòng ở bảng khác.

---

## Thứ tự làm — theo đúng số này

Sắp xếp để **luôn có thứ test được**, và để mở khoá cho Hoà & Hoàng sớm nhất.

| # | Endpoint | Ghi chú |
|---|---|---|
| 1 | `POST /organizations` | phải có tổ chức trước đã |
| 2 | `GET /organizations` | để nhìn thấy #1 có chạy không |
| 3 | `POST /workspaces` | 🔓 **xong cái này là Hoà bắt đầu được** |
| 4 | `GET /workspaces?orgId=` | |
| 5 | `PATCH /workspaces/:id` | |
| 6 | `DELETE /workspaces/:id` | |
| 7 | `GET /organizations/:id/members` | sang phần thành viên |
| 8 | **`RolesGuard`** | ⚠️ làm trước #9–#12, nếu không thì không test được quyền |
| 9 | `POST /organizations/:id/invites` | |
| 10 | `GET /organizations/invites/me` | |
| 11 | `PATCH /organizations/invites/:inviteId` | |
| 12 | `PATCH /organizations/:id/members/:userId/role` | |
| 13 | `DELETE /organizations/:id/members/:userId` | |

**Trước khi bắt đầu**, đọc 2 file này — đừng bỏ qua, sẽ tiết kiệm cả buổi:
- [`CACH-LAM-1-ENDPOINT.md`](CACH-LAM-1-ENDPOINT.md) — công thức 6 bước
- [`TEST-BANG-POSTMAN.md`](TEST-BANG-POSTMAN.md) — cách lấy token và test

Và mở sẵn `src/modules/auth/auth.service.ts` — đó là code mẫu chuẩn nhất trong dự án.

---

## 1. `POST /organizations` — tạo tổ chức

**Vào:** body `{ name, slug }`
**Ra:** `201` + `{ id, name, slug, ownerId, createdAt }`

Đây là endpoint khó nhất trong nhóm CRUD vì phải làm **2 việc liên tiếp**:

```
1. INSERT organizations              → có id tổ chức
2. INSERT organization_members       → người tạo thành 'owner'
```

Bỏ bước 2 là tổ chức tồn tại nhưng **không ai thuộc về nó** — kể cả người vừa tạo.
Sau đó `GET /organizations` trả mảng rỗng và bạn sẽ ngồi debug rất lâu.

**Kiểm tra `slug` trước khi insert:**

| Kiểm tra | Sai thì trả |
|---|---|
| Đúng định dạng `^[a-z0-9]+(-[a-z0-9]+)*$`, dài 3–30 | **400** |
| Không nằm trong danh sách từ khoá hệ thống | **400** |
| Chưa ai dùng | **409** |

Danh sách từ khoá hệ thống ở `frontend/src/app/utils/slug.util.ts` →
`RESERVED_SLUGS` (khoảng 45 từ: `login`, `settings`, `board`, `api`, `admin`...).
Copy sang backend thành một mảng hằng. Lý do: slug nằm ngay ở **gốc URL**
(`/thanh-organization/...`) nên nó dùng chung namespace với mọi route của app.
Ai đó đặt slug `settings` là chiếm mất trang `/settings` vĩnh viễn — và slug **không
cho đổi** sau khi cấp.

**Về chuyện trùng slug:** đừng viết kiểu "kiểm tra tồn tại rồi mới insert" —
giữa 2 bước đó người khác vẫn chen vào được. Cứ insert, rồi **bắt lỗi `23505`**:

```ts
if (error?.code === '23505') {
  throw new ConflictException(`Đường dẫn "${slug}" đã có người dùng.`);
}
```

Mẫu y hệt có trong `auth.service.ts` → `assignGeneratedUsername()`.

**Test:**
```json
POST /organizations
{ "name": "Công ty Huy", "slug": "cong-ty-huy" }
```
Rồi gửi lại **đúng body đó** lần nữa → phải ra **409**, không được là 500.
Thử `{"slug": "ab"}` → **400**. Thử `{"slug": "settings"}` → **400**.

---

## 2. `GET /organizations` — tổ chức của tôi

**Vào:** không có
**Ra:** `200` + `[{ id, name, slug, role }]`

Đọc `organization_members` lọc `user_id = uid` rồi join sang `organizations`.
Supabase join viết như thế này:

```ts
.from('organization_members')
.select('role, organizations(id, name, slug)')
.eq('user_id', uid)
```

Nó trả về dạng lồng `{ role, organizations: {...} }` — bạn phải map phẳng lại
thành `{ id, name, slug, role }`. **Code mẫu y hệt có sẵn** trong
`auth.service.ts` → `getMe()`, đọc rồi bắt chước.

Chưa có tổ chức nào → trả `[]`, **không phải** `null` và cũng **không phải** 404.

---

## 3. `POST /workspaces` — tạo workspace 🔓

**Vào:** body `{ orgId, name, description? }`
**Ra:** `201` + `{ id, orgId, name, description, createdBy, createdAt }`

Xong cái này là **Hoà bắt đầu làm được** — ưu tiên.

Cũng 2 bước như #1:
```
1. INSERT workspaces
2. INSERT workspace_members  (người tạo, role 'owner')
```

**Trước khi insert phải kiểm tra quyền:** người gọi có thuộc `orgId` đó không?

```ts
const { data: member } = await this.supabase.client
  .from('organization_members')
  .select('role')
  .eq('org_id', orgId)
  .eq('user_id', uid)
  .maybeSingle();

if (!member) throw new ForbiddenException('Bạn không thuộc tổ chức này.');
```

Bỏ bước này là **ai cũng tạo được workspace trong công ty người khác.**

> 💡 Đoạn kiểm tra này bạn sẽ dùng lại ở gần như mọi endpoint còn lại. Tách thành
> một hàm private, vd `assertMember(uid, orgId)`, viết 1 lần dùng 12 lần.

**Test:** tạo xong mở Supabase → Table Editor → bảng `workspaces`, phải thấy dòng
mới với `org_id` đúng. Rồi thử lại với `orgId` của tổ chức bạn không thuộc →
phải **403**.

---

## 4–6. `GET` / `PATCH` / `DELETE /workspaces`

CRUD thường, nhưng **cả ba đều phải kiểm tra quyền**:

| Endpoint | Kiểm tra |
|---|---|
| `GET /workspaces?orgId=` | `uid` có thuộc `orgId` → không thì 403 |
| `PATCH /workspaces/:id` | workspace này thuộc tổ chức mà `uid` là thành viên → không thì **404** |
| `DELETE /workspaces/:id` | như trên |

> Vì sao `PATCH`/`DELETE` trả **404** chứ không phải 403 khi khác tổ chức?
> Trả 403 là vô tình xác nhận *"id này có tồn tại, chỉ là bạn không có quyền"* —
> người ngoài dò được id nào có thật. Với dữ liệu không thuộc về họ, coi như không tồn tại.

`DELETE` sẽ kéo theo board/list/card bên trong (`ON DELETE CASCADE` ở database) —
đúng như mong muốn, không cần tự xoá tay từng bảng.

---

## 7. `GET /organizations/:id/members`

**Ra:** `200` + `[{ userId, role, user: { displayName, email, avatarUrl } }]`

Join sang `users` để có tên/email — đừng chỉ trả về `user_id` trơ trọi, frontend
không hiển thị được gì.

```ts
.from('organization_members')
.select('user_id, role, joined_at, users(display_name, email, avatar_url)')
.eq('org_id', orgId)
```

⚠️ Kiểm tra người gọi có thuộc tổ chức không. Thiếu bước này thì **ai cũng đọc
được danh sách nhân viên của mọi công ty** — chỉ cần đoán uuid.

---

## 8. ⚠️ `RolesGuard` — việc quan trọng nhất của bạn

File: `src/common/firebase/roles.guard.ts`

**Hiện trạng:** `return true` vô điều kiện. Ba endpoint gắn `@Roles(...)` đang
**không được bảo vệ gì cả** — tài khoản member vẫn đuổi được owner ra khỏi công ty.

### Guard chạy khi nào

```
Request
  ↓
FirebaseAuthGuard   verify token → gắn req.user = { uid, ... }
  ↓
RolesGuard          ← bạn viết ở đây. Đã có req.user để dùng.
  ↓
Controller
```

Thứ tự này do `@UseGuards(FirebaseAuthGuard)` ở cấp class và `@UseGuards(RolesGuard)`
ở cấp method quyết định — đã đúng sẵn, không cần sửa.

### Việc cần làm — 4 bước

```ts
async canActivate(context: ExecutionContext): Promise<boolean> {
  // 1. Route này cần role gì? (đã viết sẵn)
  const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
    context.getHandler(),
    context.getClass(),
  ]);
  if (!required?.length) return true;

  const req = context.switchToHttp().getRequest();

  // 2. Ai đang gọi? (FirebaseAuthGuard đã gắn sẵn)
  const uid = req.user?.uid;

  // 3. Tổ chức nào? — TỰ VIẾT: lấy từ req.params.id, hoặc req.body.orgId
  const orgId = /* ??? */;

  // 4. TỰ VIẾT: query organization_members lấy role thật,
  //    so với `required`, không khớp thì ném ForbiddenException.
}
```

### Ba chỗ dễ vấp

**a) Lấy `orgId` ở đâu.** Ba route dùng guard này có dạng
`/organizations/:id/...` nên `orgId` nằm ở `req.params.id`. Nhưng viết cứng
`req.params.id` thì sau này route khác đặt tên param khác là hỏng. Nên tìm theo
thứ tự: `req.params.id` → `req.params.orgId` → `req.body.orgId`, cái nào có trước
thì dùng. Không tìm thấy → ném `ForbiddenException` (an toàn hơn là cho qua).

**b) Guard cần đọc database.** Phải inject `SupabaseService` vào constructor.
Guard là provider bình thường, inject như service:

```ts
constructor(
  private readonly reflector: Reflector,
  private readonly supabase: SupabaseService,
) {}
```

Nếu Nest báo *"Nest can't resolve dependencies of the RolesGuard"* → module chứa
route đó chưa import `SupabaseModule`. Xem `organizations.module.ts`.

**c) Trả `false` hay ném exception?** `return false` cho ra **403 với lời nhắn
rỗng tuếch**. Ném `ForbiddenException('Chỉ owner mới đổi được vai trò.')` thì
người dùng đọc là hiểu ngay. Chọn cách thứ hai.

### Test — cần 2 tài khoản

Đây là chỗ hay bị bỏ qua: test bằng chính tài khoản owner của mình thì **luôn
pass**, không chứng minh được gì cả.

1. Trong Postman, thư mục `0. BAT DAU O DAY`, sửa `testEmail` thành
   `hocvien-a2@test.dev` → chạy `Dang ky` + `Dang nhap` → copy `idToken`
2. Dán vào biến `{{otherIdToken}}` (đã có sẵn trong collection)
3. Mời tài khoản đó vào tổ chức với role `member`
4. Đổi header của request `PATCH .../role` thành `Bearer {{otherIdToken}}` → gửi

**Phải ra 403.** Ra 200 nghĩa là guard chưa chặn được gì.

---

## 9. `POST /organizations/:id/invites` — mời người vào

**Vào:** body `{ toUserId }` (Firebase uid của người được mời)

> 💡 **Không cần rủ ai vào test.** File seed đã tạo sẵn một user tên "Người Lạ" —
> uid nằm ở biến `{{memberUserId}}` trong Postman. Dùng luôn cho #9, #12, #13.
> Người này không đăng nhập được (không có tài khoản Firebase), nên riêng phần
> test 403 ở #8 vẫn cần tài khoản thật.
**Ra:** `201` + `{ id, orgId, toUserId, status: 'pending' }`

Chỉ owner/admin gọi được — `RolesGuard` (#8) lo phần này.

Hai trường hợp phải trả **409**:
- Người đó **đã là thành viên** → tự kiểm tra `organization_members` trước
- **Đã có lời mời đang chờ** → database tự chặn bằng index `uniq_pending_invite`,
  bạn bắt lỗi `23505` rồi đổi thành `ConflictException`

Người đã **từ chối** trước đó thì **mời lại được** — index là partial, chỉ áp dụng
cho `status = 'pending'`.

`from_user_id` lấy từ **token**, không lấy từ body.

---

## 10. `GET /organizations/invites/me`

**Ra:** `200` + `[{ id, orgId, orgName, fromUser: { displayName }, createdAt }]`

Lọc `to_user_id = uid` **và** `status = 'pending'`. Join sang `organizations` để
có tên tổ chức, join `users` để có tên người mời — chuông thông báo trên frontend
cần hiển thị *"Nam mời bạn vào Công ty ABC"*, không phải 2 chuỗi uuid.

> ⚠️ **Route tĩnh phải khai TRƯỚC route động.** Trong controller,
> `@Get('invites/me')` phải nằm **trên** `@Get(':id/members')`. NestJS khớp route
> theo thứ tự khai báo — để ngược thì `invites` bị hiểu là giá trị của `:id`.
> Hiện tại controller đã khai đúng, đừng đảo thứ tự khi sửa.

---

## 11. `PATCH /organizations/invites/:inviteId`

**Vào:** body `{ accept: true | false }`

```
accept = true   → status = 'accepted', responded_at = now()
                  + INSERT organization_members (role 'member')
accept = false  → status = 'declined',  responded_at = now()
```

Nhớ **cả hai** việc khi `accept = true`. Chỉ đổi status mà quên thêm thành viên
là người ta bấm đồng ý xong vẫn không vào được tổ chức.

| Tình huống | Trả |
|---|---|
| `inviteId` không tồn tại | 404 |
| Lời mời gửi cho người khác | **403** |
| Lời mời đã trả lời rồi (`status != 'pending'`) | **409** |

Trường hợp 2 quan trọng: phải kiểm tra `invite.to_user_id === uid`. Thiếu là ai
cũng bấm đồng ý hộ lời mời của người khác.

---

## 12. `PATCH /organizations/:id/members/:userId/role`

**Vào:** body `{ role: 'owner' | 'admin' | 'member' }` — **chỉ owner**

⚠️ **Mỗi tổ chức chỉ được ĐÚNG 1 owner.** Database có unique index
`uniq_org_single_owner` chặn chuyện này. Nên khi phong owner cho người khác, phải
**hạ owner cũ xuống `admin`** — nếu không câu UPDATE sẽ vỡ vì trùng.

```
Đổi B thành owner:
  1. UPDATE A (owner hiện tại) → 'admin'
  2. UPDATE B                  → 'owner'
```

Làm sai thứ tự (2 trước 1) là dính lỗi ngay. Đây là chỗ lý tưởng để dùng
transaction, nhưng Supabase JS client không có API transaction trực tiếp — làm
tuần tự và kiểm tra `error` sau **mỗi** bước là chấp nhận được cho bài này.

Body `role` sai giá trị → **400** (dùng DTO với `@IsIn(['owner','admin','member'])`),
đừng để nó xuống database rồi vỡ CHECK constraint thành 500.

---

## 13. `DELETE /organizations/:id/members/:userId`

owner hoặc admin gọi được.

Chặn 2 trường hợp:
- Xoá chính **owner** của tổ chức → **400** *"Phải chuyển quyền owner trước"*
- Không tìm thấy thành viên → **404**

---

## Xong khi nào

- [ ] 12 endpoint chạy đúng, mỗi cái có DTO riêng
- [ ] `RolesGuard` chặn được thật — đã test bằng **tài khoản thứ hai**, ra 403
- [ ] Slug: sai định dạng → 400, trùng → 409, từ khoá hệ thống → 400
- [ ] Tạo tổ chức xong `GET /organizations` thấy ngay (nhớ bước 2: insert member)
- [ ] Mọi query đều lọc theo `org_id` / kiểm tra thành viên
- [ ] Thư mục `5. Kiem tra bao mat` trong Postman chạy sạch
- [ ] Thử `orgId` của tổ chức khác → 403/404, **không** trả dữ liệu
