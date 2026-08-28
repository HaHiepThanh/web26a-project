/**
 * ĐỐI CHIẾU TÊN NGƯỜI TRONG TIN NHẮN — chạy bằng thuật toán, KHÔNG hỏi model.
 *
 * Trước đây muốn AI biết giao việc cho ai thì phải gõ `@` rồi chọn từ danh sách.
 * Người Việt chat không gõ vậy: "ê H.Thanh", "Thanh ơi", "P.Thanh làm giúp".
 *
 * ── Vì sao đối chiếu ở đây mà không để model tự suy?
 * Model suy được, nhưng không ổn định — cùng một câu, lúc nó chọn Hiệp Thanh,
 * lúc chọn Phương Thanh. Việc "H.Thanh là ai" là tra cứu thuần tuý, có luật rõ
 * ràng và kiểm thử được. Để đây thì model chỉ còn mỗi việc trích đầu việc.
 */

export interface ThanhVienTen {
  id: string;
  displayName: string;
}

/**
 * Cách một cái tên được gọi ra:
 * - `day-du`   "Hà Hiệp Thanh", "Hiệp Thanh"  → rất đặc trưng
 * - `viet-tat` "H.Thanh", "H.H.Thanh"         → rất đặc trưng
 * - `ten-rieng` "Thanh"                        → CHỈ tính khi có dấu hiệu gọi
 */
export type KieuKhop = 'day-du' | 'viet-tat' | 'ten-rieng';

export interface TenBatDuoc {
  /** Đúng như người dùng gõ (đã bỏ dấu, viết thường) — để đưa vào prompt. */
  nguyenVan: string;
  /** uid khớp, sắp xếp ổn định. Nhiều hơn 1 nghĩa là MƠ HỒ. */
  ids: string[];
  kieu: KieuKhop;
}

/**
 * Từ đứng TRƯỚC một cái tên trống trơn để nó thành lời gọi.
 * Đã bỏ dấu: "ê"→"e", "này"→"nay", "bạn"→"ban".
 */
const DAU_HIEU_TRUOC = new Set([
  'e',
  'ey',
  'hey',
  'hi',
  'nay',
  'ban',
  'chao',
  'anh',
  'chi',
  'em',
  'bro',
  'ong',
  'ba',
  'co',
  'chu',
  'may',
  'thang',
]);

/** Từ đứng SAU: "ơi"→"oi", "à"→"a", "nhé"→"nhe". */
const DAU_HIEU_SAU = new Set([
  'oi',
  'a',
  'ah',
  'ơi',
  'nhe',
  'nha',
  'ne',
  'nhi',
  'dau',
  'ui',
  'gium',
  'giup',
  'lam',
  'co',
]);

/** Bí danh ngắn hơn ngần này thì bỏ — "a", "b" khớp lung tung. */
const DAI_TOI_THIEU = 2;

/** Số từ tối đa của một bí danh, dùng để quét cụm. */
const TOI_DA_TU = 4;

/**
 * Bỏ dấu tiếng Việt, viết thường, giữ lại `@ . ,`.
 *
 * Giữ `.` vì nó là một PHẦN CỦA TÊN trong lối viết tắt ("h.thanh"), và giữ `,`
 * vì dấu phẩy ngay sau tên là dấu hiệu gọi rõ nhất ("Thanh, làm giúp anh").
 */
export function chuanHoa(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9@.,\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sinh mọi cách gọi một người.
 *
 * Quy ước tên tiếng Việt: TỪ CUỐI là tên riêng ("Hà Hiệp Thanh" → "Thanh"),
 * các từ trước là họ và tên đệm. Viết tắt là lấy chữ cái đầu của một từ phía
 * trước ghép với tên riêng — "H.Thanh" có thể là tắt của "Hà" hoặc của "Hiệp",
 * cả hai đều đúng nên cả hai đều được sinh ra.
 */
function biDanh(displayName: string): { alias: string; kieu: KieuKhop }[] {
  const tu = chuanHoa(displayName)
    .replace(/[.,@]/g, ' ')
    .split(' ')
    .filter(Boolean);
  if (!tu.length) return [];

  const ra: { alias: string; kieu: KieuKhop }[] = [];
  const cuoi = tu[tu.length - 1];
  const dau = tu.slice(0, -1);

  ra.push({ alias: cuoi, kieu: 'ten-rieng' });

  if (tu.length >= 2) {
    ra.push({ alias: tu.join(' '), kieu: 'day-du' });
    // Hai từ cuối: "Hà Hiệp Thanh" vẫn gọi được là "Hiệp Thanh".
    ra.push({ alias: `${tu[tu.length - 2]} ${cuoi}`, kieu: 'day-du' });

    for (const t of dau) {
      // "h.thanh" và "h thanh" — người ta gõ dấu chấm liền hoặc cách ra đều có.
      ra.push({ alias: `${t[0]}.${cuoi}`, kieu: 'viet-tat' });
      ra.push({ alias: `${t[0]} ${cuoi}`, kieu: 'viet-tat' });
    }
    if (tu.length >= 3) {
      ra.push({
        alias: `${dau.map((t) => t[0]).join('.')}.${cuoi}`,
        kieu: 'viet-tat',
      });
    }
  }

  return ra.filter((x) => x.alias.length >= DAI_TOI_THIEU);
}

interface Tu {
  /** Đã bỏ `@` đầu và `.,` cuối. */
  sach: string;
  coAt: boolean;
  coPhay: boolean;
}

function tachTu(text: string): Tu[] {
  return text
    .split(' ')
    .filter(Boolean)
    .map((w) => {
      const coAt = w.startsWith('@');
      let s = coAt ? w.slice(1) : w;
      const coPhay = s.endsWith(',');
      s = s.replace(/[.,]+$/, '');
      return { sach: s, coAt, coPhay };
    })
    .filter((t) => t.sach.length > 0);
}

/**
 * Tìm những người được gọi tên trong tin nhắn.
 *
 * ⚠️ TÊN RIÊNG TRỐNG TRƠN PHẢI CÓ DẤU HIỆU GỌI. Đây không phải cẩn thận thừa:
 *    bỏ dấu xong, tên riêng đụng hàng loạt từ thông thường.
 *
 *      "lên kế hoạch chức năng thanh toán"  → "thanh" (Thanh)
 *      "hoàn thành trước thứ 6"             → "thanh" (Thành → Thanh)
 *      "chuyển sang màu xanh"               → "xanh"  (Xanh)
 *
 *    Khớp thẳng thì mọi thẻ về thanh toán đều bị gán cho Thanh. Nên "Thanh" chỉ
 *    tính khi có `@`, có dấu phẩy ngay sau, hoặc kèm từ gọi ("ê Thanh",
 *    "Thanh ơi"). Còn "H.Thanh" và "Hiệp Thanh" thì đủ đặc trưng để khớp ở bất
 *    kỳ đâu — không cần dấu hiệu.
 */
export function batTen(
  noiDung: string,
  thanhVien: ThanhVienTen[],
): TenBatDuoc[] {
  const banDo = new Map<string, { ids: Set<string>; kieu: KieuKhop }>();
  for (const tv of thanhVien) {
    for (const { alias, kieu } of biDanh(tv.displayName)) {
      const cu = banDo.get(alias);
      if (cu) {
        cu.ids.add(tv.id);
        // Cùng một chuỗi vừa là tên riêng của người này vừa là viết tắt của
        // người kia thì lấy mức ĐẶC TRƯNG HƠN — nếu không, một cái tên riêng
        // trùng cờ sẽ kéo cả cụm viết tắt xuống phải cần dấu hiệu gọi.
        if (cu.kieu === 'ten-rieng' && kieu !== 'ten-rieng') cu.kieu = kieu;
      } else {
        banDo.set(alias, { ids: new Set([tv.id]), kieu });
      }
    }
  }

  const tu = tachTu(chuanHoa(noiDung));
  const ra = new Map<string, TenBatDuoc>();
  const daDung = new Set<number>();

  // Cụm DÀI trước: có "An" và "An Huy" mà xét "An" trước thì "An Huy" không bao
  // giờ khớp được. Cùng cái bẫy đã ghi ở `chat.service.ts`.
  for (let dai = TOI_DA_TU; dai >= 1; dai--) {
    for (let i = 0; i + dai <= tu.length; i++) {
      let trung = false;
      for (let k = i; k < i + dai; k++) if (daDung.has(k)) trung = true;
      if (trung) continue;

      const cum = tu.slice(i, i + dai);
      const alias = cum.map((t) => t.sach).join(' ');
      const khop = banDo.get(alias);
      if (!khop) continue;

      if (khop.kieu === 'ten-rieng') {
        const truoc =
          cum[0].coAt || (i > 0 && DAU_HIEU_TRUOC.has(tu[i - 1].sach));
        const sau =
          cum[dai - 1].coPhay ||
          (i + dai < tu.length && DAU_HIEU_SAU.has(tu[i + dai].sach));
        if (!truoc && !sau) continue;
      }

      for (let k = i; k < i + dai; k++) daDung.add(k);
      const cu = ra.get(alias);
      if (cu) {
        for (const id of khop.ids) if (!cu.ids.includes(id)) cu.ids.push(id);
      } else {
        ra.set(alias, {
          nguyenVan: alias,
          ids: [...khop.ids].sort(),
          kieu: khop.kieu,
        });
      }
    }
  }

  return [...ra.values()];
}
