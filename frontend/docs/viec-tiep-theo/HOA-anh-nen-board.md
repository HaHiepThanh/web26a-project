# Hoà — Ảnh nền board lên Supabase Storage

> Việc **trọn vẹn nhất** trong ba việc lần này: cần cả endpoint backend lẫn giao
> diện. Bạn làm từ đầu tới cuối.
>
> Đây không phải tính năng mới — nó đang chạy **sai** và sẽ hỏng khi dùng thật.

---

## 1. Hiện trạng: ảnh nền là base64 nhét trong localStorage

Đọc `frontend/src/app/ngrx/board/board.local-image.util.ts`. Chính chú thích
trong đó đã ghi rõ đây là giải pháp tạm.

Hai vấn đề thật:

**Vỡ quota.** localStorage chỉ ~5MB. Một ảnh 1200×900 chưa nén nặng **1.09MB**.
Đặt vài ảnh nền là hết chỗ — hàm `persistLocalBoardOverrides()` trả `false` khi
vỡ, và code hiện phải **bỏ ảnh đi để giữ board**. Người dùng mất ảnh không hiểu vì sao.

**Chỉ mình bạn thấy.** Ảnh nằm trong máy người đặt. Người khác mở cùng board
thấy nền xám. Đây là app làm việc nhóm — nền board phải là của board, không phải
của trình duyệt.

Database đã sẵn sàng: cột `boards.background_image_path` tồn tại, chờ một đường
dẫn Storage. Chưa ai ghi vào đó.

---

## 2. Backend: endpoint upload

**Đã có mẫu để chép:** `backend/src/modules/attachments/` làm đúng việc này cho
tệp đính kèm của thẻ. Đọc nó trước, đừng phát minh lại.

Những chỗ đáng chú ý trong mẫu đó:

- `const BUCKET = 'card-attachments'` — bucket **private**, không public
- Trả về bằng `createSignedUrls(...)` hạn 1 giờ, không trả URL vĩnh viễn
- Dùng `FileInterceptor` với `memoryStorage()` cho multipart

### Việc cần làm

```
POST   /boards/:id/background     multipart, field `file`
DELETE /boards/:id/background     gỡ nền, xoá tệp trong Storage
```

- Bucket mới `board-backgrounds`, cũng **private**
- Đường dẫn: `boards/<board_id>/bg.<ext>` — một board một ảnh, đặt lại thì ghi đè
- Ghi `boards.background_image_path`, phát sự kiện WebSocket `board.updated`
- Quyền: dùng `assertBoardAccess` như mọi endpoint khác. Chỉ owner/admin đổi
  được nền hay ai trong board cũng đổi được — bạn quyết, nhưng ghi rõ lý do
  trong chú thích

### Giới hạn phải chặn ở SERVER

Kiểm ở client là gợi ý cho người dùng; kiểm ở server mới là ràng buộc.

| | Giá trị | Vì sao |
|---|---|---|
| Kích thước | ≤ 2MB | Sau khi client nén thì ảnh thường ~30KB; 2MB đã rất rộng |
| Kiểu tệp | `image/jpeg`, `image/png`, `image/webp` | Đừng tin `Content-Type` client gửi — kiểm cả magic bytes |

---

## 3. Frontend

**Nén trước khi upload — bắt buộc.** Đo thực tế ghi trong `schema.md`: ảnh
1200×900 chưa nén **1.09MB**, nén xong còn **30KB** (giảm 36 lần). Thu về tối đa
1600px rồi encode JPEG chất lượng ~0.82 bằng `canvas.toBlob()`.

Không nén thì vừa tốn dung lượng Storage vừa làm trang board tải chậm cho **mọi**
người trong board, không riêng người tải lên.

### Quy tắc hiển thị (đã ghi trong `schema.md` mục 4.7, giữ nguyên)

| Tình huống | Hiển thị |
|---|---|
| `background_image_path` có giá trị | Dùng **ảnh** |
| Chỉ có `background` | Dùng **màu** |
| Cả hai `null` | Nền xám mặc định |

Cố ý **không** cấm điền cả hai: màu là nền dự phòng cho lúc ảnh chưa tải xong
hoặc URL ký đã hết hạn, nhờ vậy board không bao giờ trắng trơn.

### Gỡ phần localStorage

Xoá `board.local-image.util.ts` và `localOverrides` trong `board.state.ts`
**trong cùng PR**. Để cả hai đường là hai nguồn sự thật đá nhau — người dùng đặt
nền mới mà vẫn thấy nền cũ từ localStorage.

---

## 4. Bẫy riêng: URL ký hết hạn sau 1 giờ

Đây là chỗ dễ sai nhất và chỉ lộ ra sau khi mở tab lâu.

`createSignedUrl` trả URL sống 1 giờ. Người mở board rồi để tab đó qua trưa,
quay lại thì ảnh nền **vỡ** — vì URL đã hết hạn.

Đừng cache URL ký vào state lâu dài. Lấy lại URL mỗi lần nạp board, và nếu ảnh
lỗi thì rơi về màu nền chứ đừng để trống.

---

## 5. Xong là thế nào

- [ ] Tải ảnh lên → **người khác** mở cùng board cũng thấy (mở hai tài khoản)
- [ ] Ảnh 1MB chưa nén: client nén xuống còn vài chục KB trước khi gửi
- [ ] Gửi tệp 5MB thẳng vào API → server từ chối **400**, không phải 500
- [ ] Gửi tệp `.exe` đổi tên thành `.jpg` → server từ chối
- [ ] Gỡ nền → cả hai bên đều về màu/xám, tệp trong Storage bị xoá
- [ ] `localStorage` **không còn** base64 ảnh nền nào
- [ ] Người ngoài board gọi thẳng `POST /boards/:id/background` → **404**
- [ ] `npm run kiem-tra` vẫn đạt; thêm phép thử quyền vào `kiem-tra-bao-mat.mjs`
