# Hướng dẫn người dùng mới (onboarding tour) — đặc tả ý tưởng

> **Trạng thái: đã chốt hướng thiết kế, CHƯA viết một dòng code nào.**
>
> File này viết để **bàn giao sang phiên Claude Code khác** (chủ dự án đổi tài
> khoản, lịch sử hội thoại không mang theo được). Nên nó tự chứa: đọc file này
> là đủ hiểu toàn bộ, không cần hỏi lại gì về phần đã bàn.
>
> Ngày viết: 2026-08-26.

---

## 0. Yêu cầu gốc của chủ dự án

Nguyên ý: *người mới đăng ký tài khoản, lần đầu vào app thì hiện thông báo hỏi
"bạn có cần hướng dẫn cách sử dụng không?". Bấm Có thì bắt đầu chỉ: cách tạo
workspace → tạo danh sách → tạo thẻ → cách filter hoạt động → khung chat để làm
gì → tính năng AI. Nói chung là tất cả tính năng, để người lần đầu vào biết web
có gì và làm thế nào.*

Phần dưới giữ nguyên mục tiêu đó, nhưng **chia tầng** thay vì làm một mạch — lý
do ở §2.

---

## 1. Bối cảnh repo tại thời điểm viết

Hai việc dưới đây **không liên quan tính năng này** nhưng ảnh hưởng tới việc cắt
nhánh, nên ghi lại:

- Nhánh `redesign/phase-0-foundation` (nhánh đang checkout) **sau `main` 41
  commit** và chưa từng push. Thử merge khô: **5 file xung đột nội dung**
  (`styles.css`, `login.css`, `register.css`, `settings.css`, `index.html`).
- Nguyên nhân: `main` vừa có đợt `refactor(ui): áp dụng daisyUI kit` (commit
  `1221204`, kèm tài liệu `frontend/UI-GUIDE.md`) đi **ngược hướng** với quyết
  định D9 "bảng màu Aurora" trong `CLAUDE.md`. Một bên lấy màu từ 2 theme dựng
  sẵn của daisyUI (`winter`/`sunset`), một bên tự dựng bảng màu rồi nối daisyUI
  vào. Hai triết lý loại trừ nhau, **chưa ai quyết chọn bên nào**.

➡️ **Tính năng này phải cắt nhánh mới từ `main`**, không dính vào đống xung đột
trên. Tên đề xuất: `feat/huong-dan-nguoi-dung-moi`.

---

## 2. Vấn đề cốt lõi: tour không có gì để chỉ vào

Luồng thật của người mới (`frontend/src/app/app.routes.ts`,
`frontend/src/app/guards/onboarding.guard.ts`):

```
register → login → onboardingGuard chặn → /onboarding (BẮT BUỘC tạo Organization)
        → /:orgSlug/workspace   ← lúc này: 0 workspace, 0 board, 0 list,
                                          0 card, 0 tin nhắn chat
```

Tour kiểu "spotlight trỏ vào nút Filter" **không chạy được** ở trạng thái này:
chưa có board để mở, nút Filter chưa tồn tại trong DOM, khung chat chưa tồn tại,
AI không có tin nhắn nào để đọc.

Đây là lỗi phổ biến nhất của tour tự làm: viết và thử trên tài khoản đã có dữ
liệu, chạy trên tài khoản mới thì trỏ vào hư không.

➡️ Câu hỏi thật không phải "đặt tooltip ở đâu" mà **"lấy đâu ra nội dung để dạy"**.

---

## 3. Kiến trúc 3 tầng

### 3.1 Tầng 1 — Làm thật, không xem phim (4 bước, ~90 giây)

Tour **không mô tả** cách tạo workspace; nó bắt người dùng tạo thật. Tooltip trỏ
vào nút thật, người dùng bấm thật, tour chỉ sang bước sau khi hành động **thành
công** — nghe store (dữ liệu đã về), **không** nghe sự kiện click.

Che phần còn lại bằng lớp mờ nhưng **không chặn chuột ở vùng highlight**.

| Bước | Trỏ vào | Điều kiện sang bước sau |
|---|---|---|
| 1 | Nút "Create a Workspace" ở `components/workspace/workspace-welcome-banner/` | workspace đầu tiên xuất hiện |
| 2 | `components/workspace/create-board-modal/` | board đầu tiên xuất hiện → tour tự điều hướng sang `/board/:id` |
| 3 | `components/board/add-list/` ("Add list") | list đầu tiên |
| 4 | `components/board/add-card/` | card đầu tiên → mở luôn `card-detail-modal` giới thiệu label / priority / due date / assignee / checklist |

Hết tầng 1, người dùng **có tài sản thật** — không phải xem xong mà màn hình vẫn
trống. Đây là khác biệt lớn nhất so với tour kiểu slideshow.

### 3.2 Tầng 2 — Gieo dữ liệu rồi mới dạy (Filter, Chat, AI)

Ba tính năng này **vô nghĩa trên board 1 thẻ**: filter lọc 1/1 thẻ thì không ai
hiểu nó để làm gì.

Cuối bước 4, hỏi một câu: *"Add 8 sample cards so I can show you filtering and
AI?"*. Bấm có → seed **qua API thật** vào chính board vừa tạo:

- 3 list, 8 thẻ với label / priority / due date **khác nhau có chủ đích**:
  2 thẻ quá hạn, 3 thẻ High, 2 thẻ chưa gán người.
- 3–4 tin nhắn chat mồi, trong đó có **một tin cố ý viết để AI bắt được việc**,
  kiểu: *"Tuần này cần xong landing page, viết test và deploy staging"*.

Có dữ liệu rồi mới dạy được đúng bản chất:

- **Filter** — `components/board/board-header-bar/board-header-bar.html:69`.
  Cho bấm lọc `High`, badge nhảy `3/8`, người dùng *thấy* nó lọc. Rồi chỉ tiếp
  "Save as quick filter" và highlight group.
- **Chat** — `components/chat/chat-panel/`. Panel bên trái trang Board, kéo đổi
  bề rộng được, thu gọn được, realtime, kèm avatar người đang xem trên header.
- **AI** — điểm bán hàng, **tách riêng, đừng gộp vào bước chat**. Trỏ vào tin
  nhắn mồi → nút gợi ý → `components/chat/task-suggestion-modal/` hiện bảng thẻ
  đề xuất. Nhấn mạnh đúng tinh thần đã ghi trong comment của chính component đó:
  **AI đề xuất, NGƯỜI DÙNG quyết định** — mọi trường sửa được, bỏ tick được.
  Đó mới là thứ tạo lòng tin, không phải câu "chúng tôi có AI".

Cuối tầng 2: *"Delete the sample cards?"* — một nút dọn sạch. **Không** dọn hộ
ngầm, cũng **không** bỏ mặc.

### 3.3 Tầng 3 — Coach mark, KHÔNG nhét vào tour

**Coach mark** = một mẩu chỉ dẫn nhỏ, hiện **đúng một lần**, ngay tại chỗ tính
năng nằm, vào lúc người dùng **thực sự sắp cần**. Khác tour ở *thời điểm*:

| | Tour | Coach mark |
|---|---|---|
| Khi nào chạy | người dùng chủ động bấm "Hướng dẫn tôi" | tự bật khi một điều kiện xảy ra |
| Độ dài | chuỗi nhiều bước, có Next/Back/Skip | **một** bong bóng, một câu, một nút "Got it" |
| Ngắt việc | có | không — họ vẫn đang làm việc, nó chỉ ghé vào |
| Lặp lại | chạy lại được từ Settings | hiện 1 lần rồi biến mất vĩnh viễn |

Các tính năng còn lại — stats modal, minimap, layout column/row, saved filter,
mời thành viên, đổi theme, link mời — **đưa hết xuống đây**. Nhét cả vào tour thì
thành 15 bước và người ta bấm Skip ở bước 6.

Ví dụ khai báo:

```ts
{ id: 'filter-hint', anchor: 'board-filter-btn', when: () => cards().length > 12,
  text: "Board's getting busy. Filter by assignee, label, priority or due date." }
```

Ba tình huống nên làm trước:

- board lần đầu vượt 12 thẻ → gợi ý Filter
- lần đầu có người thứ hai mở cùng board → giải thích cụm avatar realtime
  (không giải thích thì người ta tưởng lỗi)
- board lần đầu rộng quá màn hình → giới thiệu minimap

**Vì sao tách khỏi tour:** nói "bạn có thể lọc thẻ" khi trong tay đang có 0 thẻ
là câu rơi vào khoảng không — chưa có vấn đề nào để câu đó giải quyết, não không
lưu. Coach mark đảo thứ tự: **để vấn đề xuất hiện trước, rồi mới đưa lời giải**.

**Ba luật để coach mark không thành phiền toái:**

1. Không bao giờ hai cái cùng lúc. Xếp hàng, mỗi phiên tối đa một cái.
2. Không chặn chuột. Bấm ra ngoài tính như "Got it".
3. Im lặng trong lúc tour đang chạy, và trong vài phút đầu của phiên đầu tiên.

---

## 4. Hộp thoại "Bạn có cần hướng dẫn không?"

Hai điều chỉnh so với ý ban đầu:

**(a) Đặt sau khi vào workspace, KHÔNG đặt ngay sau đăng ký.** Ngay sau đăng ký
người dùng đang bị ép làm một việc bắt buộc (tạo Organization) — chen câu hỏi vào
giữa là cắt ngang. Để họ hoàn tất org, tới `/:orgSlug/workspace` trống, lúc đó
mới hỏi.

**(b) Ba lựa chọn, không phải hai.** "Có/Không" ép chọn giữa 10 phút và không gì
cả:

- **Show me around** — tour đầy đủ (tầng 1 + 2)
- **Just the basics** — chỉ tầng 1, dừng sau khi có thẻ đầu tiên
- **I'll explore myself** — đóng, nhưng **không mất vĩnh viễn**

Chữ "Không" mà xoá sạch đường quay lại là lỗi thiết kế phổ biến nhất của
onboarding. Bấm "explore myself" thì thanh checklist *"Getting started — 0/4"*
vẫn nằm góc dưới, thu gọn được, bấm là vào tour. Thêm mục "Restart tutorial"
trong `pages/settings/settings.html`.

---

## 5. Lưu trạng thái ở đâu — chỗ dễ làm sai

Bảng `users` trong `database.sql` **chưa có** cột nào cho việc này.

| | localStorage | Cột trong DB |
|---|---|---|
| Công | ~0, theo đúng nếp `trello_theme` / `trello_chat_panel_width` đang có | 1 migration `0007_*.sql` + nới `PATCH /auth/profile` (`backend/src/modules/auth/auth.controller.ts:44`) |
| Hỏng ở đâu | đổi máy / đổi trình duyệt / cửa sổ ẩn danh → **hỏi lại người đã dùng 3 tháng** | không |

**Đề xuất: DB**, cột `onboarding_state jsonb`. Lý do: "đã từng được hướng dẫn" là
sự thật của *tài khoản*, không phải của *cái máy*.

Chọn `jsonb` thay vì `boolean tour_done` để còn chứa được: đang dở ở bước nào
(quit giữa chừng thì lần sau *"Resume from step 3?"*), và coach mark nào đã hiện
(§3.3 cần đúng chỗ này). Sau này thêm tính năng mới muốn báo cho người dùng cũ
cũng dùng lại được cấu trúc này.

---

## 6. Kỹ thuật — 4 điểm quyết định thành bại

**1. Tour phải là service cấp gốc, không phải component.**
Tour đi xuyên route: `/:slug/workspace` → `/board/:id`, còn qua nhiều modal. State
nằm trong component thì mỗi lần điều hướng là mất sạch. Dùng một `TourStore`
(SignalStore, đúng nếp `frontend/src/app/ngrx/` đang có) + overlay render **một
lần** ở `layouts/app-layout/`.

**2. Neo bằng `data-tour`, TUYỆT ĐỐI không bằng class CSS.**
Đặt `data-tour="create-workspace"` vào template. Trỏ bằng selector kiểu
`.btn-primary.gap-1` thì đợt đổi giao diện kế tiếp là tour chết câm — mà repo
này đang có sẵn hai hệ CSS đánh nhau (§1), khả năng đó không hề xa.

**3. Mỗi bước phải chờ được và bỏ qua được.**
Neo chưa có trong DOM (modal đang mở, dữ liệu đang tải) → chờ bằng
`MutationObserver`, quá 3 giây thì **bỏ qua bước đó và đi tiếp**, không treo.
Tour tự tin rằng DOM sẵn sàng là tour sẽ hỏng trên máy mạng chậm.

**4. Dùng CDK Overlay, đừng thêm thư viện.**
`@angular/cdk` đã có trong `frontend/package.json` và đang được dùng ở
`components/board/board-list/board-list.ts` + `pages/board/board.ts`.
Shepherd.js / driver.js kéo theo CSS riêng — lại một bảng màu thứ ba trong cái
repo đang có hai.

**Kèm theo (bắt buộc, không phải tuỳ chọn):**
`Esc` thoát · `←/→` chuyển bước · focus trap trong popover · tôn trọng
`prefers-reduced-motion` (CLAUDE.md §2 bắt buộc) · trên mobile đổi popover thành
bottom sheet — **chat panel ở mobile là FAB chứ không phải panel**, tour phải biết
điều đó (xem `chat-panel.ts`, host class `chat-mobile-fab`).

---

## 7. Ba câu hỏi còn TREO — phải hỏi chủ dự án trước khi code

1. **Có được đụng backend không?** Cột `onboarding_state` cần 1 migration + sửa
   `PATCH /auth/profile`. Không được thì lùi về localStorage và chấp nhận hỏi lại
   khi người dùng đổi máy.
2. **Seed dữ liệu mẫu ở tầng 2 — API thật hay mock?** Đề xuất API thật.
   ⚠️ Lưu ý: `loadSampleWorkspaces()` hiện có
   (`pages/workspace/workspace.ts:444`) vẫn đang ghi **mock vào localStorage** —
   di sản thời chưa nối backend. **Đừng dùng lại nó.**
3. **Xác nhận cắt nhánh từ `main`** (xem §1).

---

## 8. Chưa làm gì cả

Tính tới lúc viết file này: **chưa sửa/tạo file code nào**, chưa cắt nhánh, chưa
commit. Toàn bộ nội dung trên là thiết kế trên giấy, đã đối chiếu với code thật
(mọi đường dẫn và số dòng trong file này đều đã kiểm tra trên nhánh `main`).
