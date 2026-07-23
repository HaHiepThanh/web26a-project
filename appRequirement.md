## Project Requirement: Build Mini Trello
1. Authentication & Onboarding
- Đăng ký tài khoản (email + password qua Supabase Auth)
- Đăng nhập / đăng xuất
- Quên mật khẩu / reset password
- Khi đăng ký lần đầu → tự động tạo tenant mới, user trở thành owner
- Trang onboarding: đặt tên công ty/team (= tên tenant)

2. Quản lý Tenant & Thành viên
- Xem thông tin tenant (tên, danh sách thành viên)
- Owner tạo invite link (kèm token, có thời hạn hết hạn)
- User khác dùng link để join vào tenant (nếu đã có tài khoản → join trực tiếp; nếu chưa → đăng ký rồi tự join)
- Danh sách thành viên trong tenant: tên, email, role, ngày tham gia
- Owner đổi role thành viên (owner ⇄ member)
- Owner xóa thành viên khỏi tenant
- (Owner) Rời/xóa tenant — có cảnh báo xác nhận

3. Workspace & Board
- Tạo / sửa / xóa workspace (mỗi tenant có thể có nhiều workspace, vd theo phòng ban)
- Tạo / sửa / xóa board trong workspace
- Danh sách board dạng grid, hiển thị số lượng card/member
- Đặt board public (mọi thành viên tenant xem được) hoặc giới hạn thành viên cụ thể (tùy độ khó, có thể để bonus)

4. List & Card (chức năng lõi kiểu Trello)
- Tạo / sửa / xóa list trong board (vd: To Do, Doing, Done)
- Sắp xếp lại thứ tự list (kéo thả ngang)
- Tạo / sửa / xóa card trong list
- Kéo thả card giữa các list và trong cùng list (đổi vị trí/thứ tự)
- Card chi tiết (mở dạng modal):
    - Tiêu đề, mô tả (rich text hoặc markdown đơn giản)
    - Gán người phụ trách (assignee) — chọn từ thành viên tenant
    - Due date (hạn chót)
    - Nhãn/label (màu sắc, tùy chọn)
    - Checklist nhỏ trong card (bonus)
    - Bình luận trong card (bonus, nếu còn thời gian)
- Xóa/khôi phục card (soft delete, bonus)

5. Realtime Collaboration (đã giảm tải theo scope mới)
- Khi 1 người tạo/xóa/di chuyển card hoặc list → những người khác đang mở cùng board thấy cập nhật gần như ngay lập tức (qua Supabase Realtime subscribe theo bảng)
- Hiển thị trạng thái "đang online" đơn giản trong board (ai đang mở board này) — bonus, không bắt buộc
- Không cần: con trỏ chuột real-time, edit đồng thời từng ký tự, conflict resolution phức tạp

6. Activity Log (đã giảm tải)
- Ghi lại các hành động quan trọng dạng câu mô tả: tạo/xóa/di chuyển card, thêm/xóa thành viên, tạo board
- Hiển thị dạng feed (danh sách) trong board, sắp xếp theo thời gian mới nhất
- Không cần: diff chi tiết từng field, filter/search nâng cao trong log

7. Phân quyền (Authorization)
- 2 role: owner (toàn quyền: quản lý thành viên, xóa board/tenant) và member (tạo/sửa card, list, board nhưng không quản lý thành viên)
- RLS ở tầng Postgres đảm bảo user chỉ thấy dữ liệu thuộc tenant của mình
- Guard ở tầng NestJS kiểm tra role trước khi cho phép hành động nhạy cảm (xóa board, đổi role, xóa thành viên)

8. Dashboard / Trang tổng quan (bonus nếu còn thời gian)
- Trang tổng quan hiển thị: số board, số card đang mở, card sắp đến hạn (due soon)
- Card của tôi (my tasks): danh sách card được gán cho user hiện tại, gom từ tất cả board

9. Cài đặt cá nhân & giao diện
- Cập nhật thông tin cá nhân (tên hiển thị, avatar)
- Dark mode / light mode 
- Responsive cơ bản (dùng được trên tablet/mobile, không cần tối ưu hoàn hảo)