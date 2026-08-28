import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ChatService, docConTro, taoConTro } from './chat.service';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { AccessService } from '../../common/access/access.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { TaskSuggestionsService } from '../task-suggestions/task-suggestions.service';

interface KetQua {
  data: unknown;
  error?: unknown;
}

/**
 * Supabase giả: mỗi bước `.from()` ghi lại vào nhật ký, và mỗi lần "chốt" một
 * câu truy vấn thì lấy kết quả kế tiếp trong hàng đợi.
 *
 * Thứ tự hàng đợi PHẢI khớp thứ tự service gọi — đó cũng chính là thứ mình muốn
 * khoá lại: đổi thứ tự truy vấn trong service là test đỏ ngay.
 */
function taoSupabase() {
  const hang: KetQua[] = [];
  const nhatKy: Record<string, unknown>[] = [];

  const client = {
    from(table: string) {
      const buoc: Record<string, unknown> = { table };
      nhatKy.push(buoc);
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'order', 'limit', 'or', 'insert', 'update']) {
        q[m] = (...args: unknown[]) => {
          buoc[m] = args;
          return q;
        };
      }
      const lay = () => Promise.resolve(hang.shift() ?? { data: null, error: null });
      q.single = lay;
      q.maybeSingle = lay;
      q.then = (res: (v: KetQua) => unknown, rej: (e: unknown) => unknown) =>
        lay().then(res, rej);
      return q;
    },
  };
  return { client, hang, nhatKy };
}

const dong = (over: Record<string, unknown> = {}) => ({
  id: 'm-1',
  org_id: 'org-1',
  board_id: 'b-1',
  user_id: 'u-1',
  content: 'xin chào',
  created_at: '2026-01-01T00:00:00Z',
  edited_at: null,
  deleted_at: null,
  reply_to_id: null,
  users: { display_name: 'An', avatar_url: null },
  ...over,
});

describe('ChatService', () => {
  let sb: ReturnType<typeof taoSupabase>;
  let realtime: { emitToBoard: jest.Mock; emitToUser: jest.Mock };
  let service: ChatService;

  beforeEach(() => {
    sb = taoSupabase();
    realtime = { emitToBoard: jest.fn(), emitToUser: jest.fn() };
    service = new ChatService(
      { client: sb.client } as unknown as SupabaseService,
      realtime as unknown as RealtimeGateway,
      { analyze: jest.fn() } as unknown as TaskSuggestionsService,
      {
        assertBoardAccess: jest.fn().mockResolvedValue({ orgId: 'org-1' }),
        nguoiXemDuocBoard: jest.fn().mockResolvedValue({ uids: [], boardName: '', orgSlug: '' }),
      } as unknown as AccessService,
    );
  });

  describe('con trỏ phân trang', () => {
    it('đi trọn vòng', () => {
      const c = taoConTro({ createdAt: '2026-01-01T00:00:00Z', id: 'm-1' });
      expect(docConTro(c)).toEqual({ at: '2026-01-01T00:00:00Z', id: 'm-1' });
    });

    it('tách ở dấu gạch dưới CUỐI CÙNG', () => {
      // uuid không có gạch dưới, nhưng id sinh bằng md5 hay id do người khác
      // đặt thì có thể có. Tách ở dấu ĐẦU tiên là vỡ mốc thời gian.
      expect(docConTro('2026-01-01T00:00:00Z_a_b')).toEqual({
        at: '2026-01-01T00:00:00Z_a',
        id: 'b',
      });
    });

    it('con trỏ rác → 400 chứ không âm thầm trả sai trang', () => {
      expect(() => docConTro('rac')).toThrow(BadRequestException);
      expect(() => docConTro('_m-1')).toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('lấy DƯ MỘT dòng để biết còn trang nữa không', async () => {
      sb.hang.push({ data: Array.from({ length: 11 }, (_, i) => dong({ id: `m-${i}` })) });
      const ra = await service.findAll('u-1', 'b-1', undefined, 10);

      expect(ra.hasMore).toBe(true);
      expect(ra.messages).toHaveLength(10); // dòng dư bị cắt, không lọt ra ngoài
      expect(sb.nhatKy[0].limit).toEqual([11]);
    });

    it('trả về theo thứ tự CŨ → MỚI dù truy vấn lấy mới nhất trước', async () => {
      sb.hang.push({
        data: [
          dong({ id: 'm-2', created_at: '2026-01-02T00:00:00Z' }),
          dong({ id: 'm-1', created_at: '2026-01-01T00:00:00Z' }),
        ],
      });
      const ra = await service.findAll('u-1', 'b-1');
      expect(ra.messages.map((m) => m.id)).toEqual(['m-1', 'm-2']);
    });

    it('trần cứng: xin 100000 vẫn chỉ được 50', async () => {
      sb.hang.push({ data: [] });
      await service.findAll('u-1', 'b-1', undefined, 100000);
      expect(sb.nhatKy[0].limit).toEqual([51]);
    });

    it('tin ĐÃ THU HỒI không mang nội dung ra khỏi backend', async () => {
      // Trả nội dung rồi để giao diện tự ẩn là ẩn giả: mở tab Network là đọc được.
      sb.hang.push({
        data: [dong({ content: 'lỡ tay gửi nhầm', deleted_at: '2026-01-02T00:00:00Z' })],
      });
      const ra = await service.findAll('u-1', 'b-1');
      expect(ra.messages[0].content).toBe('');
      expect(JSON.stringify(ra)).not.toContain('lỡ tay gửi nhầm');
    });

    it('gắn ô trích dẫn bằng ĐÚNG MỘT câu truy vấn phụ', async () => {
      sb.hang.push({
        data: [
          dong({ id: 'm-2', reply_to_id: 'm-1' }),
          dong({ id: 'm-3', reply_to_id: 'm-1' }),
        ],
      });
      sb.hang.push({
        data: [{ id: 'm-1', user_id: 'u-9', content: 'câu gốc', deleted_at: null, users: null }],
      });

      const ra = await service.findAll('u-1', 'b-1');

      expect(sb.nhatKy).toHaveLength(2); // 1 câu chính + 1 câu trích dẫn
      expect(sb.nhatKy[1].in).toEqual(['id', ['m-1']]); // gộp, không hỏi hai lần
      expect(ra.messages.every((m) => m.replyTo?.content === 'câu gốc')).toBe(true);
    });

    it('ô trích dẫn KHÔNG mang theo trích dẫn của chính nó', async () => {
      // Chặn lồng vô hạn ngay từ hợp đồng dữ liệu, không đợi tới giao diện.
      sb.hang.push({ data: [dong({ id: 'm-2', reply_to_id: 'm-1' })] });
      sb.hang.push({
        data: [{ id: 'm-1', user_id: 'u-9', content: 'gốc', deleted_at: null, users: null }],
      });
      const ra = await service.findAll('u-1', 'b-1');
      expect(ra.messages[0].replyTo).not.toHaveProperty('replyTo');
    });
  });

  describe('trả lời', () => {
    it('tin được trả lời ở BOARD KHÁC → 400', async () => {
      // Không kiểm thì backend ngoan ngoãn lấy nội dung tin của tổ chức khác rồi
      // nhét vào ô trích dẫn của board này.
      sb.hang.push({ data: null }); // không tìm thấy trong board này
      await expect(
        service.create('b-1', 'u-1', 'hi', 'm-cua-board-khac'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('kiểm bằng CẢ id LẪN board_id', async () => {
      sb.hang.push({ data: null });
      await expect(service.create('b-1', 'u-1', 'hi', 'm-0')).rejects.toThrow();
      expect(sb.nhatKy[0].eq).toBeDefined();
    });

    it('hợp lệ thì lưu reply_to_id và phát WebSocket', async () => {
      sb.hang.push({ data: { id: 'm-0' } }); // kiểm tra tin gốc
      sb.hang.push({ data: dong({ id: 'm-2', reply_to_id: 'm-0' }) }); // insert
      sb.hang.push({ data: [{ id: 'm-0', user_id: 'u-9', content: 'gốc', deleted_at: null, users: null }] });

      const ra = await service.create('b-1', 'u-1', 'trả lời nè', 'm-0');

      expect(sb.nhatKy[1].insert).toEqual([
        expect.objectContaining({ reply_to_id: 'm-0' }),
      ]);
      expect(ra.replyTo?.content).toBe('gốc');
      expect(realtime.emitToBoard).toHaveBeenCalledWith(
        'b-1', 'chat.message', 'u-1', expect.objectContaining({ id: 'm-2' }),
      );
    });

    it('không trả lời ai thì reply_to_id là null, không có câu truy vấn thừa', async () => {
      sb.hang.push({ data: dong() });
      await service.create('b-1', 'u-1', 'bình thường');
      expect(sb.nhatKy).toHaveLength(1); // chỉ mỗi insert
      expect(sb.nhatKy[0].insert).toEqual([expect.objectContaining({ reply_to_id: null })]);
    });
  });

  describe('sửa và thu hồi', () => {
    it('sửa tin của NGƯỜI KHÁC → 403', async () => {
      sb.hang.push({ data: dong({ user_id: 'u-khac' }) });
      await expect(service.update('u-1', 'm-1', 'đổi')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('thu hồi tin của NGƯỜI KHÁC → 403', async () => {
      sb.hang.push({ data: dong({ user_id: 'u-khac' }) });
      await expect(service.recall('u-1', 'm-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('tin ĐÃ THU HỒI thì không sửa được nữa', async () => {
      sb.hang.push({ data: dong({ deleted_at: '2026-01-02T00:00:00Z' }) });
      await expect(service.update('u-1', 'm-1', 'đổi')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('sửa xong đánh dấu edited_at và phát chat.message.updated', async () => {
      sb.hang.push({ data: dong() });
      sb.hang.push({ data: dong({ content: 'đã đổi', edited_at: '2026-01-02T00:00:00Z' }) });

      const ra = await service.update('u-1', 'm-1', 'đã đổi');

      expect(sb.nhatKy[1].update).toEqual([
        expect.objectContaining({ content: 'đã đổi', edited_at: expect.any(String) }),
      ]);
      expect(ra.editedAt).toBeTruthy();
      expect(realtime.emitToBoard).toHaveBeenCalledWith(
        'b-1', 'chat.message.updated', 'u-1', expect.anything(),
      );
    });

    it('thu hồi giữ nguyên DÒNG, chỉ đánh dấu deleted_at', async () => {
      // Xoá dòng thì reply_to_id của mọi câu trả lời thành NULL và ô trích dẫn
      // mất sạch ngữ cảnh.
      sb.hang.push({ data: dong() });
      sb.hang.push({ data: dong({ content: 'xin chào', deleted_at: '2026-01-02T00:00:00Z' }) });

      const ra = await service.recall('u-1', 'm-1');

      expect(sb.nhatKy[1].update).toEqual([
        expect.objectContaining({ deleted_at: expect.any(String) }),
      ]);
      expect(ra.deletedAt).toBeTruthy();
      expect(ra.content).toBe(''); // nội dung không ra ngoài
    });

    it('thu hồi hai lần không phải lỗi', async () => {
      sb.hang.push({ data: dong({ deleted_at: '2026-01-02T00:00:00Z' }) });
      const ra = await service.recall('u-1', 'm-1');
      expect(ra.deletedAt).toBeTruthy();
    });
  });
});
