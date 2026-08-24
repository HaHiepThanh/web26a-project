# Huy — Giao diện cho link mời vào tổ chức

> Backend **đã xong và đã test** (27 phép thử đạt). Việc của bạn là nối giao diện.
>
> Đây là tính năng người dùng đặt hàng nhưng hiện **không chạm được**: `grep`
> toàn bộ `frontend/src/app` không ra một chỗ nào gọi tới nhóm endpoint này.

---

## 1. Backend có sẵn gì

Đã chạy migration `0005_link_moi_co_thoi_han.sql`. Năm endpoint:

| Method | Đường dẫn | Ai gọi được | Việc |
|---|---|---|---|
| `POST` | `/organizations/:id/invite-links` | owner/admin | Tạo link |
| `GET` | `/organizations/:id/invite-links` | owner/admin | Danh sách link |
| `DELETE` | `/invite-links/:id` | owner/admin | Thu hồi trước hạn |
| `GET` | `/invite-links/:token/preview` | ai đăng nhập | "Bạn được mời vào ..." |
| `POST` | `/invite-links/:token/accept` | ai đăng nhập | Tham gia |

**Body khi tạo** (`CreateInviteLinkDto`) — cả ba trường đều tuỳ chọn:

```ts
{
  expiresInDays?: number;   // 1–30, mặc định 7
  role?: 'admin' | 'member'; // mặc định 'member'
  maxUses?: number;          // 1–500, bỏ trống = không giới hạn
}
```

**Trả về** — `active` được server tính sẵn, đừng tự suy ở client:

```ts
{ id, orgId, token, role, expiresAt, maxUses, usedCount, revokedAt, createdBy, createdAt, active }
```

---

## 2. Ba màn phải làm

### 2a. Ô "Mời bằng link" trong màn quản lý tổ chức

Đặt cạnh phần mời đích danh đang có. Cần:

- Nút **Tạo link**, kèm chọn hạn (1/7/30 ngày), quyền, và giới hạn lượt
- Ô hiện link đầy đủ + nút **Sao chép**
- Danh sách link đang sống: còn bao lâu, đã dùng mấy lượt, nút **Thu hồi**

**Link đầy đủ ghép ở client:** `${location.origin}/join/${token}`

### 2b. Trang `/join/:token`

Route này **đã được nhắc trong chú thích** đầu `app.routes.ts` nhưng chưa ai làm.
Đặt NGOÀI layout app (giống `/onboarding`), vì người bấm link có thể chưa thuộc
tổ chức nào — vào layout app là guard đá họ đi ngay.

Luồng:

1. Chưa đăng nhập → chuyển sang `/login`, nhớ đường quay lại
2. Gọi `GET /invite-links/:token/preview`
3. `alreadyMember: true` → vào thẳng `/${orgSlug}/workspace`, không hỏi gì
4. Ngược lại → hiện "Bạn được mời vào **{orgName}** với quyền {role}" + nút **Tham gia**
5. Bấm Tham gia → `POST .../accept` → chuyển tới `/${orgSlug}/workspace`

### 2c. Xử lý link chết

Backend trả **410 Gone** cho ba trường hợp: hết hạn, bị thu hồi, hết lượt.
Câu lỗi nằm sẵn trong `message`, hiện thẳng ra cho người dùng.

**404** nghĩa là token sai/bịa → hiện "Link không hợp lệ".

> Đừng gộp 410 và 404 thành một câu chung chung. Người dùng cần biết "link hết
> hạn, xin người mời gửi link mới" khác với "link sai".

---

## 3. Ba điều dễ làm sai

**Token là bí mật, đừng để lọt.** `GET /organizations/:id/invite-links` trả về
`token`. Backend đã chặn thành viên thường gọi endpoint này — nhưng ở client,
đừng nhét token vào chỗ nào mà người không phải owner/admin đọc được.

**Đừng tự tính link còn sống hay không.** Server đã trả `active`. Tự so
`expiresAt` với `Date.now()` ở client là sai khi đồng hồ máy người dùng lệch.

**`alreadyMember` phải xử lý.** Người đã ở trong tổ chức bấm lại link thì đưa
thẳng vào, đừng bắt bấm "Tham gia" lần nữa — bấm cũng không tiêu lượt (backend
đã lo), nhưng hỏi thừa là khó hiểu.

---

## 4. Store hay service?

Tạo `ngrx/invite-link/` theo đúng khuôn bạn đã làm với `organization/`.

Lý do không nhét vào `OrganizationStore`: token là dữ liệu **nhạy cảm và sống
ngắn**, chỉ dùng ở đúng hai màn. Trộn vào store tổ chức là nó nằm trong bộ nhớ
suốt phiên và hiện trong DevTools ở mọi trang.

---

## 5. Xong là thế nào

- [ ] Tạo được link, sao chép được, dán vào tab ẩn danh thì vào được tổ chức
- [ ] Thu hồi xong thì link cũ báo **410** với câu lỗi đọc hiểu được
- [ ] Link `maxUses: 1`: người thứ hai bị chặn, **không** lọt vào tổ chức
- [ ] Thành viên thường **không thấy** ô quản lý link
- [ ] Người đã là thành viên bấm link → vào thẳng, không hỏi
- [ ] `npm run build` sạch, không có `any`
