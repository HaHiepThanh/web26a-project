# 21 endpoint bổ sung — dành cho việc nối frontend

> Backend đã xong và có bộ kiểm tra riêng: `npm run kiem-tra:bo-sung` (66 phép thử).
> Việc còn lại của các bạn học viên là **nối vào giao diện**, không phải viết backend.

Chạy thử toàn bộ:

```bash
cd backend && npm run kiem-tra
```

---

## 1. Checklist trong thẻ

Thay cho `ChecklistService` đang giữ dữ liệu trong RAM (F5 là mất).

| | |
|---|---|
| `GET /checklist?cardId=` | Danh sách mục, sắp theo `position` tăng dần |
| `POST /checklist` | `{ cardId, content }` → mục mới về cuối |
| `PATCH /checklist/:id` | `{ content?, isDone?, position? }` |
| `DELETE /checklist/:id` | |

```json
{ "id": "…", "cardId": "…", "content": "Việc 1", "isDone": false, "position": 1 }
```

`position` là **số thực** — chèn giữa hai mục thì lấy trung bình vị trí hai hàng
xóm, không phải đánh số lại cả danh sách (giống cách kéo thả cột/thẻ).

Phát WebSocket `checklist.changed` / `checklist.deleted` → người khác đang mở
board thấy ngay.

---

## 2. Đính kèm tệp

Thay cho `AttachmentService` đang giữ base64 trong RAM.

| | |
|---|---|
| `GET /attachments?cardId=` | Danh sách, **kèm link tải ký tạm 1 giờ** |
| `POST /attachments` | `multipart/form-data`: field `file` + field `cardId` |
| `PATCH /attachments/:id/cover` | `{ isCover: true \| false }` |
| `DELETE /attachments/:id` | Xoá cả dòng lẫn file trong Storage |

```json
{
  "id": "…", "cardId": "…", "name": "so-do.png", "mimeType": "image/png",
  "sizeBytes": 20480, "isImage": true, "isCover": false,
  "uploadedBy": "…", "createdAt": "…",
  "url": "https://…/object/sign/…?token=…"
}
```

**Ba điều cần nhớ khi nối:**

1. Gửi bằng `FormData`, **đừng tự đặt `Content-Type`** — để trình duyệt tự sinh
   boundary. Đặt tay là request hỏng.
2. `url` **hết hạn sau 1 giờ**. Đừng lưu vào localStorage rồi dùng lại ngày hôm
   sau; mở lại thẻ thì gọi `GET /attachments` để lấy link mới.
3. Tệp tối đa **10MB**, quá thì trả 400.

File nằm trong bucket **riêng tư** `card-attachments` trên Supabase Storage.
Bucket public thì ai biết đường dẫn cũng tải được, mà đường dẫn lại nằm ngay
trong phản hồi API — đính kèm là tài liệu nội bộ nên phải đi qua kiểm tra quyền
rồi backend mới cấp link tạm.

Đường dẫn lưu là `{orgId}/{cardId}/{uuid}.{đuôi}` — **không** dùng tên tệp người
dùng gửi lên, vì tên đó có thể chứa `../` để ghi đè file của thẻ khác. Tên gốc
vẫn giữ ở cột `name` để hiển thị.

---

## 3. Tuỳ chọn riêng của từng người

⚠️ Ba nhóm này lọc theo **`user_id`**, không phải theo board. Hai người cùng mở
một board vẫn có sao và bộ lọc riêng. Vì là dữ liệu riêng nên **không** phát
WebSocket.

| | |
|---|---|
| `GET /stars` | Id các board tôi đã gắn sao (mọi tổ chức) |
| `POST /stars/:boardId` | Trả **200** (không phải 201) — bấm lại không tạo thêm gì |
| `DELETE /stars/:boardId` | |
| `GET /saved-filters?boardId=` | |
| `POST /saved-filters` | `{ boardId, name, assigneeIds?, labelIds?, priorities?, dateFilter? }` |
| `DELETE /saved-filters/:id` | Chỉ xoá được của mình, của người khác → 404 |
| `GET /highlight-groups?boardId=` | |
| `POST /highlight-groups` | `{ boardId, name, cardIds? }` |
| `DELETE /highlight-groups/:id` | |

`assigneeIds` là **Firebase uid** (chuỗi 28 ký tự), `labelIds`/`cardIds` là uuid.
`priorities` chỉ nhận `high` / `medium` / `low`; `dateFilter` chỉ nhận
`overdue` / `today` / `week`.

---

## 4. Thống kê board

`GET /stats/boards/:boardId` — thay dữ liệu giả ở modal "Thống kê & Báo cáo".

Một request trả cả ba khối (modal cần cả ba cùng lúc; tách ra 3 request chỉ khiến
giao diện hiện lắp ghép từng mảnh):

```json
{
  "overview":   { "boardName": "…", "totalCards": 12, "completedCount": 5,
                  "inProgressCount": 4, "overdueCount": 3, "onTimeRatePct": 62 },
  "memberWorkload": [ { "userId": "…", "displayName": "…", "assignedCount": 4,
                        "completedCount": 2, "doingCount": 1, "overdueCount": 1,
                        "lastActiveAt": "…" } ],
  "overdueCards":   [ { "cardId": "…", "title": "…", "assigneeId": "…",
                        "assigneeName": "…", "dueDate": "…", "daysOverdue": 5 } ]
}
```

Số liệu đọc từ 3 **view** trong database, tính lại mỗi lần gọi nên luôn khớp
thực tế — không cần cache ở frontend.

---

## 5. Bốn endpoint lẻ

| | |
|---|---|
| `PATCH /organizations/:id` | `{ name }` — **chỉ đổi tên**, slug cố định |
| `GET /organizations/:id/invites` | Lời mời đã gửi, chưa ai trả lời (owner/admin) |
| `DELETE /organizations/invites/:id` | Huỷ lời mời; đã được đồng ý rồi → **409** |
| `PATCH /boards/:id` | Nhận thêm `background` + `backgroundImagePath` |

**Slug không đổi được** là cố ý: nó nằm trong mọi URL (`/:orgSlug/board/:id`) và
trong link mọi người đã lưu — đổi một cái là gãy hết.

**Nền board** giờ lưu xuống database. `BoardService` ở frontend đang giữ
`background` + `backgroundImageUrl` trong localStorage (`trello_boards`) — bỏ chỗ
đó đi, gửi thẳng qua `PATCH /boards/:id`. Gửi `null` để gỡ nền về mặc định.

Hai chỗ frontend đang hiện câu *"Tính năng … chưa có ở backend"* trong
`organization.service.ts` giờ xoá được rồi.

---

## Luật chung — mọi endpoint trên đều theo

1. **Không thuộc tổ chức → 404**, không phải 403. Trả 403 là vô tình xác nhận
   "id này có thật, chỉ là bạn không có quyền" — người ngoài cứ dò uuid, cái nào
   403 là biết có tồn tại.
2. **Thành viên thường dùng được hết phần này.** Đây là "làm việc trên board",
   không phải "quản lý" — khác với tạo/xoá workspace và board (chỉ owner/admin).
3. **camelCase** ở mọi phản hồi.
4. **id sai định dạng uuid → 404**, không phải 500.

Kiểm tra quyền gom về một chỗ: `src/common/access/access.service.ts`. Module mới
chỉ việc gọi `assertBoardAccess` / `assertCardAccess`, không phải tự chép lại —
chính việc chép tay từng module là chỗ đã để lọt lỗ hổng ở module cards trước đây.
