# Công thức làm 1 endpoint

Mọi endpoint trong dự án này đều làm theo đúng 6 bước dưới. Học thuộc 1 lần,
dùng cho cả 12 cái còn lại.

Ví dụ xuyên suốt: **`POST /workspaces`** — tạo workspace mới.

---

## Bước 0 — Hiểu đường đi của 1 request

```
Postman
   │  POST /workspaces  + header Authorization: Bearer <token>  + body JSON
   ▼
FirebaseAuthGuard        kiểm tra token → gắn req.user = { uid, email, ... }
   │                     token sai/thiếu → 401, dừng tại đây
   ▼
ValidationPipe           kiểm tra body theo DTO → sai định dạng thì 400
   │
   ▼
Controller               chỉ nhận tham số rồi gọi service. KHÔNG viết logic ở đây.
   │
   ▼
Service                  chỗ viết code thật: query Supabase, kiểm tra quyền
   │
   ▼
Supabase (Postgres)      lưu / đọc dữ liệu
```

Nhớ ranh giới này: **controller mỏng, service dày**. Controller chỉ là cái phễu.

---

## Bước 1 — Mở controller xem chữ ký hàm

`src/modules/workspaces/workspaces.controller.ts`:

```ts
@Post()
create(
  @CurrentUser() user: CurrentUserInfo,
  @Body() body: { orgId: string; name: string; description?: string },
) {
  return this.workspaces.create(user.uid, body.orgId, body.name, body.description);
}
```

Đọc được 3 điều:
- Đường dẫn: `POST /workspaces`
- Đầu vào: `orgId`, `name`, `description` (tuỳ chọn) trong body
- Gọi tới hàm `create` của service, truyền `user.uid` lấy từ **token**

> **Controller thường đã viết sẵn** — việc của bạn chủ yếu ở service.
> Chỉ sửa controller khi cần thêm DTO (bước 2).

---

## Bước 2 — Viết DTO để chặn dữ liệu rác

Đang khai kiểu inline `@Body() body: { orgId: string; ... }`. Kiểu TypeScript
**biến mất lúc chạy** — nó không kiểm tra gì cả. Client gửi `{"name": 12345}`
vẫn lọt xuống database.

Tạo `src/modules/workspaces/dto/create-workspace.dto.ts`:

```ts
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateWorkspaceDto {
  @IsUUID('4', { message: 'orgId phải là uuid.' })
  orgId: string;

  @IsString()
  @MinLength(1, { message: 'Tên workspace không được để trống.' })
  @MaxLength(100, { message: 'Tên workspace tối đa 100 ký tự.' })
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
```

Rồi dùng trong controller:

```ts
@Post()
create(@CurrentUser() user: CurrentUserInfo, @Body() body: CreateWorkspaceDto) {
  return this.workspaces.create(user.uid, body.orgId, body.name, body.description);
}
```

Xong. `ValidationPipe` đã bật sẵn ở `src/main.ts` nên tự động chạy — sai định dạng
là trả **400** kèm lời nhắn tiếng Việt bạn vừa viết, không cần làm gì thêm.

`whitelist: true` cũng đang bật: field lạ trong body bị **loại bỏ**, client không
nhét thêm cột vào database qua đường này được.

Mẫu tham khảo: `src/modules/auth/dto/update-profile.dto.ts`.

---

## Bước 3 — Viết service

Mở `src/modules/workspaces/workspaces.service.ts`, tìm hàm có `// TODO`.

**Đọc `src/modules/auth/auth.service.ts` trước** — đó là code mẫu chuẩn nhất
trong dự án, viết theo cùng phong cách.

Bộ khung của gần như mọi hàm service:

```ts
async create(uid: string, orgId: string, name: string, description?: string) {
  // 1. KIỂM TRA QUYỀN — người này có thuộc tổ chức đó không?
  const { data: member } = await this.supabase.client
    .from('organization_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', uid)
    .maybeSingle();

  if (!member) {
    throw new ForbiddenException('Bạn không thuộc tổ chức này.');
  }

  // 2. LÀM VIỆC CHÍNH
  const { data, error } = await this.supabase.client
    .from('workspaces')
    .insert({ org_id: orgId, name, description: description ?? '', created_by: uid })
    .select()      // ⚠️ THIẾU DÒNG NÀY LÀ data = null
    .single();     // trả về 1 object thay vì mảng 1 phần tử

  // 3. XỬ LÝ LỖI
  if (error) {
    this.logger.error(`Tạo workspace thất bại: ${error.message}`);
    throw new InternalServerErrorException('Không tạo được workspace');
  }

  return data;
}
```

Nhớ import những gì đã dùng:

```ts
import { ForbiddenException, InternalServerErrorException, Logger } from '@nestjs/common';
```

và khai logger trong class:

```ts
private readonly logger = new Logger(WorkspacesService.name);
```

### 4 câu Supabase cần thuộc

```ts
const sb = this.supabase.client;

// ĐỌC nhiều dòng
await sb.from('workspaces').select('*').eq('org_id', orgId).order('created_at');

// ĐỌC 1 dòng — maybeSingle() trả null nếu không có (single() sẽ NÉM LỖI)
await sb.from('workspaces').select('*').eq('id', id).maybeSingle();

// GHI mới — luôn kèm .select() nếu muốn nhận lại dòng vừa tạo
await sb.from('workspaces').insert({ ... }).select().single();

// SỬA
await sb.from('workspaces').update({ name }).eq('id', id).select().single();

// XOÁ
await sb.from('workspaces').delete().eq('id', id);
```

**Supabase không ném exception.** Nó luôn trả `{ data, error }`. Không kiểm tra
`error` là lỗi trôi qua âm thầm, `data` thành `null` mà không ai biết vì sao.

### Tên cột là snake_case

Database dùng `org_id`, `created_by`, `created_at`, `list_id`, `board_id`.
Viết `orgId` trong câu query là Supabase báo *column does not exist*.

---

## Bước 4 — Chạy lại server

`npm run start:dev` tự khởi động lại khi lưu file. Nhưng **luôn nhìn terminal**:
nếu có lỗi biên dịch TypeScript, server **đứng ở bản cũ** — bạn sửa code mà
endpoint không đổi gì, rất dễ tưởng mình viết sai logic.

```
Found 0 errors. Watching for file changes.     ← ổn
error TS2554: Expected 2 arguments, but got 3  ← PHẢI sửa trước khi test
```

---

## Bước 5 — Test bằng Postman

Chi tiết ở [`TEST-BANG-POSTMAN.md`](TEST-BANG-POSTMAN.md). Tóm tắt:

1. Chạy `0. BAT DAU O DAY` → `Dang nhap (lay token)` — token tự lưu
2. Mở request của endpoint mình vừa làm
3. Bấm **Send**
4. Kiểm tra **3 thứ**: status code đúng chưa, dữ liệu trả về có đủ trường chưa,
   và **mở Supabase Table Editor xem dòng đã thật sự vào bảng chưa**

---

## Bước 6 — Kiểm tra phần bảo mật

Endpoint chạy được **chưa phải là xong**. Thử thêm 4 trường hợp:

| Thử | Phải ra |
|---|---|
| Xoá header `Authorization` rồi gửi lại | 401 |
| Đổi 1 chữ số trong uuid thành id không tồn tại | 404 (**không phải** 500) |
| Gửi body thiếu field bắt buộc | 400 (**không phải** 500) |
| Truyền `orgId` của tổ chức mình không thuộc | 403, tuyệt đối không trả dữ liệu |

Trường hợp cuối là quan trọng nhất. Backend dùng `service_role key` nên Postgres
**không** tự chặn gì — chỉ có code của bạn chặn.

---

## Checklist trước khi báo "xong 1 endpoint"

- [ ] Có DTO, gửi body sai trả 400 kèm lời nhắn rõ ràng
- [ ] Mọi câu query đều lọc theo tổ chức / quyền của user
- [ ] `user_id` lấy từ `@CurrentUser()`, **không** lấy từ `@Body()`
- [ ] Đã kiểm tra biến `error` của Supabase, không bỏ trôi
- [ ] Id không tồn tại → 404, không phải 500
- [ ] Không có token → 401
- [ ] Đã mở Supabase Table Editor xác nhận dữ liệu thật sự thay đổi
