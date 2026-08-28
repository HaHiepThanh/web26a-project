/**
 * NHẬN DIỆN TỆP THỰC THI — chặn không cho đính kèm.
 *
 * ─── VÌ SAO CHẶN ───
 *
 * Đính kèm được tải về qua một link đã ký của chính ứng dụng, nên nó mang vẻ
 * đáng tin: đồng đội thấy tệp nằm trong thẻ công việc của nhóm mình thì mở ra
 * mà không nghi ngờ gì. Một `.exe` hay `.bat` ở đó là đường phát tán mã độc
 * mượn uy tín của app.
 *
 * ─── HAI LỚP, VÌ MỖI LỚP BẮT MỘT KIỂU ───
 *
 *   1. MAGIC BYTES — bắt tệp nhị phân dù đã đổi tên. `virus.exe` đổi thành
 *      `baocao.pdf` vẫn còn nguyên `MZ` ở hai byte đầu.
 *   2. ĐUÔI TỆP — bắt script dạng VĂN BẢN THUẦN (`.bat`, `.vbs`, `.ps1`).
 *      Những thứ này không có magic bytes nào cả, chúng chỉ là chữ; điều khiến
 *      chúng nguy hiểm chính là cái đuôi, vì Windows nhìn đuôi để quyết định
 *      chạy bằng gì.
 *
 * ⚠️ ĐÂY LÀ DANH SÁCH CẤM, KHÔNG PHẢI DANH SÁCH CHO PHÉP — nên nó yếu hơn theo
 *    bản chất. Nhét `virus.exe` vào trong một file `.zip` là qua được: magic
 *    bytes thấy zip, đuôi là `.zip`, cả hai lớp đều không nhìn được vào bên
 *    trong. Muốn kín thì phải đổi sang danh sách CHO PHÉP (chỉ nhận pdf/ảnh/
 *    office/text) — xem `docs/KIEM-DUYET-ANH.md`.
 */

/** Chuỗi byte mở đầu của các định dạng thực thi. */
const CHU_KY: { ten: string; bytes: number[] }[] = [
  // MZ — mọi thứ chạy được trên Windows: .exe .dll .scr .sys .com
  { ten: 'Windows executable', bytes: [0x4d, 0x5a] },
  // ELF — nhị phân Linux/Unix
  { ten: 'Linux executable', bytes: [0x7f, 0x45, 0x4c, 0x46] },
  // Mach-O — nhị phân macOS, đủ bốn biến thể 32/64-bit và hai thứ tự byte
  { ten: 'macOS executable', bytes: [0xfe, 0xed, 0xfa, 0xce] },
  { ten: 'macOS executable', bytes: [0xfe, 0xed, 0xfa, 0xcf] },
  { ten: 'macOS executable', bytes: [0xce, 0xfa, 0xed, 0xfe] },
  { ten: 'macOS executable', bytes: [0xcf, 0xfa, 0xed, 0xfe] },
  // CA FE BA BE dùng chung cho Mach-O universal VÀ file .class của Java.
  // Cả hai đều là mã chạy được nên chặn chung, không cần tách.
  { ten: 'executable bundle', bytes: [0xca, 0xfe, 0xba, 0xbe] },
  // dex — mã Android
  { ten: 'Android executable', bytes: [0x64, 0x65, 0x78, 0x0a] },
  // "#!" — script có dòng shebang, chạy được ngay khi có quyền thực thi
  { ten: 'shell script', bytes: [0x23, 0x21] },
];

/**
 * Đuôi tệp bị cấm.
 *
 * ─── VÌ SAO KHÔNG CẤM `.js`, `.sh`, `.py`, `.ts` ───
 *
 * Đây là nhóm làm phần mềm: đính kèm một file mã nguồn để nhờ xem hộ là việc
 * bình thường. Chúng cũng không TỰ chạy khi tải về — phải cố ý mở bằng trình
 * thông dịch. Cấm chúng là cản việc thật để đổi lấy rất ít an toàn.
 *
 * Danh sách dưới đây chỉ gồm những thứ CHẠY NGAY khi bấm đúp trên máy người
 * nhận, hoặc là bộ cài đặt.
 */
const DUOI_CAM = new Set([
  // Windows — chạy ngay khi bấm đúp
  'exe',
  'com',
  'scr',
  'bat',
  'cmd',
  'pif',
  'cpl',
  'hta',
  'msc',
  'vbs',
  'vbe',
  'wsf',
  'wsh',
  'jse',
  'ps1',
  'psm1',
  'reg',
  'lnk',
  'scf',
  'inf',
  // Bộ cài đặt
  'msi',
  'msp',
  'dmg',
  'pkg',
  'deb',
  'rpm',
  'apk',
  'appx',
  'app',
  // Thư viện liên kết động / mã đã biên dịch
  'dll',
  'so',
  'dylib',
  'jar',
  'class',
]);

/**
 * Tệp này có phải thứ chạy được không?
 *
 * @returns tên loại để đưa vào câu báo lỗi, hoặc `null` nếu an toàn.
 */
export function laTepThucThi(buffer: Buffer, tenTep: string): string | null {
  if (buffer && buffer.length >= 2) {
    for (const { ten, bytes } of CHU_KY) {
      if (bytes.every((b, i) => buffer[i] === b)) return ten;
    }
  }

  // Lấy phần sau dấu chấm CUỐI CÙNG: `bao-cao.pdf.exe` phải ra `exe`, không
  // phải `pdf` — kiểu đặt tên hai đuôi này là mẹo che mắt rất cũ và vẫn hiệu
  // quả vì Windows mặc định ẩn phần đuôi đã biết.
  const duoi = (tenTep ?? '').split('.').pop()?.toLowerCase().trim() ?? '';
  if (duoi && duoi !== tenTep.toLowerCase() && DUOI_CAM.has(duoi)) {
    return `.${duoi} file`;
  }

  return null;
}
