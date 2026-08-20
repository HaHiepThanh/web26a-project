# Prompt để dán vào AI Agent

Copy nguyên khối, **thay `<TÊN>` bằng tên bạn**: `Huy` / `Hoà` / `Hoàng`.

---

## 🚀 Prompt mở đầu — dùng lần đầu tiên

```
Mình là <TÊN>, học viên mới, chưa từng viết backend thật.

Dự án: clone Trello, dùng NestJS + Supabase (Postgres) + Firebase Auth.
Mình được giao làm một số endpoint, code đã có sẵn khung, cần điền ruột vào.

Trước khi trả lời, hãy đọc 2 file này:
  backend/docs/AI-AGENT.md   ← quy tắc làm việc, đọc file này TRƯỚC
  backend/docs/<TÊN>.md      ← phần việc của mình

CÁCH LÀM VIỆC: mình KHÔNG gõ code tay. BẠN viết code vào file, mình duyệt
và tự chạy test. Với MỖI endpoint, làm đúng 5 bước này:

  1. Nói ngắn gọn bạn sắp làm gì, sửa file nào — rồi HỎI MÌNH rồi DỪNG LẠI CHỜ
  2. Mình gõ "ok" thì bạn mới viết code
  3. Viết xong, tóm tắt 3-5 dòng: sửa gì, chỗ nào là mấu chốt, chỗ nào chặn
     truy cập trái phép. Đừng dán lại toàn bộ code
  4. Hướng dẫn mình test bằng Postman TỪ A ĐẾN Z: lấy token thế nào, gắn vào
     đâu, gọi đường dẫn nào, gửi body gì, kết quả thế nào MỚI LÀ ĐÚNG
  5. Chờ mình chạy xong và báo lại. Chạy được rồi mới sang endpoint tiếp theo

Trả lời đầu tiên cho mình 4 việc:
  1. Xác nhận mình phụ trách mảng nào + liệt kê đầy đủ endpoint của mình
  2. Mình nên bắt đầu từ endpoint nào, vì sao
  3. Nói bạn định làm gì cho endpoint đó
  4. Hỏi mình có ok không, rồi dừng lại chờ

Yêu cầu chung:
  - Trả lời bằng tiếng Việt
  - MỖI LẦN CHỈ 1 ENDPOINT. Mình có giục "làm hết đi" thì cũng đừng nghe
  - Chỉ sửa file trong thư mục của mình, đừng đụng phần của bạn khác
  - Viết code xong mà chưa hướng dẫn mình test thì coi như chưa xong
```

> **Nếu AI Agent không đọc được file trong máy** (ChatGPT/Claude trên web):
> đính kèm 2 file `AI-AGENT.md` và `<TÊN>.md` vào khung chat, rồi bỏ 3 dòng
> "hãy đọc 2 file này" đi.

---

## Prompt dùng trong lúc làm

### Duyệt cho AI viết code

```
ok, làm đi
```

### Sang endpoint tiếp theo

```
Mình test rồi, chạy đúng như bạn nói. Sang endpoint tiếp theo nhé.
```

### Nhờ giải thích đoạn code AI vừa viết

```
Đoạn <dán đoạn code> này làm gì vậy? Giải thích bằng ví dụ dữ liệu
cụ thể trước và sau giúp mình.
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

### Nhờ rà lại trước khi báo xong

```
Mình nghĩ đã xong endpoint <METHOD /đường-dẫn>.
Rà lại giúp mình theo checklist "Xong khi nào" cuối file <TÊN>.md,
và chỉ ra chỗ nào còn thiếu.
```

### Khi AI làm quá đà

```
Khoan, bạn đang làm nhiều endpoint một lúc. Quay lại làm từng cái thôi,
và nhớ hướng dẫn mình test xong cái này rồi mới sang cái sau.
```
