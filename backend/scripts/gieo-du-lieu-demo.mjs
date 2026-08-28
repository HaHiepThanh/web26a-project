#!/usr/bin/env node
/**
 * GIEO DỮ LIỆU DEMO — workspace + board + thẻ + hội thoại có sẵn.
 *
 *   node scripts/gieo-du-lieu-demo.mjs          gieo (chạy lại được, tự dọn bản cũ)
 *   node scripts/gieo-du-lieu-demo.mjs --xoa    chỉ xoá, không gieo
 *
 * ── NGUYÊN TẮC
 *
 * CỘNG THÊM, KHÔNG ĐỤNG DỮ LIỆU SẴN CÓ. Script chỉ tạo MỘT workspace mới và
 * mọi thứ nằm gọn bên trong nó; board/thẻ/chat đang có không bị chạm tới.
 *
 * Nhận diện bản gieo bằng MÔ TẢ (`description`) chứ không bằng tên: tên hiện ra
 * trước mặt người xem lúc demo nên phải sạch, còn mô tả thì không ai thấy. Xoá
 * workspace là cascade cuốn theo toàn bộ board/list/thẻ/tin nhắn bên trong.
 *
 * DÙNG TÀI KHOẢN CÓ THẬT. Không tạo user mới: user phải tồn tại bên Firebase
 * mới đăng nhập được, mà script này không với tới Firebase. Nó lấy đúng những
 * người đang là thành viên tổ chức.
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../secrets/.env') });

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/** Dấu nhận diện nằm trong `description` — xem ghi chú đầu tệp. */
const DAU = '[demo-seed]';
const TEN_WORKSPACE = 'Sàn thương mại điện tử';

const nay = new Date();
const ngay = (lech) => {
  const d = new Date(nay);
  d.setDate(d.getDate() + lech);
  return d.toISOString().slice(0, 10);
};
/** Mốc thời gian lùi về trước `phut` phút — để hội thoại trông như vừa diễn ra. */
const luc = (phut) => new Date(nay.getTime() - phut * 60_000).toISOString();

async function chen(bang, rows) {
  if (!rows.length) return [];
  const { data, error } = await sb.from(bang).insert(rows).select();
  if (error) throw new Error(`${bang}: ${error.message}`);
  return data;
}

async function xoa(orgId) {
  const { data } = await sb
    .from('workspaces')
    .select('id, name')
    .eq('org_id', orgId)
    .like('description', `%${DAU}%`);
  for (const w of data ?? []) {
    await sb.from('workspaces').delete().eq('id', w.id);
    console.log(`  đã xoá workspace "${w.name}" (và mọi thứ bên trong)`);
  }
  return (data ?? []).length;
}

(async () => {
  // ---------------------------------------------------------------- bối cảnh
  const { data: org } = await sb
    .from('organizations')
    .select('id, name, slug')
    .eq('slug', 'hahiepthanhhhtt')
    .single();
  if (!org) throw new Error('Không tìm thấy tổ chức. Sửa slug ở đầu script.');

  const { data: tv } = await sb
    .from('organization_members')
    .select('user_id, role, users(display_name, email)')
    .eq('org_id', org.id);

  const nguoi = (tv ?? []).map((r) => ({
    id: r.user_id,
    ten: r.users?.display_name ?? r.users?.email ?? '?',
    chu: r.role === 'owner',
  }));
  const chu = nguoi.find((n) => n.chu) ?? nguoi[0];
  const khac = nguoi.filter((n) => n.id !== chu.id);
  if (!khac.length) throw new Error('Tổ chức chỉ có một người — hội thoại demo cần ít nhất hai.');

  console.log(`Tổ chức: ${org.name}`);
  console.log(`Người:   ${nguoi.map((n) => n.ten).join(', ')}\n`);

  const daXoa = await xoa(org.id);
  if (process.argv.includes('--xoa')) {
    console.log(daXoa ? '\nXong.' : '\nKhông có gì để xoá.');
    return;
  }

  // -------------------------------------------------------------- workspace
  const [ws] = await chen('workspaces', [
    {
      org_id: org.id,
      name: TEN_WORKSPACE,
      description: `Không gian làm việc của nhóm ${DAU}`,
      created_by: chu.id,
    },
  ]);

  // ---------------------------------------------------------------- board 1
  const [b1] = await chen('boards', [
    { org_id: org.id, workspace_id: ws.id, name: 'Website bán hàng', background: 'bg-board-blue', created_by: chu.id },
  ]);
  const [b2] = await chen('boards', [
    { org_id: org.id, workspace_id: ws.id, name: 'Sprint 3 — Thanh toán', background: 'bg-board-purple', created_by: chu.id },
  ]);

  const nhan = await chen(
    'labels',
    [
      ['Backend', '#61bd4f'], ['Frontend', '#0079bf'], ['Gấp', '#eb5a46'],
      ['UI/UX', '#c377e0'], ['Bug', '#ff9f1a'],
    ].map(([name, color]) => ({ org_id: org.id, board_id: b1.id, name, color })),
  );
  const N = Object.fromEntries(nhan.map((l) => [l.name, l.id]));

  const cot1 = await chen(
    'lists',
    ['Cần làm', 'Đang làm', 'Chờ duyệt', 'Xong'].map((name, i) => ({
      org_id: org.id, board_id: b1.id, name, position: i + 1,
    })),
  );
  const L = Object.fromEntries(cot1.map((l) => [l.name, l.id]));

  const the = [
    ['Cần làm', 'Trang chi tiết sản phẩm', 'Ảnh lớn, chọn size/màu, đánh giá của khách.', khac[0], ngay(4), 'medium', ['Frontend', 'UI/UX']],
    ['Cần làm', 'Bộ lọc theo danh mục và khoảng giá', null, khac[0], ngay(6), 'low', ['Frontend']],
    ['Cần làm', 'Gửi email xác nhận đơn hàng', 'Dùng Brevo, mẫu HTML giống email đặt lại mật khẩu.', chu, ngay(7), 'medium', ['Backend']],
    ['Cần làm', 'Trang quản trị đơn hàng', null, khac[1] ?? khac[0], ngay(9), 'low', ['Frontend', 'Backend']],
    ['Đang làm', 'Giỏ hàng — thêm, sửa số lượng, xoá', 'Lưu vào localStorage khi chưa đăng nhập, đồng bộ khi đăng nhập.', chu, ngay(1), 'high', ['Frontend', 'Gấp']],
    ['Đang làm', 'API tính phí vận chuyển', 'Theo tỉnh thành và khối lượng.', khac[0], ngay(2), 'medium', ['Backend']],
    ['Đang làm', 'Ảnh sản phẩm bị méo trên điện thoại', 'object-fit không áp dụng ở Safari iOS.', khac[1] ?? khac[0], ngay(0), 'high', ['Bug', 'Gấp']],
    ['Chờ duyệt', 'Đăng nhập bằng Google', 'Đã xong, cần review phần lưu token.', khac[0], ngay(-1), 'high', ['Backend']],
    ['Chờ duyệt', 'Thanh toán bằng VNPay', 'Đã chạy được ở môi trường thử.', chu, ngay(1), 'high', ['Backend', 'Gấp']],
    ['Xong', 'Dựng khung dự án Angular + NestJS', null, chu, ngay(-12), 'medium', []],
    ['Xong', 'Thiết kế cơ sở dữ liệu', 'Đã chốt 14 bảng, có ràng buộc khoá ngoại.', khac[0], ngay(-9), 'medium', ['Backend']],
    ['Xong', 'Trang chủ và danh sách sản phẩm', null, khac[1] ?? khac[0], ngay(-5), 'medium', ['Frontend', 'UI/UX']],
  ];

  const theRows = the.map(([cot, title, desc, ng, due, uu], i) => ({
    org_id: org.id, list_id: L[cot], title, description: desc,
    assignee_id: ng.id, due_date: due, priority: uu, position: i + 1,
    created_by: chu.id, completed_at: cot === 'Xong' ? luc(60 * 24) : null,
  }));
  const daTao = await chen('cards', theRows);

  await chen(
    'card_labels',
    daTao.flatMap((c, i) => (the[i][6] ?? []).map((n) => ({ card_id: c.id, label_id: N[n] }))),
  );

  // Vài việc con cho thẻ đang làm — để mở thẻ ra có cái mà xem.
  const gioHang = daTao.find((c) => c.title.startsWith('Giỏ hàng'));
  await chen('checklist_items', [
    ['Thêm sản phẩm vào giỏ', true], ['Sửa số lượng', true],
    ['Xoá khỏi giỏ', false], ['Đồng bộ khi đăng nhập', false],
  ].map(([content, is_done], i) => ({ card_id: gioHang.id, content, is_done, position: i + 1 })));

  // ---------------------------------------------------------------- board 2
  const cot2 = await chen(
    'lists',
    ['Việc cần làm', 'Đang xử lý', 'Hoàn tất'].map((name, i) => ({
      org_id: org.id, board_id: b2.id, name, position: i + 1,
    })),
  );
  await chen('cards', [
    ['Việc cần làm', 'Hoàn tiền một phần', khac[0], ngay(5), 'medium'],
    ['Việc cần làm', 'Lưu lịch sử giao dịch', chu, ngay(8), 'low'],
    ['Đang xử lý', 'Đối soát với cổng thanh toán', khac[0], ngay(2), 'high'],
    ['Đang xử lý', 'Xử lý webhook báo thành công', chu, ngay(3), 'high'],
    ['Hoàn tất', 'Tạo đơn ở trạng thái chờ thanh toán', chu, ngay(-4), 'medium'],
  ].map(([cot, title, ng, due, uu], i) => ({
    org_id: org.id, list_id: cot2.find((l) => l.name === cot).id, title,
    assignee_id: ng.id, due_date: due, priority: uu, position: i + 1,
    created_by: chu.id, completed_at: cot === 'Hoàn tất' ? luc(60 * 12) : null,
  })));

  // ------------------------------------------------------------------ chat
  //
  // Hội thoại cố ý bày ra ĐỦ những gì vừa làm xong: trả lời, trả lời chính
  // mình, sửa, thu hồi, @nhắc tên. Có sẵn thì lúc demo chỉ việc chỉ vào, không
  // phải gõ tại chỗ rồi chờ.
  const A = khac[0], B = khac[1] ?? khac[0];
  const tin = async (ai, noiDung, phutTruoc, them = {}) => {
    const [m] = await chen('messages', [{
      org_id: org.id, board_id: b1.id, user_id: ai.id,
      content: noiDung, created_at: luc(phutTruoc), ...them,
    }]);
    return m;
  };

  await tin(A, 'Chào cả nhà, tuần này mình chốt nốt phần giỏ hàng nhé.', 240);
  const m2 = await tin(chu, 'Ok, mình đang làm phần đồng bộ giỏ hàng khi đăng nhập.', 232);
  await tin(B, 'Ảnh sản phẩm bên Safari iOS vẫn méo nha, mình mở thẻ rồi.', 210);
  await tin(chu, 'Để mình xem lại object-fit.', 205, { reply_to_id: m2.id });
  const m5 = await tin(A, 'Phí vận chuyển tính theo tỉnh hay theo khối lượng vậy?', 150);
  await tin(chu, 'Cả hai, khối lượng là chính còn tỉnh chỉ cộng thêm.', 146, {
    reply_to_id: m5.id, edited_at: luc(140),
  });
  await tin(B, '', 120, { deleted_at: luc(118) });
  await tin(A, `@${chu.ten} bên VNPay trả về mã lỗi 24 khi huỷ giữa chừng.`, 90);
  const m9 = await tin(chu, 'Mã 24 là người dùng tự huỷ, mình bắt riêng ca đó.', 86);
  await tin(chu, 'Đã đẩy lên nhánh feat/thanh-toan rồi nhé.', 84, { reply_to_id: m9.id });
  const m11 = await tin(A, `ê ${chu.ten.split(' ').slice(-1)[0]}, làm giúp mình trang quản trị đơn hàng trước thứ 6 nhé`, 20);

  // Gợi ý AI kèm sẵn cho tin cuối — để lúc demo chip hiện ngay, không phải chờ
  // gọi model. Vẫn gửi tin mới được thì AI chạy thật.
  await chen('chat_task_suggestions', [{
    org_id: org.id, board_id: b1.id, message_id: m11.id, created_by: A.id,
    status: 'pending', model: 'gemini-3.5-flash-lite',
    cards: [{
      title: 'Trang quản trị đơn hàng', assigneeId: chu.id,
      dueDate: ngay(((5 - nay.getDay() + 7) % 7) || 7), priority: 'high', listId: L['Cần làm'],
    }],
  }]);

  console.log(`✅ Workspace "${ws.name}"`);
  console.log(`   • ${b1.name}: 4 cột, ${daTao.length} thẻ, 5 nhãn, 11 tin nhắn, 1 gợi ý AI`);
  console.log(`   • ${b2.name}: 3 cột, 5 thẻ`);
  console.log(`\nXoá lại: node scripts/gieo-du-lieu-demo.mjs --xoa`);
})().catch((e) => {
  console.error('LỖI:', e.message);
  process.exit(1);
});
