import { laTepThucThi } from './tep-thuc-thi.util';

const b = (...d: number[]) =>
  Buffer.concat([Buffer.from(d), Buffer.alloc(32, 0x41)]);
const chu = (s: string) =>
  Buffer.concat([Buffer.from(s, 'ascii'), Buffer.alloc(32, 0x41)]);
const SACH = chu('%PDF-1.7');

describe('laTepThucThi — theo MAGIC BYTES', () => {
  it('bắt nhị phân của cả ba hệ điều hành', () => {
    expect(laTepThucThi(b(0x4d, 0x5a), 'a.pdf')).toMatch(/Windows/);
    expect(laTepThucThi(b(0x7f, 0x45, 0x4c, 0x46), 'a.pdf')).toMatch(/Linux/);
    expect(laTepThucThi(b(0xcf, 0xfa, 0xed, 0xfe), 'a.pdf')).toMatch(/macOS/);
    expect(laTepThucThi(b(0xfe, 0xed, 0xfa, 0xce), 'a.pdf')).toMatch(/macOS/);
  });

  it('bắt được DÙ ĐÃ ĐỔI TÊN thành tệp vô hại', () => {
    // Cả lý do phải xét magic bytes: tên tệp là thứ dễ đổi nhất.
    expect(laTepThucThi(b(0x4d, 0x5a), 'bao-cao-quy-3.pdf')).toBeTruthy();
    expect(laTepThucThi(b(0x4d, 0x5a), 'anh-nhom.png')).toBeTruthy();
    expect(laTepThucThi(b(0x4d, 0x5a), 'khong-co-duoi')).toBeTruthy();
  });

  it('bắt script có shebang, .class của Java và mã Android', () => {
    expect(laTepThucThi(chu('#!/bin/bash'), 'note.txt')).toMatch(
      /shell script/,
    );
    expect(laTepThucThi(b(0xca, 0xfe, 0xba, 0xbe), 'x.dat')).toMatch(
      /executable/,
    );
    expect(laTepThucThi(b(0x64, 0x65, 0x78, 0x0a), 'x.dat')).toMatch(/Android/);
  });
});

describe('laTepThucThi — theo ĐUÔI TỆP', () => {
  it('bắt script dạng văn bản thuần (không có magic bytes nào)', () => {
    // `.bat`/`.vbs` chỉ là chữ; thứ khiến chúng nguy hiểm chính là cái đuôi,
    // vì Windows nhìn đuôi để quyết định chạy bằng gì.
    expect(laTepThucThi(chu('echo hello'), 'run.bat')).toBe('.bat file');
    expect(laTepThucThi(chu('WScript.Echo 1'), 'x.vbs')).toBe('.vbs file');
    expect(laTepThucThi(chu('Get-Process'), 'x.ps1')).toBe('.ps1 file');
  });

  it('bắt mẹo ĐUÔI KÉP', () => {
    // Windows mặc định ẩn phần đuôi đã biết, nên người nhận chỉ thấy
    // "bao-cao.pdf" — mẹo rất cũ mà vẫn hiệu quả.
    expect(laTepThucThi(SACH, 'bao-cao.pdf.exe')).toBe('.exe file');
    expect(laTepThucThi(SACH, 'anh.png.bat')).toBe('.bat file');
  });

  it('không phân biệt chữ hoa thường', () => {
    expect(laTepThucThi(SACH, 'X.EXE')).toBeTruthy();
    expect(laTepThucThi(SACH, 'X.Bat')).toBeTruthy();
  });

  it('bắt bộ cài đặt và gói ứng dụng', () => {
    for (const d of ['msi', 'dmg', 'pkg', 'deb', 'apk', 'jar']) {
      expect(laTepThucThi(SACH, `setup.${d}`)).toBeTruthy();
    }
  });
});

describe('laTepThucThi — KHÔNG chặn nhầm việc thật', () => {
  it('tài liệu và ảnh đi qua bình thường', () => {
    expect(laTepThucThi(SACH, 'bao-cao.pdf')).toBeNull();
    expect(laTepThucThi(chu('PK'), 'tai-lieu.docx')).toBeNull();
    expect(
      laTepThucThi(
        b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
        'anh.png',
      ),
    ).toBeNull();
  });

  it('mã nguồn KHÔNG bị chặn — nhóm làm phần mềm hay gửi nhau xem hộ', () => {
    // Chúng cũng không TỰ chạy khi tải về, phải cố ý mở bằng trình thông dịch.
    for (const t of [
      'index.js',
      'app.ts',
      'main.py',
      'deploy.sh',
      'Program.cs',
    ]) {
      expect(laTepThucThi(chu('console.log(1)'), t)).toBeNull();
    }
  });

  it('tên KHÔNG có dấu chấm thì không bị hiểu nhầm cả tên là đuôi', () => {
    // `split('.').pop()` trên chuỗi không dấu chấm trả về chính chuỗi đó — đặt
    // tên tệp là "exe" mà bị chặn thì là lỗi.
    expect(laTepThucThi(SACH, 'exe')).toBeNull();
    expect(laTepThucThi(SACH, 'bat')).toBeNull();
  });

  it('buffer rỗng / tên rỗng không làm nổ', () => {
    expect(laTepThucThi(Buffer.alloc(0), '')).toBeNull();
    expect(laTepThucThi(SACH, undefined as unknown as string)).toBeNull();
  });

  it('LỖ HỔNG CÒN LẠI: nhét .exe vào .zip thì lọt', () => {
    // Ghi lại tường minh vì đây là danh sách CẤM, không phải danh sách CHO PHÉP.
    // Cả hai lớp đều không nhìn được vào bên trong file nén.
    expect(laTepThucThi(chu('PK'), 'tai-lieu.zip')).toBeNull();
  });
});
