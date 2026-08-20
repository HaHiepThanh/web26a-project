# Prompt để dán vào AI Agent

Copy nguyên khối, **thay `<TÊN>` bằng tên bạn**: `Huy` / `Hoà` / `Hoàng`.

---

## 🚀 Prompt mở đầu — dùng lần đầu tiên

```
Mình là <TÊN>, học viên mới, chưa từng viết backend thật.

Dự án: clone Trello, dùng NestJS + Supabase (Postgres) + Firebase Auth.
Mình được giao làm một số endpoint, code đã có sẵn khung, mình cần điền ruột vào.

Trước khi trả lời, hãy đọc 2 file này:
  backend/docs/AI-AGENT.md   ← quy tắc hướng dẫn, đọc file này TRƯỚC
  backend/docs/<TÊN>.md      ← phần việc của mình

Rồi trả lời đúng 3 việc:
  1. Xác nhận mình phụ trách mảng nào + liệt kê đầy đủ endpoint của mình
  2. Mình nên bắt đầu từ endpoint nào, vì sao
  3. Hướng dẫn mình làm endpoint đầu tiên đó, từng bước một

Yêu cầu khi hướng dẫn mình:
  - Trả lời bằng tiếng Việt
  - Giải thích chậm, đừng viết hộ hết code — cho khung + gợi ý để mình tự viết
  - Mỗi lần chỉ 1 endpoint. Làm xong, test chạy được rồi mới sang cái tiếp theo
  - Sau mỗi endpoint, hướng dẫn mình test bằng Postman từ A đến Z
```

> **Nếu AI Agent không đọc được file trong máy** (ChatGPT/Claude trên web):
> đính kèm 2 file `AI-AGENT.md` và `<TÊN>.md` vào khung chat, rồi bỏ 3 dòng
> "hãy đọc 2 file này" đi.

---

## Prompt dùng trong lúc làm

### Nhờ xem code vừa viết

```
Mình viết xong hàm <tên hàm> rồi. Xem giúp mình có sai gì không,
nhất là phần bảo mật (lọc theo org_id, lấy user_id từ token).

<dán code vào đây>
```

### Hỏi cách test

```
Mình vừa làm xong <METHOD /đường-dẫn>. Hướng dẫn mình test từ đầu:
lấy token thế nào, gắn vào đâu, gửi body gì, kết quả thế nào mới là đúng.
```

### Báo lỗi — luôn kèm ĐỦ 3 THỨ

```
Endpoint <METHOD /đường-dẫn> bị lỗi.

Code mình viết:
<dán code>

Postman trả về:
<dán status code + body>

Terminal đang chạy npm run start:dev báo:
<dán dòng lỗi>
```

> ⚠️ Thiếu phần **terminal** thì ai cũng chỉ đoán mò được thôi. Lỗi 500 in
> stack trace đầy đủ ở terminal, còn Postman chỉ hiện 1 dòng chung chung.

### Kẹt, không hiểu đề bài

```
Mình đọc phần <tên endpoint> trong <TÊN>.md mà chưa hiểu.
Giải thích lại giúp mình bằng ví dụ cụ thể, kèm dữ liệu mẫu trước và sau.
```

### Nhờ kiểm tra trước khi báo xong

```
Mình nghĩ đã xong endpoint <METHOD /đường-dẫn>.
Rà lại giúp mình theo checklist "Xong khi nào" cuối file <TÊN>.md,
và chỉ ra chỗ nào mình còn thiếu.
```
