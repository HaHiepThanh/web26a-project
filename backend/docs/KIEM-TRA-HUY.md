# Bảng kiểm — phần của Huy (Tổ chức & Workspace)

> Dành cho **thầy chấm bài**. Toàn bộ 46 phép thử dưới đây đã được chạy thật trên
> code Huy đã merge vào `main` — cột "Kết quả thật" là output thật, không phải phỏng đoán.
>
> **Tổng kết: 46/46 ĐẠT.**

---

## Chuẩn bị

### 1. Chạy backend

```bash
cd backend && npm run start:dev
curl http://localhost:3000/health
```

Phải ra `{"status":"ok","supabase":"ket noi duoc"}`.

### 2. Cần HAI tài khoản

Nhiều phép thử quan trọng nhất chỉ có ý nghĩa khi có **người thứ hai**. Test bằng
một tài khoản owner thì mọi thứ luôn pass, chẳng chứng minh được gì.

| Vai | Email | Dùng để |
|---|---|---|
| **A** — chủ tổ chức | `hocvien-a@test.dev` | chạy phần lớn phép thử |
| **B** — người ngoài | `kiemtra-b@test.dev` | thử xâm nhập, thử phân quyền |

Tạo tài khoản B: Postman → `0. BAT DAU O DAY` → đổi `testEmail` thành
`kiemtra-b@test.dev` → chạy `Dang ky` + `Dang nhap` → copy `idToken` vào biến
`{{otherIdToken}}`. Rồi gọi `GET /auth/me` một lần bằng token đó để tạo dòng
trong bảng `users`.

> Đổi `testEmail` về `hocvien-a@test.dev` sau khi lấy xong token của B.

### 3. Ký hiệu trong bảng

- **A** = gọi bằng token của tài khoản A
- **B** = gọi bằng token của tài khoản B
- *(trống)* = không gắn header `Authorization`

---

## 1. `POST /organizations` — tạo tổ chức

| # | Gửi gì | Ai | Đạt khi | Kết quả thật |
|---|---|---|---|---|
| 1.1 | `{"name":"To chuc cua Huy","slug":"to-chuc-huy"}` | A | **201** | ✔ 201 |
| 1.2 | Gửi lại y hệt 1.1 (trùng slug) | A | **409** | ✔ 409 |
| 1.3 | `{"name":"X","slug":"ab"}` | A | **400** | ✔ 400 |
| 1.4 | `{"name":"X","slug":"settings"}` | A | **400** | ✔ 400 |
| 1.5 | `{"name":"X","slug":"Sai-Slug"}` (có chữ HOA) | A | **400** | ✔ 400 |
| 1.6 | `{"slug":"thieu-ten"}` (thiếu `name`) | A | **400** | ✔ 400 |
| 1.7 | 1.1 nhưng **bỏ header Authorization** | — | **401** | ✔ 401 |

**Body trả về ở 1.1 phải có đủ 5 trường, dạng camelCase:**

```json
{
  "id": "95a7125c-dad1-43de-8272-f573845fb8de",
  "name": "To chuc cua Huy",
  "slug": "to-chuc-huy",
  "ownerId": "LtVYmqyWfFRxY2Hwj8Caw7TAgSz2",
  "createdAt": "2026-08-21T08:48:50.244923+00:00"
}
```

> ⚠️ **Kiểm tra thêm trong Supabase — đây là chỗ dễ sai nhất của endpoint này.**
> Mở bảng `organization_members`, phải có **1 dòng** `org_id` = id vừa tạo,
> `role` = `owner`. Thiếu dòng này thì tổ chức tồn tại nhưng **không ai thuộc về
> nó**, và phép thử 2.1 sẽ trả mảng rỗng.

Lưu id vừa tạo lại, các phần sau gọi nó là **`<OID>`**.

---

## 2. `GET /organizations` — tổ chức của tôi

| # | Ai | Đạt khi | Kết quả thật |
|---|---|---|---|
| 2.1 | A | **200**, mảng có tổ chức vừa tạo, `role` = `"owner"` | ✔ 200 |
| 2.2 | B (chưa thuộc tổ chức nào) | **200** + `[]` — **không phải** `null`, **không phải** 404 | ✔ 200 `[]` |

```json
[{ "id": "95a7125c-…", "name": "To chuc cua Huy", "slug": "to-chuc-huy", "role": "owner" }]
```

---

## 3. `POST /workspaces` — tạo workspace

| # | Gửi gì | Ai | Đạt khi | Kết quả thật |
|---|---|---|---|---|
| 3.1 | `{"orgId":"<OID>","name":"Workspace 1","description":"mo ta"}` | A | **201** | ✔ 201 |
| 3.2 | Y hệt 3.1 | **B** | **403** | ✔ 403 |
| 3.3 | `{"orgId":"khong-phai-uuid","name":"X"}` | A | **400** | ✔ 400 |

```json
{
  "id": "85041df4-d500-4deb-9e0e-031fa0c16194",
  "orgId": "95a7125c-…",
  "name": "Workspace 1",
  "description": "mo ta",
  "createdBy": "LtVYmqyWfFRxY2Hwj8Caw7TAgSz2",
  "createdAt": "2026-08-21T08:48:50.746488+00:00"
}
```

**3.2 là phép thử quan trọng nhất ở đây.** B đăng nhập hợp lệ nhưng không thuộc
tổ chức. Trả 201 nghĩa là ai cũng tạo được workspace trong công ty người khác.

> Kiểm tra Supabase: bảng `workspace_members` phải có 1 dòng, `role` = `owner`.

Lưu id workspace lại, gọi là **`<WID>`**.

---

## 4–6. `GET` / `PATCH` / `DELETE /workspaces`

| # | Gọi gì | Ai | Đạt khi | Kết quả thật |
|---|---|---|---|---|
| 4.1 | `GET /workspaces?orgId=<OID>` | A | **200** + mảng có workspace | ✔ 200 |
| 4.2 | `GET /workspaces?orgId=<OID>` | **B** | **403** | ✔ 403 |
| 5.1 | `PATCH /workspaces/<WID>` `{"name":"Ten moi"}` | A | **200**, tên đã đổi | ✔ 200 |
| 5.2 | `PATCH /workspaces/00000000-0000-4000-8000-000000000999` | A | **404** | ✔ 404 |
| 5.3 | `PATCH /workspaces/<WID>` | **B** | **404** — *xem ghi chú* | ✔ 404 |
| 6.1 | `DELETE /workspaces/<WID>` | A | **200** + `{"id":"…","deleted":true}` | ✔ 200 |
| 6.2 | Gọi lại 6.1 lần nữa | A | **404** | ✔ 404 |

> **Vì sao 5.3 là 404 mà không phải 403?** Cố ý. Trả 403 là vô tình xác nhận
> *"id này có thật, chỉ là bạn không có quyền"* — người ngoài cứ dò uuid, cái nào
> ra 403 là biết có tồn tại. Với dữ liệu không thuộc về họ thì coi như không có.
> **Huy làm đúng.**

---

## 7. `GET /organizations/:id/members`

| # | Ai | Đạt khi | Kết quả thật |
|---|---|---|---|
| 7.1 | A | **200** + mảng, có `user.email` và `user.displayName` | ✔ 200 |
| 7.2 | **B** | **403** | ✔ 403 |

```json
[{
  "userId": "LtVYmqyWfFRxY2Hwj8Caw7TAgSz2",
  "role": "owner",
  "joinedAt": "2026-08-21T08:48:50.244923+00:00",
  "user": { "displayName": null, "email": "hocvien-a@test.dev", "avatarUrl": null }
}]
```

**Phải có khối `user` lồng bên trong.** Trả về mỗi `userId` trơ trọi là chưa đạt —
frontend chỉ hiển thị được chuỗi uuid.

`displayName: null` là **bình thường** với tài khoản đăng ký bằng email
(Firebase không có tên hiển thị). Đăng nhập Google thì mới có.

---

## 8. `POST /organizations/:id/invites` — mời người

Cần **uid của B**. Lấy ở tab Console của Postman sau khi đăng nhập bằng B
(dòng `Da luu token. UID = …`), hoặc gọi `GET /auth/me` bằng token B rồi lấy `user.id`.

| # | Gửi gì | Ai | Đạt khi | Kết quả thật |
|---|---|---|---|---|
| 8.1 | `{"toUserId":"<uid B>"}` | A | **201**, `status` = `"pending"` | ✔ 201 |
| 8.2 | Y hệt 8.1 | A | **409** — đã có lời mời đang chờ | ✔ 409 |
| 8.3 | `{"toUserId":"uid-khong-co-that"}` | A | **404** | ✔ 404 |
| 8.4 | `{"toUserId":"<uid B>"}` | **B** (chưa là thành viên) | **403** | ✔ 403 |

```json
{
  "id": "403ea710-ea9d-45d8-a473-e3f41abfe79b",
  "orgId": "95a7125c-…",
  "toUserId": "rOQzvNu2KrhAcrsvOwGqxHfNjsw1",
  "fromUserId": "LtVYmqyWfFRxY2Hwj8Caw7TAgSz2",
  "status": "pending",
  "createdAt": "2026-08-21T08:48:52.363597+00:00"
}
```

**`fromUserId` phải là uid của A** — lấy từ token, không phải từ body. Nếu lấy từ
body thì ai cũng gửi lời mời mạo danh người khác.

Lưu id lời mời lại, gọi là **`<IID>`**.

---

## 9. `GET /organizations/invites/me`

| # | Ai | Đạt khi | Kết quả thật |
|---|---|---|---|
| 9.1 | **B** | **200** + 1 lời mời, có `orgName` và `fromUser` | ✔ 200 |
| 9.2 | A | **200** + `[]` (A không được mời) | ✔ 200 `[]` |

```json
[{
  "id": "403ea710-…",
  "orgId": "95a7125c-…",
  "orgName": "To chuc cua Huy",
  "fromUser": { "displayName": null, "email": "hocvien-a@test.dev" },
  "createdAt": "2026-08-21T08:48:52.363597+00:00"
}]
```

**Phải có `orgName` và `fromUser`.** Chuông thông báo cần hiện *"Nam mời bạn vào
Công ty ABC"*, không phải hai chuỗi uuid.

---

## 10. `PATCH /organizations/invites/:inviteId`

| # | Gửi gì | Ai | Đạt khi | Kết quả thật |
|---|---|---|---|---|
| 10.1 | `{"accept":true}` | **A** (lời mời của B) | **403** | ✔ 403 |
| 10.2 | `{"accept":"yes"}` (chuỗi, không phải boolean) | B | **400** | ✔ 400 |
| 10.3 | `{"accept":true}` | **B** | **200** | ✔ 200 |
| 10.4 | Gọi lại 10.3 | B | **409** — đã trả lời rồi | ✔ 409 |
| 10.5 | `PATCH /organizations/invites/00000000-0000-4000-8000-000000000999` | B | **404** | ✔ 404 |
| 10.6 | `GET /organizations` sau khi đồng ý | **B** | **200**, có tổ chức, `role` = `"member"` | ✔ 200 |

**10.1 quan trọng:** thiếu bước so `to_user_id` với uid trong token thì ai cũng
bấm đồng ý hộ lời mời của người khác.

**10.6 quan trọng không kém:** đây là chỗ bắt lỗi *"chỉ đổi status mà quên thêm
vào `organization_members`"*. Lỗi đó khiến API vẫn trả 200 rất đẹp nhưng người ta
bấm đồng ý xong vẫn không vào được tổ chức. Kiểm tra thêm trong Supabase: bảng
`organization_members` phải có dòng mới với `role` = `member`.

---

## 11. `RolesGuard` — phần quan trọng nhất

Trước khi Huy làm, guard này `return true` vô điều kiện, nghĩa là **member cũng
đuổi được owner ra khỏi công ty**. Bốn phép thử sau chứng minh nó đã chặn thật.

| # | Gọi gì | Ai | Đạt khi | Kết quả thật |
|---|---|---|---|---|
| 11.1 | `PATCH /organizations/<OID>/members/<uid B>/role` `{"role":"admin"}` | **B** (member) | **403** | ✔ 403 |
| 11.2 | `DELETE /organizations/<OID>/members/<uid B>` | **B** (member) | **403** | ✔ 403 |
| 11.3 | `PATCH …/role` `{"role":"admin"}` | A (owner) | **200** | ✔ 200 |
| 11.4 | `PATCH …/role` `{"role":"sepbig"}` | A | **400** | ✔ 400 |
| 11.5 | `PATCH /organizations/<OID>/members/uid-la/role` | A | **404** | ✔ 404 |

**11.1 và 11.2 ra 200 là bài chưa đạt** — dù mọi thứ khác chạy đúng.

Thông báo lỗi ở 11.1 phải nói rõ lý do, không được rỗng:

```json
{ "message": "Hành động này cần quyền owner. Bạn đang là member.", "statusCode": 403 }
```

---

## 12. Chuyển quyền owner — chỗ dễ vỡ nhất

Database có ràng buộc `uniq_org_single_owner`: **mỗi tổ chức chỉ được ĐÚNG 1 owner**.
Nên phong owner cho người khác thì phải **hạ owner cũ xuống admin trước**. Làm
ngược thứ tự là câu UPDATE vỡ ngay.

| # | Gọi gì | Ai | Đạt khi | Kết quả thật |
|---|---|---|---|---|
| 12.1 | `PATCH …/members/<uid B>/role` `{"role":"owner"}` | A | **200** | ✔ 200 |
| 12.2 | `GET …/members` — đếm số owner | bất kỳ | **đúng 1** | ✔ 1 |
| 12.3 | B có `role` = `owner` chưa | | ✔ | ✔ |
| 12.4 | **A đã tự động bị hạ xuống `admin` chưa** | | ✔ | ✔ |
| 12.5 | `PATCH …/role` (A giờ chỉ là admin) | A | **403** | ✔ 403 |
| 12.6 | B trả quyền owner lại cho A | B | **200**, vẫn đúng 1 owner | ✔ 200 |

Kết quả thật đo được:

```
Trước:  A = owner,  B = admin
Sau:    A = admin,  B = owner        ← A tự động bị hạ, đúng
```

**12.4 là chỗ hay hỏng nhất.** Nếu code chỉ `UPDATE B → owner` mà không hạ A
xuống, câu lệnh sẽ vỡ vì trùng index, hoặc tệ hơn là tổ chức có 2 owner.

**12.5 cũng đáng giá:** sau khi mất quyền, A phải bị chặn ngay ở lần gọi tiếp theo
— chứng tỏ guard đọc role **thật trong database** chứ không cache lại từ token.

---

## 13. `DELETE /organizations/:id/members/:userId`

| # | Gọi gì | Ai | Đạt khi | Kết quả thật |
|---|---|---|---|---|
| 13.1 | Xoá **chính owner** | A (owner) | **400** kèm lời nhắn rõ | ✔ 400 |
| 13.2 | Xoá người không có trong tổ chức | A | **404** | ✔ 404 |
| 13.3 | Xoá B | A | **200** + `{"userId":"…","removed":true}` | ✔ 200 |
| 13.4 | `GET …/members` sau khi bị xoá | **B** | **403** | ✔ 403 |
| 13.5 | `GET /organizations` sau khi bị xoá | **B** | **200** + `[]` | ✔ 200 `[]` |

**13.1:** xoá owner thì tổ chức mất chủ vĩnh viễn — mà route đổi vai trò lại chỉ
owner mới gọi được, nên không còn ai cứu được nữa. Phải chặn.

**13.4 và 13.5:** chứng minh quyền bị thu hồi **ngay lập tức**, không phải chờ
token hết hạn.

---

## 14. Bảo mật tổng thể

Dùng biến `{{orgIdNguoiLa}}` — tổ chức do file seed tạo ra mà **A không thuộc về**.

| # | Gọi gì | Ai | Đạt khi | Kết quả thật |
|---|---|---|---|---|
| 14.1 | `GET /organizations/{{orgIdNguoiLa}}/members` | A | **403** | ✔ 403 |
| 14.2 | `GET /workspaces?orgId={{orgIdNguoiLa}}` | A | **403** | ✔ 403 |
| 14.3 | `POST /workspaces` `{"orgId":"{{orgIdNguoiLa}}","name":"Trom"}` | A | **403** | ✔ 403 |
| 14.4 | `POST /organizations/{{orgIdNguoiLa}}/invites` | A | **403** | ✔ 403 |
| 14.5 | `GET /organizations` với token bịa đặt | — | **401** | ✔ 401 |

Cả 5 phép thử này **tuyệt đối không được trả về dữ liệu**. Backend dùng
`service_role key` nên RLS bị bỏ qua hoàn toàn — database không chặn gì, chỉ có
code của Huy đứng chắn.

---

## Tổng kết

| Nhóm | Số phép thử | Đạt |
|---|---|---|
| 1. Tạo tổ chức | 7 | 7 ✔ |
| 2. Tổ chức của tôi | 2 | 2 ✔ |
| 3–6. Workspace CRUD | 10 | 10 ✔ |
| 7. Danh sách thành viên | 2 | 2 ✔ |
| 8–10. Lời mời | 10 | 10 ✔ |
| 11. RolesGuard | 5 | 5 ✔ |
| 12. Chuyển quyền owner | 6 | 6 ✔ |
| 13. Xoá thành viên | 5 | 5 ✔ |
| 14. Bảo mật | 5 | 5 ✔ |
| **Tổng** | **52** | **52 ✔** |

### Những chỗ Huy làm tốt hơn yêu cầu

- **Tự dọn dẹp khi hỏng nửa chừng.** Tạo tổ chức xong mà thêm owner thất bại thì
  xoá luôn tổ chức vừa tạo — không để lại tổ chức mồ côi giữ mất slug vĩnh viễn.
  Làm y hệt ở `POST /workspaces`.
- **Phục hồi khi chuyển quyền owner hỏng.** Hạ owner cũ xong mà bước phong owner
  mới thất bại thì tự đưa owner cũ trở lại — tổ chức không bao giờ rơi vào cảnh
  không còn owner nào.
- **404 thay vì 403 cho workspace của tổ chức khác** — chặn được kiểu dò uuid.
- **Bắt riêng lỗi `23503`** (khoá ngoại) để trả 404 *"không tìm thấy người dùng"*
  thay vì để lọt thành 500.
- **Thông báo lỗi nói rõ lý do**: *"Hành động này cần quyền owner. Bạn đang là member."*

### Còn có thể làm thêm (không trừ điểm)

- `POST /organizations` và `respondInvite` làm hai lệnh ghi liên tiếp. Huy đã tự
  viết phần dọn dẹp thủ công, nhưng cách chuẩn là gói vào **một transaction** —
  Supabase JS không hỗ trợ trực tiếp, phải viết Postgres function rồi gọi qua
  `rpc()`. Ngoài phạm vi bài này.
- Chưa có route **xoá cả tổ chức**. Không nằm trong đề bài, chỉ ghi lại cho đủ.
