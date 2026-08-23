# AI gợi ý tạo thẻ từ chat (Gemini)

> Nhắn "Ê Hoà, mày giúp tao làm chức năng thêm giỏ hàng đi trong hôm nay nhé để
> tao còn làm chức năng thanh toán" → AI đề xuất **2 thẻ**, đúng người, đúng hạn.

Chạy thử: `npm run kiem-tra:ai` (44 phép thử).

---

## Luồng đi

```
POST /chat  ──► lưu tin nhắn ──► phát 'chat.message'  ──► TRẢ VỀ NGAY (~0.3s)
                                       │
                                       └─► analyze()  ◄── KHÔNG await
                                            │
                                            ├─ bộ lọc rẻ (regex, 0 lượt gọi)
                                            ├─ Gemini (~1–2s)
                                            ├─ kiểm tra lại kết quả
                                            ├─ lưu `chat_task_suggestions`
                                            └─► phát 'suggestion.created' cho CẢ BOARD
```

Người dùng bấm chip → modal xem lại/sửa → `POST /task-suggestions/:id/accept`
→ tạo thẻ qua `CardsService` → `card.created` bay tới mọi người.

---

## Endpoint

| | |
|---|---|
| `GET /task-suggestions?boardId=` | Gợi ý còn `pending` — F5 không mất |
| `POST /task-suggestions/:id/accept` | Body `{ cards: [...] }` — danh sách **đã sửa** trong modal |
| `POST /task-suggestions/:id/dismiss` | Bỏ qua |

Không có endpoint "phân tích" cho frontend gọi. Bản trước có `POST /ai/detect-task`
và nó sai ở hai chỗ: chỉ **người gửi** thấy gợi ý (người được giao việc thì không),
và mỗi client lại phân tích lại cùng một tin nhắn.

---

## Cấu hình

`backend/.env`:

```
GEMINI_API_KEY=<chép từ secrets/.env, dòng gemini-api-key>
GEMINI_MODEL=gemini-3.5-flash-lite
```

Thiếu `GEMINI_API_KEY` → tính năng **tự tắt**, chat vẫn chạy bình thường.

⚠️ Đây chính là chỗ bản trước làm hỏng: `AiService` cũ gọi
`getOrThrow('ANTHROPIC_API_KEY')` ngay trong constructor, mà NestJS khởi tạo mọi
provider lúc bật app — nên **thiếu key là cả backend không khởi động được**, cuối
cùng phải tắt hẳn `AiModule`. Giờ đọc key kiểu "thiếu thì tắt tính năng".

### Vì sao chọn `gemini-3.5-flash-lite`

Việc để tên model ở biến môi trường đã có ích ngay hai lần trong lúc làm:

| Model | Kết quả |
|---|---|
| `gemini-2.5-flash` | **404** — Google ngừng cấp cho tài khoản mới (dù vẫn nằm trong danh sách model của key) |
| `gemini-3.6-flash` | Đúng, nhưng **~28 giây/lượt** vì nó "suy nghĩ" rất lâu |
| `gemini-3.5-flash` | Đúng, ~3–5 giây |
| **`gemini-3.5-flash-lite`** | Đúng y hệt, **~1–2 giây** ✅ |

Đo trên 3 kịch bản (Việt / Anh / trộn). Bản lite cho kết quả giống hệt bản đầy đủ
nhưng nhanh gấp 3.

---

## Song ngữ Việt – Anh

Cả ba dạng đều xử lý được:

| Tin nhắn | Kết quả |
|---|---|
| `Ê Hoà, mày giúp tao làm chức năng thêm giỏ hàng...` | 2 thẻ, tên **tiếng Việt** |
| `Hey Hoa, can you build the add-to-cart feature...` | 2 thẻ, tên **tiếng Anh** |
| `Hoà ơi fix cái bug login trước thứ 6 nhé` | 1 thẻ, hạn = thứ Sáu tới |

Ba chỗ phải làm riêng cho việc này:

1. **Bộ lọc rẻ** có cả từ khoá tiếng Anh (`build`, `help`, `finish`, `by`, `EOD`,
   `today`…). Thiếu nhóm đó thì tin tiếng Anh bị chặn ngay từ đầu, không bao giờ
   tới được model.
2. **Prompt** yêu cầu tên thẻ viết **cùng ngôn ngữ với tin nhắn gốc** — nhắn tiếng
   Anh mà đẻ ra thẻ tiếng Việt thì đọc rất chối.
3. **Mốc thời gian** hiểu cả `hôm nay/mai/thứ 6` lẫn `today/tomorrow/by Friday/EOD`.

---

## Ba lớp bảo vệ

### 1. Bộ lọc rẻ — trước khi gọi model

Regex thuần, không tốn lượt gọi. Cần **ít nhất 2 trong 3** dấu hiệu: động từ giao
việc · mốc thời gian · nhắc tên ai đó. Cộng thêm điều kiện dài ≥ 15 ký tự.

Chỉ một dấu hiệu thì chưa đủ — "hôm nay làm biếng quá" có cả động từ lẫn thời gian
nhưng không nhắc ai, nên vẫn bị chặn.

### 2. Kiểm tra lại kết quả của model

Model bịa id là chuyện bình thường (thấy "Hoà" rồi tự chế ra một uid trông hợp lý).

| Trường | Sai thì làm gì |
|---|---|
| `assigneeId` không có trong board | **bỏ trường**, giữ nguyên thẻ |
| `listId` không thuộc board | rơi về cột đầu tiên |
| `dueDate` sai định dạng hoặc ngày không có thật (`2026-02-31`) | bỏ trường |
| `priority` lạ | `medium` |
| `title` rỗng | bỏ cả thẻ đó |

Bỏ **trường** chứ không bỏ **cả gợi ý**: một cái id hỏng không đáng để mất luôn
đầu việc mà model trích đúng.

### 3. Giới hạn tần suất

12 lượt/board/phút, cửa sổ trượt giữ trong bộ nhớ. Phòng khi ai đó spam chat làm
cạn quota.

---

## Chống tạo thẻ trùng

Cột `status` trong `chat_task_suggestions` là chốt chặn duy nhất. `accept()` đổi
trạng thái **TRƯỚC** khi tạo thẻ, bằng câu `UPDATE ... WHERE status = 'pending'`:

- Huy và Hoà cùng bấm "Chấp nhận" → người thứ hai nhận **409**, không tạo ra bộ
  thẻ thứ hai.
- Tạo thẻ trước rồi mới đổi trạng thái là để hở đúng khoảng thời gian đó.

Thêm một lưới nữa: `UNIQUE (message_id)` — một tin nhắn chỉ đẻ ra đúng một gợi ý,
kể cả khi server phân tích lại sau khi khởi động lại.

---

## Múi giờ

`homNayVN()` dùng `Intl.DateTimeFormat` với `Asia/Ho_Chi_Minh`, **không** dùng
`new Date().toISOString()`. Lý do: `toISOString()` cho giờ UTC, mà từ 0h đến 7h
sáng giờ Việt Nam thì UTC vẫn đang ở **ngày hôm trước** — nhắn "xong trong hôm
nay" lúc 1h sáng sẽ ra hạn của hôm qua.

---

## Kiểm tra

`npm run kiem-tra:ai` — 44 phép thử, gồm cả gọi model thật:

| Nhóm | |
|---|---|
| Bộ lọc rẻ | `"ok"`, `"ừ"`, `"lol"`, báo-đã-xong → không gọi model |
| 🇻🇳 Việt | 2 thẻ · giỏ hàng→Hoà + hạn hôm nay · thanh toán→Huy (hiểu **"tao"**) |
| 🇬🇧 Anh | 2 thẻ · cart→Hoà · checkout→Huy (hiểu **"I'll"**) · tên thẻ không dấu |
| 🔀 Trộn | 1 thẻ · quy "thứ 6" ra đúng ngày thứ Sáu ở tương lai · ưu tiên cao |
| Quyền | người ngoài đọc/chấp nhận → 404 |
| Chống trùng | chấp nhận lần hai → 409, **không** tạo thêm thẻ |
| WebSocket | B nhận `suggestion.created` mà không gọi API |
| Không chặn chat | `POST /chat` trả về dưới 1.5s |

Bài test LLM không tất định, nên chỉ khẳng định những thứ **bắt buộc phải đúng**
(số thẻ, ai phụ trách, ngày hạn) và so tên thẻ kiểu *chứa*. Đã chạy 3 lần liên
tiếp đều 44/44.

`npm run kiem-tra:ai -- --skip-llm` chạy được phần còn lại khi mạng hỏng/hết quota.

⚠️ Bộ test đổi tên hiển thị của `hocvien-a@test.dev` thành "Huy" (để model có cái
bám vào) và **trả lại như cũ** lúc dọn dẹp.
