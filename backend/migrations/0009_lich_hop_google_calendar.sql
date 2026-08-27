-- =====================================================================
-- 0009 — Lịch họp Google Calendar (soạn lịch + mời + nhắc trước giờ)
-- =====================================================================
--
-- CÁCH CHẠY: Supabase → SQL Editor → dán toàn bộ file → Run.
-- Chạy lại nhiều lần không sao (IF NOT EXISTS ở mọi lệnh).
--
-- Tiếp nối 0008 (link Meet gắn theo board). 0008 giải bài "họp NGAY BÂY GIỜ";
-- file này giải bài "hẹn giờ họp, mời người, nhắc trước".
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. AI ĐÃ NỐI GOOGLE
-- ---------------------------------------------------------------------
-- VÌ SAO PHẢI CÓ CỘT NÀY
--
--   Bộ chọn người mời cần biết "người B đã nối Google chưa" để bật/tắt dòng
--   của họ. Nhưng `GoogleMeetService.daNoiGoogle()` đọc `providerData` của
--   Firebase, mà Firebase chỉ đưa cho trình duyệt thông tin của CHÍNH người
--   đang đăng nhập. userA không có đường nào biết về userB.
--
-- VÌ SAO CHỈ MỘT MỐC THỜI GIAN, KHÔNG LƯU EMAIL GOOGLE
--
--   `GoogleMeetService.noiGoogle()` BẮT BUỘC email Google phải trùng email
--   đăng nhập — nối nhầm tài khoản khác là nó tự gỡ ra và báo lỗi. Nên email
--   Google luôn == `users.email`, lưu thêm một cột nữa là chép lại dữ liệu đã
--   có và tạo thêm một chỗ để lệch nhau.
--
--   Dùng timestamptz thay vì boolean vì nó trả lời được cả "có chưa" lẫn "từ
--   bao giờ" mà không tốn thêm cột nào.
--
-- ⚠️ GIÁ TRỊ NÀY KHÔNG BAO GIỜ LẤY TỪ BODY REQUEST.
--    Nó suy ra từ `firebase.identities` trong ID token đã được Firebase Admin
--    verify chữ ký (xem firebase-auth.guard.ts). Nếu tin client tự khai thì ai
--    cũng bịa được "tôi đã nối Google" để lọt vào danh sách mời.
-- ---------------------------------------------------------------------

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_linked_at timestamptz;

COMMENT ON COLUMN users.google_linked_at IS
  'Lần gần nhất thấy tài khoản này có liên kết google.com. NULL = chưa nối. Suy ra từ firebase.identities trong ID token đã verify, KHÔNG nhận từ client.';


-- ---------------------------------------------------------------------
-- 2. LỊCH HỌP
-- ---------------------------------------------------------------------
-- VÌ SAO PHẢI LƯU LỊCH Ở ĐÂY MÀ KHÔNG ĐỂ HẲN BÊN GOOGLE
--
--   Yêu cầu có phần "nhắc trước giờ họp qua chuông 🔔". Nhắc của Google
--   (`reminders.overrides`) chạy trong hệ thống Google: nó bật popup trong
--   Google Calendar và gửi mail, và KHÔNG gọi về server mình. Cơ chế đẩy duy
--   nhất Google có là `events.watch`, mà cái đó chỉ bắn khi sự kiện BỊ SỬA,
--   không bắn khi tới giờ nhắc.
--
--   Nên muốn chuông kêu thì mình phải tự đếm giờ, tức phải tự giữ lịch.
--
--   Đọc ngược từ Google cũng không thay thế được: đọc lịch của ai thì cần
--   token OAuth của người đó, mà token sống ~1 giờ và chỉ có trong tab của
--   chính họ. Không đọc hộ người khác được.
--
-- QUAN HỆ VỚI GOOGLE
--
--   Bảng này là BẢN SAO để tra cứu, Google vẫn là nơi tổ chức cuộc họp thật.
--   `google_event_id` giữ đường về để sau này sửa/huỷ đúng sự kiện đó.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS board_meetings (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references boards(id) on delete cascade,
  -- org_id lặp lại từ boards.org_id một cách CÓ CHỦ Ý: truy vấn nhắc lịch lọc
  -- theo tổ chức rất nhiều, có sẵn ở đây thì khỏi join sang boards mỗi lần.
  org_id      uuid not null references organizations(id) on delete cascade,

  title       text not null,
  description text,

  start_at    timestamptz not null,
  end_at      timestamptz not null,
  -- Múi giờ IANA ('Asia/Ho_Chi_Minh'). `start_at` đã là thời điểm tuyệt đối nên
  -- không cần cột này để tính giờ — nó dùng để HIỂN THỊ lại đúng múi giờ người
  -- tạo đã chọn, và để gửi lên Google (Calendar API đòi `timeZone` riêng).
  time_zone   text not null default 'UTC',

  -- Nhắc trước bao nhiêu phút. 0 = không nhắc.
  remind_minutes int not null default 10 check (remind_minutes between 0 and 1440),

  -- Đường về sự kiện bên Google. NULL khi vì lý do gì đó tạo hụt bên Google
  -- nhưng vẫn muốn giữ lịch phía mình.
  google_event_id  text,
  google_html_link text,
  meet_url         text,

  created_by  text references users(id) on delete set null,
  created_at  timestamptz not null default now(),

  -- Huỷ MỀM, không xoá dòng: người đã nhận mail mời vẫn cần tra lại được cuộc
  -- họp đó từng tồn tại, và lịch sử họp là dữ liệu người dùng — cùng lý do đã
  -- giữ lại lịch sử chat khi thành viên rời tổ chức.
  canceled_at timestamptz,

  -- Họp kết thúc trước khi bắt đầu là dữ liệu vô nghĩa; chặn ngay ở database
  -- thay vì tin rằng mọi đường ghi đều đã kiểm.
  constraint board_meetings_thoi_gian_hop_le check (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_board_meetings_board ON board_meetings (board_id, start_at);
-- Truy vấn nóng nhất: "sắp tới giờ chưa" — quét theo mốc bắt đầu, bỏ cuộc đã huỷ.
CREATE INDEX IF NOT EXISTS idx_board_meetings_sap_toi ON board_meetings (start_at) WHERE canceled_at IS NULL;

COMMENT ON TABLE board_meetings IS
  'Bản sao lịch họp đã tạo trên Google Calendar. Tồn tại vì nhắc của Google không gọi về server mình được — chuông 🔔 phải tự đếm giờ từ bảng này.';


-- ---------------------------------------------------------------------
-- 3. NGƯỜI ĐƯỢC MỜI
-- ---------------------------------------------------------------------
-- Bảng nối riêng chứ không phải mảng uid trong board_meetings: câu hỏi nóng
-- nhất là "CÓ CUỘC NÀO SẮP TỚI CỦA TÔI KHÔNG", hỏi theo user_id. Mảng thì
-- phải quét toàn bảng mỗi lần; bảng nối có index thì tra thẳng.
--
-- KHÔNG có cột trạng thái nhận lời (accepted/declined) — CỐ Ý.
--   Người ta bấm nhận lời BÊN GOOGLE, và Google không báo về đây. Muốn biết
--   phải đọc ngược sự kiện bằng token OAuth của người tạo, mà token sống ~1
--   giờ và chỉ nằm trong tab của họ. Cột đó sẽ đúng lúc đầu rồi sai vĩnh viễn
--   — tệ hơn là không có. Người tổ chức xem trạng thái nhận lời ở Google
--   Calendar, nơi nó luôn đúng.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS board_meeting_attendees (
  meeting_id uuid not null references board_meetings(id) on delete cascade,
  -- on delete cascade ở đây chỉ bắn khi XOÁ HẲN DÒNG USER, không bắn khi ai đó
  -- bị gỡ khỏi tổ chức (đó là xoá dòng organization_members, không đụng users).
  user_id    text not null references users(id) on delete cascade,
  primary key (meeting_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_meeting_attendees_user ON board_meeting_attendees (user_id);


-- ---------------------------------------------------------------------
-- Kiểm tra lại
-- ---------------------------------------------------------------------
SELECT 'users.google_linked_at' AS kiem_tra,
       count(*) FILTER (WHERE column_name = 'google_linked_at') AS co
FROM information_schema.columns WHERE table_name = 'users'
UNION ALL
SELECT 'board_meetings', count(*) FROM information_schema.tables WHERE table_name = 'board_meetings'
UNION ALL
SELECT 'board_meeting_attendees', count(*) FROM information_schema.tables WHERE table_name = 'board_meeting_attendees';
