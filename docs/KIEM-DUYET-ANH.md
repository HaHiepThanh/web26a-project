# Kiểm duyệt ảnh 18+

Chặn ảnh nhạy cảm / bạo lực ở **mọi đường ảnh đi vào hệ thống**.

## Chặn ở đâu

| Đường | Bucket | Ghi chú |
|---|---|---|
| Avatar (`POST /auth/avatar`) | **CÔNG KHAI** | Rủi ro cao nhất — URL ai cũng mở được |
| Ảnh nền board (`POST /boards/:id/background`) | riêng tư | |
| Ảnh đính kèm thẻ (`POST /attachments`) | riêng tư | Ảnh đầu tiên **tự thành bìa thẻ** |

Cả ba đều gọi `ModerationService.kiemTra()` **trước khi ghi vào Storage**.

> **Vì sao phải quét trước khi lưu?** Bucket `avatars` là bucket công khai. Lưu
> trước rồi quét ngầm nghĩa là ảnh có một khoảng sống dưới một URL không cần
> đăng nhập — vài giây cũng đủ để phát tán.

Đính kèm thẻ nhận **cả tài liệu**: file không phải ảnh (PDF, docx…) đi qua bình
thường, chỉ ảnh mới bị kiểm.

## Chín nhóm bị chặn

| Nhà cung cấp | Nhóm chấm | Cần gì |
|---|---|---|
| **Gemini** | **đủ cả 9** | Khoá AI Studio (miễn phí, không cần thẻ) |
| Vision SafeSearch | 3 nhóm cốt lõi | Google Cloud + **bật thanh toán** |

**Gemini một mình là đủ.** Vision là lớp *thêm chính xác* cho ba nhóm cốt lõi
(khiêu dâm · gợi dục · bạo lực), không phải lớp *thêm phạm vi*.

Hai bên chạy **song song**, lấy điểm **cao nhất** của từng nhóm — chỉ cần một
bên chắc chắn thấy vi phạm là chặn. Lấy trung bình sẽ để bên "không nhận ra"
pha loãng mất kết luận đúng của bên kia.

> ### Một lỗi thiết kế đã sửa
>
> Bản đầu chia việc: Vision lo 3 nhóm cốt lõi, Gemini lo 6 nhóm mở rộng. Cách
> chia đó **ngầm coi Vision luôn có mặt**. Nhưng Vision đòi bật thanh toán trên
> Google Cloud, nên rất dễ rơi vào cảnh chỉ có Gemini — và khi đó **ba nhóm
> quan trọng nhất không ai kiểm**, trong khi log vẫn báo `Kiểm duyệt ảnh: BẬT`
> như thể mọi thứ đang chạy.
>
> Mất phạm vi mà không có dấu hiệu gì là kiểu hỏng tệ nhất cho một tính năng an
> toàn. Nay **mỗi nhà cung cấp tự đứng được một mình**.

### Khi chính Gemini từ chối xử lý ảnh

Gemini có bộ lọc an toàn riêng và có thể **từ chối** đọc ảnh quá nhạy cảm. Lời
từ chối đó **là kết luận, không phải lỗi** — nó được quy thành vi phạm, ánh xạ
theo `safetyRatings` khi có (`SEXUALLY_EXPLICIT` → khiêu dâm, `HATE_SPEECH` →
thù ghét…), không quy được thì rơi về `gây sốc`.

Chỉ lấy nhãn mức `HIGH`/`MEDIUM`: Gemini trả về nhãn `NEGLIGIBLE` cho **mọi**
ảnh, gom hết vào là ảnh nào cũng thành vi phạm.

### Hai nhóm CỐ Ý không chặn

SafeSearch còn trả về `medical` và `spoof`. Cả hai **không** dùng để chặn:

- `medical` — ảnh y khoa là nội dung hợp lệ. Chặn nó là chặn nhầm ảnh X-quang
  trong board của một nhóm làm phần mềm y tế.
- `spoof` — chỉ nghĩa là "ảnh đã chỉnh/chế", không hàm ý có hại. Gần như mọi
  ảnh chế đều dính nhãn này.

### Ngưỡng

Thang 0–3, **chặn từ 2**. Khớp với thang `likelihood` của SafeSearch:

| | |
|---|---|
| 0 | `VERY_UNLIKELY` / `UNKNOWN` |
| 1 | `UNLIKELY` / `POSSIBLE` |
| **2** | **`LIKELY`** ← chặn từ đây |
| 3 | `VERY_LIKELY` |

## Fail-closed

**Không kiểm được thì không cho qua.**

API hỏng vài phút thì không ai đổi được avatar. Chấp nhận vì ba đường này đều
là hành động hiếm và cố ý — bảo người dùng thử lại là được. Còn cho qua thì chỉ
cần API chập chờn đúng lúc là ảnh lọt thẳng vào bucket công khai.

Một chi tiết quan trọng: **một bên lỗi + bên còn lại bảo sạch → vẫn chặn.** "Có
một bên bảo sạch" không đồng nghĩa "đã kiểm xong" — bên hỏng có thể chính là
bên phụ trách nhóm vi phạm.

> ### 🛑 Mặt trái phải biết: khoá hỏng = chặn HẾT
>
> Fail-closed không phân biệt "hỏng nhất thời" với "cấu hình sai vĩnh viễn".
> Cắm một `GOOGLE_VISION_API_KEY` chưa bật thanh toán vào là **mọi upload ảnh
> đều bị chặn**, dù Gemini vẫn chạy tốt — vì chưa lần nào kiểm xong.
>
> **Cách chữa nhanh:** gỡ `GOOGLE_VISION_API_KEY` khỏi `.env`, khởi động lại.
> Hệ thống quay về chạy bằng Gemini.
>
> **Cách tránh:** thử khoá bằng `curl` trước khi dán vào `.env` — xem
> `docs/LAY-CAC-KEY.md`, Bước 0'.
>
> Đây là đánh đổi CỐ Ý, không phải lỗi: nếu chọn cho qua khi không kiểm được thì
> chỉ cần API chập chờn đúng lúc là ảnh lọt thẳng vào bucket công khai. Nhưng
> phải biết để lúc "tự nhiên không upload được gì" thì nhìn đúng chỗ.

Câu báo lỗi phân biệt hai ca, để không đổ oan cho ảnh người dùng:

| Ca | Người dùng thấy |
|---|---|
| Ảnh vi phạm | *This image was blocked by the content check (violence)…* |
| Hệ thống hỏng | *The image could not be checked right now. Please try again…* |

## Ba lớp chặn KHÔNG phụ thuộc API

Ba thứ này chạy cả khi `MODERATION_ENABLED=false`, vì chúng là chuyện đúng đắn
của dữ liệu chứ không phải chuyện kiểm duyệt:

**1. Magic bytes.** `file.mimetype` do **client khai** — đổi tên `virus.exe`
thành `anh.png` rồi khai `image/png` là qua được mọi danh sách trắng dựa trên
mimetype. Nay loại ảnh suy từ **vài byte đầu của file**, và mime ghi vào Storage
cũng lấy từ đó.

**2. Cấm GIF.** Mọi API kiểm duyệt chỉ quét **một khung hình**. Ảnh động sạch ở
khung 1 và vi phạm ở khung 30 sẽ lọt trót lọt — nhận GIF nghĩa là để hở sẵn một
đường đi vòng.

**3. Trần 8MB.** Ảnh gửi đi chấm dưới dạng base64, phình ~33%. Chặn kèm lý do rõ
vẫn hơn để request lỗi rồi người dùng nhận về "không kiểm được" khó hiểu.

## Nhớ ảnh đã từ chối

Hash `sha256` của ảnh bị từ chối được nhớ lại (tối đa 500, trong bộ nhớ tiến
trình) → gửi lại đúng file đó thì chặn ngay, không tốn lượt gọi API. Chặn luôn
trò thử lại cùng một file 50 lần để đốt quota.

**Lỗi hệ thống KHÔNG ghi hash** — ảnh đó chưa hề bị kết luận là xấu. Nhớ nhầm
thì một lần Google chập chờn sẽ cấm vĩnh viễn một ảnh bình thường.

## Cấu hình

Xem `backend/.env.example`. Tóm tắt:

```
GOOGLE_VISION_API_KEY=      # nên có — nhanh và đã hiệu chuẩn
GEMINI_API_KEY=             # đã có sẵn trong dự án
MODERATION_ENABLED=         # trống = tự bật khi có key
```

Chỉ có Gemini thì **mỗi lần upload chờ ~3 giây** (đo thật). Thêm Vision (~0.3s)
để cắt phần lớn độ trễ đó.

## Chặn tệp thực thi ở đường đính kèm

Đính kèm được tải về qua link đã ký của chính app nên nó **mang vẻ đáng tin**:
đồng đội thấy tệp nằm trong thẻ công việc của nhóm mình thì mở ra mà không nghi
ngờ. Một `.exe` ở đó là đường phát tán mã độc mượn uy tín của app.

Chặn bằng **hai lớp**, vì mỗi lớp bắt một kiểu:

| Lớp | Bắt được | Ví dụ |
|---|---|---|
| Magic bytes | Nhị phân **dù đã đổi tên** | `virus.exe` → `bao-cao.pdf` vẫn còn `MZ` ở hai byte đầu |
| Đuôi tệp | Script **văn bản thuần** (không có magic bytes) | `.bat` `.vbs` `.ps1` |

Lớp đuôi tệp lấy phần sau dấu chấm **cuối cùng**, nên bắt được mẹo **đuôi kép**
`bao-cao.pdf.exe` — mẹo rất cũ mà vẫn hiệu quả vì Windows mặc định ẩn phần đuôi
đã biết, người nhận chỉ thấy `bao-cao.pdf`.

### Mã nguồn CỐ Ý không bị chặn

`.js` `.ts` `.py` `.sh` `.cs`… đi qua bình thường. Đây là nhóm làm phần mềm,
gửi nhau một file mã để nhờ xem hộ là việc thật; chúng cũng không **tự** chạy
khi tải về, phải cố ý mở bằng trình thông dịch. Cấm chúng là cản việc thật để
đổi lấy rất ít an toàn.

Muốn đổi thì sửa đúng một mảng: `DUOI_CAM` trong `tep-thuc-thi.util.ts`.

### ⚠️ Đây là danh sách CẤM, không phải danh sách CHO PHÉP

Nên nó yếu hơn theo bản chất: **nhét `virus.exe` vào một file `.zip` là lọt** —
cả hai lớp đều không nhìn được vào bên trong file nén. Có một bài test ghi lại
tường minh giới hạn này để không ai tưởng nhầm là đã kín.

Muốn kín thì phải đổi sang danh sách **cho phép** (chỉ nhận pdf / ảnh / office /
text). Đánh đổi: sẽ chặn nhầm những loại tệp hợp lệ mà nhóm chưa nghĩ tới, và
mỗi lần cần thêm một loại là phải sửa code.

## Những gì tính năng này KHÔNG làm

- **Không quét ảnh cũ.** Chỉ áp cho ảnh tải lên từ lúc bật.
- **Không đọc chữ trong ảnh.** Một câu chửi viết lên ảnh sẽ qua. Muốn bắt thì
  cần OCR + danh sách từ.
- **Không mở được tài liệu.** Ảnh nằm *bên trong* một file PDF/Office thật thì
  không kiểm được — phải render tài liệu ra ảnh trước.
- **Không phải chống CSAM.** Nội dung xâm hại trẻ em là lĩnh vực khác hẳn: công
  cụ chuyên biệt (PhotoDNA) và nghĩa vụ báo cáo pháp lý. Một lời gọi SafeSearch
  **không** thay thế được.
- **Không hoàn hảo.** Sẽ có ảnh lọt và ảnh bị chặn oan. Đường xử lý của người
  thật vẫn cần: owner/admin xoá được ảnh, cái này đã có sẵn.

## Đổi nhà cung cấp

Mọi nhà cung cấp cài `NhaCungCapKiemDuyet` (`moderation.types.ts`) và trả về bộ
nhóm **theo tên của mình**, không theo tên nhãn của hãng. Thêm AWS Rekognition
chỉ là viết một lớp adapter rồi thêm vào mảng trong `moderation.module.ts` —
không phải sửa ba service upload.

## Phần code liên quan

| Việc | Ở đâu |
|---|---|
| Điều phối, ngưỡng, fail-closed, nhớ hash | `backend/src/common/moderation/moderation.service.ts` |
| Nhận dạng magic bytes | `backend/src/common/moderation/anh.util.ts` |
| Vision SafeSearch | `backend/src/common/moderation/vision.provider.ts` |
| Gemini (6 nhóm mở rộng) | `backend/src/common/moderation/gemini-vision.provider.ts` |
| Chặn tệp thực thi | `backend/src/common/moderation/tep-thuc-thi.util.ts` |
| Test (51 bài) | `backend/src/common/moderation/*.spec.ts` |
| Kiểm tra đầu-cuối (14 bài) | `backend/scripts/kiem-tra-kiem-duyet-anh.mjs` |
| Hướng dẫn lấy khoá | `docs/LAY-CAC-KEY.md` |
