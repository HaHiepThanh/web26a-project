# Đặc tả giao diện — Horizon Hub Harmony

Tài liệu này mô tả **quy ước giao diện hiện tại** của phần ứng dụng (không tính
trang landing) sau đợt chuyển sang daisyUI kit, và **những chỗ còn thiếu** để
thành viên khác làm tiếp.

> Nguồn sự thật là chính đoạn code. Khi bạn sửa quy ước, sửa luôn file này trong
> cùng PR — nếu không nó sẽ lạc hậu và gây hại hơn là không có.

| | |
|---|---|
| Angular | 21.2 (standalone components, signals) |
| Tailwind CSS | 4.3 (cấu hình bằng CSS, **không có** `tailwind.config.js`) |
| daisyUI | **5.7** — chú ý API v5 khác v4, xem [§7](#7-bẫy-thường-gặp) |
| Icon | `@lucide/angular` (kiểu outline) |

---

## 1. Nguyên tắc gốc

1. **Ưu tiên component daisyUI.** Cần một cái nút thì dùng `.btn`, đừng dựng
   `<button class="flex rounded-lg px-3 py-2 hover:bg-...">`. Tự dựng nghĩa là
   nút đó không có viền/nền/trạng thái focus thống nhất với phần còn lại.
2. **Không viết mã màu thô.** Không dùng `bg-white`, `text-slate-500`,
   `border-purple-300`… Chỉ dùng class ngữ nghĩa của daisyUI (`bg-base-100`,
   `text-base-content/60`, `border-base-300`, `text-error`…). Màu thô sẽ không
   đổi theo theme sáng/tối.
3. **Không tự bịa bảng màu.** Toàn bộ `--color-*` do theme daisyUI cấp. Token
   riêng của app trong `styles.css` chỉ *dẫn xuất* từ đó, không khai màu mới.
4. **Trang landing nằm ngoài phạm vi.** `src/app/pages/landing/**` có hệ class
   riêng (`lp-btn`, `kan-card`, `bento-card`…) và font riêng — cố ý giữ nguyên,
   đừng áp daisyUI vào đó.

---

## 2. Theme

Khai báo ở [`src/styles.css`](src/styles.css):

```css
@plugin 'daisyui' {
  themes: winter --default, sunset --prefersdark;
}
```

- **winter** = chế độ sáng, **sunset** = chế độ tối.
- `ThemeService` giữ tên nội bộ là `'light' | 'dark'` (hàng chục chỗ đang so
  sánh `theme() === 'dark'`), rồi ánh xạ sang tên daisyUI khi ghi ra
  `[data-theme]`:

```ts
const DAISY_THEME: Record<Theme, string> = { light: 'winter', dark: 'sunset' };
```

- Lựa chọn được lưu ở `localStorage['trello_theme']`, mặc định lần đầu theo
  `prefers-color-scheme` của hệ điều hành.
- Nút chuyển sáng/tối nằm trên header (giữa nút lời mời và nút Cài đặt).

> ⚠️ Khi viết CSS phụ thuộc theme tối, selector là `[data-theme='sunset']`,
> **không phải** `[data-theme='dark']`.

---

## 3. Token trong `styles.css`

Tất cả token app đều dẫn xuất từ `--color-*` của theme đang bật, nên chỉ cần
**một** khối `:root` — đổi `[data-theme]` là cả bộ token tự đổi.

```css
--bg-app:        var(--color-base-200);   /* nền trang */
--bg-card:       var(--color-base-100);   /* mặt nổi: thẻ, navbar, sidebar */
--border-color:  var(--color-base-300);
--text-primary:   var(--color-base-content);
--text-secondary: color-mix(in oklab, var(--color-base-content) 78%, transparent);
--text-muted:     color-mix(in oklab, var(--color-base-content) 58%, transparent);
--accent-blue:   var(--color-primary);    /* "màu nhấn 1" */
--accent-purple: var(--color-secondary);  /* "màu nhấn 2" */
```

> ⚠️ **Tên biến không còn tả đúng màu.** `--accent-blue` ở theme `sunset` là màu
> **cam** (primary của sunset), không phải xanh. Tên giữ nguyên chỉ để khỏi phải
> sửa hàng trăm chỗ đang dùng. Hiểu là "màu nhấn số 1 / số 2".

Chỉ `--shadow-*` là khai riêng cho `sunset` (bóng trên nền tối phải đậm hơn mới
thấy được — thứ duy nhất không dẫn xuất được từ bảng màu).

**Khi viết mới:** dùng thẳng class daisyUI (`bg-base-100`) thay vì
`bg-[var(--bg-card)]`. Token chỉ dành cho CSS trong file `.css` của component.

---

## 4. Quy ước theo loại component

### Nút — `.btn`

| Tình huống | Class |
|---|---|
| Hành động chính | `btn btn-primary` |
| Hành động phụ | `btn btn-outline` |
| Nút trong suốt / icon | `btn btn-ghost` |
| Nút tròn chỉ có icon | `btn btn-ghost btn-circle btn-sm` |
| Hành động phá huỷ | `btn btn-error` |
| Thêm mới (viền đứt) | `btn btn-dash btn-primary` |
| Trông như link | `btn btn-link` |
| Trạng thái chọn/không | `[class.btn-primary]="dk"` + `[class.btn-outline]="!dk"` |
| Tô nhạt khi được chọn | thêm `btn-soft` (vd `btn-error btn-soft`) |

Cỡ: `btn-xs` `btn-sm` (mặc định) `btn-lg`. Full width: `btn-block`.

Khi cần nút cao tự do (nội dung nhiều dòng), thêm `h-auto min-h-0` và
`font-normal normal-case` để bỏ chữ hoa/đậm mặc định của `.btn`.

### Modal — `.modal` + `.modal-box`

Modal ở đây render có điều kiện bằng `@if`, **không** dùng `<dialog>`, nên phải
tự thêm `modal-open` (mặc định `.modal` bị `visibility: hidden`):

```html
@if (isOpen()) {
<div class="modal modal-open z-[1000] p-4" (click)="close.emit()">
  <div class="modal-box w-full max-w-[480px] border border-base-300"
       (click)="$event.stopPropagation()">
    …
  </div>
</div>
}
```

`.modal-box` đã có sẵn nền `base-100`, bo góc, `padding: 1.5rem`,
`overflow-y: auto`, `max-width: 32rem` — **đừng khai lại**. Chỉ ghi đè khi cần
khác mặc định (`max-w-[880px]`, hoặc `p-0` khi tự quản lý padding bên trong).

Căn trên thay vì giữa: thêm `items-start` vào `.modal`.

### Điều hướng / danh sách chọn — `.menu`

Dùng cho sidebar, dropdown, popover menu, tab dọc:

```html
<ul class="menu menu-sm w-full gap-1 p-0">
  <li>
    <button type="button" [class.menu-active]="dangChon()" (click)="chon()">…</button>
  </li>
</ul>
```

- Trạng thái đang chọn: **`menu-active`** (không tự tô `bg-primary`).
- Nút nằm trực tiếp trong `<li>` của `.menu` **không cần** class `.btn` —
  daisyUI tự tạo kiểu hover/focus/active cho chúng.
- Tiêu đề nhóm / dòng thông báo: `<li class="menu-title">`.

### Thẻ — `.card`

```html
<div class="card card-border card-sm bg-base-100">
  <div class="card-body">
    <h3 class="card-title">…</h3>
    …
    <div class="card-actions">…</div>
  </div>
</div>
```

`card-border` mới là cái tạo viền. Cỡ: `card-xs` → `card-xl`.

### Ô nhập — `.input` / `.select` / `.textarea`

```html
<input type="text" class="input input-sm w-full" [class.input-error]="loi()" />
```

Icon nằm trong ô: bọc bằng `<label class="input">` rồi đặt `<input class="grow">`
bên trong — đây là cách daisyUI 5 khuyến nghị:

```html
<label class="input flex items-center gap-2">
  <svg …></svg>
  <input type="text" class="grow" />
</label>
```

### Khác

| Thành phần | Class |
|---|---|
| Nhãn nhỏ | `badge badge-sm` + `badge-primary` / `badge-ghost` / `badge-soft` |
| Bảng | `table` |
| Thông báo | `alert alert-success` / `alert-error` / `alert-info` |
| Toast | `toast toast-top toast-end` |
| Ảnh đại diện | `avatar` / `avatar-placeholder` |
| Nhóm nút dính nhau | `join` + `join-item` |
| Đang tải | `loading loading-spinner loading-sm` |
| Bo góc theo theme | `rounded-box` (thẻ/modal) · `rounded-field` (nút/ô nhập) |

---

## 5. Hiện trạng (tính đến commit `1221204`)

| Hạng mục | Số liệu |
|---|---|
| Nút dùng daisyUI | **182/189** (173 `.btn`/`.tab`/`.link`/`.badge` + 9 trong `.menu`) |
| Modal | **12/12** dùng `.modal` + `.modal-box` |
| Màu Tailwind thô còn sót | **0** |
| API daisyUI 4 đã khai tử (`*-bordered`) | **0** |

### 7 nút cố ý KHÔNG dùng `.btn`

Đây **không phải** thiếu sót — đừng "sửa" nếu chưa đọc lý do:

| Vị trí | Lý do |
|---|---|
| `pages/login/login.html:38`<br>`pages/register/register.html:92, :115` | Nút hiện/ẩn mật khẩu nằm **bên trong** `<label class="input">`. Thêm `.btn` sẽ vẽ thêm viền và nền ngay giữa ô nhập. |
| `components/board/board-minimap/board-minimap.html:25` | Khung chỉ vùng đang nhìn của minimap — là vùng kéo thả, không phải nút bấm. |
| `components/board/card-detail-modal/card-detail-modal.html:76` | Đã là daisyUI, nhưng class đến từ `priorityChoiceClass()` trong file `.ts` nên script quét không thấy. |
| `components/header/header.html:59`<br>`components/workspace/workspace-sidebar/workspace-sidebar.html:32` | Nút trong `<li>` của `.menu` — đúng quy ước, không cần `.btn`. |

---

## 6. Việc còn có thể làm tiếp

Xếp theo mức đáng làm:

1. **Dropdown của header vẫn tự quản lý đóng/mở.** Nút chuông, lời mời, menu
   người dùng dùng `@if (…Open())` + `HostListener` bắt click ra ngoài. daisyUI
   có `.dropdown` (dùng `popover` API hoặc `:focus-within`) làm sẵn việc này.
   Chuyển sẽ bỏ được kha khá code state.
2. **`.tooltip` chưa dùng chỗ nào** — hiện đang dùng thuộc tính `title` gốc của
   trình duyệt (hiện chậm, không tuỳ biến được).
3. **Thanh header tràn ngang ở màn hình < 420px.** Lỗi có sẵn từ trước đợt này
   (đã đo: header rộng 502px ở viewport 375px *trước khi* thêm nút theme). Cần
   ẩn bớt icon hoặc gom vào menu ở breakpoint nhỏ.
4. **Sidebar trang Settings bị bóp hẹp dưới 900px** — lỗi flex có sẵn, không do
   đợt đổi màu.
5. **Kiểu chữ chưa chuẩn hoá.** Còn nhiều cỡ chữ tuỳ biến (`text-[11.5px]`,
   `text-[12px]`) lẫn với thang chuẩn. Đã có sẵn 2 token `text-3xs` (10px) và
   `text-2xs` (11px) trong `styles.css` để thay.
6. **Bo góc chưa nhất quán.** Vẫn còn `rounded-xl`, `rounded-2xl`, `rounded-3xl`
   rải rác; nên quy về `rounded-box` / `rounded-field` để ăn theo theme.

---

## 7. Bẫy thường gặp

**① Đừng để script tự động chạm vào `[class.X]` của Angular.**
Ở binding `[class.bg-white]="dk"`, tên class nằm trong **tên thuộc tính**. Một
lệnh tìm-thay toàn file sẽ biến nó thành `[class.]="dk"` → vỡ template. Khi viết
script đổi class, chỉ biến đổi phần trong `class="…"`:

```js
src.replace(/(\sclass=")([^"]*)(")/g, (_m, a, body, c) => a + convert(body) + c)
```

**② daisyUI 5 đã bỏ `*-bordered`.** `input-bordered`, `select-bordered`,
`textarea-bordered` không còn tồn tại — v5 cho `.input`/`.select`/`.textarea`
viền sẵn. Viết thêm chỉ là class chết.

**③ `.modal` mặc định ẩn.** Thiếu `modal-open` thì modal render ra nhưng không
nhìn thấy (`visibility: hidden`).

**④ `--border` là độ *dày* viền, không phải màu.** daisyUI đọc
`border-width: var(--border)`. Từng có người alias nó thành mã màu, khiến
`border-width` không hợp lệ và **mọi** nút daisyUI rơi về viền mặc định ~3px của
trình duyệt. Muốn màu viền thì dùng `--border-color`.

**⑤ Đo border trong Browser pane có thể sai.** Pane thu phóng nên `border: 1px`
đọc ra `0.571px`. Muốn kiểm tra thật thì so với một phần tử có `border: 1px`
hardcoded, đừng vội kết luận là lỗi.

**⑥ `reset` màu ở `@layer base`.** `styles.css` có `button { border: none }`
trong `@layer base`. Nó **không** ảnh hưởng `.btn` (component layer thắng base
layer), nhưng sẽ xoá viền của mọi `<button>` **không** dùng `.btn`.

---

## 8. Kiểm tra trước khi mở PR

```bash
cd frontend && npm start
```

Đối chiếu ở **cả hai theme** (bấm nút sáng/tối trên header):

- [ ] Workspace: sidebar, thẻ workspace, tile board, modal tạo workspace
- [ ] Board: kéo thả thẻ (phải còn chạy), mở chi tiết thẻ, đổi mức ưu tiên
- [ ] Chat: panel mở/thu, gợi ý `@mention`
- [ ] Settings: cả 3 tab, pill chọn tổ chức/workspace, modal mời thành viên
- [ ] Login/Register: gửi form thật
- [ ] Thu về ~375px xem có vỡ layout không
- [ ] Console không có lỗi mới

Đếm nhanh chỗ chưa theo quy ước:

```bash
grep -rnE "\b(bg|text|border)-(slate|purple|rose|emerald)-[0-9]{2,3}" frontend/src/app --include=*.html --exclude-dir=landing
```
