# Hoàng — Bỏ dữ liệu giả ở "Quản lý Workspace"

> Cùng kiểu việc bạn vừa làm với 5 miền: nối giao diện vào API thật.
> Khác một điểm — lần này thứ bạn thay không phải service cũ, mà là **dữ liệu bịa**.

---

## 1. Hiện trạng: màn này hiển thị dữ liệu không có thật

`Settings → Quản lý Workspace` chạy hoàn toàn bằng mock. Bằng chứng nằm ngay
trong `manage-workspace.models.ts`:

```ts
/** The signed-in user, for now hardcoded — swap for AuthService.currentUser() ... */
export const CURRENT_USER_ID = 'me';
```

`'me'` không khớp uid nào trong database. Hệ quả: `myRole` luôn tính sai, nên
nút sửa/xoá hiện hoặc ẩn theo một vai trò tưởng tượng.

Chú thích đầu file ghi lý do: viết lúc trang Board chưa tồn tại. **Giờ Board đã
có** — lý do đó hết hiệu lực.

Ba file liên quan:

```
pages/settings/manage-workspace/
├── manage-workspace.models.ts     ← kiểu + hàm mock*() + CURRENT_USER_ID
├── project-list/                  ← danh sách project
└── project-members/               ← thành viên + thẻ được giao
```

---

## 2. API thật đã có sẵn

Không phải viết endpoint mới. Tất cả đã có và đã test:

| Cần gì | Endpoint |
|---|---|
| Board trong workspace | `GET /boards?workspaceId=` |
| Thành viên board | `GET /boards/:id/members` |
| Đổi tập thành viên | `PATCH /boards/:id` với `memberIds` |
| Thẻ được giao cho một người | `GET /cards?boardId=` rồi lọc `assigneeId` |
| Tôi là ai | `AuthService.currentUserId()` |

Bốn store bạn vừa viết (`CardStore`, `LabelStore`, `ChecklistStore`,
`CommentStore`) đã phủ phần lớn dữ liệu — phần nhiều là **đọc lại từ store sẵn
có**, không phải gọi API mới.

---

## 3. Ba điều dễ làm sai

**`BoardRole` có `'observer'`, database thì không.** `manage-workspace.models.ts`
khai `'admin' | 'member' | 'observer'`, nhưng `board_members` chỉ có
`board_id` + `user_id` — **không có cột role**. Vai trò thật nằm ở
`organization_members` với ba giá trị `owner | admin | member`.

Phải chốt một trong hai:
- Bỏ `'observer'`, dùng đúng ba vai trò của tổ chức, hoặc
- Thêm cột `role` vào `board_members` (cần migration — hỏi trước khi làm)

Đừng ánh xạ bừa `observer → member` rồi để đó: giao diện sẽ hứa một thứ hệ thống
không làm được.

**Xoá mock trong CÙNG PR.** Xoá hẳn các hàm `mock*()` và `CURRENT_USER_ID`. Để
lại là lần sau có người vô tình import nhầm, và không ai biết màn nào đang thật
màn nào đang giả.

**Đừng tin `myRole` tính ở client để chặn quyền.** Ẩn nút chỉ là cho gọn giao
diện. Backend đã kiểm quyền thật ở mọi endpoint — nhưng nếu client tính sai,
người dùng bấm được nút rồi nhận lỗi 403, trải nghiệm rất tệ. Lấy vai trò từ
`OrganizationStore` (Huy đã bày sẵn `myRole`, `isOwner`, `isAdminOrOwner`).

---

## 4. Việc nhỏ kèm theo, nếu còn thời gian

Bốn phép thử frontend đang **hỏng sẵn** từ trước đợt NgRx — không phải do ai làm
hỏng, chỉ là spec scaffold cũ chưa ai bảo trì:

```
src/app/app.spec.ts                      should render title
src/app/components/footer/footer.spec.ts should create
src/app/components/header/header.spec.ts should create
src/app/pages/login/login.spec.ts        should create
```

Phần lớn hỏng vì thiếu provider (`ActivatedRoute`...). Sửa xong thì
`npx ng test` sạch **139/139**, và lần sau ai làm hỏng gì sẽ thấy ngay — chứ
hiện tại bốn cái đỏ này che mất tín hiệu thật.

---

## 5. Xong là thế nào

- [ ] `CURRENT_USER_ID` và mọi hàm `mock*()` **đã xoá khỏi repo**
- [ ] Danh sách project hiện đúng board mà **tài khoản đang đăng nhập** tham gia
- [ ] Thành viên hiện đúng người thật, avatar và tên lấy từ API
- [ ] Vai trò hiển thị khớp với `organization_members` trong database
- [ ] Thêm/bớt thành viên → tải lại trang vẫn đúng (ghi thật, không phải state tạm)
- [ ] Chốt xong chuyện `'observer'` và ghi lý do vào chú thích
- [ ] `npm run build` sạch, không có `any`
