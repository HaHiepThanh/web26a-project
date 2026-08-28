import { batTen, chuanHoa, ThanhVienTen } from './nhan-dien-ten.util';

const HIEP: ThanhVienTen = { id: 'u-hiep', displayName: 'Hà Hiệp Thanh' };
const PHUONG: ThanhVienTen = { id: 'u-phuong', displayName: 'Lê Phương Thanh' };
const HOA: ThanhVienTen = { id: 'u-hoa', displayName: 'Ngô Đức Hoà' };
const BOARD = [HIEP, PHUONG, HOA];

/** Rút gọn: chỉ lấy cặp (chuỗi gõ ra, uid) cho dễ đọc kỳ vọng. */
const ids = (s: string, tv = BOARD) =>
  batTen(s, tv)
    .map((t) => `${t.nguyenVan}=${t.ids.join('|')}`)
    .sort();

describe('chuanHoa', () => {
  it('bỏ dấu, viết thường, đổi đ thành d', () => {
    expect(chuanHoa('Ngô Đức Hoà')).toBe('ngo duc hoa');
  });

  it('GIỮ dấu chấm và dấu phẩy', () => {
    // Dấu chấm là một PHẦN của tên viết tắt ("h.thanh"), còn dấu phẩy ngay sau
    // tên là dấu hiệu gọi rõ nhất ("Thanh, làm giúp anh").
    expect(chuanHoa('ê H.Thanh, làm nhé')).toBe('e h.thanh, lam nhe');
  });
});

describe('batTen — viết tắt kiểu H.Thanh', () => {
  it('phân biệt ĐÚNG hai người cùng tên riêng', () => {
    // Đây là yêu cầu gốc: board có cả Hiệp Thanh lẫn Phương Thanh.
    expect(ids('ê H.Thanh, hãy lên kế hoạch chức năng thanh toán')).toEqual([
      'h.thanh=u-hiep',
    ]);
    expect(ids('P.Thanh làm giúp cái giỏ hàng nhé')).toEqual([
      'p.thanh=u-phuong',
    ]);
  });

  it('viết tắt được cả bằng HỌ lẫn bằng TÊN ĐỆM', () => {
    // "Hà Hiệp Thanh" viết tắt thành "H.Thanh" theo cả hai đường đều hợp lệ.
    expect(ids('L.Thanh xem hộ')).toEqual(['l.thanh=u-phuong']);
  });

  it('chấp nhận dạng cách ra "H. Thanh"', () => {
    expect(ids('H. Thanh ơi xem hộ cái')).toEqual(['h thanh=u-hiep']);
  });

  it('viết tắt đủ chữ cái đầu', () => {
    expect(ids('N.D.Hoa xử lý phần login')).toEqual(['n.d.hoa=u-hoa']);
  });

  it('KHÔNG cần dấu hiệu gọi — viết tắt đã đủ đặc trưng', () => {
    expect(ids('giao phần thanh toán cho h.thanh')).toEqual(['h.thanh=u-hiep']);
  });
});

describe('batTen — tên đầy đủ', () => {
  it('khớp ở bất kỳ đâu, không cần @', () => {
    expect(ids('nhờ Hà Hiệp Thanh làm phần này')).toEqual([
      'ha hiep thanh=u-hiep',
    ]);
  });

  it('gọi bằng hai từ cuối cũng được', () => {
    expect(ids('Hiệp Thanh làm giúp phần login')).toEqual([
      'hiep thanh=u-hiep',
    ]);
  });

  it('cụm DÀI thắng cụm ngắn', () => {
    // Có "Thanh" và "Hiệp Thanh" mà xét cụm ngắn trước thì "Hiệp Thanh" không
    // bao giờ khớp được.
    const ra = batTen('Hiệp Thanh ơi', BOARD);
    expect(ra).toHaveLength(1);
    expect(ra[0].nguyenVan).toBe('hiep thanh');
  });
});

describe('batTen — tên riêng trống trơn PHẢI có dấu hiệu gọi', () => {
  it('"thanh toán" KHÔNG bị coi là gọi tên Thanh', () => {
    // Cái bẫy chính. Bỏ dấu xong "thanh toán" chứa đúng chữ "thanh"; khớp thẳng
    // thì MỌI thẻ về thanh toán đều bị gán cho Thanh.
    expect(ids('lên kế hoạch chức năng thanh toán trong hôm nay')).toEqual([]);
  });

  it('"hoàn thành" cũng không, dù bỏ dấu thành "thanh"', () => {
    expect(ids('cần hoàn thành trước thứ 6')).toEqual([]);
  });

  it('có @ thì tính', () => {
    expect(ids('@Thanh làm giúp')).toEqual(['thanh=u-hiep|u-phuong']);
  });

  it('có dấu phẩy ngay sau thì tính', () => {
    expect(ids('Thanh, làm giúp anh cái này')).toEqual([
      'thanh=u-hiep|u-phuong',
    ]);
  });

  it('có từ gọi phía trước ("ê", "này") thì tính', () => {
    expect(ids('ê Hoà lo phần deploy nhé')).toEqual(['hoa=u-hoa']);
  });

  it('có "ơi" phía sau thì tính', () => {
    expect(ids('Hoà ơi lo phần deploy')).toEqual(['hoa=u-hoa']);
  });

  it('trùng tên riêng thì trả VỀ CẢ HAI — để model tự chọn', () => {
    // Người dùng đã chốt: nhiều Thanh thì giao ai cũng được.
    const ra = batTen('Thanh ơi làm giúp', BOARD);
    expect(ra[0].ids).toEqual(['u-hiep', 'u-phuong']);
    expect(ra[0].kieu).toBe('ten-rieng');
  });
});

describe('batTen — vặt', () => {
  it('tin không nhắc ai thì trả mảng rỗng', () => {
    expect(batTen('ok anh em cứ triển khai đi', BOARD)).toEqual([]);
  });

  it('board rỗng thì không nổ', () => {
    expect(batTen('ê H.Thanh làm nhé', [])).toEqual([]);
  });

  it('tên hiển thị chỉ một từ vẫn dùng được', () => {
    const tv = [{ id: 'u-x', displayName: 'websocketb' }];
    expect(batTen('websocketb ơi lên kế hoạch phân quyền', tv)[0].ids).toEqual([
      'u-x',
    ]);
    // nhưng vẫn phải có dấu hiệu gọi
    expect(batTen('sửa lại websocketb cho đúng', tv)).toEqual([]);
  });

  it('nhiều người trong một câu', () => {
    const ra = ids('H.Thanh làm giỏ hàng, N.D.Hoa lo thanh toán');
    expect(ra).toEqual(['h.thanh=u-hiep', 'n.d.hoa=u-hoa']);
  });

  it('bỏ qua bí danh quá ngắn', () => {
    const tv = [{ id: 'u-a', displayName: 'A B' }];
    expect(batTen('ê b ơi', tv)).toEqual([]);
  });
});
